const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { convertInputs } = require('./converter');

function createWindow() {
  const window = new BrowserWindow({
    width: 640,
    height: 520,
    minWidth: 480,
    minHeight: 420,
    title: 'PNG to JPEG',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.loadFile(path.join(__dirname, 'index.html'));
}

ipcMain.handle('convert', async (_event, { paths, quality, recursive }) => {
  if (!Array.isArray(paths) || paths.some(item => typeof item !== 'string')) {
    throw new TypeError('ファイルまたはフォルダをドロップしてください');
  }
  return convertInputs(paths, { quality, recursive });
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
