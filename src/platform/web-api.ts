/**
 * 浏览器版的 window.api polyfill。
 *
 * 设计目标：让 src/App.tsx 等渲染层代码**完全不用判平台**，所有 `window.api.foo()`
 * 调用在浏览器里都能跑（要么真的做事，要么 graceful no-op）。
 *
 * 用法：在 web 入口（web/main.tsx 或类似）里 `import { attachWebApi } from './platform/web-api';`
 * 然后在挂载 React 之前调用 `attachWebApi()`。
 */

import type { AppApi } from '../../electron/preload';

type OpenResult = Awaited<ReturnType<AppApi['openAudio']>>;

const VIDEO_EXTS = /\.(mp4|m4v|mov|webm|mkv|avi)$/i;
const AUDIO_EXTS = /\.(mp3|wav|flac|ogg|m4a|aac|opus|webm)$/i;

function detectKind(name: string): 'audio' | 'video' {
  if (VIDEO_EXTS.test(name)) return 'video';
  return 'audio';
}

/** 触发一个隐藏的 <input type="file">，返回用户选择的文件读到的 ArrayBuffer。 */
async function pickFile(): Promise<OpenResult> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = [
      '.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.opus',
      '.mp4', '.m4v', '.mov', '.webm', '.mkv', '.avi',
      'audio/*', 'video/*',
    ].join(',');
    input.style.display = 'none';

    const cleanup = () => {
      if (input.parentNode) input.parentNode.removeChild(input);
    };

    let resolved = false;
    input.addEventListener('change', async () => {
      if (resolved) return;
      const file = input.files?.[0];
      if (!file) {
        resolved = true;
        cleanup();
        resolve(null);
        return;
      }
      try {
        const data = await file.arrayBuffer();
        resolved = true;
        cleanup();
        resolve({
          filePath: '',
          fileName: file.name,
          data,
          kind: detectKind(file.name),
        });
      } catch (e) {
        resolved = true;
        cleanup();
        console.error('[web-api] 读取文件失败：', e);
        resolve(null);
      }
    });

    // 兜底：用户在文件对话框里点取消时，浏览器不会触发任何事件，
    // 但 window focus 回来时就知道结束了。
    const onFocus = () => {
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          window.removeEventListener('focus', onFocus);
          resolve(null);
        }
      }, 300);
    };
    window.addEventListener('focus', onFocus, { once: true });

    document.body.appendChild(input);
    input.click();
  });
}

/** 浏览器版的"保存快照 PNG"：触发浏览器下载，不弹原生对话框。 */
async function downloadBlob(name: string, data: Uint8Array): Promise<string> {
  // TS 5.7+ 的 Uint8Array<ArrayBufferLike> 不直接匹配 BlobPart，
  // 复制到一个新的 ArrayBuffer（不共享 SharedArrayBuffer）再传。
  const fresh = new ArrayBuffer(data.byteLength);
  new Uint8Array(fresh).set(data);
  const blob = new Blob([fresh], { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
  // 浏览器没法回报真实保存路径，用文件名当返回值，App.tsx 那边会做合理处理。
  return name;
}

/** Web 上没有 ffmpeg / 没有原生对话框的方法统一抛这个错。 */
function unsupported(name: string): never {
  throw new Error(
    `[web-api] "${name}" 在 Web 试玩版里不可用。请下载桌面版获得完整功能。`
  );
}

/** 把 Electron 的 AppApi 接口在浏览器里实现一份（能做的真做，做不了的优雅降级）。 */
export function createWebApi(): AppApi {
  // AppApi 里 onFfmpegLog 的 unsub 返回类型是 () => IpcRenderer（Electron 类型），
  // Web 上拿不到 IpcRenderer，所以这里返回 noop 并对外整体 as AppApi 强转。
  const noopUnsub = () => {
    /* nothing to unsubscribe */
  };

  const api = {
    debugLog: () => {
      /* no-op in web */
    },

    openAudio: () => pickFile(),

    saveExportPath: async () => {
      console.warn('[web-api] saveExportPath：Web 版不支持视频导出');
      return null;
    },

    loadFromPath: async () => {
      throw new Error('[web-api] loadFromPath：Web 版没有磁盘路径概念');
    },

    getDroppedFilePath: () => {
      throw new Error('[web-api] getDroppedFilePath：Web 版不支持');
    },

    saveSnapshot: ({
      defaultName,
      data,
    }: {
      defaultName: string;
      data: Uint8Array;
    }) => downloadBlob(defaultName, data),

    setLocale: () => {
      /* 浏览器没有原生对话框文案要同步 */
    },

    getHardwareEncoders: async () => ({
      nvenc: false,
      amf: false,
      qsv: false,
      available: [],
    }),

    ffmpegStart: () => unsupported('ffmpegStart'),
    ffmpegWriteFrame: () => unsupported('ffmpegWriteFrame'),
    onFfmpegFrameWritten: () => noopUnsub,
    onFfmpegSessionError: () => noopUnsub,
    ffmpegFinish: () => unsupported('ffmpegFinish'),
    ffmpegCancel: async () => {
      /* graceful no-op */
    },
    onFfmpegLog: () => noopUnsub,

    showItemInFolder: async () => {
      /* graceful no-op：浏览器没法"打开资源管理器"，调用方应已通过 capabilities 跳过这里 */
    },

    getVersion: async () => {
      // Vite 在构建时把 package.json 的 version 注入到 __APP_VERSION__；
      // 没注入就走 'web' fallback。
      const injected = (
        globalThis as unknown as { __APP_VERSION__?: string }
      ).__APP_VERSION__;
      return injected ?? 'web';
    },
  };

  return api as unknown as AppApi;
}

/** 把 createWebApi() 的结果挂到 window.api，并设置一个标志位防止重复挂载。 */
export function attachWebApi(): void {
  const w = window as unknown as {
    api?: AppApi;
    __WEB_API_ATTACHED__?: boolean;
  };
  if (w.__WEB_API_ATTACHED__) return;
  w.api = createWebApi();
  w.__WEB_API_ATTACHED__ = true;
}
