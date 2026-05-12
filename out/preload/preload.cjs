"use strict";
const electron = require("electron");
const sessionPorts = /* @__PURE__ */ new Map();
const ackHandlers = /* @__PURE__ */ new Map();
const errorHandlers = /* @__PURE__ */ new Map();
electron.ipcRenderer.on("ffmpeg:port", (event, payload) => {
  const port = event.ports[0];
  if (!port) return;
  port.onmessage = (e) => {
    const data = e.data;
    if (data.type === "ack") {
      const handler = ackHandlers.get(payload.sessionId);
      if (handler) handler(data.frameIndex);
    } else if (data.type === "error") {
      const handler = errorHandlers.get(payload.sessionId);
      if (handler) handler(data.message);
    }
  };
  port.start();
  sessionPorts.set(payload.sessionId, port);
});
const api = {
  // #region agent log debug bridge
  /** Debug only：把任意 JSON-able payload 序列化后由主进程写到 .cursor/debug-5269e2.log */
  debugLog: (payload) => {
    try {
      electron.ipcRenderer.send("debug:log", JSON.stringify(payload));
    } catch {
    }
  },
  // #endregion
  openAudio: () => electron.ipcRenderer.invoke("dialog:openAudio"),
  saveExportPath: (opts) => electron.ipcRenderer.invoke("dialog:saveExport", opts),
  /**
   * 拖拽 / 命令行打开等场景：把已知路径直接读为 ArrayBuffer。
   * 路径需先通过 `getDroppedFilePath(file)` 拿到（Electron 32+ 后 file.path 已被移除）。
   */
  loadFromPath: (path) => electron.ipcRenderer.invoke("file:loadFromPath", path),
  /** 用 webUtils 拿到拖入的 File 在磁盘上的绝对路径（仅 Electron 主进程能用）。 */
  getDroppedFilePath: (file) => electron.webUtils.getPathForFile(file),
  /**
   * 弹"另存为 PNG"对话框并把字节写入磁盘。返回真正写入的路径，取消则返回 null。
   * 渲染端务必传 Uint8Array 而不是 Blob——后者跨进程序列化不稳定。
   */
  saveSnapshot: (opts) => electron.ipcRenderer.invoke("dialog:saveSnapshot", opts),
  /** 把渲染端当前语言通知主进程，原生对话框据此切换文案。 */
  setLocale: (locale) => {
    electron.ipcRenderer.send("i18n:setLocale", locale);
  },
  getHardwareEncoders: () => electron.ipcRenderer.invoke("app:getHardwareEncoders"),
  ffmpegStart: (opts) => electron.ipcRenderer.invoke("ffmpeg:start", opts),
  /**
   * 异步路径：经 MessagePort 把帧像素送到主进程。
   *
   * 历史教训：Electron 42 / Chromium 的 MessagePortMain 在跨进程传输时，
   * 一旦 transferList 含 ArrayBuffer，整个 event.data 会变成 null（payload 全丢）。
   * 详见 scripts/diagnose-ipc/ 下的诊断结果，5 个变体里只有变体 A
   * （= 旧的 transferList 写法）会丢包，B/C/D/E 都正常。
   *
   * 修法（变体 D）：直接传 Uint8Array，不解构 .buffer，不放 transferList。
   * Chromium 会做一次 cross-process structured clone（~8MB / 帧 / 1080p），
   * 比"零拷贝失败"好太多。性能影响 < 1% CPU。
   *
   * 不再 detach，调用方可以重用 pixels 这块内存（用 buffer pool 进一步省 GC）。
   */
  ffmpegWriteFrame: (sessionId, frameIndex, pixels) => {
    const port = sessionPorts.get(sessionId);
    if (!port) throw new Error(`未找到 session port: ${sessionId}`);
    port.postMessage({ frameIndex, pixels });
  },
  onFfmpegFrameWritten: (sessionId, cb) => {
    ackHandlers.set(sessionId, cb);
    return () => {
      if (ackHandlers.get(sessionId) === cb) ackHandlers.delete(sessionId);
    };
  },
  onFfmpegSessionError: (sessionId, cb) => {
    errorHandlers.set(sessionId, cb);
    return () => {
      if (errorHandlers.get(sessionId) === cb) errorHandlers.delete(sessionId);
    };
  },
  ffmpegFinish: (sessionId) => {
    const port = sessionPorts.get(sessionId);
    if (port) {
      try {
        port.close();
      } catch {
      }
      sessionPorts.delete(sessionId);
    }
    return electron.ipcRenderer.invoke("ffmpeg:finish", sessionId);
  },
  ffmpegCancel: (sessionId) => {
    const port = sessionPorts.get(sessionId);
    if (port) {
      try {
        port.close();
      } catch {
      }
      sessionPorts.delete(sessionId);
    }
    ackHandlers.delete(sessionId);
    errorHandlers.delete(sessionId);
    return electron.ipcRenderer.invoke("ffmpeg:cancel", sessionId);
  },
  onFfmpegLog: (cb) => {
    const listener = (_e, sessionId, line) => cb(sessionId, line);
    electron.ipcRenderer.on("ffmpeg:log", listener);
    return () => electron.ipcRenderer.removeListener("ffmpeg:log", listener);
  },
  showItemInFolder: (path) => electron.ipcRenderer.invoke("shell:showItemInFolder", path),
  getVersion: () => electron.ipcRenderer.invoke("app:getVersion")
};
electron.contextBridge.exposeInMainWorld("api", api);
