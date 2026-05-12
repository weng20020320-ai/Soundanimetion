/**
 * 平台能力开关。
 *
 * 同一份渲染器代码同时用于：
 *  - Electron 桌面版（完整功能，包括离线视频导出）
 *  - Web demo（精简版，浏览器里跑预览，不能导出视频）
 *
 * 区分方式：Vite 构建时用 `define` 把 `VITE_PLATFORM` 注入；
 *   - electron-vite.config.ts → 默认 'electron'
 *   - web/vite.config.ts      → 写死 'web'
 *
 * 渲染层用 `capabilities` 决定是否显示导出按钮、是否要走文件对话框。
 */

const RAW_PLATFORM =
  (import.meta.env.VITE_PLATFORM as string | undefined) ?? 'electron';

export const PLATFORM: 'electron' | 'web' =
  RAW_PLATFORM === 'web' ? 'web' : 'electron';

export const isElectron = PLATFORM === 'electron';
export const isWeb = PLATFORM === 'web';

/**
 * 各功能在当前平台是否可用。
 *
 * 渲染层永远只判断 capabilities，**不要**直接判断 `isElectron` —— 这样将来加
 * Tauri / Native macOS 等第三种宿主时只需要扩 capabilities，不用满代码改。
 */
export const capabilities = {
  /** 能否打开原生文件对话框（电脑端能，浏览器要走 input[type=file]） */
  fileDialog: isElectron,
  /** 能否离线渲染视频导出（依赖 ffmpeg native binary） */
  videoExport: isElectron,
  /** 能否在资源管理器里"显示位置" */
  showInFolder: isElectron,
  /** 能否探测硬件视频编码器（NVENC / QSV / AMF） */
  hardwareEncoderProbe: isElectron,
  /** 能否拿到拖入文件的磁盘绝对路径（webUtils.getPathForFile） */
  droppedFilePath: isElectron,
  /** 是否需要在 UI 里显示"这是 Web 试玩版"的横幅 */
  showWebDemoNotice: isWeb,
} as const;

/** Web demo 的桌面版下载链接（用于横幅 + 导出按钮 fallback）。 */
export const DESKTOP_DOWNLOAD_URL =
  'https://github.com/weng20020320-ai/Soundanimetion/releases/latest';
