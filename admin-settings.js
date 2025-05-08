// Admin Settings Interface
import { loadUserSettings, saveUserSettings } from './user-management.js';

function initializeAdminSettings() {
    const userId = getCurrentUserId();
    if (!userId) {
        console.error('No user ID found');
        return;
    }
    
    // Load existing settings
    const settings = loadUserSettings(userId);
    
    // Initialize UI elements
    initializeVolumeControl(settings);
    initializeQueueSettings(settings);
    initializePlaybackSettings(settings);
    initializeVideoQualitySettings(settings);
    initializeCustomUrlDisplay(settings);
    initializeSaveResetButtons();
}

function initializeVolumeControl(settings) {
    const volumeSlider = document.getElementById('volume-control');
    const volumeValue = document.getElementById('volume-value');
    
    if (volumeSlider && volumeValue) {
        volumeSlider.value = settings.volume || 100;
        volumeValue.textContent = `${volumeSlider.value}%`;
        
        volumeSlider.addEventListener('input', (e) => {
            const userId = getCurrentUserId();
            if (userId) {
                const newVolume = parseInt(e.target.value);
                volumeValue.textContent = `${newVolume}%`;
                const newSettings = { ...settings, volume: newVolume };
                saveUserSettings(userId, newSettings);
                
                // Update player volume if player is open
                const playerWindow = window.openPlayerWindow();
                if (playerWindow) {
                    playerWindow.postMessage({
                        type: 'set-volume',
                        volume: newVolume
                    }, '*');
                }
            }
        });
    }
}

function initializeQueueSettings(settings) {
    const queueLimitInput = document.getElementById('queue-limit');
    const queueTimeoutInput = document.getElementById('queue-timeout');
    
    if (queueLimitInput) {
        queueLimitInput.value = settings.queueLimit || 10;
        queueLimitInput.addEventListener('change', (e) => {
            const userId = getCurrentUserId();
            if (userId) {
                const newSettings = { ...settings, queueLimit: parseInt(e.target.value) };
                saveUserSettings(userId, newSettings);
            }
        });
    }
    
    if (queueTimeoutInput) {
        queueTimeoutInput.value = settings.queueTimeout || 30;
        queueTimeoutInput.addEventListener('change', (e) => {
            const userId = getCurrentUserId();
            if (userId) {
                const newSettings = { ...settings, queueTimeout: parseInt(e.target.value) };
                saveUserSettings(userId, newSettings);
            }
        });
    }
}

function initializePlaybackSettings(settings) {
    const autoplayToggle = document.getElementById('autoplay-toggle');
    const shuffleToggle = document.getElementById('shuffle-toggle');
    const repeatToggle = document.getElementById('repeat-toggle');
    
    if (autoplayToggle) {
        autoplayToggle.checked = settings.autoplay || true;
        autoplayToggle.addEventListener('change', (e) => {
            const userId = getCurrentUserId();
            if (userId) {
                const newSettings = { ...settings, autoplay: e.target.checked };
                saveUserSettings(userId, newSettings);
            }
        });
    }
    
    if (shuffleToggle) {
        shuffleToggle.checked = settings.shuffle || false;
        shuffleToggle.addEventListener('change', (e) => {
            const userId = getCurrentUserId();
            if (userId) {
                const newSettings = { ...settings, shuffle: e.target.checked };
                saveUserSettings(userId, newSettings);
            }
        });
    }
    
    if (repeatToggle) {
        repeatToggle.checked = settings.repeat || false;
        repeatToggle.addEventListener('change', (e) => {
            const userId = getCurrentUserId();
            if (userId) {
                const newSettings = { ...settings, repeat: e.target.checked };
                saveUserSettings(userId, newSettings);
            }
        });
    }
}

function initializeVideoQualitySettings(settings) {
    const qualityRadios = document.getElementsByName('quality');
    const defaultQuality = settings.quality || 'auto';
    
    qualityRadios.forEach(radio => {
        radio.checked = radio.value === defaultQuality;
        radio.addEventListener('change', (e) => {
            const userId = getCurrentUserId();
            if (userId) {
                const newSettings = { ...settings, quality: e.target.value };
                saveUserSettings(userId, newSettings);
                
                // Update player quality if player is open
                const playerWindow = window.openPlayerWindow();
                if (playerWindow) {
                    playerWindow.postMessage({
                        type: 'set-quality',
                        quality: e.target.value
                    }, '*');
                }
            }
        });
    });
}

function initializeCustomUrlDisplay(settings) {
    const urlDisplay = document.getElementById('custom-url-display');
    if (urlDisplay) {
        const userId = getCurrentUserId();
        if (userId) {
            const user = Object.values(USER_SETTINGS).find(u => u.userId === userId);
            if (user) {
                const url = `https://${user.subdomain}.obie.bar`;
                urlDisplay.textContent = url;
                urlDisplay.style.color = '#4CAF50';
                urlDisplay.style.cursor = 'pointer';
                urlDisplay.addEventListener('click', () => {
                    window.open(url, '_blank');
                });
            }
        }
    }
}

function initializeSaveResetButtons() {
    const saveButton = document.getElementById('save-settings');
    const resetButton = document.getElementById('reset-settings');
    
    if (saveButton) {
        saveButton.addEventListener('click', () => {
            const userId = getCurrentUserId();
            if (userId) {
                const settings = {
                    volume: parseInt(document.getElementById('volume-control').value),
                    queueLimit: parseInt(document.getElementById('queue-limit').value),
                    queueTimeout: parseInt(document.getElementById('queue-timeout').value),
                    autoplay: document.getElementById('autoplay-toggle').checked,
                    shuffle: document.getElementById('shuffle-toggle').checked,
                    repeat: document.getElementById('repeat-toggle').checked,
                    quality: document.querySelector('input[name="quality"]:checked').value
                };
                saveUserSettings(userId, settings);
                showStatus('Settings saved successfully', 100);
            }
        });
    }
    
    if (resetButton) {
        resetButton.addEventListener('click', () => {
            if (confirm('Are you sure you want to reset all settings to defaults?')) {
                const userId = getCurrentUserId();
                if (userId) {
                    const defaultSettings = {
                        volume: 100,
                        queueLimit: 10,
                        queueTimeout: 30,
                        autoplay: true,
                        shuffle: false,
                        repeat: false,
                        quality: 'auto'
                    };
                    saveUserSettings(userId, defaultSettings);
                    initializeAdminSettings(); // Reinitialize with defaults
                    showStatus('Settings reset to defaults', 100);
                }
            }
        });
    }
}

// Export the initializer
export { initializeAdminSettings };
