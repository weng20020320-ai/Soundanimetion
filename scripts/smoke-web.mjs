#!/usr/bin/env node
/**
 * Web demo 烟测脚本：
 *  1. 启动 `vite preview --port 5175` 服务静态产物
 *  2. HTTP GET 根路径，确认能拿到 index.html 且包含 #root 和 module script
 *  3. 终止进程，返回退出码
 *
 * 用法：node scripts/smoke-web.mjs
 */
import { spawn } from 'node:child_process';
import http from 'node:http';

const PORT = 5175;
const URL = `http://127.0.0.1:${PORT}/`;

const proc = spawn(
  'npx',
  [
    'vite',
    'preview',
    '--config',
    'web/vite.config.ts',
    '--port',
    String(PORT),
    '--host',
    '127.0.0.1',
  ],
  { stdio: ['ignore', 'pipe', 'pipe'], shell: true }
);

let booted = false;
const timeout = setTimeout(() => {
  if (!booted) {
    console.error('[smoke] TIMEOUT after 15s waiting for vite preview');
    proc.kill();
    process.exit(2);
  }
}, 15000);

proc.stdout.on('data', (d) => {
  const s = d.toString();
  process.stdout.write('[vite] ' + s);
  if (!booted && /Local:/.test(s)) {
    booted = true;
    setTimeout(() => {
      http
        .get(URL, (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => {
            const hasRoot = body.includes('id="root"');
            const hasModule = body.includes('type="module"');
            const hasTitle = body.includes('<title>Wavelet');
            console.log('[smoke] HTTP status =', res.statusCode);
            console.log('[smoke] has #root      =', hasRoot);
            console.log('[smoke] has <script type=module> =', hasModule);
            console.log('[smoke] has Wavelet title =', hasTitle);
            const ok =
              res.statusCode === 200 && hasRoot && hasModule && hasTitle;
            proc.kill();
            clearTimeout(timeout);
            process.exit(ok ? 0 : 1);
          });
        })
        .on('error', (e) => {
          console.error('[smoke] fetch error:', e.message);
          proc.kill();
          clearTimeout(timeout);
          process.exit(3);
        });
    }, 800);
  }
});

proc.stderr.on('data', (d) => process.stderr.write('[vite err] ' + d));
