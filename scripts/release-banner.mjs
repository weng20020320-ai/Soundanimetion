#!/usr/bin/env node
/**
 * 打包发布流程的横幅脚本（被 打包发布.bat 调用）。
 *
 * 替换原来的 release-banner.ps1：
 *  - 旧 .ps1 是 UTF-8 无 BOM，Windows PowerShell 5.x 在日文系统会按 CP932 读，
 *    导致中文字符串引号被吃掉，进而 Write-Host 把后续行当字面量打出来，
 *    最后报 "Input string was not in a correct format" 整个 switch 散架。
 *  - Node.js 始终按 UTF-8 处理源文件，stdout 在 cmd `chcp 65001` 之后能正确显示中文。
 *
 * 用法：
 *   node scripts/release-banner.mjs pre   # 打包前的"即将执行"清单
 *   node scripts/release-banner.mjs post  # 打包后的"成功"提示
 */

const stage = process.argv[2] || 'pre';

const COLOR = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
};

function line(color, text) {
  console.log(color + text + COLOR.reset);
}

if (stage === 'pre') {
  console.log();
  line(COLOR.cyan, '  ============================================================');
  line(COLOR.cyan, '   Wavelet - 打包成可移植 .exe');
  line(COLOR.cyan, '  ============================================================');
  console.log();
  console.log('  即将执行：');
  console.log('    [1] 自动清理 release\\ 里的旧版本产物 + out\\ + Vite 缓存');
  console.log('        （保留 release\\.cache\\ 以便复用 electron 二进制下载）');
  console.log('    [2] electron-vite build  → 构建 main / preload / renderer');
  console.log('    [3] electron-builder --win  → 在 release\\ 下生成两个文件：');
  console.log('          wavelet-x.x.x-win-x64-portable.exe   绿色单文件，免安装');
  console.log('          wavelet-x.x.x-win-x64-setup.exe      NSIS 安装包');
  console.log();
  line(
    COLOR.dim,
    '  说明：本流程不需要管理员权限，也不会向你索要任何密码。'
  );
  line(
    COLOR.dim,
    '       如果中途弹出 SmartScreen / 杀软提示，是 Windows 对未签名 .exe 的常规警告。'
  );
  console.log();
} else if (stage === 'post') {
  console.log();
  line(COLOR.green, '  ============================================================');
  line(COLOR.green, '   打包完成');
  line(COLOR.green, '  ============================================================');
  console.log();
  console.log('  请到项目下的 release\\ 目录查看生成的 .exe 文件：');
  console.log('    wavelet-<version>-win-x64-portable.exe   双击即跑，不写注册表');
  console.log('    wavelet-<version>-win-x64-setup.exe      NSIS 安装版');
  console.log();
} else if (stage === 'fail') {
  const exitCode = process.argv[3] || '?';
  console.log();
  line(COLOR.red, '  ============================================================');
  line(COLOR.red, `   打包失败（npm 退出码=${exitCode}）`);
  line(COLOR.red, '  ============================================================');
  console.log();
  line(COLOR.yellow, '  上方的 npm 输出里通常会有 ERR! 之类的关键错误行。');
  line(
    COLOR.yellow,
    '  常见原因：网络中断（首次下载 electron 二进制约 80MB） / 杀软拦截 / 磁盘空间不足。'
  );
  console.log();
} else if (stage === 'confirm') {
  console.log('  按任意键开始打包；要中止请直接关闭本窗口。');
} else if (stage === 'bye') {
  console.log('  按任意键关闭本窗口。');
} else if (stage === 'banner-fail-warn') {
  line(COLOR.yellow, '  [WARN] release-banner.mjs pre 输出异常，但不阻断流程。');
} else {
  console.error('Unknown stage:', stage);
  process.exit(1);
}
