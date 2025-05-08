// =============================================================================
// ==                           thumbDownloader.js                           ==
// ==        Utility to download, validate and save YouTube thumbnails       ==
// =============================================================================

// Required modules
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Configuration
const THUMBNAILS_DIR = path.join(process.env.HOME, 'Thumbnails');
const JSON_PATH = path.join(__dirname, 'Videos_by_Artist.JSON');
const CONCURRENT_DOWNLOADS = 5; // Number of concurrent downloads
const TIMEOUT_MS = 10000; // 10 second timeout for downloads

// Stats tracking
let stats = {
    totalImages: 0,
    successfulDownloads: 0,
    failedDownloads: 0,
    skippedExisting: 0,
    invalidUrls: 0
};

// Create thumbnails directory if it doesn't exist
function ensureThumbnailsDir() {
    if (!fs.existsSync(THUMBNAILS_DIR)) {
        console.log(`Creating thumbnails directory at ${THUMBNAILS_DIR}`);
        fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
    }
}

// Get a safe filename from a URL
function getFilenameFromUrl(url) {
    try {
        // Extract video ID from YouTube thumbnail URL
        // Common formats:
        // - https://i.ytimg.com/vi/VIDEOID/hqdefault.jpg
        // - https://i.ytimg.com/vi/VIDEOID/mqdefault.jpg
        // - https://img.youtube.com/vi/VIDEOID/0.jpg
        
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/');
        
        // The video ID is usually the part after /vi/ in the path
        let videoId = '';
        for (let i = 0; i < pathParts.length; i++) {
            if (pathParts[i] === 'vi' && i < pathParts.length - 1) {
                videoId = pathParts[i + 1];
                break;
            }
        }
        
        if (!videoId) {
            // If we couldn't extract a video ID, use a hash of the URL
            videoId = 'thumb_' + Buffer.from(url).toString('hex').substring(0, 10);
        }
        
        // Get file extension from URL
        const ext = path.extname(urlObj.pathname) || '.jpg';
        
        return `${videoId}${ext}`;
    } catch (error) {
        console.error(`Error parsing URL ${url}: ${error.message}`);
        // Fallback to a hash of the URL
        return 'thumb_' + Buffer.from(url).toString('hex').substring(0, 16) + '.jpg';
    }
}

// Download a single image
function downloadImage(url, destPath) {
    return new Promise((resolve, reject) => {
        // Skip if file already exists
        if (fs.existsSync(destPath)) {
            stats.skippedExisting++;
            return resolve({ success: true, path: destPath, status: 'skipped' });
        }
        
        // Validate URL
        let urlObj;
        try {
            urlObj = new URL(url);
        } catch (error) {
            stats.invalidUrls++;
            return reject(new Error(`Invalid URL: ${url}`));
        }
        
        // Choose http or https module based on protocol
        const protocol = urlObj.protocol === 'https:' ? https : http;
        
        const request = protocol.get(url, { timeout: TIMEOUT_MS }, (response) => {
            // Check if redirected
            if (response.statusCode === 301 || response.statusCode === 302) {
                if (response.headers.location) {
                    return downloadImage(response.headers.location, destPath)
                        .then(resolve)
                        .catch(reject);
                }
                return reject(new Error(`Redirect without location header: ${url}`));
            }
            
            // Check for successful response
            if (response.statusCode !== 200) {
                return reject(new Error(`HTTP Error: ${response.statusCode} for ${url}`));
            }
            
            // Check content type
            const contentType = response.headers['content-type'] || '';
            if (!contentType.startsWith('image/')) {
                return reject(new Error(`Not an image: ${contentType} for ${url}`));
            }
            
            // Create write stream
            const fileStream = fs.createWriteStream(destPath);
            
            // Pipe response to file
            response.pipe(fileStream);
            
            // Handle errors
            fileStream.on('error', (err) => {
                fs.unlink(destPath, () => {}); // Delete partial file
                reject(err);
            });
            
            // Resolve when download completes
            fileStream.on('finish', () => {
                fileStream.close();
                resolve({ success: true, path: destPath, status: 'downloaded' });
            });
        });
        
        // Handle request errors
        request.on('error', (err) => {
            reject(err);
        });
        
        // Handle timeouts
        request.on('timeout', () => {
            request.destroy();
            reject(new Error(`Request timeout: ${url}`));
        });
    });
}

// Process all videos in batches
async function processVideos(videoData) {
    ensureThumbnailsDir();
    
    // Extract all thumbnail URLs
    let allThumbnails = [];
    
    // Process artists and their videos
    videoData.forEach(artist => {
        if (artist && artist.music_videos && Array.isArray(artist.music_videos)) {
            artist.music_videos.forEach(video => {
                if (video && video.track_thumb) {
                    // Save video info
                    allThumbnails.push({
                        url: video.track_thumb,
                        artist: artist.artist_name,
                        title: video.title || "Unknown"
                    });
                }
            });
        }
    });
    
    stats.totalImages = allThumbnails.length;
    console.log(`Found ${stats.totalImages} thumbnail URLs to process`);
    
    // Process in batches to control concurrency
    const batchSize = CONCURRENT_DOWNLOADS;
    let processed = 0;
    
    // Process a batch of thumbnails
    async function processBatch(startIndex) {
        const batch = allThumbnails.slice(startIndex, startIndex + batchSize);
        if (batch.length === 0) return;
        
        const promises = batch.map(item => {
            const filename = getFilenameFromUrl(item.url);
            const destPath = path.join(THUMBNAILS_DIR, filename);
            
            return downloadImage(item.url, destPath)
                .then(result => {
                    if (result.status === 'downloaded') {
                        stats.successfulDownloads++;
                        process.stdout.write(`\rDownloaded: ${stats.successfulDownloads}, Skipped: ${stats.skippedExisting}, Failed: ${stats.failedDownloads} | Progress: ${Math.floor((processed / stats.totalImages) * 100)}%`);
                    } else {
                        process.stdout.write(`\rDownloaded: ${stats.successfulDownloads}, Skipped: ${stats.skippedExisting}, Failed: ${stats.failedDownloads} | Progress: ${Math.floor((processed / stats.totalImages) * 100)}%`);
                    }
                })
                .catch(error => {
                    stats.failedDownloads++;
                    console.error(`\nFailed to download ${item.url} for "${item.artist} - ${item.title}": ${error.message}`);
                });
        });
        
        await Promise.all(promises);
        processed += batch.length;
        
        // Process next batch
        await processBatch(startIndex + batchSize);
    }
    
    // Start processing
    const startTime = Date.now();
    await processBatch(0);
    const endTime = Date.now();
    
    // Log results
    console.log("\n\n======= Thumbnail Download Summary =======");
    console.log(`Total images found: ${stats.totalImages}`);
    console.log(`Successfully downloaded: ${stats.successfulDownloads}`);
    console.log(`Skipped (already exist): ${stats.skippedExisting}`);
    console.log(`Failed downloads: ${stats.failedDownloads}`);
    console.log(`Invalid URLs: ${stats.invalidUrls}`);
    console.log(`Time taken: ${((endTime - startTime) / 1000).toFixed(2)} seconds`);
    console.log("=========================================");
    
    return {
        stats,
        thumbnailsDir: THUMBNAILS_DIR
    };
}

// Main function to run the downloader
async function main() {
    console.log("YouTube Thumbnail Downloader");
    console.log(`Reading JSON data from ${JSON_PATH}`);
    
    try {
        // Read the video data
        const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
        
        if (!Array.isArray(data)) {
            throw new Error('Invalid JSON format: expected an array');
        }
        
        console.log(`Found data for ${data.length} artists`);
        
        // Process the videos
        await processVideos(data);
        
        console.log(`\nThumbnails have been saved to: ${THUMBNAILS_DIR}`);
        console.log('You can now update the script.js file to use local thumbnails first');
        
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

// Run the main function if this script is executed directly
if (require.main === module) {
    main();
}

module.exports = {
    processVideos,
    ensureThumbnailsDir,
    getFilenameFromUrl
};
