const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    showPlayer: () => ipcRenderer.send('show-player'),
    hidePlayer: () => ipcRenderer.send('hide-player')
});
