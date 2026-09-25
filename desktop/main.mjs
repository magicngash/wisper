import { app, BrowserWindow, globalShortcut, ipcMain, screen, session } from 'electron';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { insertTextIntoActiveWindow } from './text-injector.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(projectRoot, '.env') });
process.env.GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || 'YOUR_API_KEY';
const port = Number(process.env.PORT || 3000);
const shortcut = process.env.CLEAN_SPEECH_SHORTCUT || 'CommandOrControl+Shift+Space';
const chromeUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
let backendProcess;
let mainWindow;
let overlayWindow;
let releaseWatcher;
let recording = false;

function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    width: 390,
    height: 88,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  });
  overlayWindow.setAlwaysOnTop(true, 'floating');
  overlayWindow.setIgnoreMouseEvents(true);

  const overlayMarkup = `<!doctype html>
    <html><head><meta charset="utf-8"><style>
      * { box-sizing: border-box; }
      html, body { margin: 0; background: transparent; font-family: "Segoe UI", Arial, sans-serif; }
      #card { margin: 8px; padding: 13px 16px; border-radius: 16px; color: white; background: rgba(15, 23, 42, .96); box-shadow: 0 12px 34px rgba(15, 23, 42, .32); border: 1px solid rgba(255,255,255,.14); display: flex; gap: 11px; align-items: center; }
      #dot { width: 11px; height: 11px; flex: 0 0 auto; border-radius: 50%; background: #94a3b8; }
      #dot.active { background: #fb7185; box-shadow: 0 0 0 5px rgba(251,113,133,.17); animation: pulse 1.25s infinite; }
      #dot.busy { background: #818cf8; box-shadow: 0 0 0 5px rgba(129,140,248,.17); animation: pulse 1.5s infinite; }
      #label { font-size: 14px; font-weight: 700; line-height: 18px; }
      #detail { color: #cbd5e1; font-size: 11px; line-height: 15px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 320px; }
      #time { color: #fda4af; font: 700 12px Consolas, monospace; margin-left: auto; }
      @keyframes pulse { 50% { opacity: .45; transform: scale(.85); } }
    </style></head><body><div id="card"><span id="dot"></span><div><div id="label">Ready</div><div id="detail">Clean Speech is ready</div></div><span id="time"></span></div>
    <script>
      window.overlay?.onOverlayStatus((payload) => {
        const dot = document.getElementById('dot');
        document.getElementById('label').textContent = payload.label || 'Clean Speech';
        document.getElementById('detail').textContent = payload.detail || '';
        document.getElementById('time').textContent = payload.recordingTime ? payload.recordingTime : '';
        dot.className = payload.status === 'recording' ? 'active' : (payload.status === 'transcribing' || payload.status === 'refining' ? 'busy' : '');
      });
    </script></body></html>`;
  overlayWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(overlayMarkup)}`);
}

function setOverlayStatus(payload) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.webContents.send('overlay:status', payload);
  if (payload.status === 'idle') {
    setTimeout(() => {
      if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide();
    }, 1000);
    return;
  }
  const { workArea } = screen.getPrimaryDisplay();
  overlayWindow.setPosition(
    Math.round(workArea.x + (workArea.width - 390) / 2),
    workArea.y + 18,
  );
  overlayWindow.showInactive();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 650,
    title: 'Clean Speech',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  });
  mainWindow.webContents.setUserAgent(chromeUserAgent);
  mainWindow.webContents.on('console-message', (_event, _level, message) => {
    console.log(`[renderer] ${message}`);
  });
  mainWindow.loadURL(`http://127.0.0.1:${port}`);
}

function configureMediaPermissions() {
  const isSpeechPermission = (permission) => permission === 'media' || permission === 'speech';

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(isSpeechPermission(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => isSpeechPermission(permission));
}

function startBackend() {
  const tsx = path.join(projectRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  if (!existsSync(tsx)) throw new Error('Dependencies are not installed. Run npm install first.');
  backendProcess = spawn(process.env.npm_node_execpath || 'node.exe', [tsx, 'server.ts'], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(port) },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  backendProcess.stdout.on('data', (chunk) => console.log(`[backend] ${chunk.toString().trim()}`));
  backendProcess.stderr.on('data', (chunk) => console.error(`[backend] ${chunk.toString().trim()}`));
}

async function waitForBackend() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Clean Speech backend did not become ready.');
}

function registerPushToTalk() {
  const candidates = process.platform === 'win32'
    ? [shortcut, ...(shortcut === 'CommandOrControl+Shift+Space' ? ['Control+Shift+Space'] : [])]
    : [shortcut];
  const registered = candidates.find((candidate) => globalShortcut.register(candidate, () => {
    if (recording || !mainWindow || mainWindow.isDestroyed()) return;
    recording = true;
    console.log('Push-to-talk START');
    mainWindow.webContents.send('desktop:start-recording');

    if (process.platform === 'win32') {
      const releaseScript = [
        'Add-Type @"',
        'using System; using System.Runtime.InteropServices;',
        'public static class KeyState { [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key); }',
        '"@',
        '$deadline = [DateTime]::UtcNow.AddSeconds(1)',
        'while (([KeyState]::GetAsyncKeyState(0x20) -band 0x8000) -eq 0 -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 15 }',
        'while (([KeyState]::GetAsyncKeyState(0x20) -band 0x8000) -ne 0) { Start-Sleep -Milliseconds 25 }',
      ].join('\n');
      releaseWatcher = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', releaseScript], { windowsHide: true, stdio: 'ignore' });
      releaseWatcher.once('close', () => {
        releaseWatcher = undefined;
        if (!recording || !mainWindow || mainWindow.isDestroyed()) return;
        recording = false;
        console.log('Push-to-talk STOP');
        mainWindow.webContents.send('desktop:stop-recording');
      });
      releaseWatcher.once('error', (error) => console.error('Push-to-talk release watcher failed:', error));
    }
  }));

  if (!registered) console.error(`Could not register push-to-talk shortcut: ${candidates.join(', ')}`);
  else console.log(`Push-to-talk shortcut: ${registered}`);
}

app.whenReady().then(async () => {
  configureMediaPermissions();
  startBackend();
  await waitForBackend();
  createOverlayWindow();
  createWindow();
  registerPushToTalk();
}).catch((error) => {
  console.error(error);
  app.quit();
});

ipcMain.on('desktop:insert-text', async (_event, text) => {
  try { await insertTextIntoActiveWindow(String(text || '')); }
  catch (error) { mainWindow?.webContents.send('desktop:error', error instanceof Error ? error.message : 'Text insertion failed.'); }
});

ipcMain.on('desktop:error', (_event, message) => console.error(`Clean Speech: ${message}`));
ipcMain.on('desktop:overlay-status', (_event, payload) => setOverlayStatus(payload));

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (releaseWatcher && !releaseWatcher.killed) releaseWatcher.kill();
  if (backendProcess && !backendProcess.killed) backendProcess.kill();
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.destroy();
});
