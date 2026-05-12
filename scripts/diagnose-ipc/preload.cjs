/**
 * 复刻业务里 preload.ts 的 MessagePort 接收 + ffmpegWriteFrameTransfer 模式。
 */
const { contextBridge, ipcRenderer } = require('electron');

let port = null;
let ackHandler = null;
let ackCount = 0;
let firstAckAt = 0;
let lastAckAt = 0;
const startedAt = Date.now();

function log(...args) {
  console.log(`[preload ${(Date.now() - startedAt).toString().padStart(5)}ms]`, ...args);
}

ipcRenderer.on('diag:port', (event) => {
  port = event.ports[0];
  log(`[preload] received port: ${port ? 'OK' : 'NULL'}`);
  if (!port) return;
  port.onmessage = (e) => {
    const data = e.data;
    if (data?.type === 'ack') {
      ackCount++;
      if (!firstAckAt) firstAckAt = Date.now() - startedAt;
      lastAckAt = Date.now() - startedAt;
      if (ackHandler) ackHandler(data.frameIndex);
    }
  };
  port.start();
  log('[preload] port.start() called');
});

const api = {
  /** Fix A 之后的写法：postMessage 直传 Uint8Array，无 transferList */
  sendFrame: (frameIndex, pixels) => {
    if (!port) {
      throw new Error('port not ready in preload');
    }
    // 关键：不传 transferList，让 Chromium 走 structured clone
    port.postMessage({ type: 'frame', frameIndex, pixels });
  },
  signalDone: () => {
    if (port) port.postMessage({ type: 'done' });
  },
  onAck: (cb) => {
    ackHandler = cb;
  },
  openPort: () => ipcRenderer.invoke('diag:open-port'),
  report: (payload) => ipcRenderer.invoke('diag:report-renderer', payload),
  getStats: () => ({ ackCount, firstAckAt, lastAckAt }),
};

contextBridge.exposeInMainWorld('diag', api);
