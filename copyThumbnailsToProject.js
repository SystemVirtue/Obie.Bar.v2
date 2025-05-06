// =============================================================================
// ==                     copyThumbnailsToProject.js                         ==
// ==   Copy downloaded thumbnails from ~/Thumbnails to project directory    ==
// =============================================================================

const fs = require('fs');
const path = require('path');

// Configuration
const HOME_THUMBNAILS_DIR = path.join(process.env.HOME, 'Thumbnails');
const PROJECT_THUMBNAILS_DIR = path.join(__dirname, 'Thumbnails');
const JSON_PATH = path.join(__dirname, 'Videos_by_Artist.JSON');

// Stats tracking
let stats = {
    totalFound: 0,
    copied: 0,
    alreadyExist: 0,
    errors: 0
};

// Ensure project thumbnails directory exists
function ensureProjectThumbnailsDir() {
    if (!fs.existsSync(PROJECT_THUMBNAILS_DIR)) {
        console.log(`Creating project thumbnails directory at ${PROJECT_THUMBNAILS_DIR}`);
        fs.mkdirSync(PROJECT_THUMBNAILS_DIR, { recursive: true });
    }
}

// Extract video IDs from URLs in the database
function extractVideoIdsFromDatabase() {
    console.log(`Reading JSON data from ${JSON_PATH}`);
    
    try {
        // Read the video data
        const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
        
        if (!Array.isArray(data)) {
            throw new Error('Invalid JSON format: expected an array');
        }
        
        // Extract all thumbnail URLs and video IDs
        const videoIds = new Set();
        
        // Process artists and their videos
        data.forEach(artist => {
            if (artist && artist.music_videos && Array.isArray(artist.music_videos)) {
                artist.music_videos.forEach(video => {
                    if (video && video.track_thumb) {
                        try {
                            // Extract video ID from thumbnail URL
                            const urlParts = video.track_thumb.split('/');
                            let videoId = null;
                            
                            // Find the video ID (typically after 'vi' in the URL)
                            for (let i = 0; i < urlParts.length; i++) {
                                if (urlParts[i] === 'vi' && i < urlParts.length - 1) {
                                    videoId = urlParts[i + 1];
                                    break;
                                }
                            }
                            
                            // If we couldn't extract a video ID using the above method
                            if (!videoId && urlParts.length >= 2) {
                                // Fallback: assume the second-to-last part is the ID
                                videoId = urlParts[urlParts.length - 2];
                            }
                            
                            if (videoId) {
                                videoIds.add(videoId);
                            }
                        } catch (error) {
                            console.warn(`Could not extract video ID from URL ${video.track_thumb}`);
                        }
                    }
                });
            }
        });
        
        stats.totalFound = videoIds.size;
        console.log(`Found ${stats.totalFound} unique video IDs in the database`);
        
        return Array.from(videoIds);
    } catch (error) {
        console.error(`Error extracting video IDs: ${error.message}`);
        process.exit(1);
    }
}

// Copy thumbnails from home directory to project directory
function copyThumbnails(videoIds) {
    ensureProjectThumbnailsDir();
    
    // Check if source directory exists
    if (!fs.existsSync(HOME_THUMBNAILS_DIR)) {
        console.error(`Home thumbnails directory ${HOME_THUMBNAILS_DIR} does not exist!`);
        console.error('Please run thumbDownloader.js first to download thumbnails.');
        process.exit(1);
    }
    
    console.log(`Copying thumbnails from ${HOME_THUMBNAILS_DIR} to ${PROJECT_THUMBNAILS_DIR}`);
    
    // Get list of files in home thumbnails directory
    const files = fs.readdirSync(HOME_THUMBNAILS_DIR);
    
    // Create a map of videoId -> filename
    const thumbnailFiles = new Map();
    files.forEach(file => {
        // Extract the video ID from the filename (before the extension)
        const videoId = path.parse(file).name;
        thumbnailFiles.set(videoId, file);
    });
    
    // Copy thumbnails for each video ID
    let processedCount = 0;
    videoIds.forEach(videoId => {
        try {
            const fileName = thumbnailFiles.get(videoId);
            
            // Skip if we don't have a file for this video ID
            if (!fileName) {
                return;
            }
            
            const sourcePath = path.join(HOME_THUMBNAILS_DIR, fileName);
            const destPath = path.join(PROJECT_THUMBNAILS_DIR, fileName);
            
            // Skip if the file already exists in the project directory
            if (fs.existsSync(destPath)) {
                stats.alreadyExist++;
                return;
            }
            
            // Copy the file
            fs.copyFileSync(sourcePath, destPath);
            stats.copied++;
            
            // Update progress every 100 files
            processedCount++;
            if (processedCount % 100 === 0) {
                console.log(`Copied ${processedCount} thumbnails...`);
            }
        } catch (error) {
            console.error(`Error copying thumbnail for video ID ${videoId}: ${error.message}`);
            stats.errors++;
        }
    });
}

// Main function
function main() {
    console.log("YouTube Thumbnail Copier");
    
    try {
        // Extract video IDs from the database
        const videoIds = extractVideoIdsFromDatabase();
        
        // Copy thumbnails
        copyThumbnails(videoIds);
        
        // Show results
        console.log("\n======= Thumbnail Copy Summary =======");
        console.log(`Total video IDs in database: ${stats.totalFound}`);
        console.log(`Thumbnails copied: ${stats.copied}`);
        console.log(`Thumbnails already in project: ${stats.alreadyExist}`);
        console.log(`Errors: ${stats.errors}`);
        console.log("======================================");
        
        console.log(`\nThumbnails have been copied to: ${PROJECT_THUMBNAILS_DIR}`);
        console.log('Your web browser can now access these thumbnails locally.');
        
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

// Run the main function
main();
