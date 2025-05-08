// =============================================================================
// ==                         cleanDatabase.js                               ==
// ==       Utility to clean up Videos_by_Artist.JSON database               ==
// =============================================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration
const JSON_PATH = path.join(__dirname, 'Videos_by_Artist.JSON');
const OUTPUT_PATH = path.join(__dirname, 'Videos_by_Artist_Clean.JSON');
const THUMBNAILS_DIR = path.join(process.env.HOME, 'Thumbnails');
const GENERIC_THUMB_PATH = path.join(__dirname, 'generic_youtube_thumbnail.jpg');

// Stats tracking
let stats = {
    originalArtists: 0,
    originalVideos: 0,
    removedArtists: 0,
    removedVideos: 0,
    remainingArtists: 0,
    remainingVideos: 0
};

// Get file hash for comparison
function getFileHash(filePath) {
    try {
        const fileBuffer = fs.readFileSync(filePath);
        const hashSum = crypto.createHash('md5');
        hashSum.update(fileBuffer);
        return hashSum.digest('hex');
    } catch (error) {
        console.error(`Error hashing file ${filePath}: ${error.message}`);
        return null;
    }
}

// Check if a thumbnail is valid
async function isValidThumbnail(videoId, thumbUrl) {
    // Basic URL validation
    if (!thumbUrl || typeof thumbUrl !== 'string') {
        return false;
    }
    
    // Extract filename from URL
    try {
        const urlObj = new URL(thumbUrl);
        const pathParts = urlObj.pathname.split('/');
        
        // The video ID is usually the part after /vi/ in the path
        let thumbVideoId = '';
        for (let i = 0; i < pathParts.length; i++) {
            if (pathParts[i] === 'vi' && i < pathParts.length - 1) {
                thumbVideoId = pathParts[i + 1];
                break;
            }
        }
        
        // If we couldn't extract a video ID from URL, use the provided one
        if (!thumbVideoId) {
            thumbVideoId = videoId;
        }
        
        // Get file extension from URL
        const ext = path.extname(urlObj.pathname) || '.jpg';
        
        // Check if the thumbnail exists locally
        const localThumbPath = path.join(THUMBNAILS_DIR, `${thumbVideoId}${ext}`);
        
        if (fs.existsSync(localThumbPath)) {
            // Get hash of generic thumbnail
            const genericThumbHash = getFileHash(GENERIC_THUMB_PATH);
            
            // Get hash of this thumbnail
            const thisThumbHash = getFileHash(localThumbPath);
            
            // If hashes match, this is a generic thumbnail (invalid)
            if (genericThumbHash && thisThumbHash && genericThumbHash === thisThumbHash) {
                return false;
            }
            
            // If file exists and isn't generic, it's valid
            return true;
        }
        
        // If the thumbnail wasn't successfully downloaded, it's likely invalid
        return false;
    } catch (error) {
        console.error(`Error checking thumbnail ${thumbUrl}: ${error.message}`);
        return false;
    }
}

// Clean the database
async function cleanDatabase(jsonData) {
    stats.originalArtists = jsonData.length;
    let totalVideos = 0;
    jsonData.forEach(artist => {
        if (artist && artist.music_videos && Array.isArray(artist.music_videos)) {
            totalVideos += artist.music_videos.length;
        }
    });
    stats.originalVideos = totalVideos;
    
    console.log(`Processing ${stats.originalArtists} artists with ${stats.originalVideos} total videos...`);
    
    // Get hash of generic thumbnail for comparison
    const genericThumbHash = getFileHash(GENERIC_THUMB_PATH);
    if (!genericThumbHash) {
        console.error("Could not read generic thumbnail for comparison. Continuing without this check.");
    }
    
    // Process each artist
    const cleanedData = [];
    let artistsProcessed = 0;
    
    for (const artist of jsonData) {
        artistsProcessed++;
        
        if (artistsProcessed % 10 === 0) {
            process.stdout.write(`\rProcessing artist ${artistsProcessed}/${stats.originalArtists}...`);
        }
        
        // Skip invalid artist data
        if (!artist || !artist.artist_name || !Array.isArray(artist.music_videos)) {
            stats.removedArtists++;
            continue;
        }
        
        // Filter valid videos
        const validVideos = [];
        
        for (const video of artist.music_videos) {
            // Skip videos without required fields
            if (!video || !video.youtube_url || !video.title) {
                stats.removedVideos++;
                continue;
            }
            
            // Extract video ID from YouTube URL
            let videoId = null;
            try {
                const urlParts = video.youtube_url.split('v=');
                if (urlParts.length > 1) {
                    videoId = urlParts[1].split('&')[0];
                }
            } catch (error) {
                // Skip videos with malformed URLs
                stats.removedVideos++;
                continue;
            }
            
            // Skip videos without valid ID
            if (!videoId) {
                stats.removedVideos++;
                continue;
            }
            
            // Check thumbnail validity
            const isValid = await isValidThumbnail(videoId, video.track_thumb);
            
            if (isValid) {
                validVideos.push(video);
            } else {
                stats.removedVideos++;
            }
        }
        
        // Skip artists with no valid videos
        if (validVideos.length === 0) {
            stats.removedArtists++;
            continue;
        }
        
        // Create cleaned artist entry
        const cleanedArtist = {
            ...artist,
            music_videos: validVideos
        };
        
        cleanedData.push(cleanedArtist);
        stats.remainingVideos += validVideos.length;
    }
    
    stats.remainingArtists = cleanedData.length;
    
    return cleanedData;
}

// Main function
async function main() {
    console.log("YouTube Music Video Database Cleaner");
    console.log(`Reading JSON data from ${JSON_PATH}`);
    
    try {
        // Read the video data
        const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
        
        if (!Array.isArray(data)) {
            throw new Error('Invalid JSON format: expected an array');
        }
        
        // Clean the database
        const cleanedData = await cleanDatabase(data);
        
        // Save cleaned database
        fs.writeFileSync(OUTPUT_PATH, JSON.stringify(cleanedData, null, 2));
        
        // Show results
        console.log("\n\n======= Database Cleaning Summary =======");
        console.log(`Original database: ${stats.originalArtists} artists, ${stats.originalVideos} videos`);
        console.log(`Removed: ${stats.removedArtists} artists, ${stats.removedVideos} videos`);
        console.log(`Cleaned database: ${stats.remainingArtists} artists, ${stats.remainingVideos} videos`);
        console.log(`Removed ${Math.round((stats.removedVideos / stats.originalVideos) * 100)}% of videos`);
        console.log(`Removed ${Math.round((stats.removedArtists / stats.originalArtists) * 100)}% of artists`);
        console.log(`Cleaned database saved to: ${OUTPUT_PATH}`);
        console.log("==========================================");
        
        console.log("\nTo use the cleaned database:");
        console.log("1. Backup your original database if needed:");
        console.log(`   cp "${JSON_PATH}" "${JSON_PATH}.backup"`);
        console.log("2. Replace the original with the cleaned version:");
        console.log(`   cp "${OUTPUT_PATH}" "${JSON_PATH}"`);
        
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

// Run the main function
main();
