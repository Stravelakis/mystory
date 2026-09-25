/* =============================================================================
   DESKTOP SHELL

   One codebase, two ways to run it, which is what the standards ask for:

     · Desktop   — this file. A window, an icon in the taskbar, an entry in
                   Windows "Installed apps", an uninstaller.
     · Browser   — the same server on the same port, opened in your own
                   browser. Pass --browser, or tick it in Settings.

   Both run the SAME Express server out of dist/server.cjs. There is no second
   implementation to drift, and no feature that exists in one and not the
   other.

   The vault does NOT live inside the installation. An installer can replace
   or remove everything it put on disk, and the one thing here that cannot be
   regenerated is the writing. So the vault and .env go to the user's own data
   folder, and Repair and Update are free to touch the program files without
   ever being near an entry.
   ========================================================================== */

const { app, BrowserWindow, shell, dialog, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const BROWSER_MODE = process.argv.includes('--browser');

// %APPDATA%\my-story on Windows. Survives uninstall, reinstall and update.
const DATA_DIR = app.getPath('userData');
const VAULT_DIR = path.join(DATA_DIR, 'vault');
const ENV_PATH = path.join(DATA_DIR, '.env');

let serverPort = null;
let mainWindow = null;

/** The server reads its configuration from the environment, so the shell
 *  decides where the writing lives before anything starts. */
function prepareEnvironment() {
  fs.mkdirSync(VAULT_DIR, { recursive: true });
  if (!fs.existsSync(ENV_PATH)) fs.writeFileSync(ENV_PATH, '', { mode: 0o600 });

  process.env.VAULT_DIR = VAULT_DIR;
  process.env.MYSTORY_ENV_PATH = ENV_PATH;
  // Loopback only. The desktop app is for this machine; publishing to the
  // network is a deliberate act, done from DEPLOY.md with HOST set.
  process.env.HOST = process.env.HOST || '127.0.0.1';
  // Serve the built client. Without this the server starts Vite's dev
  // middleware, which inside the installed app cannot spawn esbuild and the
  // window waits forever on a port that never opens.
  process.env.NODE_ENV = 'production';
}

/** Starts the bundled server in this process.
 *
 *  Required rather than spawned: a child process would survive a crash of the
 *  window and leave the port held, which is exactly the failure that had to be
 *  cleaned up by hand during development. */
async function startServer() {
  prepareEnvironment();
  const entry = path.join(__dirname, '..', 'dist', 'server.cjs');
  if (!fs.existsSync(entry)) {
    throw new Error(`The app is missing its server (${entry}). Reinstall, or run Repair.`);
  }
  require(entry);

  // The server picks the port; wait for it to actually answer rather than
  // guessing at a delay.
  const port = Number(process.env.PORT) || 38726;
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 80; i++) {
    await new Promise(r => setTimeout(r, 250));
    try {
      const res = await fetch(`${url}/api/auth/status`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        serverPort = port;
        return url;
      }
    } catch {
      // Not up yet.
    }
  }
  throw new Error(`The app started but never answered on port ${port}.`);
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 380,
    backgroundColor: '#0b0808',
    title: 'My Story',
    icon: path.join(__dirname, '..', 'public', 'icon-512.png'),
    autoHideMenuBar: true,
    webPreferences: {
      // The window shows a local page and nothing else. No preload bridge,
      // because the page already has an HTTP API and does not need one.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.loadURL(url);

  // Anything that is not this app opens in the real browser, never in here.
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (!target.startsWith(url)) shell.openExternal(target);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, target) => {
    if (!target.startsWith(url)) {
      e.preventDefault();
      shell.openExternal(target);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/** A menu with the three things someone actually reaches for. */
function buildMenu(url) {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'My Story',
        submenu: [
          { label: 'Open in my browser instead', click: () => shell.openExternal(url) },
          {
            label: 'Show my writing on disk',
            click: () => shell.openPath(VAULT_DIR),
          },
          { type: 'separator' },
          { role: 'reload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      { role: 'editMenu' },
    ]),
  );
}

app.whenReady().then(async () => {
  try {
    const url = await startServer();

    if (BROWSER_MODE) {
      // Browser mode: no window, just the server and the user's own browser.
      // Quitting is done from the tray of the task manager, or by closing the
      // console the installer's shortcut opens.
      await shell.openExternal(url);
      return;
    }

    buildMenu(url);
    createWindow(url);
  } catch (err) {
    dialog.showErrorBox('My Story could not start', String(err && err.message ? err.message : err));
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // Closing the window closes the app, including the server it is holding.
  if (!BROWSER_MODE) app.quit();
});

app.on('activate', () => {
  if (!mainWindow && serverPort) createWindow(`http://127.0.0.1:${serverPort}`);
});
