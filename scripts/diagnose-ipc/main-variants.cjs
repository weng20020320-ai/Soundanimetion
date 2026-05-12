const path = require('node:path');
const {
  app,
  BrowserWindow,
  MessageChannelMain,
  ipcMain,
} = require('electron');

const startedAt = Date.now();
const log = (...args) => {
  console.log(`[${(Date.now() - startedAt).toString().padStart(5)}ms]`, ...args);
};

let win;
let mainPort;
const counters = { A: 0, B: 0, C: 0, D: 0, E: 0, empty: 0 };
const inspectFirst = { A: false, B: false, C: false, D: false, E: false };

ipcMain.handle('diag:open-port', (event) => {
  const channel = new MessageChannelMain();
  mainPort = channel.port1;

  mainPort.on('message', (e) => {
    const data = e.data;
    if (!data || typeof data !== 'object') {
      counters.empty++;
      log(
        `  [main] EMPTY data | typeof=${typeof data} | val=${JSON.stringify(data)}`
      );
      return;
    }
    if (data.type === 'done') {
      log(`[main] DONE`);
      log(`[main] counters: ${JSON.stringify(counters)}`);
      setTimeout(() => app.quit(), 200);
      return;
    }
    if (data.type === 'frame') {
      counters[data.variant] = (counters[data.variant] || 0) + 1;
      if (!inspectFirst[data.variant]) {
        inspectFirst[data.variant] = true;
        const keys = Object.keys(data);
        let bufInfo = 'n/a';
        if (data.pixelsBuffer) {
          const ctor = data.pixelsBuffer.constructor?.name ?? 'unknown';
          const len =
            data.pixelsBuffer.byteLength ?? data.pixelsBuffer.length ?? -1;
          bufInfo = `${ctor}(byteLength=${len})`;
        }
        let pixInfo = 'n/a';
        if (data.pixels) {
          const ctor = data.pixels.constructor?.name ?? 'unknown';
          const len = data.pixels.byteLength ?? data.pixels.length ?? -1;
          pixInfo = `${ctor}(len=${len})`;
        }
        log(
          `  [main] variant ${data.variant} | keys=${keys.join(',')} | pixelsBuffer=${bufInfo} | pixels=${pixInfo}`
        );
      }
    }
  });
  mainPort.start();

  event.sender.postMessage('diag:port', null, [channel.port2]);
  return { ok: true };
});

ipcMain.handle('diag:report-renderer', (_e, payload) => {
  log(`[renderer] ${JSON.stringify(payload)}`);
});

app.whenReady().then(() => {
  win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-variants.cjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer-variants.html'));

  setTimeout(() => {
    log('[main] WATCHDOG TIMEOUT (30s)');
    log(`[main] counters: ${JSON.stringify(counters)}`);
    app.quit();
  }, 30_000);
});

app.on('window-all-closed', () => app.quit());
