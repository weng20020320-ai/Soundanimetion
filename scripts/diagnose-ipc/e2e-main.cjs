/**
 * 端到端验证：
 *   renderer → MessagePort (Fix A 写法) → main → ffmpeg → mp4 文件
 *
 * 这个脚本独立于业务代码，但严格复刻业务的 spawn + attachPort 模式
 * （包括 Fix A 后的 { frameIndex, pixels: Uint8Array } 格式）。
 *
 * 同时验证 Bug 2 + Bug 3：
 *   - 跑两次：一次正常导出，一次故意给坏参数让 ffmpeg early-exit
 *   - 检查 mp4 是否生成、log 文件是否写入、error 是否回到 renderer
 *
 * 运行：npx electron scripts/diagnose-ipc/e2e-main.cjs
 */
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');

const {
  app,
  BrowserWindow,
  MessageChannelMain,
  ipcMain,
} = require('electron');

const require2 = createRequire(__filename);
const ffmpegPath = require2('ffmpeg-static');

const W = 320;
const H = 240;
const FPS = 30;
const NUM_FRAMES = 30;
const FRAME_BYTES = W * H * 4;
const TMP_DIR = path.join(__dirname, '..', '..', 'tmp-diagnose');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const startedAt = Date.now();
const log = (...args) =>
  console.log(`[${(Date.now() - startedAt).toString().padStart(5)}ms]`, ...args);

const sessions = new Map();

function spawnFfmpeg(sessionId, args, sender) {
  const proc = spawn(ffmpegPath, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const channel = new MessageChannelMain();
  const session = {
    id: sessionId,
    proc,
    port: channel.port1,
    framesWritten: 0,
    procExited: false,
    recentStderr: [],
    pendingDrain: [],
    cancelled: false,
    onError: null,
    onClose: null,
    logPath: path.join(TMP_DIR, `e2e_${sessionId}.log`),
  };

  // 复刻业务的日志落盘
  const logStream = fs.createWriteStream(session.logPath, { encoding: 'utf8' });
  logStream.write(`session ${sessionId}\nargs: ${args.join(' ')}\n---\n`);
  session.logStream = logStream;

  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data', (chunk) => {
    chunk.split(/\r?\n/).forEach((line) => {
      if (!line.trim()) return;
      session.recentStderr.push(line);
      if (session.recentStderr.length > 40) session.recentStderr.shift();
      logStream.write(line + '\n');
    });
  });

  proc.stdin.on('drain', () => {
    const queue = session.pendingDrain;
    session.pendingDrain = [];
    for (const cb of queue) cb();
  });

  proc.on('close', (code) => {
    session.procExited = true;
    logStream.write(`---\nclosed code=${code} framesWritten=${session.framesWritten}\n`);
    logStream.end();
    if (session.onClose) session.onClose(code);
  });

  // 关键：复刻业务的 attachPort（Fix A 之后的格式）
  channel.port1.on('message', (event) => {
    const data = event.data;
    if (!data || !data.pixels) {
      log(`!!! [main] EMPTY message data — Fix A 失效了 !!!`);
      return;
    }
    const u8 = data.pixels;
    const buf = Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);
    if (buf.byteLength !== FRAME_BYTES) {
      log(`!!! [main] frame size mismatch: ${buf.byteLength} vs ${FRAME_BYTES}`);
      return;
    }
    const ok = proc.stdin.write(buf);
    const ack = () => {
      session.framesWritten += 1;
      try {
        channel.port1.postMessage({ type: 'ack', frameIndex: data.frameIndex });
      } catch {
        /* ignore */
      }
    };
    if (ok) ack();
    else session.pendingDrain.push(ack);
  });
  channel.port1.start();

  sessions.set(sessionId, session);
  sender.postMessage('e2e:port', { sessionId }, [channel.port2]);
  return session;
}

function finishFfmpeg(sessionId) {
  return new Promise((resolve, reject) => {
    const session = sessions.get(sessionId);
    if (!session) return reject(new Error('no session'));
    session.onClose = (code) => {
      if (code === 0) resolve({ ok: true, frames: session.framesWritten });
      else reject(new Error(`ffmpeg exit ${code}\n${session.recentStderr.slice(-5).join('\n')}`));
    };
    try {
      session.proc.stdin.end();
    } catch {
      /* ignore */
    }
  });
}

ipcMain.handle('e2e:start-ok', (e, outputPath) => {
  log('[main] starting OK ffmpeg session');
  const sessionId = 'sess-ok';
  const args = [
    '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgba',
    '-s', `${W}x${H}`, '-r', String(FPS),
    '-i', 'pipe:0',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast',
    '-an', outputPath,
  ];
  spawnFfmpeg(sessionId, args, e.sender);
  return { sessionId, logPath: sessions.get(sessionId).logPath };
});

ipcMain.handle('e2e:start-bad', (e, outputPath) => {
  log('[main] starting BAD ffmpeg session (invalid input file)');
  const sessionId = 'sess-bad';
  const args = [
    '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgba',
    '-s', `${W}x${H}`, '-r', String(FPS),
    '-i', 'pipe:0',
    '-i', 'C:\\nonexistent\\path\\foobar.mp3',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-shortest', '-map', '0:v:0', '-map', '1:a:0',
    outputPath,
  ];
  spawnFfmpeg(sessionId, args, e.sender);
  return { sessionId, logPath: sessions.get(sessionId).logPath };
});

ipcMain.handle('e2e:finish', async (_e, sessionId) => {
  return finishFfmpeg(sessionId);
});

ipcMain.handle('e2e:report', (_e, name, data) => {
  log(`[result] ${name}:`, JSON.stringify(data));
  return true;
});

let testsCompleted = 0;
ipcMain.handle('e2e:done', () => {
  testsCompleted++;
  if (testsCompleted >= 1) {
    setTimeout(() => app.quit(), 200);
  }
});

app.whenReady().then(() => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'e2e-preload.cjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'e2e-renderer.html'));

  setTimeout(() => {
    log('[main] WATCHDOG TIMEOUT (60s)');
    app.quit();
  }, 60_000);
});

app.on('window-all-closed', () => app.quit());
