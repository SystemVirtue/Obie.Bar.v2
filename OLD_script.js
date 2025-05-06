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
    let currentMode = 'artists'; // 'artists', 'songs', 'search', 'filtered-songs'
    let keyboardMode = 'alpha'; // 'alpha', 'numeric'
    let allArtists = []; // Holds final, cleaned artist data
    let allSongs = [];   // Holds final, cleaned song data
    let fullFilteredList = []; // Complete list for current view
    let displayedItems = []; // Items currently visible in grid
    let currentPage = 0;
    const itemsPerPage = 16;
    let totalPages = 0;
    let lastSearchTerm = '';
    let originalJsonData = null;
    let isDataLoaded = false;    // Flag for data readiness

    // Artist Filtering State
    let filteredArtistMbid = null;
    let previousArtistScrollPosition = 0;

    // Playback State & Queue
    let playerWindow = null; // Reference to the player window
    let playlistQueue = [];  // Array of video objects {id, title, artist}
    let currentlyPlayingVideoId = null; // Stores the YT Video ID (11 chars)
    let currentlyPlayingVideoArtist = null;
    let currentlyPlayingVideoTitle = null;
    let currentlyPlayingIsFromQueue = false;

    // --- Constants ---
    const JSON_URL = 'Videos_by_Artist.JSON';
    const PLAYER_URL = 'player.html';
    const PLACEHOLDER_THUMB_URL = 'generic_youtube_thumbnail.jpg'; // !!! Needs correct path !!!
    let PLACEHOLDER_THUMB_SIZE = -1;
    const alphaKeys = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split('');
    const numericKeys = "1234567890".split('');
    const COMMAND_STORAGE_KEY = 'jukeboxCommand';
    const STATUS_STORAGE_KEY = 'jukeboxStatus';
    const FADE_DURATION_MS = 3000; // Default fade duration

    // =============================================================================
    // ==                         Core Functions                                  ==
    // =============================================================================

    // --- Startup Sequence ---
    async function startup() {
        showStatus("Loading database...", 0);
        try {
            // 1. Load Initial Data
            originalJsonData = await loadInitialData(JSON_URL);

            // 2. Fetch Placeholder Size
            showStatus("Preparing validation...", 5);
            PLACEHOLDER_THUMB_SIZE = await fetchImageSize(PLACEHOLDER_THUMB_URL);
            if (PLACEHOLDER_THUMB_SIZE <= 0) { // Check for -1 or 0
                throw new Error(`Could not load placeholder thumbnail from ${PLACEHOLDER_THUMB_URL}. Check path/file.`);
            }
            console.log(`Placeholder thumbnail size: ${PLACEHOLDER_THUMB_SIZE} bytes`);

            // 3. Validate & Clean Data
            const validationResults = await validateAndCleanData(originalJsonData);

            // 4. Process Cleaned Data
            processCleanedData(validationResults); // Populates allArtists & allSongs
            isDataLoaded = true; // <<< SET FLAG HERE

            // 5. Open Player Window
            openPlayerWindow();

            // 6. Setup Player Communication Listener
            window.addEventListener('storage', handlePlayerStatusUpdate);

            // 7. Update Main UI & Initial Playback
            hideStatus(); // Hide overlay AFTER data is ready
            updateDisplay(); // Initial render (Browse Artists) - NOW SAFE TO CALL
            updateNowPlaying(null, null); // Clear initially
            updateComingUpTicker(); // Clear initially
            startInitialPlayback(); // Start random playback

        } catch (error) {
            console.error("Error during startup:", error);
            showErrorStatus(`Startup Error: ${error.message}. Cannot start Jukebox.`);
            isDataLoaded = false; // Ensure flag remains false on error
        }
    }

    // --- Player Window Management ---
    function openPlayerWindow() {
        console.log("DEBUG: [Jukebox] Attempting to open player window...");
        const windowFeatures = "popup=yes,width=800,height=600,resizable=yes,scrollbars=no,status=no,toolbar=no,menubar=no,location=no";
        try {
             playerWindow = window.open(PLAYER_URL, 'JukeboxPlayerWindow', windowFeatures);
             if (!playerWindow || playerWindow.closed || typeof playerWindow.closed == 'undefined') {
                  throw new Error("Popup blocked or failed to open.");
             }
             console.log("DEBUG: [Jukebox] Player window opened or reference obtained.");
             playerWindow.focus();
        } catch (e) {
             console.error("DEBUG: [Jukebox] Failed to open player window:", e);
             showErrorStatus("Error: Could not open player window. Please check popup blockers.");
             // Consider disabling playback features if window fails to open
        }
    }

    // --- Send Command to Player Window ---
    function sendCommandToPlayer(commandData) {
        console.log(`DEBUG: [Jukebox] Sending command: ${commandData.action}`, commandData);
        if (!playerWindow || playerWindow.closed) {
             console.warn("DEBUG: [Jukebox] Player window not open or closed. Command aborted.", commandData.action);
             return;
        }
        try {
            commandData.timestamp = Date.now();
            localStorage.setItem(COMMAND_STORAGE_KEY, JSON.stringify(commandData));
        } catch (e) {
            console.error("DEBUG: [Jukebox] Error writing command to localStorage:", e);
        }
    }

    // --- Handle Player Status Updates ---
    function handlePlayerStatusUpdate(event) {
        if (event.key === STATUS_STORAGE_KEY && event.newValue && event.storageArea === localStorage) {
            try {
                const statusData = JSON.parse(event.newValue);
                console.log("DEBUG: [Jukebox] Parsed status:", statusData);
                const statusVideoId = statusData.id;

                switch (statusData.status) {
                    case 'ended':
                        console.log(`DEBUG: [Jukebox] Player reported video ended: ${statusVideoId}`);
                        if (statusVideoId && statusVideoId === currentlyPlayingVideoId) {
                            currentlyPlayingVideoId = null;
                            updateNowPlaying(null, null);
                            playNextInQueueOrRandom();
                        } else { console.warn(`DEBUG: [Jukebox] Received 'ended' for unexpected video ID: ${statusVideoId}. Ignoring.`); }
                        break;
                    case 'error':
                        console.error(`DEBUG: [Jukebox] Player reported error: Code ${statusData.code}, Msg: ${statusData.message}, ID: ${statusVideoId}`);
                         if (statusVideoId && statusVideoId === currentlyPlayingVideoId) {
                            currentlyPlayingVideoId = null;
                            updateNowPlaying("Error", statusData.message || `Code ${statusData.code}`);
                            setTimeout(() => playNextInQueueOrRandom(), 1500);
                         } else { console.warn(`DEBUG: [Jukebox] Received 'error' for unexpected video ID: ${statusVideoId}. Ignoring.`); }
                        break;
                    case 'fadeComplete':
                         console.log(`DEBUG: [Jukebox] Player reported fade complete: ${statusVideoId}`);
                          if (statusVideoId && statusVideoId === currentlyPlayingVideoId) {
                             currentlyPlayingVideoId = null;
                             updateNowPlaying(null, null);
                          }
                         break;
                     case 'ready': console.log("DEBUG: [Jukebox] Player window signaled ready."); break;
                    default: console.log(`DEBUG: [Jukebox] Received unhandled status: ${statusData.status}`); break;
                }
            } catch (e) { console.error("DEBUG: [Jukebox] Error parsing status from storage event:", e); }
        }
    }

    // --- Queue Management & Playback Logic ---
    function addToQueue(videoData) {
        console.log("DEBUG: [Jukebox] addToQueue called with:", videoData);
        if (!videoData || !videoData.id) { console.error("DEBUG: [Jukebox] Invalid video data for queue."); return; }
        const videoInfo = { id: videoData.id, title: videoData.title, artist: videoData.artist };
        console.log(`DEBUG: [Jukebox] Adding to queue: ${videoInfo.artist} - ${videoInfo.title} (${videoInfo.id})`);
        const wasQueueEmpty = playlistQueue.length === 0;
        playlistQueue.push(videoInfo);
        updateComingUpTicker();
        if (wasQueueEmpty && currentlyPlayingVideoId === null) {
            console.log("DEBUG: [Jukebox] Queue was empty and nothing playing, starting queue playback.");
            playNextInQueueOrRandom();
        }
    }

    function playNextInQueueOrRandom() {
        console.log(`DEBUG: [Jukebox] playNextInQueueOrRandom called.`);
        if (!isDataLoaded) { console.warn("DEBUG: [Jukebox] playNextInQueueOrRandom called before data loaded."); return; }
        if (!allSongs || allSongs.length === 0) { console.warn("DEBUG: [Jukebox] No valid songs loaded."); updateNowPlaying("Idle", "No videos available"); return; }

        let nextVideo = null;
        let playSource = '';

        if (playlistQueue.length > 0) {
            nextVideo = playlistQueue.shift(); currentlyPlayingIsFromQueue = true; playSource = 'QUEUE';
        } else {
            currentlyPlayingIsFromQueue = false;
            const validSongs = allSongs.filter(v => v.id && v.youtube_url && v.track_thumb);
            if (validSongs.length > 0) {
                const randomIndex = Math.floor(Math.random() * validSongs.length);
                const randomSong = validSongs[randomIndex];
                nextVideo = { id: randomSong.id, title: randomSong.title, artist: randomSong.artist_name };
                playSource = 'RANDOM';
            } else { console.warn('DEBUG: [Jukebox] No valid songs remaining for random playback.'); updateNowPlaying("Idle", "No videos available"); currentlyPlayingVideoId = null; updateComingUpTicker(); return; }
        }

        if (nextVideo && nextVideo.id) {
            console.log(`DEBUG: [Jukebox] Playing next from ${playSource}:`, nextVideo);
            currentlyPlayingVideoId = nextVideo.id; currentlyPlayingVideoArtist = nextVideo.artist; currentlyPlayingVideoTitle = nextVideo.title;
            updateNowPlaying(currentlyPlayingVideoArtist, currentlyPlayingVideoTitle);
            updateComingUpTicker();
            sendCommandToPlayer({ action: 'play', videoId: currentlyPlayingVideoId, title: currentlyPlayingVideoTitle, artist: currentlyPlayingVideoArtist });
        } else { console.error("DEBUG: [Jukebox] Failed to determine next video."); currentlyPlayingVideoId = null; updateNowPlaying("Error", "Could not get next video"); updateComingUpTicker(); }
    }

    function startInitialPlayback() {
        if (!isDataLoaded) { console.warn("DEBUG: [Jukebox] startInitialPlayback called, but data not ready yet."); return; }
        console.log("DEBUG: [Jukebox] startInitialPlayback: Triggering first random play check.");
        playNextInQueueOrRandom();
    }

    // --- Data Loading & Processing ---
    async function loadInitialData(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                let responseBodyText = `Status: ${response.status} ${response.statusText}`;
                try { if (response.body) { const reader = response.body.getReader(); const { value } = await reader.read(); const text = new TextDecoder().decode(value); responseBodyText += ` - Response Body (start): ${text.substring(0, 100)}`; } } catch (readError) {}
                 throw new Error(`HTTP error! ${responseBodyText}`);
            }
            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                 let responseBodyText = await response.text();
                 throw new Error(`Expected JSON but received content type: ${contentType}. Body starts with: ${responseBodyText.substring(0, 200)}`);
            }
            const data = await response.json();
            if (!Array.isArray(data)) { throw new Error("Invalid data format: Expected an array of artists."); }
            console.log(`DEBUG: [Jukebox] Successfully fetched and parsed ${url}`);
            return data;
        } catch (error) {
            console.error(`Error fetching initial data from ${url}:`, error);
            throw new Error(`Failed to load or parse database from ${url}. ${error.message || 'Unknown fetch error'}`);
        }
    }

    async function fetchImageSize(url) {
        try {
            const response = await fetch(url, { mode: 'cors', cache: "no-cache" });
            if (!response.ok) {
                 // **Log the 404 specifically here if desired**
                 if(response.status === 404) {
                    console.warn(`Thumbnail not found (404): ${url}`);
                 } else {
                    console.warn(`Could not fetch image to get size: ${url} (Status: ${response.status} ${response.statusText})`);
                 }
                 return -1; // Indicates fetch failure (includes 404)
            }
            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.startsWith("image/")) {
                console.warn(`Expected image content type but received "${contentType}" for ${url}`);
                return -1;
            }
            const buffer = await response.arrayBuffer();
            if (buffer.byteLength === 0) {
                console.warn(`Fetched zero-byte image for ${url}`);
                return -1;
            }
            return buffer.byteLength;
        } catch (error) {
            console.error(`Error fetching image size for ${url}:`, error);
            return -1;
        }
    }

    async function validateAndCleanData(rawData) {
        let validatedVideos = [];
        let totalVideos = 0;
        rawData.forEach(artist => { if (Array.isArray(artist.music_videos)) { totalVideos += artist.music_videos.length; } });

        console.log(`Starting validation for ${totalVideos} videos...`);
        let processedCount = 0;
        showStatus("Validating thumbnails...", 0, `Checked 0 of ${totalVideos}`);

        for (const artist of rawData) {
            if (artist.artist_name && Array.isArray(artist.music_videos)) {
                const videosForArtist = artist.music_videos;
                for (let i = 0; i < videosForArtist.length; i++) {
                     const video = videosForArtist[i];
                     let isValid = false;
                     let reason = "Missing data"; // Default reason for invalidity

                     if (video && video.track_thumb && video.youtube_url && video.title) {
                         const thumbSize = await fetchImageSize(video.track_thumb);
                         if (thumbSize > 0 && thumbSize !== PLACEHOLDER_THUMB_SIZE) {
                             isValid = true;
                             reason = ""; // Valid, clear reason
                         } else if (thumbSize === PLACEHOLDER_THUMB_SIZE) {
                              reason = "Placeholder thumbnail detected";
                              // console.log(`${reason}: ${artist.artist_name} - ${video.title}`);
                          } else { // thumbSize <= 0 or -1
                              reason = `Fetch error or zero size (Status: ${thumbSize})`; // thumbSize holds status or -1
                              // **Log the removal due to fetch failure (which includes 404)**
                              console.warn(`Removing video due to thumbnail fetch error/size: ${artist.artist_name} - ${video.title} (${video.track_thumb}) - Reason: ${reason}`);
                          }
                     } else {
                          // console.warn(`Treating video as invalid due to missing data: ${artist.artist_name} - ${video?.title || 'N/A'}`);
                          reason = "Missing video data fields";
                     }

                     validatedVideos.push({
                         youtube_url: video?.youtube_url, title: video?.title, track_thumb: video?.track_thumb,
                         artist_name: artist.artist_name, artist_mbid: artist.mbid,
                         isValid: isValid // Store validation result
                     });

                    processedCount++;
                    const percentage = totalVideos > 0 ? Math.round((processedCount / totalVideos) * 100) : 0;
                    if (processedCount % 20 === 0 || processedCount === totalVideos) {
                        showStatus("Validating thumbnails...", percentage, `Checked ${processedCount} of ${totalVideos}`);
                        await new Promise(resolve => setTimeout(resolve, 0)); // Yield
                    }
                }
            }
        }

        console.log("Thumbnail validation complete.");
        showStatus("Cleaning data...", 100, "Filtering artists and songs...");
        await new Promise(resolve => setTimeout(resolve, 50)); // Pause for UI

        let finalArtists = [];
        let finalSongs = [];
        const artistsGrouped = {};

        validatedVideos.forEach(video => {
            if (!video.artist_mbid) return;
            if (!artistsGrouped[video.artist_mbid]) { artistsGrouped[video.artist_mbid] = { artist_name: video.artist_name, artist_mbid: video.artist_mbid, valid_videos: [] }; }
            // **Only add valid videos to the grouping**
            if (video.isValid && video.youtube_url && video.title && video.track_thumb) {
                 artistsGrouped[video.artist_mbid].valid_videos.push({ youtube_url: video.youtube_url, title: video.title, track_thumb: video.track_thumb });
            }
        });

        Object.values(artistsGrouped).forEach(artistData => {
             // **Filter artists based on having > 0 *valid* videos**
            if (artistData.valid_videos.length > 0) {
                const firstValidThumb = artistData.valid_videos[0]?.track_thumb || null;
                 finalArtists.push({ artist_name: artistData.artist_name, artist_mbid: artistData.artist_mbid, artist_thumb: firstValidThumb, video_count: artistData.valid_videos.length });

                artistData.valid_videos.forEach(video => { // Iterate only through valid videos for this artist
                    const cleanedTitle = cleanSongTitle(video.title, artistData.artist_name);
                    const extractedId = extractVideoId(video.youtube_url);
                     if (cleanedTitle && extractedId) {
                         finalSongs.push({
                             id: extractedId, title: cleanedTitle, artist_name: artistData.artist_name,
                             artist_mbid: artistData.artist_mbid, youtube_url: video.youtube_url, track_thumb: video.track_thumb
                         });
                     } else { /* console.warn(`Skipping song due to empty title or invalid ID: ${artistData.artist_name} - ${video.title}`); */ }
                });
            } else { /* console.log(`Removing artist with no valid videos: ${artistData.artist_name}`); */ }
        });

        finalArtists.sort((a, b) => a.artist_name.localeCompare(b.artist_name, undefined, { sensitivity: 'base' }));
        finalSongs.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));

        console.log(`Data cleaning complete. Valid artists: ${finalArtists.length}, Valid songs: ${finalSongs.length}`);
        return { finalArtists, finalSongs };
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
                 img.src = thumbUrl || PLACEHOLDER_THUMB_URL;
                 img.alt = `${topText} - ${bottomText}`;
                 img.onerror = (e) => {
                     e.target.onerror = null; e.target.src = PLACEHOLDER_THUMB_URL; gridItem.classList.add('no-thumb');
                 };
                 if (!thumbUrl) { gridItem.classList.add('no-thumb'); }
                 gridItem.appendChild(img);

                 const topOverlay = document.createElement('div');
                 topOverlay.classList.add('grid-item-overlay', 'top');
                 const topSpan = document.createElement('span');
                 topSpan.classList.add('grid-item-text', 'top-text'); topSpan.textContent = topText;
                 topOverlay.appendChild(topSpan); gridItem.appendChild(topOverlay);

                 const bottomOverlay = document.createElement('div');
                 bottomOverlay.classList.add('grid-item-overlay', 'bottom');
                 const bottomTextContainer = document.createElement('div');
                 bottomTextContainer.classList.add('grid-item-text-container');
                 const bottomSpan = document.createElement('span');
                 bottomSpan.classList.add('grid-item-text', 'bottom-text'); bottomSpan.textContent = bottomText;
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

    function updateComingUpTicker() {
        if(!comingUpTickerEl) return;
        const tickerContainer = comingUpTickerEl.closest('#coming-up-container');

        if (playlistQueue.length === 0) {
            comingUpTickerEl.innerHTML = '---';
            if(tickerContainer) tickerContainer.classList.add('empty');
            comingUpTickerEl.classList.remove('animated');
            comingUpTickerEl.style.animation = 'none'; // Stop animation
            return;
        }

        if(tickerContainer) tickerContainer.classList.remove('empty');
        const items = playlistQueue.slice(0, 5).map(v =>
            `<span class="artist">${v.artist || 'N/A'}</span><span class="separator">-</span><span class="title">${v.title || 'N/A'}</span>`
        ).join('<span class="upcoming-separator">...</span>');
        const scrollContent = items + '<span class="upcoming-separator" style="padding-right: 50px;">...</span>' + items;
        comingUpTickerEl.innerHTML = scrollContent;

        comingUpTickerEl.style.animation = 'none'; // Reset animation
        void comingUpTickerEl.offsetWidth; // Reflow
        comingUpTickerEl.style.animation = ''; // Re-apply from CSS
        comingUpTickerEl.classList.add('animated');
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
    searchAllButton.addEventListener('click', () => {
        if (!isDataLoaded) return;
        if (currentMode !== 'search') { currentMode = 'search'; searchInput.value = ''; updateDisplay(); searchInput.focus(); }
    });
    browseArtistsButton.addEventListener('click', () => {
        if (!isDataLoaded) return;
        if (currentMode !== 'artists') { currentMode = 'artists'; filteredArtistMbid = null; searchInput.value = ''; updateDisplay(); }
    });
    browseSongsButton.addEventListener('click', () => {
        if (!isDataLoaded) return;
        if (currentMode !== 'songs') { currentMode = 'songs'; filteredArtistMbid = null; searchInput.value = ''; updateDisplay(); }
    });
    backButton.addEventListener('click', () => {
        if (!isDataLoaded) return;
        if (currentMode === 'search' || currentMode === 'filtered-songs') {
            currentMode = 'artists';
            filteredArtistMbid = null;
            searchInput.value = '';
            currentPage = previousArtistScrollPosition; // Try restoring page index
            updateDisplay();
        }
    });
    searchInput.addEventListener('input', () => {
        if (!isDataLoaded) return;
        currentPage = 0; filterAndPaginate(); renderGrid(); updateScrollbar();
    });
    scrollUpButton.addEventListener('click', () => {
        if (!isDataLoaded) return;
        if (currentPage > 0) { currentPage--; filterAndPaginate(); renderGrid(); updateScrollbar(); }
    });
    scrollDownButton.addEventListener('click', () => {
        if (!isDataLoaded) return;
         totalPages = Math.ceil(fullFilteredList.length / itemsPerPage); // Recalculate
        if (currentPage < totalPages - 1) { currentPage++; filterAndPaginate(); renderGrid(); updateScrollbar(); }
    });
    keyboardContainer.addEventListener('click', (e) => {
        // No data loaded check needed here, as it affects search input or calls jumpToChar (which checks)
        if (!e.target.classList.contains('key') || e.target.style.visibility === 'hidden') return;
        const keyButton = e.target;
        const key = keyButton.dataset.key;
        if (currentMode === 'search') {
            if (key === 'clear') { searchInput.value = searchInput.value.slice(0, -1); }
            else if (key === 'space') { searchInput.value += ' '; }
            else if (key === '#' || key === 'A-Z') { keyboardMode = (keyboardMode === 'alpha') ? 'numeric' : 'alpha'; renderKeyboard(); }
            else { searchInput.value += keyButton.textContent; }
            searchInput.focus(); searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            // jumpToChar already checks isDataLoaded
            if (alphaKeys.includes(key) || key === '#') {
                 jumpToChar(key);
             }
        }
    });

    // --- Initialisation ---
    startup(); // Start the application

}); // End of DOMContentLoaded listener