/**
 * 主进程 i18n：仅覆盖原生对话框需要的少量字符串。
 *
 * 不复用渲染端的 Dictionary（避免主进程引入 React/zustand 等依赖），
 * 这里只维护和 `Dictionary['fileDialog']` 一致的子集。
 *
 * 渲染端通过 `window.api.setLocale(l)` 同步当前语言；
 * 默认 zh-CN，未匹配的语言会回退到 zh-CN。
 */

export type Locale = 'zh-CN' | 'ja-JP' | 'en-US';

export interface FileDialogStrings {
  openTitle: string;
  audioFilter: string;
  videoFilter: string;
  mediaFilter: string;
  allFilesFilter: string;
  saveExportTitle: string;
  pngSeqDirTitle: string;
  pngSeqFilterName: string;
  mp4FilterName: string;
  proResFilterName: string;
  snapshotTitle: string;
  snapshotFilterName: string;
}

const TABLE: Record<Locale, FileDialogStrings> = {
  'zh-CN': {
    openTitle: '选择音频或视频文件',
    audioFilter: '音频',
    videoFilter: '视频',
    mediaFilter: '音频 / 视频',
    allFilesFilter: '所有文件',
    saveExportTitle: '导出到...',
    pngSeqDirTitle: '选择 PNG 序列输出文件夹',
    pngSeqFilterName: 'PNG 序列文件夹（输入文件夹名）',
    mp4FilterName: 'MP4 视频',
    proResFilterName: 'QuickTime ProRes 4444',
    snapshotTitle: '保存快照',
    snapshotFilterName: 'PNG 图像',
  },
  'ja-JP': {
    openTitle: '音声・動画ファイルを選択',
    audioFilter: '音声',
    videoFilter: '動画',
    mediaFilter: '音声 / 動画',
    allFilesFilter: 'すべてのファイル',
    saveExportTitle: '保存先...',
    pngSeqDirTitle: 'PNG 連番の出力フォルダを選択',
    pngSeqFilterName: 'PNG 連番フォルダ（フォルダ名を入力）',
    mp4FilterName: 'MP4 動画',
    proResFilterName: 'QuickTime ProRes 4444',
    snapshotTitle: 'スナップショットを保存',
    snapshotFilterName: 'PNG 画像',
  },
  'en-US': {
    openTitle: 'Choose an audio or video file',
    audioFilter: 'Audio',
    videoFilter: 'Video',
    mediaFilter: 'Audio / Video',
    allFilesFilter: 'All files',
    saveExportTitle: 'Export to...',
    pngSeqDirTitle: 'Choose PNG sequence output folder',
    pngSeqFilterName: 'PNG sequence folder (enter folder name)',
    mp4FilterName: 'MP4 video',
    proResFilterName: 'QuickTime ProRes 4444',
    snapshotTitle: 'Save snapshot',
    snapshotFilterName: 'PNG image',
  },
};

let currentLocale: Locale = 'zh-CN';

export function setMainLocale(l: string): void {
  if (l === 'zh-CN' || l === 'ja-JP' || l === 'en-US') {
    currentLocale = l;
  }
}

export function getDialogStrings(): FileDialogStrings {
  return TABLE[currentLocale];
}
