/**
 * Electron **main process** (not to confuse with `src/main.js`, which runs in the renderer).
 */
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, session, Menu } = require('electron');

function createWindow() {
  const iconPath = path.join(__dirname, 'icon.png');
  const winOpts = {
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  };
  if (fs.existsSync(iconPath)) {
    winOpts.icon = iconPath;
  }
  const mainWindow = new BrowserWindow(winOpts);

  // --- CORS HANDLER FOR LOCAL AI (OLLAMA) ---
  // This allows the Desktop App to connect to Ollama (localhost:11434) 
  // without the user needing to set OLLAMA_ORIGINS="*" environment variable.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const { url } = details;
    
    // Only inject headers for local LLM servers
    if (url.includes('localhost:11434') || url.includes('127.0.0.1:11434')) {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Access-Control-Allow-Origin': ['*'],
          'Access-Control-Allow-Headers': ['*'],
          'Access-Control-Allow-Methods': ['GET, POST, OPTIONS']
        }
      });
    } else {
      callback({ responseHeaders: details.responseHeaders });
    }
  });

  // Load the index.html of the app.
  mainWindow.loadFile('index.html');

  // Open the DevTools. (Optional, remove for production)
  // mainWindow.webContents.openDevTools();
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
