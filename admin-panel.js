// Admin Panel JavaScript
import { saveUserSettings, loadUserSettings } from './user-management.js';

let currentTab = 'credits';
let settings = {};

// Initialize admin panel
function initializeAdminPanel() {
    // Load settings
    const userId = getCurrentUserId();
    if (userId) {
        settings = loadUserSettings(userId) || {};
        initializeSettings();
    }

    // Setup event listeners
    setupEventListeners();
}

// Initialize settings with current values
function initializeSettings() {
    // Credits settings
    document.getElementById('credits-value').textContent = settings.credits?.value || '0';
    document.getElementById('credits-mode').value = settings.credits?.mode || 'FREE-PLAY';
    document.getElementById('credits-coins-key-1').value = settings.credits?.coinsKey1 || 'b';
    document.getElementById('credits-coins-key-2').value = settings.credits?.coinsKey2 || 'a';
    document.getElementById('credits-coins-credit-2').value = settings.credits?.coinsCredit2 || '1';
    
    // Initialize serial device dropdown
    initializeSerialDevices();

    // Initialize playlists
    initializePlaylists();

    // Initialize attract mode
    initializeAttractMode();
}

// Setup event listeners
function setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('.tab-btn').forEach(button => {
        button.addEventListener('click', () => {
            const tab = button.dataset.tab;
            switchTab(tab);
        });
    });

    // Close button
    document.getElementById('admin-close').addEventListener('click', () => {
        document.getElementById('admin-panel').style.display = 'none';
    });

    // Credit value controls
    document.querySelectorAll('.btn').forEach(button => {
        button.addEventListener('click', handleCreditValueChange);
    });

    // Mode selection
    document.getElementById('credits-mode').addEventListener('change', handleModeChange);

    // Serial device selection
    document.getElementById('credits-serial').addEventListener('change', handleSerialDeviceChange);

    // Coin key inputs
    document.getElementById('credits-coins-key-1').addEventListener('input', handleCoinsKey1Change);
    document.getElementById('credits-coins-key-2').addEventListener('input', handleCoinsKey2Change);
    document.getElementById('credits-coins-credit-2').addEventListener('input', handleCoinsCredit2Change);

    // Playlist management
    document.getElementById('validate-playlist').addEventListener('click', validatePlaylist);
    document.getElementById('add-playlist').addEventListener('click', addPlaylist);
    document.getElementById('playlist-list').addEventListener('click', handlePlaylistAction);

    // Attract mode
    document.getElementById('idle-enabled').addEventListener('change', handleIdleEnabledChange);
    document.getElementById('idle-interval').addEventListener('input', handleIdleIntervalChange);
    document.getElementById('slideshow-enabled').addEventListener('change', handleSlideshowEnabledChange);
    document.getElementById('slideshow-media').addEventListener('change', handleSlideshowMediaChange);

    // Save/Reset buttons
    document.getElementById('save-settings').addEventListener('click', saveAllSettings);
    document.getElementById('reset-settings').addEventListener('click', resetToDefaults);
}

// Handle coin key 1 change
function handleCoinsKey1Change(e) {
    settings.credits = settings.credits || {};
    settings.credits.coinsKey1 = e.target.value;
}

// Handle coin key 2 change
function handleCoinsKey2Change(e) {
    settings.credits = settings.credits || {};
    settings.credits.coinsKey2 = e.target.value;
}

// Handle coin credit 2 change
function handleCoinsCredit2Change(e) {
    settings.credits = settings.credits || {};
    settings.credits.coinsCredit2 = parseInt(e.target.value);
}

// Handle playlist validation
async function validatePlaylist() {
    const playlistId = document.getElementById('playlist-id').value;
    try {
        // Validate playlist ID here
        // For now, just show a success message
        showStatus('Playlist ID is valid', 100);
    } catch (error) {
        showStatus('Invalid playlist ID', 100, 'error');
    }
}

// Handle playlist addition
async function addPlaylist() {
    const playlistId = document.getElementById('playlist-id').value;
    try {
        // Add playlist logic here
        settings.playlists = settings.playlists || [];
        settings.playlists.push({
            id: playlistId,
            name: `Playlist ${settings.playlists.length + 1}`,
            show: true
        });
        initializePlaylists();
        showStatus('Playlist added successfully', 100);
    } catch (error) {
        showStatus('Failed to add playlist', 100, 'error');
    }
}

// Handle playlist actions
function handlePlaylistAction(e) {
    const target = e.target;
    const playlistItem = target.closest('.playlist-item');
    if (!playlistItem) return;

    const playlistId = playlistItem.dataset.playlistId;
    const playlist = settings.playlists.find(p => p.id === playlistId);

    if (target.classList.contains('playlist-show')) {
        playlist.show = target.checked;
    } else if (target.classList.contains('playlist-delete')) {
        if (confirm('Are you sure you want to delete this playlist?')) {
            settings.playlists = settings.playlists.filter(p => p.id !== playlistId);
            initializePlaylists();
        }
    }
}

// Handle idle settings
function handleIdleEnabledChange(e) {
    settings.attract = settings.attract || {};
    settings.attract.idleEnabled = e.target.checked;
}

function handleIdleIntervalChange(e) {
    settings.attract = settings.attract || {};
    settings.attract.idleInterval = parseInt(e.target.value);
}

// Handle source selection
function handleSourceChange(e) {
    settings.attract = settings.attract || {};
    settings.attract.source = e.target.value;
    updateSourceSettings();
}

// Handle promo settings
function handlePromoTransitionChange(e) {
    settings.attract = settings.attract || {};
    settings.attract.promo = settings.attract.promo || {};
    settings.attract.promo.transition = e.target.value;
}

function handlePromoMediaChange(e) {
    const files = Array.from(e.target.files);
    settings.attract = settings.attract || {};
    settings.attract.promo = settings.attract.promo || {};
    
    // Add new files to existing ones
    settings.attract.promo.media = [...(settings.attract.promo.media || []), ...files.map(file => file.name)];
    
    // Update preview
    const preview = document.getElementById('promo-media-preview');
    preview.innerHTML = '';
    
    files.forEach(file => {
        addMediaPreview(file);
    });
}

function addMediaPreview(file) {
    const preview = document.getElementById('promo-media-preview');
    const previewItem = document.createElement('div');
    previewItem.className = 'media-item';
    
    if (file.type.startsWith('image/')) {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.style.maxWidth = '100px';
        previewItem.appendChild(img);
    } else if (file.type.startsWith('video/')) {
        const video = document.createElement('video');
        video.src = URL.createObjectURL(file);
        video.controls = true;
        video.style.maxWidth = '100px';
        previewItem.appendChild(video);
    }
    
    const removeButton = document.createElement('button');
    removeButton.textContent = '×';
    removeButton.className = 'remove-media';
    removeButton.addEventListener('click', () => {
        previewItem.remove();
        settings.attract.promo.media = settings.attract.promo.media.filter(m => m !== file.name);
    });
    previewItem.appendChild(removeButton);
    
    preview.appendChild(previewItem);
}

// Handle artists settings
function handleArtistsStyleChange(e) {
    settings.attract = settings.attract || {};
    settings.attract.artists = settings.attract.artists || {};
    settings.attract.artists.style = e.target.value;
}

function handleArtistsTransitionChange(e) {
    settings.attract = settings.attract || {};
    settings.attract.artists = settings.attract.artists || {};
    settings.attract.artists.transition = e.target.value;
}

// Handle player settings
function handlePlayerControlsChange(e) {
    settings.attract = settings.attract || {};
    settings.attract.player = settings.attract.player || {};
    settings.attract.player.controls = e.target.value;
}

function handlePlayerQualityChange(e) {
    settings.attract = settings.attract || {};
    settings.attract.player = settings.attract.player || {};
    settings.attract.player.quality = e.target.value;
}

// Handle tab switching
function switchTab(tab) {
    // Update active tab in UI
    document.querySelectorAll('.tab-btn').forEach(button => {
        button.classList.toggle('active', button.dataset.tab === tab);
    });

    // Show/hide tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `${tab}-tab`);
    });

    currentTab = tab;
}

// Handle credit value changes
function handleCreditValueChange(e) {
    const action = e.target.dataset.action;
    const current = parseInt(document.getElementById('credits-value').textContent);
    
    let newValue;
    if (action === 'add') {
        newValue = current + 1;
    } else {
        newValue = Math.max(0, current - 1);
    }
    
    document.getElementById('credits-value').textContent = newValue;
    settings.credits = settings.credits || {};
    settings.credits.value = newValue;
}

// Handle mode change
function handleModeChange(e) {
    settings.credits = settings.credits || {};
    settings.credits.mode = e.target.value;
}

// Handle serial device change
function handleSerialDeviceChange(e) {
    settings.credits = settings.credits || {};
    settings.credits.serialDevice = e.target.value;
}

// Handle coins key change
function handleCoinsKeyChange(e) {
    settings.credits = settings.credits || {};
    settings.credits.coinsKey = e.target.value;
}

// Initialize serial devices dropdown
async function initializeSerialDevices() {
    try {
        const devices = await navigator.serial.getPorts();
        const select = document.getElementById('credits-serial');
        devices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.path;
            option.textContent = device.path;
            select.appendChild(option);
        });
        
        if (settings.credits?.serialDevice) {
            select.value = settings.credits.serialDevice;
        }
    } catch (error) {
        console.error('Error initializing serial devices:', error);
    }
}

// Initialize playlists
function initializePlaylists() {
    const playlistList = document.getElementById('playlist-list');
    const playlists = settings.playlists || [];
    
    // Clear existing playlists
    playlistList.innerHTML = '';
    
    // Add each playlist
    playlists.forEach(playlist => {
        const playlistItem = document.createElement('div');
        playlistItem.className = 'playlist-item';
        playlistItem.innerHTML = `
            <span class="playlist-name">${playlist.name}</span>
            <input type="checkbox" class="playlist-show" ${playlist.show ? 'checked' : ''}>
            <button class="playlist-delete">🗑️</button>
        `;
        playlistItem.dataset.playlistId = playlist.id;
        playlistList.appendChild(playlistItem);
    });
}

// Initialize attract mode
function initializeAttractMode() {
    const idleEnabled = document.getElementById('idle-enabled');
    const idleInterval = document.getElementById('idle-interval');
    const idleValue = document.getElementById('idle-value');
    const idleSource = document.getElementById('idle-source');
    
    // Set initial values
    idleEnabled.checked = settings.attract?.idleEnabled || false;
    idleInterval.value = settings.attract?.idleInterval || 30;
    idleValue.textContent = idleInterval.value;
    idleSource.value = settings.attract?.source || 'PROMO';
    
    // Update idle value display
    idleInterval.addEventListener('input', (e) => {
        idleValue.textContent = e.target.value;
    });
    
    // Update source settings visibility
    updateSourceSettings();
    
    // Initialize source-specific settings
    initializePromoSettings();
    initializeArtistsSettings();
    initializePlayerSettings();
}

// Update source settings visibility
function updateSourceSettings() {
    const source = document.getElementById('idle-source').value;
    const promoSettings = document.querySelector('.promo-settings');
    const artistsSettings = document.querySelector('.artists-settings');
    const playerSettings = document.querySelector('.player-settings');
    
    promoSettings.style.display = source === 'PROMO' ? 'block' : 'none';
    artistsSettings.style.display = source === 'ARTISTS' ? 'block' : 'none';
    playerSettings.style.display = source === 'PLAYER' ? 'block' : 'none';
}

// Initialize promo settings
function initializePromoSettings() {
    const promoTransition = document.getElementById('promo-transition');
    const promoMedia = document.getElementById('promo-media');
    const promoPreview = document.getElementById('promo-media-preview');
    
    // Set initial values
    promoTransition.value = settings.attract?.promo?.transition || 'fade';
    
    // Initialize media preview
    const mediaFiles = settings.attract?.promo?.media || [];
    mediaFiles.forEach(file => {
        addMediaPreview(file);
    });
}

// Initialize artists settings
function initializeArtistsSettings() {
    const artistsStyle = document.getElementById('artists-style');
    const artistsTransition = document.getElementById('artists-transition');
    
    // Set initial values
    artistsStyle.value = settings.attract?.artists?.style || 'classic';
    artistsTransition.value = settings.attract?.artists?.transition || 'fade';
}

// Initialize player settings
function initializePlayerSettings() {
    const playerControls = document.getElementById('player-controls');
    const playerQuality = document.getElementById('player-quality');
    
    // Set initial values
    playerControls.value = settings.attract?.player?.controls || 'show';
    playerQuality.value = settings.attract?.player?.quality || 'auto';
}

// Save all settings
function saveAllSettings() {
    const userId = getCurrentUserId();
    if (userId) {
        saveUserSettings(userId, settings);
        showStatus('Settings saved successfully', 100);
    }
}

// Reset to defaults
function resetToDefaults() {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
        const userId = getCurrentUserId();
        if (userId) {
            settings = {
                credits: {
                    value: 0,
                    mode: 'FREE-PLAY',
                    serialDevice: '',
                    coinsKey: 'b'
                }
            };
            saveUserSettings(userId, settings);
            initializeSettings();
            showStatus('Settings reset to defaults', 100);
        }
    }
}

// Export initializer
export { initializeAdminPanel };
