import { contextBridge, ipcRenderer, webUtils } from 'electron';

export type ExportFormat = 'mp4' | 'prores4444' | 'pngseq';

export type MediaKind = 'audio' | 'video';

export type LocaleId = 'zh-CN' | 'ja-JP' | 'en-US';

export type ExportQuality = 'draft' | 'standard' | 'high' | 'best';

export type VideoEncoder =
  | 'libx264'
  | 'h264_nvenc'
  | 'h264_amf'
  | 'h264_qsv'
  | 'hevc_nvenc'
  | 'hevc_amf'
  | 'hevc_qsv';

export interface HardwareEncodersInfo {
  nvenc: boolean;
  amf: boolean;
  qsv: boolean;
  available: VideoEncoder[];
}

export interface FFmpegStartOptions {
  format: ExportFormat;
  width: number;
  height: number;
  fps: number;
  outputPath: string;
  audioPath: string | null;
  /** 从音频起始秒；用于剪辑导出 */
  audioStartSec?: number;
  /** 音频持续秒数；用于剪辑导出 */
  audioDurationSec?: number;
  totalFrames: number;
  /** 是否在 ffmpeg 端做垂直翻转（替代 CPU flipY） */
  flipY?: boolean;
  /** 视频编码质量档位（仅对 mp4 生效） */
  quality?: ExportQuality;
  /** 视频编码器（仅对 mp4 生效）；默认 libx264。硬件编码器可显著提速。 */
  encoder?: VideoEncoder;
}

export interface FFmpegStartResult {
  sessionId: string;
}

export interface OpenAudioResult {
  filePath: string;
  fileName: string;
  data: ArrayBuffer;
  /** 根据扩展名识别的媒体类型（视频文件用 HTMLVideoElement 播放）。 */
  kind: MediaKind;
}

export interface SaveDialogOptions {
  defaultName: string;
  format: ExportFormat;
}

export interface SaveSnapshotOptions {
  defaultName: string;
  data: Uint8Array;
}

const sessionPorts = new Map<string, MessagePort>();
const ackHandlers = new Map<string, (frameIndex: number) => void>();
const errorHandlers = new Map<string, (msg: string) => void>();

ipcRenderer.on('ffmpeg:port', (event, payload: { sessionId: string }) => {
  const port = event.ports[0];
  if (!port) return;
  port.onmessage = (e) => {
    const data = e.data as
      | { type: 'ack'; frameIndex: number }
      | { type: 'error'; message: string };
    if (data.type === 'ack') {
      const handler = ackHandlers.get(payload.sessionId);
      if (handler) handler(data.frameIndex);
    } else if (data.type === 'error') {
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
  debugLog: (payload: unknown): void => {
    try {
      ipcRenderer.send('debug:log', JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  },
  // #endregion

  openAudio: (): Promise<OpenAudioResult | null> =>
    ipcRenderer.invoke('dialog:openAudio'),

  saveExportPath: (opts: SaveDialogOptions): Promise<string | null> =>
    ipcRenderer.invoke('dialog:saveExport', opts),

  /**
   * 拖拽 / 命令行打开等场景：把已知路径直接读为 ArrayBuffer。
   * 路径需先通过 `getDroppedFilePath(file)` 拿到（Electron 32+ 后 file.path 已被移除）。
   */
  loadFromPath: (path: string): Promise<OpenAudioResult> =>
    ipcRenderer.invoke('file:loadFromPath', path),

  /** 用 webUtils 拿到拖入的 File 在磁盘上的绝对路径（仅 Electron 主进程能用）。 */
  getDroppedFilePath: (file: File): string => webUtils.getPathForFile(file),

  /**
   * 弹"另存为 PNG"对话框并把字节写入磁盘。返回真正写入的路径，取消则返回 null。
   * 渲染端务必传 Uint8Array 而不是 Blob——后者跨进程序列化不稳定。
   */
  saveSnapshot: (opts: SaveSnapshotOptions): Promise<string | null> =>
    ipcRenderer.invoke('dialog:saveSnapshot', opts),

  /** 把渲染端当前语言通知主进程，原生对话框据此切换文案。 */
  setLocale: (locale: LocaleId): void => {
    ipcRenderer.send('i18n:setLocale', locale);
  },

  getHardwareEncoders: (): Promise<HardwareEncodersInfo> =>
    ipcRenderer.invoke('app:getHardwareEncoders'),

  ffmpegStart: (opts: FFmpegStartOptions): Promise<FFmpegStartResult> =>
    ipcRenderer.invoke('ffmpeg:start', opts),

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
  ffmpegWriteFrame: (
    sessionId: string,
    frameIndex: number,
    pixels: Uint8Array
  ): void => {
    const port = sessionPorts.get(sessionId);
    if (!port) throw new Error(`未找到 session port: ${sessionId}`);
    port.postMessage({ frameIndex, pixels });
  },

  onFfmpegFrameWritten: (
    sessionId: string,
    cb: (frameIndex: number) => void
  ): (() => void) => {
    ackHandlers.set(sessionId, cb);
    return () => {
      if (ackHandlers.get(sessionId) === cb) ackHandlers.delete(sessionId);
    };
  },

  onFfmpegSessionError: (
    sessionId: string,
    cb: (message: string) => void
  ): (() => void) => {
    errorHandlers.set(sessionId, cb);
    return () => {
      if (errorHandlers.get(sessionId) === cb) errorHandlers.delete(sessionId);
    };
  },

  ffmpegFinish: (sessionId: string): Promise<{ outputPath: string }> => {
    const port = sessionPorts.get(sessionId);
    if (port) {
      try {
        port.close();
      } catch {
        /* ignore */
      }
      sessionPorts.delete(sessionId);
    }
    return ipcRenderer.invoke('ffmpeg:finish', sessionId);
  },

  ffmpegCancel: (sessionId: string): Promise<void> => {
    const port = sessionPorts.get(sessionId);
    if (port) {
      try {
        port.close();
      } catch {
        /* ignore */
      }
      sessionPorts.delete(sessionId);
    }
    ackHandlers.delete(sessionId);
    errorHandlers.delete(sessionId);
    return ipcRenderer.invoke('ffmpeg:cancel', sessionId);
  },

  onFfmpegLog: (cb: (sessionId: string, line: string) => void) => {
    const listener = (_e: unknown, sessionId: string, line: string) =>
      cb(sessionId, line);
    ipcRenderer.on('ffmpeg:log', listener);
    return () => ipcRenderer.removeListener('ffmpeg:log', listener);
  },

  showItemInFolder: (path: string): Promise<void> =>
    ipcRenderer.invoke('shell:showItemInFolder', path),

  getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
};

contextBridge.exposeInMainWorld('api', api);

export type AppApi = typeof api;
