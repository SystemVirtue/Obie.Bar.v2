// =============================================================================
// ==                              script.js                                  ==
// ==       Main Jukebox Interface Logic (Data Loading, UI, Player Comm)      ==
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const gridContainer = document.getElementById('grid-container');
    const scrollUpButton = document.getElementById('scroll-up');
    const scrollDownButton = document.getElementById('scroll-down');
    const scrollThumb = document.getElementById('scroll-thumb');
    const scrollTrack = scrollThumb.parentElement;

    const searchAllButton = document.getElementById('search-all-button');
    const browseArtistsButton = document.getElementById('browse-artists-button');
    const browseSongsButton = document.getElementById('browse-songs-button');
    const backButton = document.getElementById('back-button');
    const searchInput = document.getElementById('search-input');

    const keyboardContainer = document.getElementById('keyboard-container');
    const keyClear = document.getElementById('key-clear');
    const keySpace = document.getElementById('key-space');
    const keyToggle = document.getElementById('key-toggle');
    const toggleKeys = keyboardContainer.querySelectorAll('.toggle-key');

    // Status Overlay Elements
    const statusOverlay = document.getElementById('status-overlay');
    const statusMessage = document.getElementById('status-message');
    const progressBar = document.getElementById('progress-bar');
    const statusDetail = document.getElementById('status-detail');

    // Confirmation Popup Container
    const confirmationPopupContainer = document.getElementById('confirmation-popup-container');

    // Header Display Elements
    const nowPlayingEl = document.getElementById('now-playing');
    const comingUpTickerEl = document.getElementById('coming-up');

    // --- State Variables ---
    let currentMode = 'artists';
    let keyboardMode = 'alpha';
    let allArtists = [];
    let allSongs = [];
    let fullFilteredList = [];
    let displayedItems = [];
    let currentPage = 0;
    const itemsPerPage = 16;
    let totalPages = 0;
    let lastSearchTerm = '';
    let originalJsonData = null;
    let isDataLoaded = false; // Flag for data readiness

    let filteredArtistMbid = null;
    let previousArtistScrollPosition = 0;

    let playerWindow = null;
    let playlistQueue = [];
    let currentlyPlayingVideoId = null;
    let currentlyPlayingVideoArtist = null;
    let currentlyPlayingVideoTitle = null;
    let currentlyPlayingIsFromQueue = false;
    let isFreePlayMode = true;

    // --- Constants ---
    const JSON_URL = 'Videos_by_Artist.JSON';
    const PLAYER_URL = 'player.html';
    const PLACEHOLDER_THUMB_URL = 'generic_youtube_thumbnail.jpg'; // !!! Needs correct path !!!
    let PLACEHOLDER_THUMB_SIZE = -1; // Will only be fetched if validation is chosen
    const alphaKeys = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split('');
    const numericKeys = "1234567890".split('');
    const COMMAND_STORAGE_KEY = 'jukeboxCommand';
    const STATUS_STORAGE_KEY = 'jukeboxStatus';
    const FADE_DURATION_MS = 3000;

    // --- Get local thumbnail if available, otherwise use remote URL ---
    // Map to track which thumbnails have been checked
    const thumbnailCache = {};
    
    function getLocalThumbnailIfAvailable(remoteUrl) {
        if (!remoteUrl) return PLACEHOLDER_THUMB_URL;
        
        // If we've already checked this URL, return the cached result
        if (thumbnailCache[remoteUrl] !== undefined) {
            return thumbnailCache[remoteUrl];
        }
        
        try {
            // Extract video ID from YouTube thumbnail URL
            let videoId = null;
            try {
                const urlParts = remoteUrl.split('/');
                // Find the video ID which is typically before the file name in YouTube URLs
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
            } catch (e) {
                console.warn("Error extracting video ID:", e);
                thumbnailCache[remoteUrl] = remoteUrl; // Cache the result
                return remoteUrl;
            }
            
            if (!videoId) {
                thumbnailCache[remoteUrl] = remoteUrl; // Cache the result
                return remoteUrl;
            }
            
            // Get file extension from URL
            const extension = remoteUrl.split('.').pop().split('?')[0] || 'jpg';
            
            // First check if we have a thumbnail in the local project Thumbnails folder
            const projectLocalPath = `Thumbnails/${videoId}.${extension}`;
            
            // Create a test image to see if we can load the local thumbnail
            const img = new Image();
            img.src = projectLocalPath;
            
            // If the image loads successfully, use the local path
            img.onload = function() {
                thumbnailCache[remoteUrl] = projectLocalPath;
            };
            
            // If the image fails to load, fall back to remote URL
            img.onerror = function() {
                console.log(`Could not load thumbnail from ${projectLocalPath}, falling back to remote URL`);
                thumbnailCache[remoteUrl] = remoteUrl;
            };
            
            // For the initial call, before onload/onerror has a chance to run,
            // return the remote URL to avoid blocking
            thumbnailCache[remoteUrl] = remoteUrl;
            return remoteUrl;
        } catch (e) {
            console.warn("Error getting local thumbnail:", e);
            thumbnailCache[remoteUrl] = remoteUrl; // Cache the result
            return remoteUrl;
        }
    }


    // =============================================================================
    // ==                         Core Functions                                  ==
    // =============================================================================

    // --- Admin Functions ---
    // Hidden feature to run validation (for admin use)
    async function runAdminValidation() {
        if (!isDataLoaded) {
            alert("Data must be loaded before running validation.");
            return;
        }
        
        if (!confirm("ADMIN FUNCTION: Run full thumbnail validation?\n\nThis will check all thumbnails and may take a long time to complete.")) {
            return;
        }
        
        showStatus("ADMIN: Running thumbnail validation...", 0);
        
        try {
            // Fetch Placeholder Size if needed
            if (PLACEHOLDER_THUMB_SIZE <= 0) {
                PLACEHOLDER_THUMB_SIZE = await fetchImageSize(PLACEHOLDER_THUMB_URL);
                if (PLACEHOLDER_THUMB_SIZE <= 0) { 
                    throw new Error(`Could not load placeholder thumbnail from ${PLACEHOLDER_THUMB_URL}.`); 
                }
                console.log(`Placeholder thumbnail size: ${PLACEHOLDER_THUMB_SIZE} bytes`);
            }
            
            // Run validation
            showStatus("ADMIN: Validating thumbnails...", 10);
            const validationResults = await validateAndCleanData(originalJsonData);
            
            // Process the results
            processCleanedData(validationResults);
            
            // Update UI
            updateDisplay();
            updateNowPlaying(null, null);
            updateComingUpTicker();
            
            // Done
            showStatus("ADMIN: Validation complete!", 100);
            setTimeout(hideStatus, 2000);
            
            alert("Validation complete! The UI has been updated with validated data.");
            
        } catch (error) {
            console.error("Error during admin validation:", error);
            showErrorStatus(`Admin Validation Error: ${error.message}`);
        }
    }
    
    // --- Startup Sequence (No Validation Prompt) ---
    async function startup() {
        // Always skip validation during normal startup
        const shouldValidate = false; // No longer prompted, always false
        
        showStatus("Loading database...", 0);
        
        try {
            // 1. Load Initial Data (Always needed)
            originalJsonData = await loadInitialData(JSON_URL);

            let validationResults = null;

            // Always use the Skip Validation path by default
            console.log("Normal startup: Skipping thumbnail validation.");
            showStatus("Processing data...", 50);
            // Directly process raw data without removing items based on thumbnails
            // We still need to clean titles and structure the data
            validationResults = processRawDataWithoutValidation(originalJsonData);
            showStatus("Processing complete.", 100);
            await new Promise(r => setTimeout(r, 100)); // Short delay to show message

            // 4. Process Data into final structures (using either validated or raw-processed results)
            processCleanedData(validationResults); // Populates allArtists & allSongs
            isDataLoaded = true; // <<< SET FLAG NOW

            // 5. Setup Player Communication Listener
            window.addEventListener('storage', handlePlayerStatusUpdate);

            // 6. Update Main UI
            updateDisplay();
            updateNowPlaying(null, null);
            updateComingUpTicker();

            // 7. Open Player Window
            openPlayerWindow();

            // 8. Hide Status Overlay
            hideStatus();

            // 9. Start Initial Playback
            startInitialPlayback();

        } catch (error) {
            console.error("Error during startup:", error);
            showErrorStatus(`Startup Error: ${error.message}. Cannot start Jukebox.`);
            isDataLoaded = false;
        }
    }

    // --- Player Window Management ---
    function openPlayerWindow() {
        console.log("DEBUG: [Jukebox] Attempting to open player window...");
        const windowFeatures = "popup=yes,width=800,height=600,resizable=yes,scrollbars=no,status=no,toolbar=no,menubar=no,location=no";
        try {
             playerWindow = window.open(PLAYER_URL, 'JukeboxPlayerWindow', windowFeatures);
             if (!playerWindow || playerWindow.closed || typeof playerWindow.closed == 'undefined') { throw new Error("Popup blocked or failed to open."); }
             console.log("DEBUG: [Jukebox] Player window opened or reference obtained.");
             playerWindow.focus();
        } catch (e) { console.error("DEBUG: [Jukebox] Failed to open player window:", e); showErrorStatus("Error: Could not open player window. Check popups."); }
    }

    // --- Send Command to Player Window ---
    function sendCommandToPlayer(commandData) {
        console.log(`DEBUG: [Jukebox] Sending command: ${commandData.action}`, commandData);
        if (!playerWindow || playerWindow.closed) { console.warn("DEBUG: [Jukebox] Player window closed. Command aborted.", commandData.action); return; }
        try { commandData.timestamp = Date.now(); localStorage.setItem(COMMAND_STORAGE_KEY, JSON.stringify(commandData)); }
        catch (e) { console.error("DEBUG: [Jukebox] Error writing command to localStorage:", e); }
    }

    // --- Handle Player Status Updates ---
    function handlePlayerStatusUpdate(event) { /* ... (Keep function as is from previous version) ... */
        if (event.key === STATUS_STORAGE_KEY && event.newValue && event.storageArea === localStorage) {
            try {
                const statusData = JSON.parse(event.newValue); console.log("DEBUG: [Jukebox] Parsed status:", statusData);
                const statusVideoId = statusData.id;
                switch (statusData.status) {
                    case 'ended':
                        if (statusVideoId && statusVideoId === currentlyPlayingVideoId) { currentlyPlayingVideoId = null; updateNowPlaying(null, null); playNextInQueueOrRandom(); }
                        else { console.warn(`DEBUG: [Jukebox] Received 'ended' for unexpected ID: ${statusVideoId}. Ignoring.`); }
                        break;
                    case 'error':
                         if (statusVideoId && statusVideoId === currentlyPlayingVideoId) { currentlyPlayingVideoId = null; updateNowPlaying("Error", statusData.message||`Code ${statusData.code}`); setTimeout(()=>playNextInQueueOrRandom(), 1500); }
                         else { console.warn(`DEBUG: [Jukebox] Received 'error' for unexpected ID: ${statusVideoId}. Ignoring.`); }
                        break;
                    case 'fadeComplete':
                          if (statusVideoId && statusVideoId === currentlyPlayingVideoId) { currentlyPlayingVideoId = null; updateNowPlaying(null, null); }
                         break;
                     case 'ready': console.log("DEBUG: [Jukebox] Player window ready."); break;
                    default: console.log(`DEBUG: [Jukebox] Unhandled status: ${statusData.status}`); break;
                }
            } catch (e) { console.error("DEBUG: [Jukebox] Error parsing status event:", e); }
        }
    }

    // --- Queue Management & Playback Logic ---
    function addToQueue(videoData) { /* ... (Keep function as is from previous version) ... */
        if (!videoData || !videoData.id) { console.error("DEBUG: [Jukebox] Invalid video data for queue."); return; }
        const videoInfo = { id: videoData.id, title: videoData.title || "?", artist: videoData.artist || "?" };
        console.log(`DEBUG: [Jukebox] Adding: ${videoInfo.artist} - ${videoInfo.title}`);
        const wasEmpty = playlistQueue.length === 0; playlistQueue.push(videoInfo); updateComingUpTicker();
        if (wasEmpty && currentlyPlayingVideoId === null) { console.log("DEBUG: [Jukebox] Starting queue playback."); playNextInQueueOrRandom(); }
    }
    function playNextInQueueOrRandom() { /* ... (Keep function as is from previous version) ... */
        console.log(`DEBUG: [Jukebox] playNextInQueueOrRandom called.`);
        if (!isDataLoaded) { console.warn("playNextInQueueOrRandom: Data not loaded."); return; }
        if (!allSongs || allSongs.length === 0) { console.warn("No valid songs."); updateNowPlaying("Idle", "No videos"); return; }
        let nextVideo = null, playSource = '';
        if (playlistQueue.length > 0) { nextVideo = playlistQueue.shift(); currentlyPlayingIsFromQueue = true; playSource = 'QUEUE'; }
        else { currentlyPlayingIsFromQueue = false; const validSongs = allSongs.filter(v => v.id); if (validSongs.length > 0) { const idx = Math.floor(Math.random() * validSongs.length); const song = validSongs[idx]; nextVideo = { id: song.id, title: song.title, artist: song.artist_name }; playSource = 'RANDOM'; } else { console.warn('No valid songs for random.'); updateNowPlaying("Idle", "No videos"); return; } }
        if (nextVideo && nextVideo.id) { console.log(`Playing next from ${playSource}:`, nextVideo); currentlyPlayingVideoId = nextVideo.id; currentlyPlayingVideoArtist = nextVideo.artist; currentlyPlayingVideoTitle = nextVideo.title; updateNowPlaying(currentlyPlayingVideoArtist, currentlyPlayingVideoTitle); updateComingUpTicker(); sendCommandToPlayer({ action: 'play', videoId: currentlyPlayingVideoId, title: currentlyPlayingVideoTitle, artist: currentlyPlayingVideoArtist }); }
        else { console.error("Failed to get next video."); currentlyPlayingVideoId = null; updateNowPlaying("Error", "No next video"); updateComingUpTicker(); }
    }
    function startInitialPlayback() { /* ... (Keep function as is from previous version) ... */
        if (!isDataLoaded) { console.warn("Initial play deferred: Data not ready."); return; }
        console.log("Triggering initial play."); playNextInQueueOrRandom();
    }

    // --- Data Loading & Processing ---
    async function loadInitialData(url) { /* ... (Keep function as is from previous version) ... */
        try {
            const response = await fetch(url);
            if (!response.ok) { let txt=`Status: ${response.status} ${response.statusText}`; try{if(response.body){const r=response.body.getReader();const{value}=await r.read();const t=new TextDecoder().decode(value);txt+=` - Body:${t.substring(0,100)}`} }catch(e){} throw new Error(`HTTP error! ${txt}`); }
            const ct = response.headers.get("content-type"); if (!ct || !ct.includes("application/json")) { let rt = await response.text(); throw new Error(`Expected JSON, got ${ct}. Body:${rt.substring(0,200)}`); }
            const data = await response.json(); if (!Array.isArray(data)) { throw new Error("Invalid data: Expected array."); }
            console.log(`Fetched and parsed ${url}`); return data;
        } catch (error) { console.error(`Error fetching ${url}:`, error); throw new Error(`Failed load/parse ${url}. ${error.message||'Fetch error'}`); }
    }
    async function fetchImageSize(url) { /* ... (Keep function as is from previous version, including 404 log) ... */
        try {
            const r = await fetch(url, {mode:'cors',cache:"no-cache"});
            if (!r.ok) { if(r.status===404){console.warn(`404: ${url}`);}else{console.warn(`Fetch fail: ${url} (${r.status})`);} return -1; }
            const ct = r.headers.get("content-type"); if (!ct || !ct.startsWith("image/")) { console.warn(`Expected image, got "${ct}" for ${url}`); return -1; }
            const b = await r.arrayBuffer(); if (b.byteLength === 0) { console.warn(`Zero-byte image: ${url}`); return -1; }
            return b.byteLength;
        } catch (error) { console.error(`Error fetching size ${url}:`, error); return -1; }
    }

    // VALIDATE AND CLEAN DATA (Batched - Called only if user confirms)
    function validateAndCleanData(rawData) { /* ... (Keep BATCHED version from previous response) ... */
        return new Promise(async (resolve, reject) => {
            let validatedVideos = []; let totalVideos = 0;
            rawData.forEach(a => { if (Array.isArray(a.music_videos)) { totalVideos += a.music_videos.length; } });
            console.log(`Starting validation (batched) for ${totalVideos} videos...`);
            let processedCount = 0, batchSize = 50, artistIdx = 0, videoIdx = 0;
            showStatus("Validating thumbnails...", 0, `Checked 0 of ${totalVideos}`);

            async function processBatch() {
                try {
                    let batchProcessed = 0;
                    while (artistIdx < rawData.length && batchProcessed < batchSize) {
                        const artist = rawData[artistIdx];
                        if (artist && artist.artist_name && Array.isArray(artist.music_videos)) {
                            const videos = artist.music_videos;
                            while (videoIdx < videos.length && batchProcessed < batchSize) {
                                const video = videos[videoIdx]; let isValid = false, reason = "Missing data";
                                if (video && video.track_thumb && video.youtube_url && video.title) {
                                    // First extract video ID from YouTube URL
                                    let videoId = null;
                                    try {
                                        const urlParts = video.youtube_url.split('v=');
                                        if (urlParts.length > 1) {
                                            videoId = urlParts[1].split('&')[0];
                                        }
                                    } catch (e) {
                                        reason = "Invalid YouTube URL";
                                    }

                                    // Skip videos with null thumbnails
                                    if (video.track_thumb === 'null' || video.track_thumb === null) {
                                        reason = "Null thumbnail URL";
                                    }
                                    // First check if we have a valid local thumbnail
                                    else if (videoId) {
                                        // Check for a local thumbnail in the Thumbnails directory
                                        let localThumbUrl = `Thumbnails/${videoId}.jpg`;
                                        if (PLACEHOLDER_THUMB_SIZE > 0) {
                                            // If we have a local thumbnail that's not the placeholder, it's valid
                                            const localThumbSize = await fetchImageSize(localThumbUrl);
                                            if (localThumbSize > 0 && localThumbSize !== PLACEHOLDER_THUMB_SIZE) {
                                                isValid = true;
                                                reason = "";
                                            } else {
                                                // If local check failed, try remote
                                                const ts = await fetchImageSize(video.track_thumb);
                                                if (ts > 0 && ts !== PLACEHOLDER_THUMB_SIZE) { 
                                                    isValid = true; 
                                                    reason = ""; 
                                                }
                                                else if (ts === PLACEHOLDER_THUMB_SIZE) { 
                                                    reason = "Placeholder"; 
                                                }
                                                else { 
                                                    reason = `Fetch error/size (${ts})`; 
                                                }
                                            }
                                        } else {
                                            // If we haven't fetched the placeholder size, fall back to remote checking
                                            const ts = await fetchImageSize(video.track_thumb);
                                            if (ts > 0 && ts !== PLACEHOLDER_THUMB_SIZE) { 
                                                isValid = true; 
                                                reason = ""; 
                                            }
                                            else if (ts === PLACEHOLDER_THUMB_SIZE) { 
                                                reason = "Placeholder"; 
                                            }
                                            else { 
                                                reason = `Fetch error/size (${ts})`; 
                                            }
                                        }
                                    } else {
                                        // Fall back to checking remote thumbnail if videoId extraction failed
                                        const ts = await fetchImageSize(video.track_thumb);
                                        if (ts > 0 && ts !== PLACEHOLDER_THUMB_SIZE) { isValid = true; reason = ""; }
                                        else if (ts === PLACEHOLDER_THUMB_SIZE) { reason = "Placeholder"; }
                                        else { reason = `Fetch error/size (${ts})`; }
                                    }
                                }
                                validatedVideos.push({ yt_url: video?.youtube_url, title: video?.title, thumb: video?.track_thumb, artist: artist.artist_name, mbid: artist.mbid, isValid: isValid });
                                processedCount++; batchProcessed++; videoIdx++;
                            }
                            if (videoIdx >= videos.length) { videoIdx = 0; artistIdx++; }
                        } else { artistIdx++; videoIdx = 0; }
                    } // End batch loop

                    const pct = totalVideos > 0 ? Math.round((processedCount / totalVideos) * 100) : 0;
                    showStatus("Validating thumbnails...", pct, `Checked ${processedCount} of ${totalVideos}`);

                    if (processedCount >= totalVideos) { // FINISHED
                        console.log("Validation complete."); showStatus("Cleaning data...", 100, "Filtering..."); await new Promise(r=>setTimeout(r,50));
                        let finalA=[], finalS=[], grouped={};
                        validatedVideos.forEach(v=>{if(!v.mbid)return; if(!grouped[v.mbid]){grouped[v.mbid]={artist:v.artist,mbid:v.mbid,valid_v:[]};} if(v.isValid&&v.yt_url&&v.title&&v.thumb){grouped[v.mbid].valid_v.push({yt_url:v.yt_url,title:v.title,thumb:v.thumb});}});
                        Object.values(grouped).forEach(ad=>{ if(ad.valid_v.length>0){ const ft=ad.valid_v[0]?.thumb||null; finalA.push({artist_name:ad.artist,artist_mbid:ad.mbid,artist_thumb:ft,video_count:ad.valid_v.length}); ad.valid_v.forEach(v=>{const ct=cleanSongTitle(v.title,ad.artist);const eid=extractVideoId(v.yt_url); if(ct&&eid){finalS.push({id:eid,title:ct,artist_name:ad.artist,artist_mbid:ad.mbid,youtube_url:v.yt_url,track_thumb:v.thumb});}});}});
                        finalA.sort((a,b)=>a.artist_name.localeCompare(b.artist_name,undefined,{sensitivity:'base'})); finalS.sort((a,b)=>a.title.localeCompare(b.title,undefined,{sensitivity:'base'}));
                        console.log(`Cleaning done. Artists:${finalA.length}, Songs:${finalS.length}`);
                        resolve({finalArtists:finalA, finalSongs:finalS}); // Resolve promise
                    } else { setTimeout(processBatch, 0); } // Schedule next batch
                } catch (error) { console.error("Batch validation error:", error); reject(error); } // Reject on error
            } // end processBatch
            processBatch(); // Start first batch
        }); // end returned Promise
    }

    // NEW: Process raw data WITHOUT validation (for skipping)
    function processRawDataWithoutValidation(rawData) {
        console.log("Processing data without validation...");
        let finalArtists = [];
        let finalSongs = [];

        rawData.forEach(artist => {
            if (artist.artist_name && Array.isArray(artist.music_videos)) {
                const artistVideos = artist.music_videos;
                const videoCount = artistVideos.length;
                let firstThumb = null;
                // Find first thumb even if potentially invalid
                const firstVideoWithThumb = artistVideos.find(video => video && video.track_thumb);
                if (firstVideoWithThumb) {
                    firstThumb = firstVideoWithThumb.track_thumb;
                }

                // Add artist if they have videos listed (even if they might be invalid)
                if (videoCount > 0) {
                    finalArtists.push({
                        artist_name: artist.artist_name,
                        artist_mbid: artist.mbid,
                        artist_thumb: firstThumb, // Might be placeholder or invalid
                        video_count: videoCount
                    });
                }

                // Add all listed songs, clean titles
                artistVideos.forEach(video => {
                    if (video && video.title && video.youtube_url) {
                        const cleanedTitle = cleanSongTitle(video.title, artist.artist_name);
                        const extractedId = extractVideoId(video.youtube_url);
                        if (cleanedTitle && extractedId) {
                            finalSongs.push({
                                id: extractedId,
                                title: cleanedTitle,
                                artist_name: artist.artist_name,
                                artist_mbid: artist.mbid,
                                youtube_url: video.youtube_url,
                                track_thumb: video.track_thumb // Keep thumb URL
                            });
                        }
                    }
                });
            }
        });

        // Sort results
        finalArtists.sort((a, b) => a.artist_name.localeCompare(b.artist_name, undefined, { sensitivity: 'base' }));
        finalSongs.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));

        console.log(`Raw processing done. Artists:${finalArtists.length}, Songs:${finalSongs.length}`);
        return { finalArtists, finalSongs }; // Return same structure as validated data
    }


    function cleanSongTitle(title, artistName) {
        if (!title) return '';
        let cleaned = title;
        try {
            cleaned = cleaned.replace(/\[.*?\]/g, '').trim();
            cleaned = cleaned.replace(/\(.*?\)/g, '').trim();
            cleaned = cleaned.replace(/\{.*?\}/g, '').trim();

            const indicators = ["Official Music Video", "Music Video", "Official Video", "Official Audio", "Official Lyric Video", "Lyric Video", "Audio", "Video", "Official", "HD", "4K", "HQ"];
            indicators.forEach(indicator => { const regex = new RegExp(`\\b${indicator.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'gi'); cleaned = cleaned.replace(regex, '').trim(); });

             if (artistName) { const escapedArtistName = artistName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'); const artistRegex = new RegExp(`(^|\\W)${escapedArtistName}(\\W|$)`, 'gi'); cleaned = cleaned.replace(artistRegex, '$1$2').trim(); }

            cleaned = cleaned.replace(/\s*-.*/, '').trim(); // Hyphen removal
            cleaned = cleaned.replace(/[\|\/\\]/g, ' ').trim(); // Separators
            cleaned = cleaned.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').trim(); // Leading/trailing non-alphanum
            cleaned = cleaned.replace(/\s+/g, ' ').trim(); // Collapse spaces
        } catch (e) { console.error(`Error cleaning title "${title}":`, e); return title; }
        return cleaned.length > 0 ? cleaned : title;
    }

    function processCleanedData(cleanedData) {
        allArtists = cleanedData.finalArtists;
        allSongs = cleanedData.finalSongs;
        console.log(`Processed cleaned data. Artists: ${allArtists.length}, Songs: ${allSongs.length}`);
    }

    // --- UI Display & Interaction ---
    function updateDisplay() {
        if (!isDataLoaded) { console.warn("updateDisplay called before data loaded. Aborting."); return; }
        if (currentMode !== 'filtered-songs') { currentPage = 0; if (currentMode !== 'artists') { filteredArtistMbid = null; } }
        keyboardMode = 'alpha'; filterAndPaginate(); renderKeyboard(); renderGrid(); updateScrollbar(); updateActiveButton(); updateUIModeVisuals();
    }

    function filterAndPaginate() {
        if (!isDataLoaded) return;
        let sourceItems = []; const searchTerm = searchInput.value.toLowerCase().trim();
        if (currentMode === 'artists') { sourceItems = allArtists; }
        else if (currentMode === 'songs') { filteredArtistMbid = null; sourceItems = allSongs; }
        else if (currentMode === 'filtered-songs') {
             if (filteredArtistMbid) { sourceItems = allSongs.filter(song => song.artist_mbid === filteredArtistMbid); }
             else { console.warn("In filtered-songs mode but no ID. Reverting."); sourceItems = allSongs; currentMode = 'songs'; }
        } else if (currentMode === 'search') {
             if (searchTerm === '') { sourceItems = []; }
             else { const matchingArtists = allArtists.filter(i => i.artist_name.toLowerCase().includes(searchTerm)).map(i=>({...i, type:'artist'})); const matchingSongs = allSongs.filter(i => i.title.toLowerCase().includes(searchTerm) || i.artist_name.toLowerCase().includes(searchTerm)).map(i=>({...i, type:'song'})); sourceItems = [...matchingArtists, ...matchingSongs]; sourceItems.sort((a,b) => { if(a.type==='artist'&&b.type==='song') return -1; if(a.type==='song'&&b.type==='artist') return 1; const tA=(a.type==='artist'?a.artist_name:a.title).toLowerCase(); const tB=(b.type==='artist'?b.artist_name:b.title).toLowerCase(); return tA.localeCompare(tB); }); }
        }
        fullFilteredList=[...sourceItems]; totalPages = Math.ceil(fullFilteredList.length / itemsPerPage); currentPage = Math.max(0, Math.min(currentPage, totalPages - 1)); const startIndex = currentPage * itemsPerPage; const endIndex = startIndex + itemsPerPage; displayedItems = fullFilteredList.slice(startIndex, endIndex); lastSearchTerm = searchTerm;
    }

 
    function renderGrid() {
        if (!isDataLoaded) return;
        gridContainer.innerHTML = '';

        if (displayedItems.length === 0) {
             let message = `No ${currentMode} available.`;
             if (currentMode === 'search' && searchInput.value) message = "No results found.";
             if (currentMode === 'filtered-songs') message = "No videos found for this artist.";
             gridContainer.innerHTML = `<p style="color: #ccc; grid-column: 1 / -1; text-align: center; align-self: center;">${message}</p>`;
        } else {
             const fragment = document.createDocumentFragment();
             displayedItems.forEach(item => {
                 const gridItem = document.createElement('div');
                 gridItem.classList.add('grid-item');
                 const itemType = item.type || (currentMode === 'artists' ? 'artist' : 'song');
                 gridItem.dataset.id = (itemType === 'artist') ? item.artist_mbid : item.id;
                 gridItem.dataset.type = itemType;

                 let thumbUrl = null, topText = '', bottomText = '', needsScrollCheck = false;

                 if (itemType === 'artist') {
                     thumbUrl = item.artist_thumb; topText = item.artist_name; bottomText = `${item.video_count} Video${item.video_count !== 1 ? 's' : ''}`;
                 } else {
                     thumbUrl = item.track_thumb; topText = item.artist_name; bottomText = item.title; needsScrollCheck = true;
                 }

                 const img = document.createElement('img');
                 img.classList.add('grid-item-thumb'); img.loading = "lazy";
                 img.src = thumbUrl ? getLocalThumbnailIfAvailable(thumbUrl) : PLACEHOLDER_THUMB_URL;
                 img.alt = `${topText} - ${bottomText}`;
                 img.onerror = (e) => {
                     e.target.onerror = null; e.target.src = PLACEHOLDER_THUMB_URL; gridItem.classList.add('no-thumb');
                 };
                 if (!thumbUrl) { gridItem.classList.add('no-thumb'); }
                 gridItem.appendChild(img);

                 const topOverlay = document.createElement('div');
                 topOverlay.classList.add('grid-item-overlay', 'top');
                 topOverlay.style.textAlign = 'center';
                 const topSpan = document.createElement('span');
                 topSpan.classList.add('grid-item-text', 'top-text'); 
                 topSpan.style.textAlign = 'center';
                 topSpan.style.width = '100%';
                 topSpan.textContent = topText;
                 topOverlay.appendChild(topSpan); gridItem.appendChild(topOverlay);

                 const bottomOverlay = document.createElement('div');
                 bottomOverlay.classList.add('grid-item-overlay', 'bottom');
                 bottomOverlay.style.textAlign = 'center';
                 const bottomTextContainer = document.createElement('div');
                 bottomTextContainer.classList.add('grid-item-text-container');
                 bottomTextContainer.style.textAlign = 'center';
                 const bottomSpan = document.createElement('span');
                 bottomSpan.classList.add('grid-item-text', 'bottom-text');
                 bottomSpan.style.textAlign = 'center';
                 bottomSpan.style.width = '100%';
                 bottomSpan.textContent = bottomText;
                 bottomTextContainer.appendChild(bottomSpan); bottomOverlay.appendChild(bottomTextContainer); gridItem.appendChild(bottomOverlay);

                 gridItem.addEventListener('click', handleItemClick);
                 fragment.appendChild(gridItem);
             });
             gridContainer.appendChild(fragment);

             // Check scrolling after fragment is in DOM
             gridContainer.querySelectorAll('.grid-item .bottom.grid-item-overlay').forEach(overlay => {
                 const textSpan = overlay.querySelector('.bottom-text');
                 const container = overlay.querySelector('.grid-item-text-container');
                 if (textSpan && container) {
                      setTimeout(() => { // Ensure layout computed
                          if (textSpan.scrollWidth > (container.clientWidth + 1)) {
                              overlay.classList.add('scrolling');
                          } else {
                              overlay.classList.remove('scrolling');
                          }
                      }, 0);
                 }
             });
        }
    }

    function handleItemClick(event) {
        const target = event.currentTarget;
        const id = target.dataset.id;
        const type = target.dataset.type;
        if (!id || !type) { console.error("Missing data-id or data-type on clicked item."); return; }

        console.log(`Item Clicked: Type=${type}, ID=${id}`);

        if (type === 'artist') {
            filteredArtistMbid = id;
            previousArtistScrollPosition = currentPage;
            currentMode = 'filtered-songs';
            updateDisplay();
        } else if (type === 'song') {
             const songData = allSongs.find(song => song.id === id);
             if(songData) {
                showQueueConfirmation({
                    id: songData.id, title: songData.title,
                    artist: songData.artist_name, track_thumb: songData.track_thumb
                });
             } else {
                 console.error("Could not find matching song data for clicked item ID:", id);
                 alert("Error: Could not find video data.");
             }
        }
    }

    function updateScrollbar() {
        if (!isDataLoaded) return;
        totalPages = Math.ceil(fullFilteredList.length / itemsPerPage);
        if (totalPages <= 1) {
            scrollThumb.style.display = 'none';
            scrollUpButton.disabled = true; scrollDownButton.disabled = true;
            scrollUpButton.style.opacity = '0.5'; scrollDownButton.style.opacity = '0.5';
        } else {
            scrollThumb.style.display = 'block';
            const thumbHeightPercentage = Math.max(15, (1 / totalPages) * 100);
            scrollThumb.style.height = `${thumbHeightPercentage}%`;
            currentPage = Math.max(0, Math.min(currentPage, totalPages - 1));
            const trackSpacePercentage = 100 - thumbHeightPercentage;
            const thumbPositionPercentage = totalPages > 1 ? (currentPage / (totalPages - 1)) * trackSpacePercentage : 0;
            scrollThumb.style.top = `${thumbPositionPercentage}%`;
            scrollUpButton.disabled = (currentPage === 0);
            scrollDownButton.disabled = (currentPage >= totalPages - 1);
            scrollUpButton.style.opacity = scrollUpButton.disabled ? '0.5' : '1';
            scrollDownButton.style.opacity = scrollDownButton.disabled ? '0.5' : '1';
        }
    }

    function updateActiveButton() {
        if (!isDataLoaded) return;
        searchAllButton.classList.toggle('active', currentMode === 'search');
        browseArtistsButton.classList.toggle('active', currentMode === 'artists');
        browseSongsButton.classList.toggle('active', currentMode === 'songs' || currentMode === 'filtered-songs');
    }

    function renderKeyboard() {
        const keys = keyboardMode === 'alpha' ? alphaKeys : numericKeys;
        const toggleButtonLabel = keyboardMode === 'alpha' ? '#' : 'A-Z';
        toggleKeys.forEach((button, index) => {
            if (index < keys.length) {
                button.textContent = keys[index]; button.dataset.key = keys[index]; button.style.visibility = 'visible';
            } else { button.textContent = ''; button.style.visibility = 'hidden'; }
        });
        keyToggle.textContent = toggleButtonLabel; keyToggle.dataset.key = toggleButtonLabel;
    }

    function updateUIModeVisuals() {
        if (!isDataLoaded) return;
        const isSearchMode = currentMode === 'search';
        const isFilteredSongsMode = currentMode === 'filtered-songs';
        searchInput.classList.toggle('hidden', !isSearchMode);
        backButton.classList.toggle('hidden', !isSearchMode && !isFilteredSongsMode);
        searchAllButton.classList.toggle('hidden', isSearchMode || isFilteredSongsMode);
        browseArtistsButton.classList.toggle('hidden', isSearchMode || isFilteredSongsMode);
        browseSongsButton.classList.toggle('hidden', isSearchMode || isFilteredSongsMode);
        keyClear.classList.toggle('hidden', !isSearchMode);
        keySpace.classList.toggle('hidden', !isSearchMode);
        keyToggle.classList.remove('hidden');
        toggleKeys.forEach(key => { key.classList.remove('hidden'); });
        if (!isSearchMode && keyboardMode !== 'alpha') { keyboardMode = 'alpha'; renderKeyboard(); }
        else if (isSearchMode) { renderKeyboard(); }
        if (!isSearchMode) { keyToggle.textContent = '#'; keyToggle.dataset.key = '#'; }
        else { renderKeyboard(); } // Update #/A-Z label in search mode too
    }

    function jumpToChar(char) {
        if (currentMode === 'search' || !isDataLoaded) return;
        const isArtistBasedView = (currentMode === 'artists' || currentMode === 'filtered-songs');
        const jumpSourceList = isArtistBasedView ? allArtists : allSongs;
        const field = isArtistBasedView ? 'artist_name' : 'title';
        let targetIndex = -1;

        if (char === '#') {
            targetIndex = jumpSourceList.findIndex(item => item && item[field] && !/^[a-z]/i.test(item[field].trim()));
        } else {
            const lowerChar = char.toLowerCase();
            targetIndex = jumpSourceList.findIndex(item => item && item[field] && item[field].toLowerCase().startsWith(lowerChar));
        }

        if (targetIndex !== -1) {
            if (!isArtistBasedView && currentMode === 'filtered-songs') {
                currentMode = 'songs'; // Switch to all songs if jumping by letter in filtered view
                filteredArtistMbid = null;
            }
            currentPage = Math.floor(targetIndex / itemsPerPage);
            filterAndPaginate(); // Re-filter first
            renderGrid();
            updateScrollbar();
        } else {
            console.log(`No items found starting with '${char}'.`);
        }
    }

    // --- UI Update Functions (Header etc.) ---
    function updateNowPlaying(artist, title) {
        if (!nowPlayingEl) return;
        artist = artist || "---"; title = title || "---";
        nowPlayingEl.textContent = `${artist} - ${title}`;
        const container = document.getElementById('now-playing-container');
        if(container) container.title = `NOW PLAYING: ${artist} - ${title}`;
    }

    function updateCreditStatus() {
        const creditStatusEl = document.getElementById('credit-status');
        if (!creditStatusEl) return;
        
        if (isFreePlayMode) {
            creditStatusEl.textContent = 'FREE-PLAY MODE';
            creditStatusEl.closest('.header-right').classList.add('free-play');
        } else {
            creditStatusEl.textContent = 'CREDIT: 0';
            creditStatusEl.closest('.header-right').classList.remove('free-play');
        }
    }

    function updateComingUpTicker() {
        const tickerEl = document.querySelector('#coming-up .ticker-content');
        if (!tickerEl) return;

        if (playlistQueue.length === 0) {
            tickerEl.innerHTML = '---';
            tickerEl.closest('#coming-up').classList.add('empty');
            tickerEl.closest('#coming-up').classList.remove('animated');
            return;
        }

        tickerEl.closest('#coming-up').classList.remove('empty');
        
        // Create the ticker content with artist-title pairs
        const items = playlistQueue.map(v =>
            `<span class="artist">${v.artist || 'N/A'}</span>
             <span class="separator">-</span>
             <span class="title">${v.title || 'N/A'}</span>`
        ).join('<span class="upcoming-separator">...</span>');
        
        // Duplicate content for continuous scrolling
        const scrollContent = items + '<span class="upcoming-separator">...</span>' + items;
        tickerEl.innerHTML = scrollContent;

        // Reset and restart animation
        tickerEl.closest('#coming-up').classList.remove('animated');
        tickerEl.closest('#coming-up').style.animation = 'none'; // Reset animation
        void tickerEl.offsetWidth; // Force reflow
        tickerEl.closest('#coming-up').style.animation = ''; // Re-apply animation
        tickerEl.closest('#coming-up').classList.add('animated');
    }

    function showQueueConfirmation(videoData) {
         if (confirmationPopupContainer.querySelector('.confirmation-popup')) { return; }
         const popup = document.createElement('div');
         popup.className = 'confirmation-popup';
         const thumbSrc = videoData.track_thumb || PLACEHOLDER_THUMB_URL;

         popup.innerHTML = `
            <img src="${thumbSrc}" alt="Video Thumbnail" onerror="this.onerror=null; this.src='${PLACEHOLDER_THUMB_URL}';">
            <div class="artist-title">${videoData.artist || 'Unknown Artist'}</div>
            <div class="song-title">${videoData.title || 'Unknown Title'}</div>
            <div class="message">Add To Queue?</div>
            <div class="buttons">
                <button class="popup-button cancel" aria-label="Cancel">X</button>
                <button class="popup-button confirm" aria-label="Confirm">✓</button>
            </div>
        `;

         const closePopup = () => {
            confirmationPopupContainer.classList.remove('visible');
             setTimeout(() => { if (popup.parentNode === confirmationPopupContainer) confirmationPopupContainer.removeChild(popup); }, 300);
         };
         popup.querySelector('button.cancel').addEventListener('click', closePopup);
         popup.querySelector('button.confirm').addEventListener('click', () => {
             addToQueue(videoData); closePopup();
         });

         confirmationPopupContainer.innerHTML = '';
         confirmationPopupContainer.appendChild(popup);
         requestAnimationFrame(() => { // Ensure appended before making visible
             confirmationPopupContainer.classList.add('visible');
         });
    }

    // --- Utility ---
    function extractVideoId(url) {
        if (!url) return null;
        try {
            const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
            const match = url.match(regExp);
            if (match && match[2].length === 11) { return match[2]; }
        } catch (e) { console.warn("Regex error extracting video ID from URL:", url, e); }
        if (typeof url === 'string' && url.length === 11 && !url.includes('/')) { return url; }
        // console.warn("Could not extract video ID from URL:", url); // Reduce noise
        return null;
    }

    // --- Status Overlay UI ---
    function showStatus(message, percentage, detail = '') {
        if (!statusOverlay) return; // Guard if element removed
        if (!statusOverlay.classList.contains('visible')) {
             statusOverlay.style.opacity = '0';
             statusOverlay.style.display = 'flex';
             statusOverlay.classList.add('visible');
             void statusOverlay.offsetWidth; // Reflow
             statusOverlay.style.opacity = '1';
        }
        if(statusMessage) statusMessage.textContent = message;
        if(progressBar) {
             progressBar.style.width = `${Math.max(0, Math.min(100, percentage))}%`;
             progressBar.style.backgroundColor = '#00a000'; // Ensure green
        }
        if(statusDetail) statusDetail.textContent = detail;
    }

    function hideStatus() {
         if (!statusOverlay) return;
         statusOverlay.style.opacity = '0';
         setTimeout(() => {
            statusOverlay.classList.remove('visible');
             statusOverlay.style.display = 'none';
         }, 300); // Match CSS transition duration
    }

    function showErrorStatus(message) {
        if (!statusOverlay) return;
        if (!statusOverlay.classList.contains('visible')) {
             statusOverlay.style.opacity = '0';
             statusOverlay.style.display = 'flex';
             statusOverlay.classList.add('visible');
             void statusOverlay.offsetWidth;
             statusOverlay.style.opacity = '1';
        }
        if(statusMessage) statusMessage.textContent = message;
        if(progressBar) {
             progressBar.style.width = '100%';
             progressBar.style.backgroundColor = '#c00000'; // Red for error
        }
        if(statusDetail) statusDetail.textContent = "Please check console for details or reload.";
        // Keep overlay visible on error
    }

    // --- Event Listeners ---
    
    // --- Event Listeners ---
    // Admin Keyboard Shortcut (Ctrl+Alt+V) for running validation
    document.addEventListener('keydown', (e) => {
        // Check for Ctrl+Alt+V combination
        if (e.ctrlKey && e.altKey && e.key === 'v') {
            console.log('Admin validation shortcut triggered');
            runAdminValidation();
        }
    });
    
    searchAllButton.addEventListener('click', ()=>{if(!isDataLoaded)return;if(currentMode!=='search'){currentMode='search';searchInput.value='';updateDisplay();searchInput.focus();}});
    browseArtistsButton.addEventListener('click', ()=>{if(!isDataLoaded)return;if(currentMode!=='artists'){currentMode='artists';filteredArtistMbid=null;searchInput.value='';updateDisplay();}});
    browseSongsButton.addEventListener('click', ()=>{if(!isDataLoaded)return;if(currentMode!=='songs'){currentMode='songs';filteredArtistMbid=null;searchInput.value='';updateDisplay();}});
    backButton.addEventListener('click', ()=>{if(!isDataLoaded)return;if(currentMode==='search'||currentMode==='filtered-songs'){currentMode='artists';filteredArtistMbid=null;searchInput.value='';currentPage=previousArtistScrollPosition;updateDisplay();}});
    searchInput.addEventListener('input', ()=>{if(!isDataLoaded)return;currentPage=0;filterAndPaginate();renderGrid();updateScrollbar();});
    scrollUpButton.addEventListener('click', ()=>{if(!isDataLoaded)return;if(currentPage>0){currentPage--;filterAndPaginate();renderGrid();updateScrollbar();}});
    scrollDownButton.addEventListener('click', ()=>{if(!isDataLoaded)return;totalPages=Math.ceil(fullFilteredList.length/itemsPerPage);if(currentPage<totalPages-1){currentPage++;filterAndPaginate();renderGrid();updateScrollbar();}});
    keyboardContainer.addEventListener('click', (e)=>{if(!e.target.classList.contains('key')||e.target.style.visibility==='hidden')return; const kb=e.target; const k=kb.dataset.key; if(currentMode==='search'){if(k==='clear'){searchInput.value=searchInput.value.slice(0,-1);}else if(k==='space'){searchInput.value+=' ';}else if(k==='#'||k==='A-Z'){keyboardMode=(keyboardMode==='alpha')?'numeric':'alpha';renderKeyboard();}else{searchInput.value+=kb.textContent;} searchInput.focus();searchInput.dispatchEvent(new Event('input',{bubbles:true}));}else{if(isDataLoaded&&(alphaKeys.includes(k)||k==='#')){jumpToChar(k);}}});

    // --- Initialisation ---
    updateCreditStatus(); // Initialize credit status display
    startup(); // Start the application

}); // End of DOMContentLoaded listener