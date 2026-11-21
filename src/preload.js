const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('converter', {
  convert: options => ipcRenderer.invoke('convert', options),
  getPathForFile: file => webUtils.getPathForFile(file),
  onDockFiles: callback => ipcRenderer.on('dock-files', (_event, paths) => callback(paths)),
});
