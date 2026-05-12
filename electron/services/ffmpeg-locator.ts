import { app } from 'electron';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let cachedPath: string | null | undefined;

export function resolveFFmpegPath(): string | null {
  if (cachedPath !== undefined) return cachedPath;

  try {
    const raw = require('ffmpeg-static') as string | null;
    if (!raw) {
      cachedPath = null;
      return cachedPath;
    }

    let resolved = raw;
    if (app.isPackaged) {
      resolved = raw.replace('app.asar', 'app.asar.unpacked');
    }

    if (existsSync(resolved)) {
      cachedPath = resolved;
      return cachedPath;
    }

    if (existsSync(raw)) {
      cachedPath = raw;
      return cachedPath;
    }
  } catch (e) {
    console.error('[ffmpeg-locator] failed to resolve ffmpeg-static', e);
  }

  const sysFfmpeg = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  cachedPath = sysFfmpeg;
  return cachedPath;
}
