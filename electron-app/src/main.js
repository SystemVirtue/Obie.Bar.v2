const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

function createWindow() {
    // Create the browser window for the main interface
    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 1024,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        frame: false, // No window border
        fullscreen: true // Start in fullscreen
    });

    // Load the main interface
    mainWindow.loadFile(path.join(__dirname, '../public/index.html'));

    // Create the player window (hidden initially)
    const playerWindow = new BrowserWindow({
        width: 1920,
        height: 1080,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        frame: false,
        fullscreen: true,
        show: false // Start hidden
    });

    // Load the public player window URL
    playerWindow.loadURL('https://player2.obie.bar');

    // Handle communication between windows
    ipcMain.on('show-player', () => {
        playerWindow.show();
        playerWindow.focus();
    });

    ipcMain.on('hide-player', () => {
        playerWindow.hide();
    });

    // Handle window events
    mainWindow.on('closed', () => {
        app.quit();
    });
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
