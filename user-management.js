// User Management System
const USER_SETTINGS_KEY = 'userSettings';
const USER_ID_KEY = 'userId';
const USER_SUBDOMAINS = new Map(); // Store subdomain -> userId mapping
const USER_SETTINGS = {}; // Store userId -> settings mapping

// Initialize user management
function initializeUserManagement() {
    // Load existing user settings from localStorage
    const savedSettings = localStorage.getItem(USER_SETTINGS_KEY);
    if (savedSettings) {
        USER_SETTINGS = JSON.parse(savedSettings);
    }
    
    // Load existing user-subdomain mappings
    const savedSubdomains = localStorage.getItem('userSubdomains');
    if (savedSubdomains) {
        const parsedSubdomains = JSON.parse(savedSubdomains);
        for (const [subdomain, userId] of Object.entries(parsedSubdomains)) {
            USER_SUBDOMAINS.set(subdomain, userId);
        }
    }
}

// Get current user ID from URL or localStorage
function getCurrentUserId() {
    const url = new URL(window.location.href);
    const subdomain = url.hostname.split('.')[0];
    
    // If URL has a custom subdomain, get the user ID
    if (subdomain !== 'www' && subdomain !== 'jukebox2') {
        const userId = USER_SUBDOMAINS.get(subdomain);
        if (userId) {
            return userId;
        }
    }
    
    // Fallback to stored user ID
    return localStorage.getItem(USER_ID_KEY);
}

// Register a new user with custom subdomain
async function registerUser(username, desiredSubdomain) {
    // Check if subdomain is available
    if (USER_SUBDOMAINS.has(desiredSubdomain)) {
        throw new Error('Subdomain already taken');
    }
    
    // Generate unique user ID
    const userId = Date.now().toString() + Math.floor(Math.random() * 10000);
    
    // Store subdomain -> userId mapping
    USER_SUBDOMAINS.set(desiredSubdomain, userId);
    localStorage.setItem('userSubdomains', JSON.stringify(Object.fromEntries(USER_SUBDOMAINS)));
    
    // Store user settings
    USER_SETTINGS[userId] = {
        username,
        subdomain: desiredSubdomain,
        settings: {
            // Default settings
            volume: 100,
            autoplay: true,
            queueLimit: 10,
            // Add more settings as needed
        }
    };
    localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(USER_SETTINGS));
    
    // Store user ID
    localStorage.setItem(USER_ID_KEY, userId);
    
    return userId;
}

// Load user settings
function loadUserSettings(userId) {
    return USER_SETTINGS[userId]?.settings || {};
}

// Save user settings
function saveUserSettings(userId, settings) {
    if (USER_SETTINGS[userId]) {
        USER_SETTINGS[userId].settings = settings;
        localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(USER_SETTINGS));
    }
}

// Get user's custom URL
function getUserCustomUrl(userId) {
    const user = Object.values(USER_SETTINGS).find(u => u.userId === userId);
    if (user) {
        return `https://${user.subdomain}.obie.bar`;
    }
    return null;
}

// Export functions for use in other modules
export {
    initializeUserManagement,
    getCurrentUserId,
    registerUser,
    loadUserSettings,
    saveUserSettings,
    getUserCustomUrl
};
