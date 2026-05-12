#!/usr/bin/env node
/**
 * 开发启动流程的横幅脚本（被 サウンド可視化.bat 调用）。
 *
 * 替换原来的 launcher-banner.ps1，避免 PowerShell 在日文 Windows 上
 * 按 CP932 解析 UTF-8 文件而乱码。Node.js 始终按 UTF-8 读源文件，
 * 配合 cmd 的 `chcp 65001` 即可正确显示中文。
 *
 * 用法：
 *   node scripts/launcher-banner.mjs banner
 *   node scripts/launcher-banner.mjs install-start
 *   node scripts/launcher-banner.mjs install-fail
 */

const stage = process.argv[2] || 'banner';

const COLOR = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

function line(color, text) {
  console.log(color + text + COLOR.reset);
}

if (stage === 'banner') {
  console.log();
  line(COLOR.cyan, '  ====================================');
  line(COLOR.cyan, '   Audio Visualizer - 启动中...');
  line(COLOR.cyan, '  ====================================');
  console.log();
} else if (stage === 'install-start') {
  line(
    COLOR.yellow,
    '[初始化] 第一次运行，正在安装依赖（约 2-3 分钟）...'
  );
} else if (stage === 'install-fail') {
  console.log();
  line(COLOR.red, '[错误] npm install 失败。请先安装 Node.js LTS：');
  line(COLOR.red, '  https://nodejs.org/zh-cn/download/');
  console.log();
} else {
  console.error('Unknown stage:', stage);
  process.exit(1);
}
