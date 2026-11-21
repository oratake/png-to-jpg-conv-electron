const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('converter', {
  convert: options => ipcRenderer.invoke('convert', options),
  getPathForFile: file => webUtils.getPathForFile(file),
});
