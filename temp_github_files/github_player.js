// --- Global Variables & Constants ---
const COMMAND_STORAGE_KEY = 'jukeboxCommand'; // Key for receiving commands
const STATUS_STORAGE_KEY = 'jukeboxStatus';   // Key for sending status back
const PLAYER_READY_TIMEOUT_MS = 15000; // Timeout for player init
const FADE_INTERVAL_MS = 50;   // Interval for audio fade steps

let player; // Holds the YT.Player object
let isPlayerReady = false;
// --- ADDED: Declare globally ---
let apiReadyCheckTimeoutId = null;
// --- End Add ---
let currentPlayerVideoId = null; // Track ID of video loaded in player
let fadeIntervalId = null; // ID for audio fade timer
let isFadingOut = false; // Local flag for fading state

// DOM Reference for Fade Overlay (cached on DOM Ready)
let fadeOverlay = null;


// --- YouTube IFrame API Setup ---
window.onYouTubeIframeAPIReady = function() {
    console.log("DEBUG: [PlayerWin] >>> window.onYouTubeIframeAPIReady function called <<<");
    // Now this clearTimeout is valid as apiReadyCheckTimeoutId is in scope
    if (apiReadyCheckTimeoutId) { clearTimeout(apiReadyCheckTimeoutId); console.log("DEBUG: [PlayerWin] Cleared existing API timeout."); }

    if (typeof YT === 'undefined' || typeof YT.Player === 'undefined') {
        console.error("DEBUG: [PlayerWin] FATAL - YT or YT.Player is UNDEFINED!");
        displayPlayerError("YT API Load Fail"); isPlayerReady = false; return;
    }
    console.log("DEBUG: [PlayerWin] YT object available.");

    try {
        const targetElement = document.getElementById('youtube-fullscreen-player');
        if (!targetElement) {
            console.error("DEBUG: [PlayerWin] FATAL - Target element '#youtube-fullscreen-player' missing!");
            displayPlayerError("Player Div Missing"); isPlayerReady = false; return;
        }
        console.log("DEBUG: [PlayerWin] Target element found.");

        // Wait for Dimensions Function
        function createPlayerWhenReady() {
            const rect = targetElement.getBoundingClientRect();
            const computedStyle = window.getComputedStyle(targetElement);
            console.log(`DEBUG: [PlayerWin] Checking dimensions - Width: ${rect.width}, Height: ${rect.height}, Display: ${computedStyle.display}`);

            if (rect.width > 0 && rect.height > 0 && computedStyle.display !== 'none') {
                console.log("DEBUG: [PlayerWin] Target element has dimensions. Proceeding with player creation.");
                try {
                     player = new YT.Player('youtube-fullscreen-player', {
                        height: '100%', width: '100%',
                        playerVars: { 'playsinline': 1, 'controls': 0, 'rel': 0 },
                        events: { 'onReady': onPlayerWindowReady, 'onStateChange': onPlayerWindowStateChange, 'onError': onPlayerWindowError }
                    });
                     if (player && typeof player.addEventListener === 'function') {
                        console.log("DEBUG: [PlayerWin] YT.Player object CREATED successfully (waiting for onReady).");
                     } else {
                        console.error("DEBUG: [PlayerWin] YT.Player object creation FAILED silently.");
                        isPlayerReady = false; displayPlayerError("Player Object Create Fail");
                     }
                } catch(e) {
                     console.error("DEBUG: [PlayerWin] CRITICAL - Exception during new YT.Player() constructor.", e);
                     isPlayerReady = false; displayPlayerError("Player Create Exception");
                }
            } else {
                console.log("DEBUG: [PlayerWin] Target element still has zero dimensions or is hidden. Waiting...");
                setTimeout(createPlayerWhenReady, 100); // Check again
            }
        }
        // Start the checking process
        createPlayerWhenReady();

    } catch (e) { // Catch errors from initial element finding etc.
        console.error("DEBUG: [PlayerWin] Error in onYouTubeIframeAPIReady before player creation attempt:", e);
        isPlayerReady = false; displayPlayerError("Initialization Error");
    }
};

function onPlayerWindowReady(event) {
    console.log("%c DEBUG: [PlayerWin] !!!!!!!!!! onPlayerWindowReady EVENT FIRED !!!!!!!!!!", "color: green; font-weight: bold;");
    isPlayerReady = true; // SET THE FLAG
    console.log("DEBUG: [PlayerWin][Ready] isPlayerReadyFlag set to TRUE");

    if(player && typeof player.getPlayerState === 'function') { console.log("DEBUG: [PlayerWin][Ready] Initial Player State:", player.getPlayerState()); }
    // Cache overlay element if not already done in DOMContentLoaded
    if (!fadeOverlay) fadeOverlay = document.getElementById('fade-overlay');
    if (!fadeOverlay) { console.error("DEBUG: [PlayerWin][Ready] Fade overlay element not found!"); }

    processStoredCommand(); // Check for pending commands
}

function onPlayerWindowStateChange(event) {
    console.log("DEBUG: [PlayerWin] State Change:", event.data);
    if (event.data === YT.PlayerState.ENDED && !isFadingOut) { // Don't send 'ended' if manually fading out
        console.log("DEBUG: [PlayerWin] Video Ended. Sending 'ended' status back.");
        sendPlayerStatus('ended', { id: currentPlayerVideoId });
        currentPlayerVideoId = null;
    } else if (event.data === YT.PlayerState.PLAYING) {
         console.log("DEBUG: [PlayerWin] Video is Playing.");
         try { currentPlayerVideoId = event.target?.getVideoData?.()?.video_id || currentPlayerVideoId; } catch(e){}
         // Ensure overlay is hidden when video starts playing normally
         resetFadeOverlayVisuals();
    }
}

function onPlayerWindowError(event) {
    console.error("%c DEBUG: [PlayerWin] !!!!!!!!!! onPlayerError EVENT FIRED !!!!!!!!!! Code:", "color: red; font-weight: bold;", event.data);
    const errorMessages = { 2: 'Invalid parameter', 5: 'HTML5 player error', 100: 'Video not found', 101: 'Playback disallowed (embed)', 150: 'Playback disallowed (embed)' };
    const message = errorMessages[event.data] || `Unknown error ${event.data}`;
    console.error(`DEBUG: [PlayerWin] YouTube Player Error: ${message}`);
    displayPlayerError(`Player Error: ${message} (${event.data})`);
    sendPlayerStatus('error', { code: event.data, message: message, id: currentPlayerVideoId });
}

// --- Combined Fade Function ---
function startVisualAndAudioFade(durationMs) {
    if (!isPlayerReady || !player || typeof player.getVolume !== 'function' || isFadingOut || !fadeOverlay) {
        console.warn("DEBUG: [PlayerWin] Cannot start fade:", { isPlayerReady, player: !!player, hasGetVol: typeof player?.getVolume, isFading: isFadingOut, hasOverlay: !!fadeOverlay });
        sendPlayerStatus('fadeComplete', { id: currentPlayerVideoId }); // Signal failure as completion
        return;
    }

    isFadingOut = true;
    let currentVolume = player.getVolume();
    const steps = durationMs / FADE_INTERVAL_MS;
    const volumeStep = steps > 0 ? (currentVolume / steps) : currentVolume; // Avoid division by zero

    console.log(`DEBUG: [PlayerWin] Fading: Duration=${durationMs}ms, Vol=${currentVolume}, Step=${volumeStep}, Steps=${steps}`);

    // Start visual fade
    fadeOverlay.style.transitionDuration = `${durationMs / 1000}s, 0s`;
    fadeOverlay.style.transitionDelay = `0s, 0s`;
    fadeOverlay.classList.add('fading-out');

    if (fadeIntervalId) clearInterval(fadeIntervalId);

    fadeIntervalId = setInterval(() => {
        currentVolume -= volumeStep;
        if (currentVolume <= 0) {
            clearInterval(fadeIntervalId); fadeIntervalId = null;
            console.log("DEBUG: [PlayerWin] Audio Fade Out Complete.");
            if (player && typeof player.setVolume === 'function') {
                player.setVolume(0);
                if (typeof player.stopVideo === 'function') { player.stopVideo(); }
                player.setVolume(100);
            }
            isFadingOut = false;
            sendPlayerStatus('fadeComplete', { id: currentPlayerVideoId }); // Signal completion
            currentPlayerVideoId = null;
        } else {
            if (player && typeof player.setVolume === 'function') { player.setVolume(currentVolume); }
        }
    }, FADE_INTERVAL_MS);
}

// --- Reset Visual Fade Overlay ---
function resetFadeOverlayVisuals() {
    if (fadeOverlay && fadeOverlay.classList.contains('fading-out')) {
        console.log("DEBUG: [PlayerWin] Resetting fade overlay visuals.");
        fadeOverlay.classList.remove('fading-out');
        fadeOverlay.style.transitionDuration = ''; // Reset to CSS default
        fadeOverlay.style.transitionDelay = '';    // Reset to CSS default
    }
}

// --- localStorage Command Processing ---
function processStoredCommand() {
    try {
        const commandString = localStorage.getItem(COMMAND_STORAGE_KEY);
        if (commandString) {
            console.log("DEBUG: [PlayerWin] Found command in storage on load/ready:", commandString);
            const commandData = JSON.parse(commandString);
            executePlayerCommand(commandData);
        } else { console.log("DEBUG: [PlayerWin] No command found in storage on load/ready."); }
    } catch (e) { console.error("DEBUG: [PlayerWin] Error processing stored command:", e); }
}

function handleStorageChange(event) {
    // Only react to command updates from other windows for the correct key
    if (event.key === COMMAND_STORAGE_KEY && event.newValue && event.storageArea === localStorage) {
        console.log("DEBUG: [PlayerWin] Received command via storage event:", event.newValue);
        try {
            const commandData = JSON.parse(event.newValue);
            executePlayerCommand(commandData);
        } catch (e) { console.error("DEBUG: [PlayerWin] Error parsing command from storage event:", e); }
    }
}

function executePlayerCommand(commandData) {
    if (!commandData || !commandData.action) { return; }
    // *** Crucially, wait for player readiness BEFORE executing commands ***
    if (!isPlayerReady || !player) {
        console.warn(`DEBUG: [PlayerWin] Player not ready when command '${commandData.action}' received. Ignoring.`);
        return;
    }

    console.log(`DEBUG: [PlayerWin] Executing action: ${commandData.action}`);
    try {
        // Reset visual fade before most actions (except fade itself)
        if (commandData.action !== 'fadeOutAndBlack') {
             resetFadeOverlayVisuals();
        }

        switch (commandData.action) {
            case 'play':
                if (commandData.videoId && typeof player.loadVideoById === 'function') {
                    console.log(`DEBUG: [PlayerWin] Loading Video: ${commandData.videoId} (${commandData.artist || 'N/A'} - ${commandData.title || 'N/A'})`);
                    currentPlayerVideoId = commandData.videoId; // Store *before* loading
                    player.loadVideoById(commandData.videoId);
                    // Autoplay is handled by YouTube API state changes or playerVars, but sometimes playVideo() is needed after load/cue
                    // player.playVideo(); // Uncomment if videos aren't autoplaying after load
                    document.title = `${commandData.artist || '?'} - ${commandData.title || '?'}`;
                } else { console.warn("DEBUG: [PlayerWin] Invalid 'play' command data:", commandData); }
                break;
            case 'stop':
                if (typeof player.stopVideo === 'function') {
                    console.log("DEBUG: [PlayerWin] Stopping video.");
                    resetFadeOverlayVisuals();
                    player.stopVideo();
                    document.title = "Jukebox Player";
                    currentPlayerVideoId = null;
                }
                break;
            case 'fadeOutAndBlack':
                 const fadeDuration = commandData.fadeDuration || 5000;
                 console.log(`DEBUG: [PlayerWin] Initiating fadeOutAndBlack over ${fadeDuration}ms`);
                 startVisualAndAudioFade(fadeDuration);
                 break;
            default: console.warn("DEBUG: [PlayerWin] Unknown command action:", commandData.action); break;
        }
    } catch(e) { console.error(`DEBUG: [PlayerWin] Error executing command action '${commandData.action}':`, e); }
}

// --- Helper to Send Status ---
function sendPlayerStatus(statusType, data = {}) {
     try {
        const statusData = {
            status: statusType,
            id: currentPlayerVideoId, // Include current ID if available
            timestamp: Date.now(),
            ...data // Include any extra data
        };
        console.log(`%c DEBUG: [PlayerWin] >>> Sending status >>> Key: ${STATUS_STORAGE_KEY}, Data: ${JSON.stringify(statusData)}`, "color: orange;");
        localStorage.setItem(STATUS_STORAGE_KEY, JSON.stringify(statusData));
     } catch (e) {
         console.error("DEBUG: [PlayerWin] Failed to send status update.", e);
     }
}

// --- Utility ---
function displayPlayerError(message) {
     const container = document.getElementById('youtube-fullscreen-player');
     // Also try setting body background for very early errors
     document.body.style.backgroundColor = '#300'; // Dark red on error
     if (container) {
         container.innerHTML = `<div style="position: absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); display:flex; justify-content:center; align-items:center; z-index: 10;"><p style="color: red; font-size: 1.5em; text-align:center; padding: 20px; background: rgba(0,0,0,0.7); border-radius: 5px;">${message}</p></div>`;
     } else {
         document.body.innerHTML = `<p style="color:red; font-size:2em; padding: 30px;">${message}</p>`;
     }
}

// --- Initialization ---
window.addEventListener('storage', handleStorageChange);

// Cache overlay element on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
    fadeOverlay = document.getElementById('fade-overlay');
    if (!fadeOverlay) console.error("DEBUG: [PlayerWin] CRITICAL - Fade overlay element not found on DOMContentLoaded!");
    console.log("DEBUG: [PlayerWin] DOM Ready, overlay cached (if found).");
});

// Add API timeout check
apiReadyCheckTimeoutId = setTimeout(() => {
    if (!isPlayerReady) { // Check the flag
         console.error(`DEBUG: [PlayerWin] YouTube API or Player Ready event timed out after ${PLAYER_READY_TIMEOUT_MS / 1000} seconds.`);
         displayPlayerError("Player Failed to Initialize (Timeout)");
         // Log container state at timeout
         const targetElement = document.getElementById('youtube-fullscreen-player');
         if(targetElement) { const computedStyle = window.getComputedStyle(targetElement); console.error(`DEBUG: [PlayerWin] Timeout occurred. Final check - Target display: '${computedStyle.display}', visibility: '${computedStyle.visibility}'`); }
         else { console.error("DEBUG: [PlayerWin] Timeout occurred. Target element not found at timeout."); }
    } else {
        console.log("DEBUG: [PlayerWin] Timeout check passed, player was already ready.");
    }
}, PLAYER_READY_TIMEOUT_MS);

console.log("DEBUG: [PlayerWin] Player script initialized, waiting for API ready...");