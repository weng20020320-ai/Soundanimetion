/**
 * 导出卡死诊断：用 4 组对照实验定位 ffmpeg 到底卡在哪个参数。
 *
 * 复刻我们项目的：
 *  - spawn(ffmpegPath, args, { stdio: ['pipe','pipe','pipe'], windowsHide: true })
 *  - stdin 喂 1920×1080 RGBA 90 帧
 *  - 关键差异变量：+faststart / 音频输入 / -shortest / -movflags
 *
 * 使用：node scripts/diagnose-export.mjs
 * 产出：node_modules/ffmpeg-static/ 下的 test_diag_*.mp4（跑完自动删）
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ffmpegPath = require('ffmpeg-static');

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'tmp-diagnose');
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const W = 1920;
const H = 1080;
const FPS = 30;
const DURATION_SEC = 3;
const FRAME_BYTES = W * H * 4;
const NUM_FRAMES = FPS * DURATION_SEC;
const TIMEOUT_MS = 25_000;

console.log(`ffmpegPath = ${ffmpegPath}`);
console.log(`OUT_DIR    = ${OUT_DIR}`);
console.log(`Frame size = ${FRAME_BYTES} bytes (${(FRAME_BYTES / 1024 / 1024).toFixed(2)} MB)`);
console.log(`Total      = ${NUM_FRAMES} frames\n`);

/**
 * @param {string} name
 * @param {string[]} args
 */
async function runTest(name, args) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`TEST: ${name}`);
  console.log(`args: ${args.join(' ')}`);
  console.log('-'.repeat(70));

  const start = Date.now();
  const proc = spawn(ffmpegPath, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let firstFrameLineAt = 0;
  let firstInputLineAt = 0;
  const stderrLines = [];
  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data', (chunk) => {
    chunk.split(/\r?\n/).forEach((line) => {
      if (!line.trim()) return;
      stderrLines.push(line);
      if (!firstInputLineAt && line.startsWith('Input #')) {
        firstInputLineAt = Date.now() - start;
      }
      if (!firstFrameLineAt && /^frame=\s*\d+/.test(line)) {
        firstFrameLineAt = Date.now() - start;
      }
    });
  });

  let writeBlocked = 0;
  let writeOk = 0;
  let drainCount = 0;
  proc.stdin.on('drain', () => drainCount++);
  proc.stdin.on('error', (err) => {
    console.log(`  [stdin error] ${err.message}`);
  });

  const frameBuffer = Buffer.alloc(FRAME_BYTES);
  let framesSent = 0;
  let timedOut = false;
  let writeError = null;

  const writeOne = () =>
    new Promise((resolve) => {
      const ok = proc.stdin.write(frameBuffer, (err) => {
        if (err) writeError = err;
      });
      if (ok) {
        writeOk++;
        resolve();
      } else {
        writeBlocked++;
        proc.stdin.once('drain', resolve);
      }
    });

  const watchdog = new Promise((resolve) => {
    setTimeout(() => {
      timedOut = true;
      resolve();
    }, TIMEOUT_MS);
  });

  const sendAll = (async () => {
    for (let i = 0; i < NUM_FRAMES; i++) {
      if (timedOut || writeError) break;
      await writeOne();
      framesSent++;
    }
  })();

  await Promise.race([sendAll, watchdog]);

  if (timedOut) {
    console.log(`  !!! TIMEOUT (${TIMEOUT_MS / 1000}s) at frame ${framesSent}/${NUM_FRAMES}`);
    proc.kill('SIGKILL');
  } else {
    try {
      proc.stdin.end();
    } catch {
      /* ignore */
    }
  }

  const exitCode = await new Promise((resolve) => {
    proc.on('close', (code) => resolve(code));
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  console.log(`  result: exitCode=${exitCode} elapsed=${elapsed}s timedOut=${timedOut}`);
  console.log(
    `  pipe:   sent=${framesSent}/${NUM_FRAMES} writeOk=${writeOk} writeBlocked=${writeBlocked} drains=${drainCount}`
  );
  console.log(
    `  ffmpeg: firstInputLine=${firstInputLineAt || 'NEVER'}ms firstFrameLine=${firstFrameLineAt || 'NEVER'}ms`
  );
  if (stderrLines.length > 0) {
    console.log(`  last 6 stderr lines:`);
    stderrLines.slice(-6).forEach((l) => console.log(`    | ${l}`));
  } else {
    console.log(`  (no stderr output at all)`);
  }
  if (writeError) {
    console.log(`  writeError: ${writeError.message}`);
  }

  return { name, exitCode, elapsed, timedOut, framesSent, firstInputLineAt, firstFrameLineAt };
}

const baseArgs = [
  '-y',
  '-f', 'rawvideo',
  '-pix_fmt', 'rgba',
  '-s', `${W}x${H}`,
  '-r', String(FPS),
  '-i', 'pipe:0',
];

const TESTS = [
  {
    name: '1) minimal libx264, no audio, no faststart',
    args: [
      ...baseArgs,
      '-vf', 'vflip',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast',
      '-an',
      join(OUT_DIR, 'test_diag_1.mp4'),
    ],
  },
  {
    name: '2) +faststart, no audio',
    args: [
      ...baseArgs,
      '-vf', 'vflip',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast',
      '-movflags', '+faststart',
      '-an',
      join(OUT_DIR, 'test_diag_2.mp4'),
    ],
  },
  {
    name: '3) lavfi audio + shortest, no faststart',
    args: [
      ...baseArgs,
      '-f', 'lavfi', '-i', `sine=frequency=440:duration=${DURATION_SEC}`,
      '-vf', 'vflip',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast',
      '-c:a', 'aac', '-b:a', '320k', '-shortest',
      '-map', '0:v:0', '-map', '1:a:0',
      join(OUT_DIR, 'test_diag_3.mp4'),
    ],
  },
  {
    name: '4) FULL APP PIPELINE: lavfi audio + +faststart + shortest',
    args: [
      ...baseArgs,
      '-f', 'lavfi', '-i', `sine=frequency=440:duration=${DURATION_SEC}`,
      '-vf', 'vflip',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast',
      '-movflags', '+faststart',
      '-c:a', 'aac', '-b:a', '320k', '-shortest',
      '-map', '0:v:0', '-map', '1:a:0',
      join(OUT_DIR, 'test_diag_4.mp4'),
    ],
  },
];

const results = [];
for (const t of TESTS) {
  results.push(await runTest(t.name, t.args));
}

console.log(`\n${'='.repeat(70)}`);
console.log('SUMMARY');
console.log('='.repeat(70));
console.log(
  'name'.padEnd(60) + 'exit  elapsed  hung'
);
results.forEach((r) => {
  console.log(
    r.name.padEnd(60) +
      String(r.exitCode).padEnd(6) +
      String(r.elapsed + 's').padEnd(9) +
      (r.timedOut ? 'YES' : '-')
  );
});

// 清理
console.log('\ncleaning up tmp files...');
for (let i = 1; i <= 4; i++) {
  const p = join(OUT_DIR, `test_diag_${i}.mp4`);
  if (existsSync(p)) {
    try {
      unlinkSync(p);
    } catch {
      /* ignore */
    }
  }
}
console.log('done.');
