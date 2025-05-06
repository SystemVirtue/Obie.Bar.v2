// =============================================================================
// ==                        enhancedValidation.js                           ==
// ==       Advanced validation script for video and thumbnail data          ==
// =============================================================================

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

// Configuration
const JSON_PATH = path.join(__dirname, 'Videos_by_Artist.JSON');
const OUTPUT_PATH = path.join(__dirname, 'Videos_by_Artist_Validated.JSON');
const LOCAL_THUMBNAILS_DIR = path.join(__dirname, 'Thumbnails');
const GENERIC_THUMB_PATH = path.join(__dirname, 'generic_youtube_thumbnail.jpg');
const CONCURRENT_CHECKS = 10; // Number of concurrent validation operations
const TIMEOUT_MS = 5000; // 5 second timeout for network requests

// Stats tracking
let stats = {
    totalArtists: 0,
    totalVideos: 0,
    videosMissingThumbnail: 0,
    videosGenericThumbnail: 0,
    videosInvalidYouTubeId: 0,
    videosRemoved: 0,
    artistsRemoved: 0,
    artistsWithNoVideos: 0,
    validVideos: 0,
    validArtists: 0
};

// Get file hash for comparison
function getFileHash(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            return null;
        }
        
        const fileBuffer = fs.readFileSync(filePath);
        const hashSum = crypto.createHash('md5');
        hashSum.update(fileBuffer);
        return hashSum.digest('hex');
    } catch (error) {
        console.error(`Error hashing file ${filePath}: ${error.message}`);
        return null;
    }
}

// Extract YouTube video ID from URL
function extractVideoId(url) {
    if (!url) return null;
    
    try {
        // Handle common YouTube URL formats
        // youtube.com/watch?v=VIDEO_ID
        // youtu.be/VIDEO_ID
        // youtube.com/v/VIDEO_ID
        
        let videoId = null;
        
        // Format: youtube.com/watch?v=VIDEO_ID
        if (url.includes('youtube.com/watch')) {
            const urlObj = new URL(url);
            videoId = urlObj.searchParams.get('v');
        } 
        // Format: youtu.be/VIDEO_ID
        else if (url.includes('youtu.be/')) {
            const parts = url.split('youtu.be/');
            if (parts.length > 1) {
                videoId = parts[1].split('?')[0].split('&')[0];
            }
        }
        // Format: youtube.com/v/VIDEO_ID
        else if (url.includes('youtube.com/v/')) {
            const parts = url.split('youtube.com/v/');
            if (parts.length > 1) {
                videoId = parts[1].split('?')[0].split('&')[0];
            }
        }
        
        // Clean up the video ID
        if (videoId) {
            videoId = videoId.trim();
        }
        
        return videoId;
    } catch (error) {
        console.error(`Error extracting video ID from ${url}: ${error.message}`);
        return null;
    }
}

// Check if a local thumbnail exists and is valid (not generic)
async function checkLocalThumbnail(videoId) {
    if (!videoId) return { valid: false, reason: 'No video ID' };
    
    // Get hash of generic thumbnail for comparison
    const genericThumbHash = getFileHash(GENERIC_THUMB_PATH);
    if (!genericThumbHash) {
        return { valid: false, reason: 'Could not read generic thumbnail' };
    }
    
    // Check for thumbnail files in the local directory
    const files = fs.readdirSync(LOCAL_THUMBNAILS_DIR);
    
    // Look for files that start with the video ID (may have different extensions)
    const matchingFiles = files.filter(file => file.startsWith(videoId));
    
    if (matchingFiles.length === 0) {
        return { valid: false, reason: 'No local thumbnail found' };
    }
    
    // Check if any of the matching files are non-generic thumbnails
    for (const file of matchingFiles) {
        const localPath = path.join(LOCAL_THUMBNAILS_DIR, file);
        const localHash = getFileHash(localPath);
        
        if (localHash && localHash !== genericThumbHash) {
            return { valid: true, path: localPath };
        }
    }
    
    // If we got here, all found thumbnails are generic
    return { valid: false, reason: 'Only generic thumbnails found' };
}

// Check thumbnail URL to see if it's valid and not generic
async function checkRemoteThumbnail(url) {
    return new Promise((resolve) => {
        if (!url || typeof url !== 'string' || url === 'null') {
            resolve({ valid: false, reason: 'Invalid or null URL' });
            return;
        }
        
        // Parse URL
        let urlObj;
        try {
            urlObj = new URL(url);
        } catch (error) {
            resolve({ valid: false, reason: `Invalid URL format: ${error.message}` });
            return;
        }
        
        // Choose http or https module based on protocol
        const protocol = urlObj.protocol === 'https:' ? https : http;
        
        const request = protocol.get(url, { timeout: TIMEOUT_MS }, (response) => {
            // Check if redirected
            if (response.statusCode === 301 || response.statusCode === 302) {
                if (response.headers.location) {
                    // Follow redirect (but only once to avoid loops)
                    checkRemoteThumbnail(response.headers.location)
                        .then(resolve)
                        .catch(() => resolve({ valid: false, reason: 'Redirect error' }));
                    return;
                }
                resolve({ valid: false, reason: 'Redirect without location header' });
                return;
            }
            
            // Check for successful response
            if (response.statusCode !== 200) {
                resolve({ valid: false, reason: `HTTP Error: ${response.statusCode}` });
                return;
            }
            
            // Check content type
            const contentType = response.headers['content-type'] || '';
            if (!contentType.startsWith('image/')) {
                resolve({ valid: false, reason: `Not an image: ${contentType}` });
                return;
            }
            
            // Check content length - extremely small images are likely placeholder thumbnails
            const contentLength = parseInt(response.headers['content-length'] || '0', 10);
            if (contentLength > 0 && contentLength < 1000) {
                resolve({ valid: false, reason: `Suspiciously small image: ${contentLength} bytes` });
                return;
            }
            
            // Image appears valid
            resolve({ valid: true, url: url });
            
            // Consume the response data to free up memory
            response.on('data', () => {});
            response.on('end', () => {});
        });
        
        // Handle request errors
        request.on('error', (err) => {
            resolve({ valid: false, reason: `Request error: ${err.message}` });
        });
        
        // Handle timeouts
        request.on('timeout', () => {
            request.destroy();
            resolve({ valid: false, reason: 'Request timeout' });
        });
    });
}

// Check video validity using both local and remote methods
async function validateVideo(video, artistName) {
    // Skip if missing essential data
    if (!video || !video.youtube_url || !video.title) {
        return { valid: false, reason: 'Missing essential data' };
    }
    
    // Extract video ID
    const videoId = extractVideoId(video.youtube_url);
    if (!videoId) {
        stats.videosInvalidYouTubeId++;
        return { valid: false, reason: 'Invalid YouTube URL or could not extract video ID' };
    }
    
    // Skip if thumbnail URL is explicitly null
    if (video.track_thumb === 'null' || video.track_thumb === null) {
        stats.videosMissingThumbnail++;
        return { valid: false, reason: 'Thumbnail URL is null' };
    }
    
    // First check local thumbnail
    const localCheck = await checkLocalThumbnail(videoId);
    if (localCheck.valid) {
        return { valid: true, videoId, source: 'local' };
    }
    
    // If local check failed, try remote
    const remoteCheck = await checkRemoteThumbnail(video.track_thumb);
    if (remoteCheck.valid) {
        return { valid: true, videoId, source: 'remote' };
    }
    
    // If thumbnail is invalid
    if (localCheck.reason === 'Only generic thumbnails found' || 
        remoteCheck.reason === 'Suspiciously small image') {
        stats.videosGenericThumbnail++;
    } else {
        stats.videosMissingThumbnail++;
    }
    
    return { 
        valid: false, 
        videoId, 
        reason: `Local check: ${localCheck.reason}, Remote check: ${remoteCheck.reason}` 
    };
}

// Process videos in batches
async function processArtistBatch(artistBatch) {
    const results = [];
    
    for (const artist of artistBatch) {
        // Skip invalid artist data
        if (!artist || !artist.artist_name || !Array.isArray(artist.music_videos)) {
            continue;
        }
        
        // Track artist validity
        const validVideos = [];
        const videoBatch = artist.music_videos.slice();
        const totalVideos = videoBatch.length;
        
        // Skip artists with no videos
        if (totalVideos === 0) {
            stats.artistsWithNoVideos++;
            continue;
        }
        
        // Process videos in parallel
        const validationPromises = videoBatch.map(video => validateVideo(video, artist.artist_name));
        const validationResults = await Promise.all(validationPromises);
        
        // Filter valid videos based on validation results
        for (let i = 0; i < validationResults.length; i++) {
            if (validationResults[i].valid) {
                validVideos.push(videoBatch[i]);
                stats.validVideos++;
            } else {
                stats.videosRemoved++;
            }
        }
        
        // Only include artists with at least one valid video
        if (validVideos.length > 0) {
            results.push({
                ...artist,
                music_videos: validVideos
            });
            stats.validArtists++;
        } else {
            stats.artistsRemoved++;
        }
    }
    
    return results;
}

// Main validation function
async function validateDatabase() {
    return new Promise(async (resolve, reject) => {
        try {
            console.log(`Reading JSON data from ${JSON_PATH}`);
            const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
            
            if (!Array.isArray(data)) {
                throw new Error('Invalid JSON format: expected an array');
            }
            
            stats.totalArtists = data.length;
            let totalVideos = 0;
            data.forEach(artist => {
                if (artist && artist.music_videos && Array.isArray(artist.music_videos)) {
                    totalVideos += artist.music_videos.length;
                }
            });
            stats.totalVideos = totalVideos;
            
            console.log(`Validating ${stats.totalArtists} artists with ${stats.totalVideos} total videos...`);
            
            // Process in batches to control concurrency
            const batchSize = CONCURRENT_CHECKS;
            const validatedData = [];
            let processed = 0;
            
            // Process artists in batches
            for (let i = 0; i < data.length; i += batchSize) {
                const batch = data.slice(i, i + batchSize);
                const results = await processArtistBatch(batch);
                validatedData.push(...results);
                
                processed += batch.length;
                const percentage = Math.floor((processed / stats.totalArtists) * 100);
                console.log(`Progress: ${percentage}% (${processed}/${stats.totalArtists} artists)`);
            }
            
            // Save validated data
            fs.writeFileSync(OUTPUT_PATH, JSON.stringify(validatedData, null, 2));
            
            resolve({
                stats,
                validatedData
            });
            
        } catch (error) {
            reject(error);
        }
    });
}

// Main function
async function main() {
    console.log("Enhanced YouTube Music Video Database Validation");
    
    try {
        // Ensure thumbnails directory exists
        if (!fs.existsSync(LOCAL_THUMBNAILS_DIR)) {
            console.error(`Error: Local thumbnails directory ${LOCAL_THUMBNAILS_DIR} does not exist!`);
            process.exit(1);
        }
        
        // Validate database
        const result = await validateDatabase();
        
        // Show results
        console.log("\n\n======= Validation Summary =======");
        console.log(`Original database: ${stats.totalArtists} artists, ${stats.totalVideos} videos`);
        console.log(`Invalid videos removed: ${stats.videosRemoved}`);
        console.log(`  - Videos with missing thumbnails: ${stats.videosMissingThumbnail}`);
        console.log(`  - Videos with generic thumbnails: ${stats.videosGenericThumbnail}`);
        console.log(`  - Videos with invalid YouTube IDs: ${stats.videosInvalidYouTubeId}`);
        console.log(`Artists with no valid videos: ${stats.artistsRemoved}`);
        console.log(`Cleaned database: ${stats.validArtists} artists, ${stats.validVideos} videos`);
        console.log(`Removed ${Math.round((stats.videosRemoved / stats.totalVideos) * 100)}% of videos`);
        console.log(`Removed ${Math.round((stats.artistsRemoved / stats.totalArtists) * 100)}% of artists`);
        console.log(`Validated database saved to: ${OUTPUT_PATH}`);
        console.log("=================================");
        
        console.log("\nTo use the validated database:");
        console.log("1. Backup your original database if needed:");
        console.log(`   cp "${JSON_PATH}" "${JSON_PATH}.backup"`);
        console.log("2. Replace the original with the validated version:");
        console.log(`   cp "${OUTPUT_PATH}" "${JSON_PATH}"`);
        
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

// Run the main function
main();
