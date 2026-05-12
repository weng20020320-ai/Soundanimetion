#!/usr/bin/env node
/**
 * 打包前的自动清理脚本（被 npm run package:win 自动调用）。
 *
 * 做的事：
 *   1. 读 package.json 里的 version
 *   2. release/ 里所有非当前版本的 .exe / .blockmap → 删除（避免多版本堆积）
 *   3. release/ 里的元数据（*.yml / builder-debug.*）→ 删除（会被重新生成）
 *   4. release/ 里的中间目录（win-unpacked / mac / linux 等）→ 删除（每次重建）
 *   5. release/.cache/ → 保留（electron 二进制下载缓存，删了要重下 ~80MB）
 *   6. out/ → 删除（electron-vite 上次产物，会被这次重建）
 *   7. node_modules/.vite/ → 删除（防止 stale 预构建缓存进打包）
 *
 * 跨平台：纯 Node.js，Windows / macOS / Linux 都能跑。
 */
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
process.chdir(root);

const c = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
};

const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
const version = pkg.version;
console.log(`${c.cyan}[clean] 当前版本: ${version}${c.reset}`);

const releaseDir = path.join(root, 'release');
if (existsSync(releaseDir)) {
  const versionTag = `-${version}-`;
  const versionTagSuffix = `-${version}.`;
  let removedOldArtifacts = 0;

  for (const e of readdirSync(releaseDir, { withFileTypes: true })) {
    const full = path.join(releaseDir, e.name);

    if (e.isFile()) {
      const lower = e.name.toLowerCase();
      if (/\.(exe|blockmap)$/i.test(lower)) {
        const isCurrent =
          e.name.includes(versionTag) || e.name.includes(versionTagSuffix);
        if (!isCurrent) {
          console.log(`${c.yellow}  删除旧版本产物: ${e.name}${c.reset}`);
          unlinkSync(full);
          removedOldArtifacts++;
        }
      } else if (
        /\.(yml|yaml)$/i.test(lower) ||
        e.name.startsWith('builder-debug') ||
        e.name === 'builder-effective-config.yaml'
      ) {
        console.log(`${c.dim}  删除元数据: ${e.name}${c.reset}`);
        unlinkSync(full);
      }
    } else if (e.isDirectory()) {
      if (e.name === '.cache') {
        continue;
      }
      console.log(`${c.dim}  删除中间目录: ${e.name}/${c.reset}`);
      rmSync(full, { recursive: true, force: true });
    }
  }

  if (removedOldArtifacts === 0) {
    console.log(`${c.green}[clean] 无旧版本 .exe 需要删除${c.reset}`);
  } else {
    console.log(
      `${c.green}[clean] 已删除 ${removedOldArtifacts} 个旧版本产物${c.reset}`
    );
  }
} else {
  console.log(`${c.green}[clean] release/ 不存在，跳过${c.reset}`);
}

if (existsSync('out')) {
  console.log(`${c.dim}[clean] 删除 out/${c.reset}`);
  rmSync('out', { recursive: true, force: true });
}

const viteCache = path.join('node_modules', '.vite');
if (existsSync(viteCache)) {
  console.log(`${c.dim}[clean] 删除 node_modules/.vite/${c.reset}`);
  rmSync(viteCache, { recursive: true, force: true });
}

console.log(`${c.green}[clean] 完成${c.reset}`);
