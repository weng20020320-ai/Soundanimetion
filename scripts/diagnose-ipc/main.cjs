/**
 * 独立的 Electron 诊断程序：复刻业务代码里 Renderer ↔ Main 的
 *   MessageChannelMain + transferList(ArrayBuffer) + contextBridge
 * 完整链路，只测 IPC 是否能跑通。
 *
 * 不依赖 ffmpeg、不依赖业务代码、不动业务代码。
 *
 * 运行：npx electron scripts/diagnose-ipc/main.cjs
 *
 * 预期成功输出：renderer 发 90 帧，main 收 90 帧，全部 ack 回去。
 * 失败模式（我们的怀疑）：renderer 发了 90 帧，main 只收到 0 / 部分。
 */
const path = require('node:path');
const {
  app,
  BrowserWindow,
  MessageChannelMain,
  ipcMain,
} = require('electron');

const NUM_FRAMES = 90;
const FRAME_BYTES = 1920 * 1080 * 4; // 7.91 MB

let win;
let mainPort;
let receivedAtMain = 0;
let expectedFrameIndices = new Set();
let receivedFrameIndices = new Set();
let firstReceiveAt = 0;
let lastReceiveAt = 0;
const startedAt = Date.now();

function log(...args) {
  console.log(`[${(Date.now() - startedAt).toString().padStart(5)}ms]`, ...args);
}

ipcMain.handle('diag:open-port', (event) => {
  const channel = new MessageChannelMain();
  mainPort = channel.port1;

  mainPort.on('message', (e) => {
    const data = e.data;
    if (!data) {
      log('[main] received message with empty data!');
      return;
    }
    if (data.type === 'frame') {
      const u8 = data.pixels;
      receivedAtMain++;
      receivedFrameIndices.add(data.frameIndex);
      if (!firstReceiveAt) firstReceiveAt = Date.now() - startedAt;
      lastReceiveAt = Date.now() - startedAt;

      const isU8 = u8 instanceof Uint8Array;
      const byteLen = u8?.byteLength ?? -1;
      const expected = FRAME_BYTES;

      if (data.frameIndex < 3 || data.frameIndex % 30 === 0) {
        log(
          `[main] frame ${data.frameIndex} | isUint8Array=${isU8} byteLen=${byteLen} ok=${byteLen === expected}`
        );
      }
      try {
        mainPort.postMessage({ type: 'ack', frameIndex: data.frameIndex });
      } catch (err) {
        log('[main] postMessage ack failed:', err);
      }
    } else if (data.type === 'done') {
      log(`[main] DONE signal received. total received = ${receivedAtMain}`);
      // 报告
      const missing = [];
      for (const idx of expectedFrameIndices) {
        if (!receivedFrameIndices.has(idx)) missing.push(idx);
      }
      const elapsed = lastReceiveAt - firstReceiveAt;
      log(`[main] received ${receivedAtMain}/${NUM_FRAMES} frames`);
      log(`[main] first frame at ${firstReceiveAt}ms, last at ${lastReceiveAt}ms (span ${elapsed}ms)`);
      if (missing.length > 0) {
        log(`[main] MISSING ${missing.length} frame indices: ${missing.slice(0, 10).join(',')}...`);
      } else {
        log(`[main] all frame indices arrived ✓`);
      }
      setTimeout(() => app.quit(), 200);
    }
  });
  mainPort.start();

  // 把 port2 转交给 renderer
  for (let i = 0; i < NUM_FRAMES; i++) expectedFrameIndices.add(i);
  event.sender.postMessage('diag:port', null, [channel.port2]);
  return { ok: true };
});

ipcMain.handle('diag:report-renderer', (_e, payload) => {
  log(`[renderer report] ${JSON.stringify(payload)}`);
});

app.whenReady().then(() => {
  win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer.html'));

  // safety net：60 秒还没结束就自杀
  setTimeout(() => {
    log('[main] WATCHDOG TIMEOUT (60s) — quitting');
    log(`[main] received ${receivedAtMain}/${NUM_FRAMES} frames before timeout`);
    app.quit();
  }, 60_000);
});

app.on('window-all-closed', () => app.quit());
