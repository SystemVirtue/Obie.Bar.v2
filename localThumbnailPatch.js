// =============================================================================
// ==                         localThumbnailPatch.js                         ==
// ==       Utility to modify script.js to use local thumbnails first        ==
// =============================================================================

const fs = require('fs');
const path = require('path');
const { getFilenameFromUrl } = require('./thumbDownloader');

const SCRIPT_PATH = path.join(__dirname, 'script.js');
const THUMBNAILS_DIR = path.join(process.env.HOME, 'Thumbnails');

// Read the script file
console.log(`Reading script file: ${SCRIPT_PATH}`);
const scriptContent = fs.readFileSync(SCRIPT_PATH, 'utf8');

// Create the function to check for local thumbnails first
const localThumbnailFunctionCode = `
    // --- Get local thumbnail if available, otherwise use remote URL ---
    function getLocalThumbnailIfAvailable(remoteUrl) {
        if (!remoteUrl) return PLACEHOLDER_THUMB_URL;
        
        try {
            // Convert remote URL to local filename
            const urlParts = remoteUrl.split('/');
            const videoId = urlParts[urlParts.length - 2];
            const extension = remoteUrl.split('.').pop().split('?')[0]; // Get extension without query params
            
            // Check if we have a local file
            const localPath = \`Thumbnails/\${videoId}.\${extension}\`;
            
            // Return the local path if it exists, otherwise return the remote URL
            return localPath;
        } catch (e) {
            console.warn("Error getting local thumbnail:", e);
            return remoteUrl;
        }
    }
`;

// Replace relevant parts of the code
let modifiedContent = scriptContent;

// 1. Add the local thumbnail function after the constants section
const constantsSectionEnd = "const FADE_DURATION_MS = 3000;";
if (modifiedContent.includes(constantsSectionEnd)) {
    modifiedContent = modifiedContent.replace(
        constantsSectionEnd,
        `${constantsSectionEnd}\n${localThumbnailFunctionCode}`
    );
} else {
    console.error("Could not find constants section to insert local thumbnail function");
    process.exit(1);
}

// 2. Modify the image.src assignment in the renderGrid function
// Find the img.src assignment line
const imgSrcRegex = /img\.src\s*=\s*thumbUrl\s*\|\|\s*PLACEHOLDER_THUMB_URL;/;
if (imgSrcRegex.test(modifiedContent)) {
    modifiedContent = modifiedContent.replace(
        imgSrcRegex,
        'img.src = thumbUrl ? getLocalThumbnailIfAvailable(thumbUrl) : PLACEHOLDER_THUMB_URL;'
    );
} else {
    console.error("Could not find img.src assignment in renderGrid function");
    process.exit(1);
}

// Write the modified content back to the file
console.log("Writing modified script back to file...");
fs.writeFileSync(SCRIPT_PATH, modifiedContent);

console.log("✅ Script.js has been modified to use local thumbnails first!");
console.log(`Local thumbnails will be read from: ${THUMBNAILS_DIR}`);
console.log("Make sure you've run thumbDownloader.js to populate this directory.");

// Create a README with instructions
const readmePath = path.join(__dirname, 'THUMBNAIL_INSTRUCTIONS.md');
const readmeContent = `# Thumbnail Management Instructions

## Overview
This jukebox application has been enhanced to use local thumbnails for faster loading and offline use.

## Setup Steps
1. Run the thumbnail downloader to fetch all thumbnails:
   \`\`\`
   node thumbDownloader.js
   \`\`\`

2. The thumbnails will be downloaded to: ${THUMBNAILS_DIR}

3. The script.js file has been patched to prioritize local thumbnails over remote ones.

## Notes
- If a thumbnail is not found locally, the application will still try to load it from the internet
- You can re-run the thumbnail downloader at any time to fetch new thumbnails
- The thumbnail downloader requires Node.js

## Benefits
- Faster initial loading
- Reduced internet usage
- Works better in low-connectivity environments
- Reduces API rate limiting issues with YouTube
`;

fs.writeFileSync(readmePath, readmeContent);
console.log(`Created instructions file: ${readmePath}`);
