import { app, dialog } from 'electron';
import { promises as fs } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type { ExportFormat } from '../preload.js';
import { getDialogStrings } from './i18n-main.js';

const AUDIO_EXTENSIONS = [
  'mp3',
  'wav',
  'flac',
  'ogg',
  'm4a',
  'aac',
  'opus',
];
const VIDEO_EXTENSIONS = [
  'mp4',
  'm4v',
  'mov',
  'webm',
  'mkv',
  'avi',
];
/** 注意：webm 既可能是音频也可能是视频容器。让 renderer 端按 MIME / 解码情况判断。 */
const MEDIA_EXTENSIONS = [
  ...AUDIO_EXTENSIONS,
  ...VIDEO_EXTENSIONS,
  'webm',
];

export type MediaKind = 'audio' | 'video';

export interface OpenMediaResult {
  filePath: string;
  fileName: string;
  data: ArrayBuffer;
  /** 根据扩展名粗判，渲染端会用真正的解码结果再确认。 */
  kind: MediaKind;
}

function detectKind(filePath: string): MediaKind {
  const ext = extname(filePath).slice(1).toLowerCase();
  return VIDEO_EXTENSIONS.includes(ext) ? 'video' : 'audio';
}

async function readFileToBuffer(filePath: string): Promise<ArrayBuffer> {
  const buf = await fs.readFile(filePath);
  return buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength
  ) as ArrayBuffer;
}

export async function openAudioDialog(): Promise<OpenMediaResult | null> {
  const s = getDialogStrings();
  const result = await dialog.showOpenDialog({
    title: s.openTitle,
    filters: [
      { name: s.mediaFilter, extensions: MEDIA_EXTENSIONS },
      { name: s.audioFilter, extensions: AUDIO_EXTENSIONS },
      { name: s.videoFilter, extensions: VIDEO_EXTENSIONS },
      { name: s.allFilesFilter, extensions: ['*'] },
    ],
    properties: ['openFile'],
  });

  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const data = await readFileToBuffer(filePath);
  return {
    filePath,
    fileName: basename(filePath),
    data,
    kind: detectKind(filePath),
  };
}

/**
 * 拖拽 / 最近文件等场景：已知绝对路径，直接读取并返回与对话框相同的结构。
 *
 * 注意：路径来自 renderer（webUtils.getPathForFile），主进程 fs 读取时也只在
 * 用户显式拖入的文件上做，不会扫描整个目录，所以无须额外白名单。
 */
export async function loadMediaFromPath(
  filePath: string
): Promise<OpenMediaResult> {
  // 简单防护：只接受常见媒体扩展名，避免误读未知二进制。
  const ext = extname(filePath).slice(1).toLowerCase();
  if (!MEDIA_EXTENSIONS.includes(ext)) {
    throw new Error(`unsupported extension: .${ext}`);
  }
  const data = await readFileToBuffer(filePath);
  return {
    filePath,
    fileName: basename(filePath),
    data,
    kind: detectKind(filePath),
  };
}

export async function saveExportDialog(opts: {
  defaultName: string;
  format: ExportFormat;
}): Promise<string | null> {
  const s = getDialogStrings();
  const filters = (() => {
    switch (opts.format) {
      case 'mp4':
        return [{ name: s.mp4FilterName, extensions: ['mp4'] }];
      case 'prores4444':
        return [{ name: s.proResFilterName, extensions: ['mov'] }];
      case 'pngseq':
        return [{ name: s.pngSeqFilterName, extensions: [] }];
    }
  })();

  if (opts.format === 'pngseq') {
    const r = await dialog.showOpenDialog({
      title: s.pngSeqDirTitle,
      properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
      defaultPath: join(app.getPath('videos'), opts.defaultName),
    });
    if (r.canceled || r.filePaths.length === 0) return null;
    return r.filePaths[0];
  }

  const r = await dialog.showSaveDialog({
    title: s.saveExportTitle,
    defaultPath: join(app.getPath('videos'), opts.defaultName),
    filters,
  });
  if (r.canceled || !r.filePath) return null;
  return r.filePath;
}

/**
 * 弹保存对话框 + 把 PNG 字节写到磁盘。
 *
 * 用 Uint8Array 而不是 Blob 是因为 IPC 跨进程序列化 Blob 在 Electron 里不靠谱，
 * 渲染端 canvas.toBlob → arrayBuffer() → Uint8Array 即可。
 */
export async function saveSnapshotDialog(opts: {
  defaultName: string;
  data: Uint8Array;
}): Promise<string | null> {
  const s = getDialogStrings();
  const r = await dialog.showSaveDialog({
    title: s.snapshotTitle,
    defaultPath: join(app.getPath('pictures'), opts.defaultName),
    filters: [{ name: s.snapshotFilterName, extensions: ['png'] }],
  });
  if (r.canceled || !r.filePath) return null;
  await fs.writeFile(r.filePath, opts.data);
  return r.filePath;
}
