const { contextBridge, ipcRenderer } = require('electron');

const ports = new Map();
const ackHandlers = new Map();

ipcRenderer.on('e2e:port', (event, payload) => {
  const port = event.ports[0];
  if (!port) return;
  port.onmessage = (e) => {
    const data = e.data;
    if (data?.type === 'ack') {
      const cb = ackHandlers.get(payload.sessionId);
      if (cb) cb(data.frameIndex);
    }
  };
  port.start();
  ports.set(payload.sessionId, port);
});

const api = {
  startOk: (out) => ipcRenderer.invoke('e2e:start-ok', out),
  startBad: (out) => ipcRenderer.invoke('e2e:start-bad', out),
  finish: (id) => ipcRenderer.invoke('e2e:finish', id),
  report: (name, data) => ipcRenderer.invoke('e2e:report', name, data),
  done: () => ipcRenderer.invoke('e2e:done'),

  /** Fix A 写法：postMessage 直传 Uint8Array */
  sendFrame: (sessionId, frameIndex, pixels) => {
    const port = ports.get(sessionId);
    if (!port) throw new Error('port not ready');
    port.postMessage({ frameIndex, pixels });
  },

  onAck: (sessionId, cb) => {
    ackHandlers.set(sessionId, cb);
  },
};
contextBridge.exposeInMainWorld('e2e', api);
