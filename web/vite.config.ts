/**
 * Vite 配置 —— Web demo 版（部署到 Vercel）。
 *
 * 和 electron.vite.config.ts 的 renderer 段最大区别：
 *  - root 指向 web/，入口是 web/index.html → web/main.tsx
 *  - 不依赖 Electron 模块（'electron' import 等）
 *  - VITE_PLATFORM=web 注入，让 src/platform/capabilities.ts 切换到 web 模式
 *  - 输出到 web/dist/，Vercel `outputDirectory` 字段指向这里
 *
 * 用法：
 *   npm run dev:web      —— Vite dev server (默认端口 5174 避开 electron-vite 的 5173)
 *   npm run build:web    —— 构建到 web/dist/
 *
 * 注意：源代码 90% 复用 src/，所以 root 设在 web/ 之后 alias '@' 仍指向 src/，
 * 让 import '../src/App' 之类的相对路径正常解析。
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = resolve(__dirname, '..');

const pkg = JSON.parse(
  readFileSync(resolve(projectRoot, 'package.json'), 'utf-8')
) as { version: string };

export default defineConfig({
  root: __dirname,
  publicDir: resolve(__dirname, 'public'),
  resolve: {
    alias: {
      '@': resolve(projectRoot, 'src'),
    },
  },
  define: {
    'import.meta.env.VITE_PLATFORM': JSON.stringify('web'),
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
  },
  server: {
    port: 5174,
    host: '127.0.0.1',
  },
  preview: {
    port: 5174,
    host: '127.0.0.1',
  },
});
