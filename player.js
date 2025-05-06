// =============================================================================
// ==                               player.js                                 ==
// ==          Handles the YouTube IFrame Player and Communication            ==
// =============================================================================

// --- Global Variables & Constants ---
const COMMAND_STORAGE_KEY = 'jukeboxCommand'; // Key for receiving commands
const STATUS_STORAGE_KEY = 'jukeboxStatus';   // Key for sending status back
const PLAYER_READY_TIMEOUT_MS = 15000; // Timeout for player init
const FADE_INTERVAL_MS = 50;   // Interval for audio fade steps

let player; // Holds the YT.Player object
let isPlayerReady = false;
let apiReadyCheckTimeoutId = null; // Timeout ID for API readiness check
let currentPlayerVideoId = null; // Track ID of video loaded in player
let fadeIntervalId = null; // ID for audio fade timer
let isFadingOut = false; // Local flag for fading state

// DOM Reference for Fade Overlay (cached on DOM Ready)
let fadeOverlay = null;


// --- YouTube IFrame API Setup ---

// This function is called automatically by the YouTube API script when it's ready
window.onYouTubeIframeAPIReady = function() {
    console.log("DEBUG: [PlayerWin] >>> onYouTubeIframeAPIReady called <<<");
    if (apiReadyCheckTimeoutId) {
        clearTimeout(apiReadyCheckTimeoutId);
        console.log("DEBUG: [PlayerWin] Cleared API ready timeout.");
    }

    if (typeof YT === 'undefined' || typeof YT.Player === 'undefined') {
        console.error("DEBUG: [PlayerWin] FATAL - YT or YT.Player is UNDEFINED!");
        displayPlayerError("YT API Load Fail");
        isPlayerReady = false;
        return;
    }
    console.log("DEBUG: [PlayerWin] YT object available.");

    try {
        const targetElement = document.getElementById('youtube-fullscreen-player');
        if (!targetElement) {
            console.error("DEBUG: [PlayerWin] FATAL - Target element '#youtube-fullscreen-player' missing!");
            displayPlayerError("Player Div Missing");
            isPlayerReady = false;
            return;
        }
        console.log("DEBUG: [PlayerWin] Target element found.");

        // Helper function to create player once the container has dimensions
        function createPlayerWhenReady() {
            const rect = targetElement.getBoundingClientRect();
            const computedStyle = window.getComputedStyle(targetElement);
            console.log(`DEBUG: [PlayerWin] Checking dimensions - W: ${rect.width}, H: ${rect.height}, Display: ${computedStyle.display}`);

            if (rect.width > 0 && rect.height > 0 && computedStyle.display !== 'none') {
                console.log("DEBUG: [PlayerWin] Target element has dimensions. Creating player.");
                try {
                     player = new YT.Player('youtube-fullscreen-player', {
                        height: '100%',
                        width: '100%',
                        playerVars: {
                            'playsinline': 1,
                            'controls': 0,        // Hide controls
                            'rel': 0,             // Don't show related videos
                            'autoplay': 1,        // Enable autoplay
                            'mute': 1             // Start muted to bypass autoplay restrictions
                            // REMOVED restrictive parameters that caused embed issues
                        },
                        events: {
                             'onReady': onPlayerWindowReady,
                             'onStateChange': onPlayerWindowStateChange,
                             'onError': onPlayerWindowError
                        }
                    });

                     if (player && typeof player.addEventListener === 'function') {
                        console.log("DEBUG: [PlayerWin] YT.Player object CREATED (waiting for onReady event).");
                     } else {
                        console.error("DEBUG: [PlayerWin] YT.Player object creation FAILED silently.");
                        isPlayerReady = false; displayPlayerError("Player Object Create Fail");
                     }
                } catch(e) {
                     console.error("DEBUG: [PlayerWin] CRITICAL - Exception during new YT.Player() constructor.", e);
                     isPlayerReady = false; displayPlayerError("Player Create Exception");
                }
            } else {
                console.log("DEBUG: [PlayerWin] Target element has zero dimensions or is hidden. Retrying...");
                setTimeout(createPlayerWhenReady, 100); // Check again shortly
            }
        }
        // Start checking for dimensions
        createPlayerWhenReady();

    } catch (e) {
        console.error("DEBUG: [PlayerWin] Error in onYouTubeIframeAPIReady:", e);
        isPlayerReady = false; displayPlayerError("Initialization Error");
    }
};

// Called by the YouTube API when the player is fully initialized and ready
function onPlayerWindowReady(event) {
    console.log("%c DEBUG: [PlayerWin] >>> onPlayerWindowReady EVENT FIRED <<<", "color: green; font-weight: bold;");
    isPlayerReady = true;
    console.log("DEBUG: [PlayerWin][Ready] isPlayerReady flag set to TRUE");

    if(player && typeof player.getPlayerState === 'function') {
        console.log("DEBUG: [PlayerWin][Ready] Initial Player State:", player.getPlayerState());
    }

    // Cache overlay element if not done yet
    if (!fadeOverlay) {
        fadeOverlay = document.getElementById('fade-overlay');
        if (!fadeOverlay) console.error("DEBUG: [PlayerWin][Ready] Fade overlay element not found!");
    }

    // Force initial playback state to ensure autoplay works
    if (typeof player.playVideo === 'function') {
        console.log("DEBUG: [PlayerWin][Ready] Explicitly calling playVideo() to ensure autoplay");
        player.playVideo();
        // If video is muted, we'll try to unmute after playback starts
        setTimeout(() => {
            try {
                if (player && typeof player.unMute === 'function' && typeof player.getPlayerState === 'function') {
                    if (player.getPlayerState() === YT.PlayerState.PLAYING) {
                        player.unMute();
                        console.log("DEBUG: [PlayerWin] Successfully unmuted after autoplay");
                    }
                }
            } catch(e) {
                console.warn("DEBUG: [PlayerWin] Failed to unmute:", e);
            }
        }, 1000); // Delay to allow playback to start
    }

    // Send a 'ready' status back to the main window (optional, but good practice)
    sendPlayerStatus('ready');

    // Check if a command was sent before the player was ready
    processStoredCommand();
}

// Called by the YouTube API when the player's state changes (playing, paused, ended, etc.)
function onPlayerWindowStateChange(event) {
    const newState = event.data;
    console.log("DEBUG: [PlayerWin] State Change:", newState, `(${ YT.PlayerState[newState] || 'Unknown' })`);

    if (newState === YT.PlayerState.ENDED && !isFadingOut) {
        console.log("DEBUG: [PlayerWin] Video Ended naturally. Sending 'ended' status.");
        sendPlayerStatus('ended', { id: currentPlayerVideoId });
        currentPlayerVideoId = null; // Clear current video after it ends
    } else if (newState === YT.PlayerState.PLAYING) {
         console.log("DEBUG: [PlayerWin] Video State: PLAYING.");
         try {
             // Update current ID if possible, useful if loaded via ID directly
             const videoData = event.target?.getVideoData?.();
             if (videoData?.video_id) {
                 currentPlayerVideoId = videoData.video_id;
             }
         } catch(e){ console.warn("Could not get video data on play state change:", e); }
         resetFadeOverlayVisuals(); // Ensure overlay is hidden if playing starts
    } else if (newState === YT.PlayerState.PAUSED) {
         console.log("DEBUG: [PlayerWin] Video State: PAUSED.");
         // Handle pause if needed
    } else if (newState === YT.PlayerState.BUFFERING) {
         console.log("DEBUG: [PlayerWin] Video State: BUFFERING.");
         // Handle buffering if needed
    } else if (newState === YT.PlayerState.CUED) {
         console.log("DEBUG: [PlayerWin] Video State: CUED.");
         // Video is loaded but not playing yet
         // If autoplay is on, PLAYING state should follow shortly
    }
}

// Called by the YouTube API if an error occurs in the player
function onPlayerWindowError(event) {
    console.error(`%c DEBUG: [PlayerWin] >>> onPlayerError EVENT FIRED <<< Code: ${event.data}`, "color: red; font-weight: bold;");
    const errorMessages = { 2: 'Invalid parameter', 5: 'HTML5 player error', 100: 'Video not found', 101: 'Playback disallowed (embed)', 150: 'Playback disallowed (embed)' };
    const message = errorMessages[event.data] || `Unknown error ${event.data}`;
    console.error(`DEBUG: [PlayerWin] YouTube Player Error: ${message}`);

    displayPlayerError(`Player Error: ${message} (${event.data})`);

    // Send error status back to the main window
    sendPlayerStatus('error', { code: event.data, message: message, id: currentPlayerVideoId });

    // Clear current video ID as it failed
    currentPlayerVideoId = null;
}

// --- Combined Fade Function ---
function startVisualAndAudioFade(durationMs) {
    if (!isPlayerReady || !player || typeof player.getVolume !== 'function' || isFadingOut || !fadeOverlay) {
        console.warn("DEBUG: [PlayerWin] Cannot start fade:", { isPlayerReady, player: !!player, hasGetVol: typeof player?.getVolume, isFading: isFadingOut, hasOverlay: !!fadeOverlay });
        // If fade can't start, immediately signal completion to allow next action
        sendPlayerStatus('fadeComplete', { id: currentPlayerVideoId });
        return;
    }

    isFadingOut = true;
    let currentVolume = 100; // Assume starting at 100 for consistent fade step calculation
    try { currentVolume = player.getVolume(); } catch(e) { console.warn("Could not get current volume, assuming 100."); }

    const steps = durationMs / FADE_INTERVAL_MS;
    const volumeStep = steps > 0 ? (currentVolume / steps) : currentVolume; // Avoid division by zero

    console.log(`DEBUG: [PlayerWin] Fading: Duration=${durationMs}ms, StartVol=${currentVolume}, Step=${volumeStep}, Steps=${steps}`);

    // Start visual fade immediately
    fadeOverlay.style.transitionDuration = `${durationMs / 1000}s`; // Set duration for visual fade
    fadeOverlay.classList.add('fading-out'); // Trigger the visual fade

    // Clear any previous audio fade interval
    if (fadeIntervalId) clearInterval(fadeIntervalId);

    // Start audio fade interval
    fadeIntervalId = setInterval(() => {
        currentVolume -= volumeStep;
        if (currentVolume <= 0) {
            clearInterval(fadeIntervalId); fadeIntervalId = null;
            console.log("DEBUG: [PlayerWin] Audio Fade Out Complete.");

            // Ensure volume is 0, stop video, reset volume for next play
            if (player && typeof player.setVolume === 'function') {
                try {
                    player.setVolume(0);
                    if (typeof player.stopVideo === 'function') { player.stopVideo(); }
                    // Reset volume immediately after stopping, ready for next load
                    player.setVolume(100);
                    console.log("DEBUG: [PlayerWin] Video stopped, volume reset to 100.");
                } catch(e) { console.error("Error during stop/volume reset:", e); }
            }

            isFadingOut = false; // Reset fade flag
            sendPlayerStatus('fadeComplete', { id: currentPlayerVideoId }); // Signal completion
            currentPlayerVideoId = null; // Clear video ID after successful fade/stop
        } else {
            // Set intermediate volume
            if (player && typeof player.setVolume === 'function') {
                try { player.setVolume(currentVolume); } catch(e) {}
            }
        }
    }, FADE_INTERVAL_MS);
}

// --- Reset Visual Fade Overlay ---
function resetFadeOverlayVisuals() {
    if (fadeOverlay && fadeOverlay.classList.contains('fading-out')) {
        console.log("DEBUG: [PlayerWin] Resetting fade overlay visuals.");
        fadeOverlay.classList.remove('fading-out');
        // Reset transitions (optional, depends on desired effect)
        // fadeOverlay.style.transitionDuration = '';
        // fadeOverlay.style.transitionDelay = '';
    }
}

// --- localStorage Command Processing ---
// Check for commands that might have been sent before the player was ready
function processStoredCommand() {
    try {
        const commandString = localStorage.getItem(COMMAND_STORAGE_KEY);
        if (commandString) {
            console.log("DEBUG: [PlayerWin] Found command in storage on load/ready:", commandString);
            const commandData = JSON.parse(commandString);
            // Execute command ONLY if player is now ready
            if (isPlayerReady) {
                executePlayerCommand(commandData);
            } else {
                console.warn("DEBUG: [PlayerWin] Player not ready yet, command stored but not executed immediately.");
            }
        } else { console.log("DEBUG: [PlayerWin] No command found in storage on load/ready."); }
    } catch (e) { console.error("DEBUG: [PlayerWin] Error processing stored command:", e); }
}

// Listen for commands sent from the main window AFTER initial load
function handleStorageChange(event) {
    if (event.key === COMMAND_STORAGE_KEY && event.newValue && event.storageArea === localStorage) {
        console.log("DEBUG: [PlayerWin] Received command via storage event:", event.newValue);
        try {
            const commandData = JSON.parse(event.newValue);
            executePlayerCommand(commandData); // Execute directly if received via event
        } catch (e) { console.error("DEBUG: [PlayerWin] Error parsing command from storage event:", e); }
    }
}

// Executes commands received from the main window
function executePlayerCommand(commandData) {
    if (!commandData || !commandData.action) { return; }

    // CRITICAL: Always check if player is ready before executing actions
    if (!isPlayerReady || !player) {
        console.warn(`DEBUG: [PlayerWin] Player not ready when command '${commandData.action}' received. Ignoring.`);
        // Optionally store the command again if needed, but usually the main window handles resends
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
                    console.log(`DEBUG: [PlayerWin] Loading Video: ${commandData.videoId} (${commandData.artist || '?'} - ${commandData.title || '?'})`);
                    currentPlayerVideoId = commandData.videoId; // Store ID *before* loading
                    player.loadVideoById(commandData.videoId);
                    
                    // Simpler approach to ensure playback (matching GitHub implementation)
                    // The loadVideoById will trigger autoplay with the playerVars we've set
                    // But adding an explicit playVideo call for reliability
                    player.playVideo();
                    
                    // Use a simpler approach for unmuting after playback starts
                    setTimeout(() => {
                        try {
                            if (player.getPlayerState() === YT.PlayerState.PLAYING) {
                                player.unMute();
                                player.setVolume(100);
                                console.log("DEBUG: [PlayerWin] Video started playing, unmuting");
                            }
                        } catch(e) {
                            console.warn("DEBUG: [PlayerWin] Error when unmuting:", e);
                        }
                    }, 1000); // Single check after 1 second
                    
                    document.title = `${commandData.artist || '?'} - ${commandData.title || '?'}`; // Update window title
                } else { console.warn("DEBUG: [PlayerWin] Invalid 'play' command data:", commandData); }
                break;

            case 'stop': // Stop immediately, no fade
                if (typeof player.stopVideo === 'function') {
                    console.log("DEBUG: [PlayerWin] Stopping video immediately.");
                    resetFadeOverlayVisuals(); // Ensure overlay is clear
                    if (fadeIntervalId) clearInterval(fadeIntervalId); // Stop any ongoing fade audio interval
                    isFadingOut = false; // Reset fade flag
                    player.stopVideo();
                    // Optionally reset volume immediately after stop
                    // player.setVolume(100);
                    document.title = "Jukebox Player";
                    currentPlayerVideoId = null; // Clear current video
                }
                break;

            case 'fadeOutAndBlack': // Start fade process
                 const fadeDuration = commandData.fadeDuration || 5000; // Use default if not provided
                 console.log(`DEBUG: [PlayerWin] Initiating fadeOutAndBlack over ${fadeDuration}ms`);
                 startVisualAndAudioFade(fadeDuration); // Call the fade function
                 break;

            default:
                 console.warn("DEBUG: [PlayerWin] Unknown command action:", commandData.action);
                 break;
        }
    } catch(e) {
        console.error(`DEBUG: [PlayerWin] Error executing command action '${commandData.action}':`, e);
        // Optionally send an error status back?
        // sendPlayerStatus('executionError', { action: commandData.action, error: e.message });
    }
}

// --- Helper to Send Status Back to Main Window ---
function sendPlayerStatus(statusType, data = {}) {
     try {
        const statusData = {
            status: statusType,
            id: currentPlayerVideoId, // Include ID of video related to status if applicable
            timestamp: Date.now(),
            ...data
        };
        console.log(`%c DEBUG: [PlayerWin] >>> Sending status >>> Key: ${STATUS_STORAGE_KEY}, Data: ${JSON.stringify(statusData)}`, "color: orange;");
        // Use localStorage to communicate back
        localStorage.setItem(STATUS_STORAGE_KEY, JSON.stringify(statusData));
     } catch (e) {
         console.error("DEBUG: [PlayerWin] Failed to send status update via localStorage.", e);
     }
}

// --- Utility for Displaying Errors within Player Window ---
function displayPlayerError(message) {
     const container = document.getElementById('youtube-fullscreen-player');
     // Also try setting body background for very early errors
     document.body.style.backgroundColor = '#300'; // Dark red background
     if (container) {
         // Create a prominent error message overlay inside the player container
         container.innerHTML = `<div style="position: absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); display:flex; justify-content:center; align-items:center; z-index: 10;"><p style="color: #ffcccc; font-size: 1.5em; text-align:center; padding: 20px; background: rgba(0,0,0,0.7); border-radius: 5px;">PLAYER ERROR:<br>${message}</p></div>`;
     } else {
         // Fallback if container isn't even found
         document.body.innerHTML = `<p style="color:red; font-size:2em; padding: 30px;">FATAL PLAYER ERROR:<br>${message}</p>`;
     }
}

// --- Initialization ---

// Listen for storage events (commands from main window)
window.addEventListener('storage', handleStorageChange);

// Cache overlay element as soon as DOM is available
document.addEventListener('DOMContentLoaded', () => {
    fadeOverlay = document.getElementById('fade-overlay');
    if (!fadeOverlay) console.error("DEBUG: [PlayerWin] CRITICAL - Fade overlay element not found on DOMContentLoaded!");
    console.log("DEBUG: [PlayerWin] DOM Ready, overlay cached (if found).");
});

// Set a timeout to catch cases where the YouTube API itself fails to load or initialize
apiReadyCheckTimeoutId = setTimeout(() => {
    if (!isPlayerReady) { // Check the flag after the timeout
         console.error(`DEBUG: [PlayerWin] YouTube API or Player Ready event timed out after ${PLAYER_READY_TIMEOUT_MS / 1000} seconds.`);
         displayPlayerError("Player Failed to Initialize (Timeout)");
         // Log container state at timeout for debugging
         const targetElement = document.getElementById('youtube-fullscreen-player');
         if(targetElement) { const computedStyle = window.getComputedStyle(targetElement); console.error(`DEBUG: [PlayerWin] Timeout occurred. Target display: '${computedStyle.display}', visibility: '${computedStyle.visibility}'`); }
         else { console.error("DEBUG: [PlayerWin] Timeout occurred. Target element not found at timeout."); }
    } else {
        // This is the expected case if everything loaded fine
        console.log("DEBUG: [PlayerWin] API Ready timeout check passed (player was already ready).");
    }
}, PLAYER_READY_TIMEOUT_MS);

console.log("DEBUG: [PlayerWin] Player script initialized, waiting for YouTube API ready...");