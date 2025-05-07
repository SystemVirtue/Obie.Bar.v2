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
    document.getElementById('credits-coins-key').value = settings.credits?.coinsKey || 'b';
    
    // Initialize serial device dropdown
    initializeSerialDevices();
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

    // Coin key input
    document.getElementById('credits-coins-key').addEventListener('input', handleCoinsKeyChange);

    // Save/Reset buttons
    document.getElementById('save-settings').addEventListener('click', saveAllSettings);
    document.getElementById('reset-settings').addEventListener('click', resetToDefaults);
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
