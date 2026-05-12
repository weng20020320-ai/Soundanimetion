import { app, ipcMain, shell } from 'electron';
import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  openAudioDialog,
  saveExportDialog,
  loadMediaFromPath,
  saveSnapshotDialog,
} from './file-service.js';
import {
  ffmpegStart,
  ffmpegFinish,
  ffmpegCancel,
  getHardwareEncoders,
} from './ffmpeg-service.js';
import { setMainLocale } from './i18n-main.js';

// #region agent log debug bridge
const DEBUG_LOG_PATH = join(process.cwd(), '.cursor', 'debug-5269e2.log');
function appendDebugLog(line: string): void {
  try {
    const dir = dirname(DEBUG_LOG_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(DEBUG_LOG_PATH, line + '\n', 'utf8');
  } catch {
    /* ignore */
  }
}
// #endregion

export function registerIpcHandlers(): void {
  ipcMain.handle('dialog:openAudio', async () => openAudioDialog());

  ipcMain.handle('dialog:saveExport', async (_e, opts) =>
    saveExportDialog(opts)
  );

  ipcMain.handle('file:loadFromPath', async (_e, path: string) =>
    loadMediaFromPath(path)
  );

  ipcMain.handle(
    'dialog:saveSnapshot',
    async (
      _e,
      opts: { defaultName: string; data: Uint8Array }
    ): Promise<string | null> => saveSnapshotDialog(opts)
  );

  ipcMain.on('i18n:setLocale', (_e, locale: string) => {
    setMainLocale(locale);
  });

  ipcMain.handle('app:getHardwareEncoders', async () => getHardwareEncoders());

  ipcMain.handle('ffmpeg:start', async (e, opts) =>
    ffmpegStart(e.sender, opts)
  );

  ipcMain.handle('ffmpeg:finish', async (_e, sessionId) =>
    ffmpegFinish(sessionId)
  );

  ipcMain.handle('ffmpeg:cancel', async (_e, sessionId) =>
    ffmpegCancel(sessionId)
  );

  ipcMain.handle('shell:showItemInFolder', async (_e, path: string) => {
    shell.showItemInFolder(path);
  });

  ipcMain.handle('app:getVersion', async () => app.getVersion());

  // #region agent log debug bridge
  ipcMain.on('debug:log', (_e, line: string) => {
    if (typeof line === 'string') appendDebugLog(line);
  });
  // #endregion
}
