const { contextBridge, ipcRenderer } = require('electron');

let port = null;

ipcRenderer.on('diag:port', (event) => {
  port = event.ports[0];
  if (!port) return;
  port.onmessage = (e) => {
    /* not used in this variant */
  };
  port.start();
});

const api = {
  openPort: () => ipcRenderer.invoke('diag:open-port'),
  report: (payload) => ipcRenderer.invoke('diag:report-renderer', payload),

  /** A) 跟业务一模一样：postMessage(obj, [transferList(ArrayBuffer)]) */
  sendVariantA: (frameIndex, pixels) => {
    port.postMessage(
      { type: 'frame', variant: 'A', frameIndex, pixelsBuffer: pixels.buffer },
      [pixels.buffer]
    );
  },

  /** B) 不放 transferList，让 ArrayBuffer 走结构化复制（慢但应该稳） */
  sendVariantB: (frameIndex, pixels) => {
    port.postMessage({
      type: 'frame',
      variant: 'B',
      frameIndex,
      pixelsBuffer: pixels.buffer,
    });
  },

  /** C) 完全不传 buffer，只传基本类型 */
  sendVariantC: (frameIndex) => {
    port.postMessage({ type: 'frame', variant: 'C', frameIndex });
  },

  /** D) 直接传 Uint8Array（不解构 .buffer），看 contextBridge 路上发生了什么 */
  sendVariantD: (frameIndex, pixels) => {
    port.postMessage({
      type: 'frame',
      variant: 'D',
      frameIndex,
      pixels, // Uint8Array
    });
  },

  /** E) Buffer.from 包一下（Node 风味） */
  sendVariantE: (frameIndex, pixels) => {
    // 注意：preload 里能用 Node 但 Buffer 在 isolated 世界
    const Buffer = require('buffer').Buffer;
    const buf = Buffer.from(pixels.buffer);
    port.postMessage({
      type: 'frame',
      variant: 'E',
      frameIndex,
      pixelsBuffer: buf, // Buffer (Node)
    });
  },

  signalDone: () => {
    if (port) port.postMessage({ type: 'done' });
  },
};

contextBridge.exposeInMainWorld('diag', api);
