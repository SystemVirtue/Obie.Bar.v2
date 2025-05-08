const fs = require('fs').promises;
const axios = require('axios');
const path = require('path');
const crypto = require('crypto');

// Configuration
const ARTIST_DATA_FILE = path.join(__dirname, '../Jukebox_V3/Videos_by_Artist.JSON');
const OUTPUT_FILE = path.join(__dirname, 'Videos_by_Artist_validated.JSON');
const THUMBNAIL_DIR = path.join(__dirname, 'thumbnails');
const CONCURRENT_OPERATIONS = 5; // Number of concurrent operations
const TIMEOUT_MS = 10000; // 10 second timeout

// Stats tracking
let stats = {
    totalArtists: 0,
    totalVideos: 0,
    validVideos: 0,
    invalidVideos: 0,
    artistsRemoved: 0,
    thumbnailsDownloaded: 0,
    thumbnailsSkipped: 0,
    errors: []
};

// Extract YouTube video ID from URL
function extractVideoId(url) {
    if (!url) return null;
    
    try {
        // Handle common YouTube URL formats
        const urlObj = new URL(url);
        if (urlObj.hostname.includes('youtube.com')) {
            return urlObj.searchParams.get('v');
        } else if (urlObj.hostname.includes('youtu.be')) {
            return urlObj.pathname.split('/')[1];
        }
        return null;
    } catch (error) {
        stats.errors.push(`Error extracting video ID from ${url}: ${error.message}`);
        return null;
    }
}

// Get file hash for comparison
async function getFileHash(filePath) {
    try {
        const fileBuffer = await fs.readFile(filePath);
        const hashSum = crypto.createHash('md5');
        hashSum.update(fileBuffer);
        return hashSum.digest('hex');
    } catch (error) {
        console.error(`Error hashing file ${filePath}: ${error.message}`);
        return null;
    }
}

// Check if a local thumbnail exists and is valid
async function checkLocalThumbnail(videoId) {
    try {
        const thumbnailPath = path.join(THUMBNAIL_DIR, `${videoId}.jpg`);
        try {
            await fs.access(thumbnailPath);
            return { valid: true, path: thumbnailPath };
        } catch {
            return { valid: false };
        }
    } catch (error) {
        stats.errors.push(`Error checking local thumbnail for ${videoId}: ${error.message}`);
        return { valid: false };
    }
}

// Download and validate thumbnail
async function downloadThumbnail(video) {
    try {
        const videoId = extractVideoId(video.youtube_url);
        if (!videoId) {
            stats.errors.push(`Invalid YouTube URL: ${video.youtube_url}`);
            return null;
        }

        const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/default.jpg`;
        const thumbnailPath = path.join(THUMBNAIL_DIR, `${videoId}.jpg`);

        // Check if thumbnail already exists
        const localCheck = await checkLocalThumbnail(videoId);
        if (localCheck.valid) {
            stats.thumbnailsSkipped++;
            return localCheck.path;
        }

        // Download thumbnail
        const response = await axios.get(thumbnailUrl, {
            responseType: 'arraybuffer',
            timeout: TIMEOUT_MS
        });

        // Create thumbnails directory if it doesn't exist
        await fs.mkdir(THUMBNAIL_DIR, { recursive: true });

        // Save thumbnail
        await fs.writeFile(thumbnailPath, Buffer.from(response.data));
        stats.thumbnailsDownloaded++;

        return thumbnailPath;
    } catch (error) {
        stats.errors.push(`Error downloading thumbnail for ${video.youtube_url}: ${error.message}`);
        return null;
    }
}

// Validate video using YouTube API
async function validateVideo(video) {
    try {
        const videoId = extractVideoId(video.youtube_url);
        if (!videoId) {
            stats.errors.push(`Invalid YouTube URL: ${video.youtube_url}`);
            return false;
        }

        // Use YouTube Data API v3 to validate video
        const response = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
            params: {
                part: 'status',
                id: videoId,
                key: process.env.YOUTUBE_API_KEY
            },
            timeout: TIMEOUT_MS
        });

        if (response.data.items.length === 0) {
            return false;
        }

        const videoStatus = response.data.items[0].status;
        return videoStatus.privacyStatus === 'public' && !videoStatus.embeddable;
    } catch (error) {
        // If API fails, fall back to basic URL validation
        try {
            const response = await axios.head(video.youtube_url, { timeout: TIMEOUT_MS });
            return response.status === 200;
        } catch (err) {
            stats.errors.push(`Error validating video ${video.youtube_url}: ${err.message}`);
            return false;
        }
    }
}

// Process artist with rate limiting
async function processArtist(artist) {
    try {
        console.log(`Processing artist: ${artist.artist_name}`);
        stats.totalArtists++;
        
        let validVideos = [];
        for (const video of artist.music_videos) {
            stats.totalVideos++;
            
            // Validate video
            const isValid = await validateVideo(video);
            if (!isValid) {
                stats.invalidVideos++;
                continue;
            }

            // Download thumbnail
            const thumbnailPath = await downloadThumbnail(video);
            if (!thumbnailPath) {
                stats.invalidVideos++;
                continue;
            }

            validVideos.push({
                ...video,
                thumbnail_path: thumbnailPath
            });
            stats.validVideos++;
        }

        // If no valid videos, remove artist
        if (validVideos.length === 0) {
            stats.artistsRemoved++;
            return null;
        }

        return {
            ...artist,
            music_videos: validVideos
        };
    } catch (error) {
        stats.errors.push(`Error processing artist ${artist.artist_name}: ${error.message}`);
        return null;
    }
}

// Process artists in batches with rate limiting
async function processArtistsBatch(artists) {
    const batchSize = Math.min(CONCURRENT_OPERATIONS, artists.length);
    const batch = artists.slice(0, batchSize);
    
    // Process batch
    const results = await Promise.all(
        batch.map(artist => processArtist(artist))
    );
    
    // Filter out null results
    const validResults = results.filter(result => result !== null);
    
    // Return remaining artists
    return {
        results: validResults,
        remaining: artists.slice(batchSize)
    };
}

// Main processing function
async function processAllArtists(artists) {
    let remaining = [...artists];
    const results = [];
    
    while (remaining.length > 0) {
        const { results: batchResults, remaining: newRemaining } = await processArtistsBatch(remaining);
        results.push(...batchResults);
        remaining = newRemaining;
        
        // Rate limiting: wait between batches
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return results;
}

// Main function
async function main() {
    try {
        console.log('Starting validation process...');
        
        // Read the input file
        const data = await fs.readFile(ARTIST_DATA_FILE, 'utf8');
        const artists = JSON.parse(data);
        
        // Process all artists
        const validArtists = await processAllArtists(artists);
        
        // Write the output file
        await fs.writeFile(OUTPUT_FILE, JSON.stringify(validArtists, null, 2));
        
        // Print statistics
        console.log('\nValidation complete!');
        console.log('Statistics:');
        console.log(`Total artists processed: ${stats.totalArtists}`);
        console.log(`Total videos processed: ${stats.totalVideos}`);
        console.log(`Valid videos: ${stats.validVideos}`);
        console.log(`Invalid videos removed: ${stats.invalidVideos}`);
        console.log(`Artists removed: ${stats.artistsRemoved}`);
        console.log(`Thumbnails downloaded: ${stats.thumbnailsDownloaded}`);
        console.log(`Thumbnails skipped (already exist): ${stats.thumbnailsSkipped}`);
        
        if (stats.errors.length > 0) {
            console.log('\nErrors encountered:');
            stats.errors.forEach(error => console.log(error));
        }
        
    } catch (error) {
        console.error('Error processing videos:', error);
    }
}

main();
