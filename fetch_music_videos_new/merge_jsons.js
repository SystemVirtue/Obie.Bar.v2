const fs = require('fs').promises;
const path = require('path');

const LOCAL_FILE = path.join(__dirname, 'Videos_by_Artist_Validated.JSON');
const REMOTE_FILE = path.join(__dirname, 'remote_Videos_by_Artist_Validated.JSON');
const OUTPUT_FILE = path.join(__dirname, 'Videos_by_Artist_Validated_Combo.JSON');

async function readJsonFile(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        throw error;
    }
}

function mergeArtists(localArtists, remoteArtists) {
    const mergedArtists = new Map();
    const stats = {
        localArtists: 0,
        remoteArtists: 0,
        mergedArtists: 0,
        localVideos: 0,
        remoteVideos: 0,
        totalVideos: 0,
        uniqueVideos: 0
    };

    // Helper function to normalize artist names
    function normalizeName(name) {
        return name.toLowerCase().trim();
    }

    // Process local artists
    localArtists.forEach(artist => {
        stats.localArtists++;
        const normalized = normalizeName(artist.artist_name);
        const existing = mergedArtists.get(normalized);
        
        if (!existing) {
            mergedArtists.set(normalized, {
                artist_name: artist.artist_name,
                mbid: artist.mbid,
                music_videos: new Set()
            });
        }

        // Add local videos
        artist.music_videos.forEach(video => {
            stats.localVideos++;
            mergedArtists.get(normalized).music_videos.add(video.youtube_url);
        });
    });

    // Process remote artists
    remoteArtists.forEach(artist => {
        stats.remoteArtists++;
        const normalized = normalizeName(artist.artist_name);
        const existing = mergedArtists.get(normalized);
        
        if (!existing) {
            mergedArtists.set(normalized, {
                artist_name: artist.artist_name,
                mbid: artist.mbid,
                music_videos: new Set()
            });
        }

        // Add remote videos
        artist.music_videos.forEach(video => {
            stats.remoteVideos++;
            mergedArtists.get(normalized).music_videos.add(video.youtube_url);
        });
    });

    // Convert Set to array and finalize merged artists
    mergedArtists.forEach(artist => {
        stats.mergedArtists++;
        stats.totalVideos += artist.music_videos.size;
        stats.uniqueVideos += artist.music_videos.size;
        artist.music_videos = Array.from(artist.music_videos);
    });

    return { mergedArtists: Array.from(mergedArtists.values()), stats };
}

async function main() {
    try {
        console.log('Reading local file...');
        const localArtists = await readJsonFile(LOCAL_FILE);
        
        console.log('Reading remote file...');
        const remoteArtists = await readJsonFile(REMOTE_FILE);
        
        console.log('Merging artists...');
        const { mergedArtists, stats } = mergeArtists(localArtists, remoteArtists);
        
        console.log('Writing merged file...');
        await fs.writeFile(OUTPUT_FILE, JSON.stringify(mergedArtists, null, 2));
        
        // Print statistics
        console.log('\nMerge Statistics:');
        console.log(`Local artists: ${stats.localArtists}`);
        console.log(`Remote artists: ${stats.remoteArtists}`);
        console.log(`Merged artists: ${stats.mergedArtists}`);
        console.log(`Local videos: ${stats.localVideos}`);
        console.log(`Remote videos: ${stats.remoteVideos}`);
        console.log(`Total videos: ${stats.totalVideos}`);
        console.log(`Unique videos: ${stats.uniqueVideos}`);
        
        console.log('\nComparison:');
        console.log(`Local file artist count: ${localArtists.length}`);
        console.log(`Remote file artist count: ${remoteArtists.length}`);
        console.log(`Merged file artist count: ${mergedArtists.length}`);
        
        console.log('\nMerge complete!');
        
    } catch (error) {
        console.error('Error:', error);
    }
}

main();
