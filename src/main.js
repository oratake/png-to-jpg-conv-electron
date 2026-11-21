const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { convertInputs } = require('./converter');

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

let mainWindow;
let rendererReady = false;
const pendingDockPaths = [];
const pendingDockPathSet = new Set();
const diagnosticLog = path.join(app.getPath('userData'), 'dock-drop-diagnostic.log');
let diagnosticWrites = Promise.resolve();

function logDiagnostic(event, details = {}) {
  const line = JSON.stringify({ at: new Date().toISOString(), event, ...details }) + '\n';
  diagnosticWrites = diagnosticWrites
    .then(() => fs.mkdir(path.dirname(diagnosticLog), { recursive: true }))
    .then(() => fs.appendFile(diagnosticLog, line, 'utf8'))
    .catch(() => {});
}

function flushDockPaths() {
  if (!rendererReady || !mainWindow || mainWindow.isDestroyed() || pendingDockPaths.length === 0) return;
  const paths = pendingDockPaths.splice(0);
  for (const filePath of paths) pendingDockPathSet.delete(filePath);
  logDiagnostic('renderer-delivery', { count: paths.length });
  mainWindow.webContents.send('dock-files', paths);
}

function receiveDockPaths(filePaths, source) {
  logDiagnostic('input-received', { source, count: filePaths.length });
  for (const filePath of filePaths) {
    const normalized = path.resolve(filePath);
    if (!pendingDockPathSet.has(normalized)) {
      pendingDockPathSet.add(normalized);
      pendingDockPaths.push(normalized);
    }
  }
  if (!app.isReady()) return;
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    flushDockPaths();
  }
}

async function receivePathsFromArguments(args) {
  const paths = [];
  for (let i = 0; i < args.length; i++) {
    const candidate = args[i];
    if (candidate.startsWith('-')) {
      if (!candidate.includes('=') && args[i + 1] && !args[i + 1].startsWith('-')) i++;
      continue;
    }
    const absolutePath = path.resolve(candidate);
    if (candidate === '.' || candidate === './' || absolutePath === process.cwd() || absolutePath === app.getAppPath()) continue;
    try {
      const stat = await fs.lstat(absolutePath);
      if (stat.isSymbolicLink()) continue;
      if (stat.isFile() && path.extname(absolutePath).toLowerCase() === '.png') paths.push(absolutePath);
      else if (stat.isDirectory() && !absolutePath.toLowerCase().endsWith('.app') && !absolutePath.includes('.app/')) paths.push(absolutePath);
    } catch {
      // Ignore Electron flags, resource paths, and non-existent arguments.
    }
  }
  logDiagnostic('arguments-scanned', { supplied: args.length, accepted: paths.length });
  if (paths.length) receiveDockPaths(paths, 'arguments');
}

// macOS routes files dropped on a Dock icon through this event.
// Register before app readiness: an initial Dock drop may arrive during launch.
if (hasSingleInstanceLock) {
  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    logDiagnostic('open-file-event', { extension: path.extname(filePath).toLowerCase() });
    receiveDockPaths([filePath], 'open-file');
  });
  app.on('second-instance', (_event, commandLine) => {
    logDiagnostic('second-instance-event', { argumentCount: commandLine.length });
    void receivePathsFromArguments(commandLine.slice(1));
  });
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  rendererReady = false;
  mainWindow = new BrowserWindow({
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
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.once('did-finish-load', () => {
    rendererReady = true;
    logDiagnostic('renderer-ready');
    flushDockPaths();
  });
  mainWindow.on('closed', () => {
    mainWindow = undefined;
    rendererReady = false;
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  return mainWindow;
}

ipcMain.handle('convert', async (_event, { paths, quality, recursive }) => {
  if (!Array.isArray(paths) || paths.some(item => typeof item !== 'string')) {
    throw new TypeError('ファイルまたはフォルダをドロップしてください');
  }
  const result = await convertInputs(paths, { quality, recursive });
  logDiagnostic('conversion-finished', { found: result.found, converted: result.converted, skipped: result.skipped, failed: result.failed.length });
  return result;
});

if (hasSingleInstanceLock) {
  app.whenReady().then(() => {
    logDiagnostic('app-ready', { platform: process.platform, argumentCount: process.argv.length });
    createWindow();
    void receivePathsFromArguments(process.argv.slice(1));
    app.on('activate', () => {
      if (!mainWindow || mainWindow.isDestroyed()) createWindow();
      else mainWindow.show();
    });
  });

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
