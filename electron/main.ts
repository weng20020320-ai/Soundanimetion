import { app, BrowserWindow, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { registerIpcHandlers } from './services/ipc-handlers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#0b0d12',
    title: 'Wavelet',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  mainWindow.on('ready-to-show', () => mainWindow?.show());

  // 仅 dev 模式下：把 renderer 的 warn/error 转发到主进程 stdout，方便定位渲染层报错。
  // 注意：只转发 W/E，避免在 callback 风暴时把 IPC 撑爆。
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.webContents.on(
      'console-message',
      (_event, level, message, line, sourceId) => {
        if (level >= 2) {
          const tag = level === 2 ? 'W' : 'E';
          process.stdout.write(
            `[renderer:${tag}] ${message} (${sourceId}:${line})\n`
          );
        }
      }
    );
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}
