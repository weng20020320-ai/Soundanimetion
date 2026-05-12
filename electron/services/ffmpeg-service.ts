import {
  spawn,
  spawnSync,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  createWriteStream,
  type WriteStream,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  app,
  MessageChannelMain,
  type MessagePortMain,
  type WebContents,
} from 'electron';
import type {
  FFmpegStartOptions,
  HardwareEncodersInfo,
  VideoEncoder,
} from '../preload.js';
import { resolveFFmpegPath } from './ffmpeg-locator.js';
import { buildFFmpegArgs } from './ffmpeg-args.js';

/** 缓存最近 N 行 stderr，给 early-exit 错误信息用 */
const RECENT_STDERR_KEEP = 40;

interface Session {
  id: string;
  format: FFmpegStartOptions['format'];
  width: number;
  height: number;
  fps: number;
  outputPath: string;
  totalFrames: number;
  framesWritten: number;
  proc: ChildProcessWithoutNullStreams;
  finishPromise: Promise<void>;
  resolveFinish: () => void;
  rejectFinish: (err: Error) => void;
  cancelled: boolean;
  port: MessagePortMain | null;
  pendingDrain: Array<() => void>;
  /** 进程是否已 exit，用来防多次 reject + 在 attachPort 里早退检测 */
  procExited: boolean;
  /** 滚动 stderr 缓冲，便于在 early-exit 时把诊断信息塞回 renderer */
  recentStderr: string[];
  /** 落盘日志文件流（可空：getPath 失败时） */
  logStream: WriteStream | null;
  /** 日志文件绝对路径（给 renderer 显示"日志在哪") */
  logPath: string | null;
  /** ffmpeg 进程开始时间，用来算耗时 */
  startedAt: number;
}

/** 给当前 session 开一个日志文件，失败时返回 null（不阻断导出） */
function openSessionLog(sessionId: string, args: string[]): {
  stream: WriteStream | null;
  path: string | null;
} {
  try {
    const userData = app.getPath('userData');
    const dir = join(userData, 'exports');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const file = join(dir, `${ts}_${sessionId.slice(0, 8)}.log`);
    const stream = createWriteStream(file, { encoding: 'utf8' });
    stream.write(`=== ffmpeg session ${sessionId} ===\n`);
    stream.write(`time: ${new Date().toISOString()}\n`);
    stream.write(`args: ${args.join(' ')}\n`);
    stream.write(`---\n`);
    return { stream, path: file };
  } catch (e) {
    console.warn('[ffmpeg] 打开日志文件失败：', e);
    return { stream: null, path: null };
  }
}

function pushStderr(session: Session, line: string): void {
  session.recentStderr.push(line);
  if (session.recentStderr.length > RECENT_STDERR_KEEP) {
    session.recentStderr.shift();
  }
  if (session.logStream) {
    try {
      session.logStream.write(line + '\n');
    } catch {
      /* ignore */
    }
  }
}

function closeLog(session: Session, footer: string): void {
  if (!session.logStream) return;
  try {
    session.logStream.write(`---\n${footer}\n`);
    session.logStream.end();
  } catch {
    /* ignore */
  }
  session.logStream = null;
}

const sessions = new Map<string, Session>();

let cachedHwEncoders: HardwareEncodersInfo | null = null;

export function getHardwareEncoders(): HardwareEncodersInfo {
  if (cachedHwEncoders) return cachedHwEncoders;

  const ffmpegPath = resolveFFmpegPath();
  if (!ffmpegPath) {
    cachedHwEncoders = { nvenc: false, amf: false, qsv: false, available: [] };
    return cachedHwEncoders;
  }

  let encodersText = '';
  try {
    const result = spawnSync(ffmpegPath, ['-hide_banner', '-encoders'], {
      encoding: 'utf8',
      timeout: 8000,
    });
    encodersText = (result.stdout || '') + (result.stderr || '');
  } catch (e) {
    console.warn('[ffmpeg] 探测硬件编码器失败：', e);
  }

  const has = (name: string) => encodersText.includes(name);
  const available: VideoEncoder[] = [];
  if (has('h264_nvenc')) available.push('h264_nvenc');
  if (has('hevc_nvenc')) available.push('hevc_nvenc');
  if (has('h264_amf')) available.push('h264_amf');
  if (has('hevc_amf')) available.push('hevc_amf');
  if (has('h264_qsv')) available.push('h264_qsv');
  if (has('hevc_qsv')) available.push('hevc_qsv');

  cachedHwEncoders = {
    nvenc: available.some((e) => e.endsWith('nvenc')),
    amf: available.some((e) => e.endsWith('amf')),
    qsv: available.some((e) => e.endsWith('qsv')),
    available,
  };
  return cachedHwEncoders;
}

export async function ffmpegStart(
  sender: WebContents,
  opts: FFmpegStartOptions
): Promise<{ sessionId: string }> {
  const ffmpegPath = resolveFFmpegPath();
  if (!ffmpegPath) throw new Error('未找到 ffmpeg 可执行文件');

  if (opts.format === 'pngseq' && !existsSync(opts.outputPath)) {
    mkdirSync(opts.outputPath, { recursive: true });
  } else if (opts.format !== 'pngseq') {
    const dir = dirname(opts.outputPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  const args = buildFFmpegArgs(opts);
  let proc: ChildProcessWithoutNullStreams;
  try {
    proc = spawn(ffmpegPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } catch (e) {
    // spawn 同步异常（少见，比如路径上有非法字符）→ 直接 reject ffmpegStart
    throw new Error(`ffmpeg 进程启动失败：${(e as Error).message}`);
  }

  const id = randomUUID();
  let resolveFinish!: () => void;
  let rejectFinish!: (err: Error) => void;
  const finishPromise = new Promise<void>((resolve, reject) => {
    resolveFinish = resolve;
    rejectFinish = reject;
  });

  const { stream: logStream, path: logPath } = openSessionLog(id, [
    ffmpegPath,
    ...args,
  ]);

  const session: Session = {
    id,
    format: opts.format,
    width: opts.width,
    height: opts.height,
    fps: opts.fps,
    outputPath: opts.outputPath,
    totalFrames: opts.totalFrames,
    framesWritten: 0,
    proc,
    finishPromise,
    resolveFinish,
    rejectFinish,
    cancelled: false,
    port: null,
    pendingDrain: [],
    procExited: false,
    recentStderr: [],
    logStream,
    logPath,
    startedAt: Date.now(),
  };

  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data', (chunk: string) => {
    const lines = chunk.split(/\r?\n/);
    for (const line of lines) {
      if (line.trim().length === 0) continue;
      pushStderr(session, line);
      if (!sender.isDestroyed()) sender.send('ffmpeg:log', id, line);
    }
  });

  proc.stdin.on('error', (err) => {
    if (!session.cancelled) {
      console.error('[ffmpeg] stdin error', err);
      pushStderr(session, `[stdin error] ${err.message}`);
      if (session.port) {
        try {
          session.port.postMessage({ type: 'error', message: String(err) });
        } catch {
          /* ignore */
        }
      }
    }
  });

  proc.stdin.on('drain', () => {
    const queued = session.pendingDrain;
    session.pendingDrain = [];
    for (const cb of queued) cb();
  });

  proc.on('close', (code) => {
    session.procExited = true;
    sessions.delete(id);
    const elapsed = ((Date.now() - session.startedAt) / 1000).toFixed(2);
    closeLog(
      session,
      `closed code=${code} cancelled=${session.cancelled} ` +
        `framesWritten=${session.framesWritten} elapsed=${elapsed}s`
    );

    if (session.cancelled) {
      resolveFinish();
      return;
    }
    if (code === 0) {
      resolveFinish();
      return;
    }

    // 关键诊断：ffmpeg 在收到任何帧之前就死了 → 99% 是参数 / 文件 / 编码器 init 问题
    const earlyExit = session.framesWritten === 0;
    const tail = session.recentStderr.slice(-15).join('\n');
    const reason = earlyExit
      ? `ffmpeg 进程在收到首帧前就退出了（code=${code}）。` +
        `\n这通常是参数错误、找不到输入文件、或编码器初始化失败。` +
        (logPath ? `\n完整日志：${logPath}` : '') +
        `\n最近 stderr：\n${tail || '(无输出)'}`
      : `ffmpeg 进程异常退出，code=${code}` +
        (logPath ? `\n完整日志：${logPath}` : '') +
        (tail ? `\n最近 stderr：\n${tail}` : '');

    // 唤醒 FrameTransport（否则 renderer 会一直 await ack）
    if (session.port) {
      try {
        session.port.postMessage({ type: 'error', message: reason });
      } catch {
        /* ignore */
      }
    }
    rejectFinish(new Error(reason));
  });

  proc.on('error', (err) => {
    session.procExited = true;
    sessions.delete(id);
    closeLog(session, `spawn error: ${err.message}`);
    if (session.port) {
      try {
        session.port.postMessage({
          type: 'error',
          message: `ffmpeg 进程启动失败：${err.message}`,
        });
      } catch {
        /* ignore */
      }
    }
    rejectFinish(err);
  });

  sessions.set(id, session);

  // ── Step 7：spawn 后等一个"settle 窗口"，让我们能同步捕获到早退 ──
  //
  // ffmpeg 启动失败（路径/编码器/参数不对）通常会在 100-500ms 内：
  //   - emit 'error'  （ENOENT / EACCES 之类）
  //   - emit 'close' code != 0
  //   - 把错误信息打到 stderr 然后退出
  //
  // 启动成功则会几乎立刻往 stderr 写 banner（"ffmpeg version ..."）。
  // 我们用 race 等"banner 到来"或"进程死掉"，最多等 1.2s。
  //
  // 这样一旦 spawn 后立刻死，调用方（renderer）就会收到 ffmpegStart 的 reject，
  // 自动触发 OfflineRenderer 的 encoder fallback (Step 5)，而不用先等 30s 背压超时。
  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        proc.stderr.off('data', onStderr);
        proc.off('error', onError);
        proc.off('close', onClose);
        clearTimeout(timer);
      };
      const onStderr = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const onError = (err: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(`ffmpeg 进程启动失败：${err.message}`));
      };
      const onClose = (code: number | null) => {
        if (settled) return;
        settled = true;
        cleanup();
        const tail = session.recentStderr.slice(-10).join('\n');
        reject(
          new Error(
            `ffmpeg 进程在收到首帧前就退出了（code=${code}）。` +
              `\n这通常是参数错误、找不到输入文件、或编码器初始化失败。` +
              (logPath ? `\n完整日志：${logPath}` : '') +
              (tail ? `\n最近 stderr：\n${tail}` : '')
          )
        );
      };
      proc.stderr.on('data', onStderr);
      proc.on('error', onError);
      proc.on('close', onClose);
      // 1.2s 内既没 banner 也没退出 → 视为已经在跑（罕见慢启动），放行
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      }, 1200);
    });
  } catch (settleErr) {
    // 早退路径：把残留的 finishPromise 静默掉，避免 unhandled rejection；
    // 同时确保 session 从 map 里清掉（close handler 一般也会做，这里兜底）
    finishPromise.catch(() => {
      /* swallow: 调用方已通过 ffmpegStart() 的 throw 收到错误 */
    });
    sessions.delete(id);
    try {
      proc.kill('SIGKILL');
    } catch {
      /* 多半已经死了 */
    }
    throw settleErr;
  }

  // 建立专用 MessagePort 通道用于零拷贝帧传输
  const channel = new MessageChannelMain();
  session.port = channel.port1;
  attachPort(session, channel.port1);
  if (!sender.isDestroyed()) {
    sender.postMessage('ffmpeg:port', { sessionId: id }, [channel.port2]);
  }

  return { sessionId: id };
}

function attachPort(session: Session, port: MessagePortMain): void {
  port.on('message', (event) => {
    // 新格式（Fix A 之后）：{ frameIndex, pixels: Uint8Array }
    // —— 通过 structured clone 跨进程，不再用 transferList（那个会让 event.data 变成 null）
    const data = event.data as
      | { frameIndex: number; pixels: Uint8Array }
      | undefined;
    if (!data || !data.pixels) {
      // 发现空包：极有可能 Electron 升级后 MessagePort 又坏了，写一行明显日志
      console.error(
        '[ffmpeg-service] 收到空 message —— Electron MessagePort 又坏了？',
        'event.data =', event.data
      );
      return;
    }
    if (session.cancelled) return;

    // structured clone 之后 data.pixels 是 Uint8Array；Buffer.from 共享底层内存，零拷贝
    const u8 = data.pixels;
    const buf = Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);
    const expected = session.width * session.height * 4;
    if (buf.byteLength !== expected) {
      const msg = `帧大小不匹配：expected=${expected} actual=${buf.byteLength}`;
      console.error('[ffmpeg]', msg);
      try {
        port.postMessage({ type: 'error', message: msg });
      } catch {
        /* ignore */
      }
      return;
    }

    const ok = session.proc.stdin.write(buf);
    const ack = () => {
      session.framesWritten += 1;
      try {
        port.postMessage({ type: 'ack', frameIndex: data.frameIndex });
      } catch {
        /* ignore */
      }
    };
    if (ok) {
      ack();
    } else {
      // 等 drain 后再 ack（实现背压）
      session.pendingDrain.push(ack);
    }
  });
  port.start();
}

export async function ffmpegFinish(
  sessionId: string
): Promise<{ outputPath: string }> {
  const session = sessions.get(sessionId);
  if (!session) {
    return { outputPath: '' };
  }
  // 排空 pending drain 回调
  await new Promise<void>((r) => setTimeout(r, 0));
  session.proc.stdin.end();
  await session.finishPromise;
  return { outputPath: session.outputPath };
}

export async function ffmpegCancel(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.cancelled = true;
  try {
    session.proc.stdin.end();
  } catch {
    /* ignore */
  }
  if (session.port) {
    try {
      session.port.close();
    } catch {
      /* ignore */
    }
  }
  session.proc.kill('SIGKILL');
}
