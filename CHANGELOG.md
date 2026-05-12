# 开发日志 / CHANGELOG

> 给"换电脑后继续 vibe-coding"用的接力笔记。
> 每条记录尽量包含**改了什么 / 为什么 / 在哪几个文件**，便于 AI 助手快速对齐项目状态。
>
> 项目根（最新一台）：`c:\Users\weng2\Desktop\Neoclear\Soundanimetion`
> 启动开发：双击 `サウンド可視化.bat`（= `npm run dev`）
> 打包发布：双击 `打包发布.bat`（= `npm run package:win`，包含自动清理）

---

## 2026-05-12 🔗 发布产物文件名去掉版本号

### 背景
主页 (`clearmika.com`) 的 Apparatus 卡片要长期稳定指向 `releases/latest/download/<file>`。`releases/latest/` 这一段会自动跟着新 release 走 ✅，但**文件名里如果带版本号（`wavelet-0.2.1-win-x64-setup.exe`），下一次发版 URL 就 404 了**。主页那边不可能每次跟着改。

### 决策
把 electron-builder 的所有 `artifactName` 模板里 `${version}` 这一段去掉，文件名只保留**平台 + 架构 + 类型**：

| 平台 | 旧 | 新 |
|---|---|---|
| Win NSIS  | `wavelet-${version}-win-${arch}-setup.exe`    | `wavelet-win-${arch}-setup.exe`    |
| Win 便携  | `wavelet-${version}-win-${arch}-portable.exe` | `wavelet-win-${arch}-portable.exe` |
| macOS dmg | `wavelet-${version}-mac-${arch}.dmg`          | `wavelet-mac-${arch}.dmg`          |

> 版本号信息仍然由应用内（`__APP_VERSION__`）和 `apparatus.json.version` 字段展示，没有丢失。

### 改动
- `package.json` → `build.nsis.artifactName` / `build.portable.artifactName` / `build.mac.artifactName` / `build.dmg.artifactName` 四处都去掉 `${version}`
- `apparatus.json` → `downloads.windows` / `downloads.macos` URL 同步改成无版本名
- `docs/handoff/wavelet-card.md` → 示例 URL 同步
- `README.md`（英 + 中）→ 下载说明里的示例文件名同步
- `scripts/release-banner.mjs` → 打包横幅里的提示文本同步

### macOS Intel 用户说明
主页卡片的 `downloads.macos` 字段只能写一个 URL，按主页 agent 的决定指向 `wavelet-mac-arm64.dmg`。Apple Silicon 用户开箱即用；**Intel Mac 用户需要自己去 Release 页面找 `wavelet-mac-x64.dmg`**。x64 build 还在产出，没有取消。

### 验证 / 不影响范围
- ✅ 没有 `electron-updater` / `autoUpdater` 代码，`latest.yml` 由 electron-builder 同步生成，引用关系自洽
- ✅ `.github/workflows/release.yml` 用 glob `release/*.exe`、`release/*.dmg`，对文件名格式不敏感，**不需要改**
- ✅ Win NSIS 和 portable 名字带 `-setup` / `-portable` 后缀区分，不冲突
- ✅ macOS x64 和 arm64 用 `${arch}` 占位符区分，不冲突
- ✅ `type-check`（web + node）和 `build:web` 均通过
- ✅ 应用源码不读自己的安装包名，runtime 行为不变

### 下一步
首次正式发版前 P0 部分已就绪，等截图（`docs/screenshots/cover.png` 等）和主页接入完成后，`git tag v0.2.1 && git push origin v0.2.1` 触发 release.yml 即可。

---

## 2026-05-12 🌐 Web demo 拆分（Phase 2）+ auto-push 规则

### 背景
延续 Phase 1，把项目变成「桌面版（完整）+ Web 试玩版（精简）」双发布。Web 版部署到 Vercel 子域 `wavelet.clearmika.com`，每次推 main 自动重新部署。同时给 Cursor agent 一条 always-apply 规则，让它做完实质性改动后自动 commit + push（不再需要用户手动操作）。

### 设计：一份源码两个产物

不复制源码、不写"if platform"判断到处都是，而是用 **能力开关（capabilities）+ window.api polyfill** 的方式让 `src/App.tsx` 90% 代码桌面/网页通吃。

```
electron-vite build  → 用 src/main.tsx 当入口 → out/renderer/      (桌面用)
vite build (web)     → 用 web/main.tsx 当入口 → web/dist/          (Vercel 用)
```

差异由 Vite 的 `define` 注入：
- 桌面版：`VITE_PLATFORM = 'electron'`（默认）
- Web 版：`VITE_PLATFORM = 'web'`（在 web/vite.config.ts 写死）

### 新增

#### 1. 平台抽象层 `src/platform/`
- **`capabilities.ts`**：
  - 导出 `PLATFORM: 'electron' | 'web'`（从 `import.meta.env.VITE_PLATFORM` 解析）
  - 导出 `capabilities` 对象，6 个能力开关：`fileDialog / videoExport / showInFolder / hardwareEncoderProbe / droppedFilePath / showWebDemoNotice`
  - 导出 `DESKTOP_DOWNLOAD_URL`（指向 GitHub Releases latest）
  - **设计要点**：渲染层永远只读 `capabilities.foo`，不直接判断 `isElectron`，将来加 Tauri / Mac Native 第三种宿主只用扩 capabilities
- **`web-api.ts`**：
  - `createWebApi()` 在浏览器里实现一份 `AppApi` 接口
  - `openAudio()` → 触发隐藏的 `<input type="file">`，含 focus 回调兜底（用户取消时也能正确 resolve null）
  - `saveSnapshot()` → 创建 Blob URL + `<a download>` 触发浏览器自动下载
  - `loadFromPath/getDroppedFilePath/ffmpegStart/showItemInFolder` 等"原生专属"方法：要么抛错要么 graceful no-op
  - `getHardwareEncoders()` → 返回空 `available: []`
  - `attachWebApi()` 把对象挂到 `window.api`（带防重复挂载标志）
  - **TS 难点**：AppApi 是从 preload.ts 推断的，`onFfmpegLog` 真实签名返回 `() => IpcRenderer`，Web 上拿不到 IpcRenderer → 最终 `as unknown as AppApi` 强转

#### 2. Web 入口 `web/`
- **`web/index.html`**：splash hint 写 `WEB DEMO`，其余和 src/index.html 同结构（保留音柱动画）
- **`web/main.tsx`**：先 `attachWebApi()` 再 render App，依赖 ESM import 顺序保证（App.tsx 里所有 `window.api.*` 都在 useEffect 内）
- **`web/vite.config.ts`**：
  - root 在 `web/`，alias `@ → src/` 共享代码
  - `define: { 'import.meta.env.VITE_PLATFORM': '"web"', __APP_VERSION__: <package.json version> }`
  - 输出到 `web/dist/`，dev server 5174 端口避开 electron-vite 的 5173

#### 3. UI 改动
- **`src/i18n/types.ts`**：新增 `webDemo` 字段（4 个 string）
- **三语 locale** 全部翻译（zh-CN 完整、en-US 完整、ja-JP 完整）
- **`src/App.tsx`**：
  - Web 横幅：`{capabilities.showWebDemoNotice && <div className="web-demo-banner">...</div>}`
  - 导出按钮：Web 上文字变成 "安装桌面版"，点击 → `window.confirm` → 跳 GitHub Releases
  - `useEffect(getHardwareEncoders)`：web 上跳过
  - `handleDrop`：web 上跳过 `getDroppedFilePath`（避免抛错）
  - 快照保存：web 上跳过"在资源管理器中显示"二次 confirm
  - 导出完成：同上
- **`src/index.css`**：
  - `.app-shell` 顶部新增 `banner` 行（`grid-template-rows: auto 48px ...`，桌面下 banner 不渲染 → auto 行高 0px，无副作用）
  - `.web-demo-banner` 玻璃拟态横条：渐变半透明蓝、CTA 链接 hover 透明度

#### 4. 构建 / 部署
- **`vercel.json`**：
  ```json
  { "buildCommand": "npm run build:web", "outputDirectory": "web/dist" }
  ```
  Vercel 自动识别 npm install，不需要其它配置
- **`package.json`** scripts 新增：
  - `dev:web` / `build:web` / `preview:web`
- **`tsconfig.web.json`** include 扩到 `web/**/*.ts(x)`
- **`src/vite-env.d.ts`** 声明 `ImportMetaEnv.VITE_PLATFORM` + `__APP_VERSION__` 全局

#### 5. 自动化规则
- **`.cursor/rules/auto-push.mdc`**（alwaysApply: true）：
  - 完成实质性改动 + type-check 通过后自动 `git add → commit → push`
  - 严禁 `--force` / `--no-verify` / `--amend after push` / 改 git config
  - Commit message 中文 Conventional Commits 风格
  - push 失败时立刻停止，把报错贴回用户，不自动 rebase / force

#### 6. 烟测脚本
- **`scripts/smoke-web.mjs`**：
  - 起 `vite preview --port 5175`
  - HTTP GET 根路径
  - 检查 `id="root"` / `type="module"` / `<title>Wavelet`
  - 全绿才退 0

### 验证

```
npm run type-check               PASS (web + node)
npm run build                    PASS (out/renderer/index.html 4.2 KB + 2.7 MB JS)
npm run build:web                PASS (web/dist/index.html 3.2 KB + 1.25 MB JS, gzip 345 KB)
node scripts/smoke-web.mjs       PASS (HTTP 200 + 三项静态检查)
```

### 决策记录

#### Q: 为什么不真的做"浏览器里也能导出 WebM"？
- MediaRecorder 输出的 WebM 质量比 ffmpeg 差几个量级
- 30 分钟编码不现实（要等浏览器实时跑完）
- 没有 alpha 通道，没有 ProRes
- 与项目"高质量出片"定位冲突 —— 用户拿到的会是劣化版

把"导出"作为桌面版**唯一卖点**，Web 只用于"5 秒看到效果，被吸引就下载"，分发漏斗更清晰。

#### Q: 为什么用一份源码两个 build 而不是 monorepo / 拷贝？
- 95% 代码是共享的（presets / render pipeline / audio / UI）
- monorepo 加 pnpm workspace 给一个文件夹的项目用是 over-engineering
- 拷贝源码 = 噩梦同步
- `capabilities` + `window.api` polyfill 是侵入最小的方案

#### Q: 为什么 web entry 必须先 `attachWebApi()` 再 render？
- preload.cjs 是 Electron 主进程在 BrowserWindow 创建时注入的，window.api 在 renderer 任何代码跑之前就存在
- Web 上没有 preload，必须由 web/main.tsx 主动挂载
- 时序：`import App from '../src/App'` 不会触发 window.api 访问（App 是函数声明，模块 eval 期只是注册 React 组件）
- 真正访问 window.api 是 React mount → useEffect → 那时 attachWebApi 早跑完了

### 主页接入提示
- `wavelet.clearmika.com` 子域需要在 Vercel 项目设置里加 custom domain，并在 DNS 加 CNAME 指向 `cname.vercel-dns.com`
- `apparatus.json` 新增 `demoNote` 字段说明 web 版限制
- 主页 Apparatus 卡片可读 `demoUrl` 渲染"在线试用"按钮，读 `downloads.windows / macos` 渲染下载按钮

### 给后续 AI / 自己的接力提示
- **❗严禁** 把"如果 isElectron 就…否则…"写得满代码都是。用 `capabilities` 开关，且渲染层一律读 `capabilities.x`
- **❗严禁** 在 `src/` 下加任何 `import 'electron'` —— 那样 web build 会爆。Electron 类型只能从 `../electron/preload` 用 `import type` 拿
- web demo 永远不要尝试做"浏览器内 ffmpeg.wasm"；这是产品决策不是技术限制
- 推 main 到 GitHub 后 Vercel 自动部署，**不需要在 GH Actions 里加 Vercel 步骤**（Vercel 自己有 webhook）
- 如果 Vercel build 失败，多半是 `npm install` 阶段缺包；先在本地 `rm -rf node_modules && npm ci && npm run build:web` 复现

---

## 2026-05-12 🏷️ 品牌化 + clearmika.com 主页接入（Phase 1）

### 背景
项目要作为"作品"挂到个人主页 https://clearmika.com 的 **Apparatus** 区。主页直读仓库根目录的 `apparatus.json`，按四语显示卡片 + 下载按钮 + 跳转 demo。同时还要提供 Web demo（精简版）和桌面安装包两条分发路径。

本条记录的是 **Phase 1**：所有桌面版相关的对外配套。Phase 2（Web demo 拆分）留待后续。

### 新增
- **`LICENSE`** —— MIT。copyright 2026 weng20020320-ai
- **`apparatus.json`** —— 主页元数据文件。schema：
  - `id: 'wavelet'`（对外 slug、子域名 `wavelet.clearmika.com`）
  - `version: '0.2.1'`、`tech: [...]`、`platforms: ['desktop', 'web']`
  - `demoUrl`、`sourceUrl`、`downloads.{windows, macos, linux}`
  - `screenshots.{cover, details}`
  - `i18n.{en, zh, ja, ko}` —— en + zh 已写完整，ja + ko 留 TODO 字段等翻译
  - 文案气质参考主页："I study molecules and the silence between them." —— 短句、名词、句号、不用营销腔
- **`.github/workflows/release.yml`** —— 推送 `v*.*.*` tag 自动触发：
  - matrix: `windows-latest` + `macos-latest`
  - 步骤：checkout → setup-node@22 → `npm ci` → `npm run build` → `electron-builder --win` / `--mac --publish never`
  - 产物上传：`actions/upload-artifact@v4`（保留 14 天）+ `softprops/action-gh-release@v2`（发布到 GitHub Release）
  - macOS 用 `CSC_IDENTITY_AUTO_DISCOVERY=false` 防止误抓本机证书做未签名构建
- **`docs/screenshots/README.md`** —— 主页用截图素材的命名规范 + 拍摄建议（深色背景、雾系渐变、隐藏 Tweakpane、用程序自带「快照」按钮抓真实像素）

### 修改

#### 1. 品牌名 Audio Visualizer → Wavelet
对外公开面统一改成 Wavelet，内部 npm `name: 'audio-visualizer'` 保留（npm 包 id 不变避免 lockfile 折腾）。
- `package.json`:
  - `build.appId`: `com.audiovisualizer.app` → `com.clearmika.wavelet`
  - `build.productName`: `Audio Visualizer` → `Wavelet`
  - `build.nsis.shortcutName`: → `Wavelet`
  - `build.nsis.artifactName`: → `wavelet-${version}-win-${arch}-setup.${ext}`
  - `build.portable.artifactName`: → `wavelet-${version}-win-${arch}-portable.${ext}`
- `electron/main.ts` BrowserWindow `title`: → `Wavelet`
- `src/index.html` `<title>` + splash brand text: → `Wavelet` / `WAVELET`
- `src/i18n/locales/{zh-CN,en-US,ja-JP}.ts` `topbar.brand`: → `Wavelet`
- `打包发布.bat` / `サウンド可視化.bat` 的 cmd window title（仍保持 100% ASCII）
- `scripts/{launcher-banner,release-banner}.mjs` 输出文案

#### 2. package.json scripts + build 配置
- 新增 `package:mac` 脚本（`clean:release && electron-vite build && electron-builder --mac`）
- 新增 `build.mac` 配置：
  - target: dmg × { x64, arm64 }
  - category: `public.app-category.music`
  - `hardenedRuntime: false` + `gatekeeperAssess: false` + `identity: null` —— 明确声明未签名
  - `artifactName: wavelet-${version}-mac-${arch}.${ext}`
- 新增 `build.dmg.artifactName` 同步格式

#### 3. README.md 重写
- 顶部 badges：GitHub Release 版本徽章 + MIT License 徽章
- 中英双语完整版（先 English，后 中文）
- 加 Downloads 段落，明确链接到 GitHub Releases
- 加 Tech stack 段落、Adobe workflow notes 表格、Quick start 命令、发布流程说明
- macOS 用户首次启动需要右键 → 打开（Gatekeeper 警告）的提示写在 Downloads 节

### 决策记录

#### Q: 内部 npm name 要不要也改成 wavelet？
不改。`package.json` 里的 `name: 'audio-visualizer'` 是 npm package id，改它会让 `package-lock.json` 大面积重写，且没有任何好处（这个项目不发布到 npm registry）。productName 改了就够了。

#### Q: macOS 要不要签名？
不签名。原因：
- 个人项目，付不起 99 USD/年 Apple Developer Program
- 即使签名了，notarization 流程也很麻烦
- 未签名 DMG 用户首次右键 → 打开就能跑，已经足够清晰
- README + DMG 内会写明这点

如果未来要签，配置入口已经预留：
```json
"hardenedRuntime": false,  → true
"gatekeeperAssess": false, → true
"identity": null           → "Developer ID Application: <Name> (<TeamID>)"
```
然后在 GH Actions 加 `CSC_LINK` + `CSC_KEY_PASSWORD` secrets 即可。

#### Q: 为什么 Phase 2（Web demo）单独拎出来？
Web demo 要做：
- 拆出 `web/` 目录（或独立 vite config）
- 给 `window.api.*` 写浏览器 polyfill（File API 替代对话框，导出按钮跳"下载桌面版"提示，etc.）
- 适配 Vercel 部署，绑 `wavelet.clearmika.com` 子域名
- 测试在浏览器里跑 Three.js + Web Audio + Meyda 不会触雷

这是 ≥ 4-8 小时的改动，且会动到 `src/App.tsx` 里大量 `window.api.*` 调用。Phase 1 完成 + 用户验证当前桌面版能跑后再做 Phase 2，风险更可控。

### 验证
- `node -e "..."` 字节审计两个 .bat：`non-ASCII=0 BOM=false`，与上一版健康基线一致
- 全局 grep `Audio Visualizer | AudioVisualizer | AUDIO VISUALIZER`：剩余命中只在历史 CHANGELOG 文本里（合理保留）
- 等待：`npm run type-check` 通过（下条记录补）

### 给后续 AI / 自己的接力提示
- **❗严禁** 直接改 `apparatus.json` 的 `id` 字段而不同步主页项目 —— 主页那边按这个字段查文件路径
- **❗严禁** 把 `release/*.exe` / `*.dmg` 提交到主分支，安装包只能挂 GitHub Release
- 推 tag 触发 GH Actions 之前先本地 `npm run package:win` 烟测一遍，CI 失败比本地失败贵多了
- macOS DMG 如果想本地烟测 arch=arm64，必须在 Apple Silicon Mac 上跑（CI 的 `macos-latest` 已经是 M1 runner）
- 不要在程序代码里写死 `clearmika.com` 任何 URL —— 程序应该独立可运行
- 如果将来加了 Linux AppImage，记得同步 `package.json build.linux`、GH Actions matrix、`apparatus.json downloads.linux`、README Downloads 节四处

---

## 2026-05-11 🔧 打包发布"问密码 / 闪退" —— PowerShell banner 续作 bug

### 现象
双击 `打包发布.bat`：
1. 第一屏的中文 banner 全是乱码 + `Write-Host '...` 字面量被打到屏幕上
2. 报错 `Input string was not in a correct format. At ...release-banner.ps1:25 char:9`
3. 提示 `Press any key to continue . . .`，按一下 → 出现 `Unknown stage: launch` / `Unknown stage: post`
4. 又一次 `Press any key to continue . . .`，再按一下 → cmd 窗口直接关闭（用户体感"闪退"）
5. **关键：实际的 `npm run package:win` 从来没跑起来**

用户原话：「我想打包发布的时候不让我输入密码，输入一个键就直接闪退了」

### 根因
上次（2026-05-11 同日早些时候）那条"`.bat` 编码 bug"修法里，把中文 banner 抽到了 .ps1 + 加 BOM。
但 BOM 不是万能的：

- **Windows PowerShell 5.x 在日文 Windows 上**，即使文件有 UTF-8 BOM，某些 codepath 下仍会按 CP932 解释字节（具体跟 PS host / `$OutputEncoding` 加载时序有关）
- 一旦中文字符被错读，闭合的 `'` 单引号被吃掉 → 字符串横跨多行 → 后续 `Write-Host` 的命令名变成上一个字符串的一部分 → 终于撞上一个含 `{...}` 的乱码 → `string.Format` 抛 `FormatException`
- `switch` 块解析失败后，连 `'launch'` / `'post'` 这种纯 ASCII 都匹配不上 → 走 default → `Unknown stage: ...`
- 也就是说原本设计的 `Start-Process -Verb RunAs` 那段（弹 UAC 启动管理员窗口跑 npm）**根本没机会执行**，更别说真正的打包

至于"问密码"：原 `.ps1` 里写着「需要管理员权限创建符号链接，会弹出 UAC 提示」。但实测我们当前 `electron-builder` 配置（`perMachine: false` + portable + 无代码签名）**根本不需要管理员权限**，那行注释是历史遗留。

### 修法（彻底放弃 PowerShell banner）
- **删除**：`scripts/release-banner.ps1`、`scripts/launcher-banner.ps1`
- **新增**：`scripts/release-banner.mjs`、`scripts/launcher-banner.mjs`
  - 纯 Node.js，UTF-8 处理零悬念，cmd `chcp 65001` 之后 stdout 中文正常
  - 用 ANSI escape 上颜色（`\x1b[36m` cyan / `\x1b[33m` yellow / `\x1b[32m` green / `\x1b[31m` red）
  - release-banner.mjs 支持 6 种 stage：`pre` / `post` / `fail <exitCode>` / `confirm`（"按任意键开始打包"）/ `bye`（"按任意键关闭本窗口"）/ `banner-fail-warn`
- **改写** `打包发布.bat` —— **必须保持 100% ASCII**：
  - 去掉所有 `powershell -File ...ps1` 调用，改成 `call node "scripts\release-banner.mjs" <stage>`
  - **去掉 `Start-Process -Verb RunAs`** —— 不再弹 UAC，不再拉新窗口
  - `npm run package:win` 在当前 cmd 窗口直接跑，用户能实时看到 clean / build / electron-builder 三阶段的进度
  - 用 `%errorlevel%` 抓 npm 退出码，失败时调 `node scripts/release-banner.mjs fail %BUILD_EXIT%` 给个友好提示再 pause（窗口不会立刻关，看得到错误）
  - **所有面向用户的中文文案（"按任意键开始打包" / "打包失败" / "上方的 npm 输出..."）全部走 .mjs 输出**，.bat 内只留 ASCII 和 REM 注释
- **改写** `サウンド可視化.bat`：同样把 `powershell -File launcher-banner.ps1` 全部换成 `node launcher-banner.mjs`，本来就是 ASCII 状态保持不变

### 复发与再修（同一会话内的 footgun）
第一版改完之后用户双击 `打包发布.bat` 报：「双击以后他让我打开一个 mjs file」。原因是我**自己违反了上一条 CHANGELOG 的"❗严禁在 .bat 写非 ASCII"**：在新 .bat 里加了几行带中文的 `REM` 和 `echo`（"横幅"、"按任意键开始打包"等）。
- CP932 解析后那几行变成乱码 token，cmd 解析串台 → 把 `call node "scripts\release-banner.mjs" pre` 截成只剩 `"scripts\release-banner.mjs"` 当独立命令执行
- Windows shell 看到 `.mjs` 路径 → 没有文件关联 → 弹"你要用什么打开此文件？"对话框
- 同时 Write 工具默认会给新文件加 UTF-8 BOM，让 .bat 头部多了 3 个 `EF BB BF` 字节，cmd 第一行 `chcp 65001 > nul` 直接吃噪声

**再修**：
1. 把 .bat 里所有中文搬进 release-banner.mjs（新增 `confirm` / `bye` / `banner-fail-warn` stage）
2. 用 `node -e "fs.writeFileSync(...)" ` 强制把两个 .bat 的 UTF-8 BOM 剥掉
3. 自动审计脚本（一行 node 命令）核对 `non-ASCII=0` + `BOM=false`，确认与上一条 CHANGELOG 的健康基线一致

### 验证
```
node scripts/release-banner.mjs pre / post / fail 1 / confirm / bye / banner-fail-warn → 全部退出码 0
node scripts/launcher-banner.mjs banner / install-start / install-fail → 全部退出码 0
```
.bat 字节审计（必须与早些时候 CHANGELOG 的健康基线一致）：
```
打包发布.bat        size=1117 non-ASCII=0 BOM=false
サウンド可視化.bat  size=369  non-ASCII=0 BOM=false
```
- node stdout 走 UTF-8，cmd 窗口 chcp 65001 下中文正常
- 现在 `打包发布.bat` 的流程：banner → pause → npm run package:win（在当前窗口）→ 成功 banner / 失败 banner → pause → 窗口关闭。**全程没有任何密码 / UAC 提示**

### 行为变化对照
| 场景 | 之前（.ps1） | 之后（.mjs） |
|---|---|---|
| 第一屏 banner | 乱码 + `Write-Host '...` 字面量 + 报错 | 正常显示中文，3 步流程清单 |
| 打包是否真的开始 | 否（switch 散架，launch stage 没跑到） | 是（同窗口直接跑 npm） |
| UAC / 密码 | 设计上要弹（实际没弹到那一步） | **完全不弹** |
| 打包失败可见性 | 看不到（窗口闪退，新窗口又是另一个进程） | 同窗口能看到 npm 的全部错误 + fail banner + pause |
| 双窗口困扰 | 旧窗口跑 post stage，新窗口才在编译，一团乱 | 单窗口顺序执行 |

### 给后续 AI 的提醒
- **❗严禁**在这个项目里再用 PowerShell 写带中文的脚本。Windows PowerShell 5.x 在日文 Windows 上 BOM 也救不了你。要中文输出一律走 Node.js
- **❗严禁**给 `打包发布.bat` 加 `-Verb RunAs` / 任何 UAC 提升逻辑。当前 electron-builder 配置（`perMachine: false` + portable）真的不需要 admin
- **❗严禁**在 .bat **内容**里写任何非 ASCII 字符（含中文 `REM` 注释、中文 `echo`、中文标点）。文件名是中日文没关系，cmd 解析的是 byte stream 里的内容。一旦 cmd 在某行炸掉、解析串台到含 `.mjs` / `.js` / `.exe` 路径的下一行，会触发 Windows shell 文件关联，弹"用什么打开此文件"对话框
- **❗严禁** .bat 头部带 UTF-8 BOM（`EF BB BF`）。Cursor 的 Write 工具默认会加，写完一定要用 `node -e "const b=fs.readFileSync('xxx.bat');console.log('BOM=',b[0]===0xEF&&b[1]===0xBB&&b[2]===0xBF)"` 核对。要剥 BOM 就 `node -e "const fs=require('fs');let b=fs.readFileSync('xxx.bat');if(b[0]===0xEF)fs.writeFileSync('xxx.bat',b.slice(3))"`
- 如果未来切到 `perMachine: true` 的 NSIS，不要在 .bat 里搞 elevation —— 让 NSIS 安装器自己在用户运行时弹 UAC 即可
- 改动 `.bat` 后**一律跑两件事**：(1) byte-audit 脚本核对 `non-ASCII=0 BOM=false`；(2) `cmd /c <文件名.bat>` 实测到第一个 pause

---

## 2026-05-11 🔧 .bat 文件在日文 Windows 上无法打开的编码 bug

### 现象
`サウンド可視化.bat` 双击报：
```
'蠑蜿第ｨ｡蠑・' は、内部コマンド...として認識されていません。
'..' は、...
'pm' は、...
'ho' は、...
```

### 根因
- `.bat` 文件存为 UTF-8 但**没 BOM**
- 日文 Windows 的 `cmd.exe` 默认按 CP932 (Shift-JIS) 解析文件字节
- 文件里的中文（`开发模式` / `初始化` 等）被当成 CP932 拆成乱码 token
- chcp 65001 在第二行才执行，太迟了 —— 文件读取阶段已经坏掉
- 加 BOM 也救不了：这台 Windows 的 cmd.exe 不识别 .bat 的 UTF-8 BOM

### 修法
**两段式**：
1. 两个 `.bat` 文件改成 **100% ASCII**（`非 ASCII bytes = 0` 实测）
2. 中文输出抽到 `scripts/launcher-banner.ps1` / `scripts/release-banner.ps1`，**带 UTF-8 BOM**
   （Windows PowerShell 5.1 看到 BOM 才知道按 UTF-8 读）
3. `.bat` 用 `powershell -File scripts\xxx.ps1 -Stage <name>` 触发各阶段输出

### 验证（实测）
```
打包发布.bat non-ASCII bytes: 0 BOM: false
サウンド可視化.bat non-ASCII bytes: 0 BOM: false
scripts/launcher-banner.ps1 BOM: true
scripts/release-banner.ps1 BOM: true
```
- `cmd /c サウンド可視化.bat` → 不再有 `'xxx' は、内部コマンド` 错误
- banner 输出字节是正确的 `e5 90 af e5 8a a8 e4 b8 ad`（=「启动中」UTF-8）
- 4 个 stage 全部测过：`banner` / `install-start` / `install-fail` / release `pre`

### 给后续 AI 的提醒
- **❗严禁** 在 `.bat` 文件里写非 ASCII 字符。中文/日文消息一律走 .ps1
- **❗严禁** 让 Cursor 的 Write 工具直接写 .ps1 后不管 BOM —— 它默认加，但你可能改了又不加
- 永远要 `node -e` 实测最终字节，不要相信"我加了 chcp 65001 应该没事"

---

## 2026-05-11 ⚡ 导出彻底修复：MessagePort transferList bug + 一连串容灾

### 故事线
打包 / dev 模式下导出全部卡死，4070 / Ryzen 7000S APU 都中招。  
排错链：以为是 AMF / 日文路径 / GPU 显存 → **真凶是 Electron 42 的 MessagePort bug**。

### 决定性诊断（`scripts/diagnose-ipc/`）
做了 5 个变体的对照实验，5 → 0 帧 vs 5 → 5 帧：

| 变体 | postMessage 写法 | 收到 |
|---|---|---|
| **A** ❌ | `(obj, [pixels.buffer])` ← **业务代码就是这个** | **0/5** event.data=null |
| B ✅ | 不传 transferList，让 Chromium 走 clone | 5/5 |
| C ✅ | 只传基本类型 | 5/5 |
| D ✅ | 传 Uint8Array 不解构 .buffer | 5/5 |
| E ✅ | Buffer.from() 包一层 | 5/5 |

**结论**：Electron 42 / Chromium 的 `MessagePortMain` 在跨进程传输时，
**transferList 含 ArrayBuffer 会让整个 `event.data` 变成 `null`**。
我们的"零拷贝"从来没工作过，反而把所有帧弄丢了，跟 GPU、AMF、ffmpeg、日文路径全无关。

### 修复（按方案 A）

#### 主修：电子 IPC
- `electron/preload.ts`：
  - `ffmpegWriteFrameTransfer` → `ffmpegWriteFrame`，删掉 `[pixels.buffer]` transferList
  - 新格式：`port.postMessage({ frameIndex, pixels })`（Uint8Array 走 structured clone）
  - 旧的同步 `ffmpegWriteFrame` (sync invoke) 删掉，未使用
- `electron/services/ffmpeg-service.ts`：
  - `attachPort` 接收 `data.pixels: Uint8Array`，`Buffer.from(u8.buffer, byteOffset, byteLength)` 共享内存零拷贝
  - 收到 `event.data == null` 时打印明显的"Electron MessagePort 又坏了？"诊断行
- `electron/services/ipc-handlers.ts`：删 `ffmpeg:writeFrame` handler
- `src/render/FrameTransport.ts`：调用名改成 `ffmpegWriteFrame`
- **性能影响**：每帧多 ~8MB structured clone。1080p@30fps = 240 MB/s 内存带宽，DDR5 占用 < 1%

#### Bug 1：PBO `MAX_CLIENT_WAIT_TIMEOUT_WEBGL`
`src/render/PBOReader.ts` 之前传 `1_000_000_000` ns 给 `clientWaitSync`，但 Chromium 把
`MAX_CLIENT_WAIT_TIMEOUT_WEBGL` 硬编码成 0（防 jank）。任何非 0 timeout 都会触发
`INVALID_OPERATION` → `WAIT_FAILED` → 我们误以为 GPU 上下文丢了，每次导出都假性降级。
修法：永远 `timeout=0` 纯 polling，紧凑 100ms 之后放慢到 1ms / 帧；超过 5s 才认定真的卡。
**影响**：PBO 现在真的会工作了，GPU 渲染和 CPU 写盘可并行，强 GPU 上能拿到接近 2× 提速。

#### Bug 2：ffmpeg 进程早退检测
`electron/services/ffmpeg-service.ts` `proc.on('close')` 增强：
- 滚动缓存最近 40 行 stderr
- 死亡时若 `framesWritten === 0` → 判定为"首帧前早退"，错误信息附上 stderr tail + 日志路径
- 通过 port 发送 `{type: 'error'}` 唤醒 FrameTransport 的等待者（避免 renderer 永久卡）
- `proc.on('error')`（spawn 失败）也同样唤醒 + reject
- `proc.stdin.on('error')` 也写到 recentStderr，便于诊断

#### Bug 3：ffmpeg 日志落盘
开 session 时写 `app.getPath('userData')/exports/<ISO时间>_<sid8>.log`：
- 第一行：完整 ffmpeg 命令行（含路径 + 全部参数）
- 中段：所有 stderr 实时追加（包括 ffmpeg 的 `frame=...` 进度）
- 关 session 时尾部：`closed code=N framesWritten=M elapsed=Xs`

打包版下用户看不到 console，但**永远能从这个 log 文件知道导出失败的真正原因**。

#### 性能：帧 buffer 池化
`src/render/OfflineRenderer.ts`：
- 之前每帧 `new Uint8Array(8MB)`，30fps = 240 MB/s 分配 → 老 GPU 上 V8 STW 几十 ms
- 改成 LIFO 池（`acquireBuffer` / `releaseBuffer`），稳态只有 4-8 个 buffer 复用
- Fix A 之后 postMessage 是同步 clone，`await transport.send` 后立即 release 100% 安全

### 验证
- `scripts/diagnose-ipc/main.cjs` (5 变体对照)：A 0/5 → 修复后 D 写法 5/5 + ack 全到
- `scripts/diagnose-ipc/main.cjs` (90 帧压力)：90/90 ack 100% 回环
- `scripts/diagnose-ipc/e2e-main.cjs`：
  - happy path：30 帧 → mp4 落盘成功 2308 字节
  - early-exit：故意给坏音频路径 → 错误信息含 stderr + 日志文件正确写入
- `npm run type-check`：web + node 双 PASS
- `scripts/diagnose-export.mjs`：4 组 ffmpeg 参数变体 + stdin pipe 全部 < 1s 跑完

### 行为变化
| 场景 | 之前 | 之后 |
|---|---|---|
| 导出（任何机器） | 卡 0% / 在途 8 永不下降 | 真的开始编码 |
| ffmpeg early-exit | renderer 永远转圈 | 立刻报错 + 显示 stderr + 日志路径 |
| 打包版导出失败 | 完全无提示 | userData/exports/ 下有完整日志 |
| 强 GPU 上 PBO | 永远假性降级到 sync | 真异步并行 |
| 帧分配 | 240 MB/s `new Uint8Array(8MB)` | 池化复用，~0 GC |

### 已知遗留
- [ ] AMF / NVENC 硬件编码器仍可能因驱动问题在初始化阶段慢/卡，但现在会在 5s 后通过 stderr 暴露
- [ ] PBO 修好后预计会触发新的"composer.pixelRatio = 1 已修但 PBO target 大小"问题，需要观察
- [ ] 没有把 sync invoke fallback 留下，将来 Electron 又改坏 MessagePort 时只能等修

### 接力提示（vibe-coding 给后续 AI）
- **❗严禁** 在 `port.postMessage` 给 ArrayBuffer 加 transferList。如果你这么写了，请先跑 `scripts/diagnose-ipc/main.cjs` 确认你那版 Electron 修了这个 bug 没
- **❗严禁** 给 `clientWaitSync` 传非 0 timeout，Chromium WebGL 永远会拒绝
- 排查导出问题先看 `app.getPath('userData')/exports/*.log` 不是 console
- 诊断脚本（`scripts/diagnose-ipc/`、`scripts/diagnose-export.mjs`）保留作为回归测试
- 升级 Electron 后先把 `scripts/diagnose-ipc/main-variants.cjs` 跑一遍确认 transferList bug 修没修，修了就可以把 Fix A 改回零拷贝 transfer

---

## 2026-05-11（导出稳定性大修：composer pixelRatio bug + GPU 自适应 + PBO 降级）

### 背景
本机（Ryzen 7000S APU，Radeon 780M）导出 1080p 视频时报
`clientWaitSync 阻塞等待失败` → 整个导出崩溃。
4070 那台没事；区别在于本机 GPU 弱、共享系统内存当 VRAM。

### 根因（5 颗钉子叠加）
1. 高 DPI 屏 → renderer.pixelRatio = 2
2. PostFXChain 构造时抓住这个 2 → composer 永久 pixelRatio = 2
3. **OfflineRenderer 只重置了 `renderer.setPixelRatio(1)`，没动 composer**
4. 导致导 1080p 实际画 4K HalfFloat（4× 显存 + 带宽）
5. 加 MSAA resolve + PBO + fenceSync + DevTools 抢 GPU → 驱动 reset → fence 全失效

### 新增

#### 1. PBO 自动降级（保命补丁）
- `src/render/PBOReader.ts`：新增 `PBOContextLostError` / `PBOFenceFailedError` 错误类
- `kickRead` / `readSlot` / `waitFence` 内部加 `gl.isContextLost()` 检查
- `src/render/OfflineRenderer.ts`：`fallbackToSync(failedStep, reason)` 函数：PBO 报错时拆掉 PBO、切同步路径、**重渲染管道里飞着的 2 帧**避免丢帧
- `src/render/ThreeContext.ts`：canvas 加 `webglcontextlost` / `webglcontextrestored` 监听 + 诊断日志，并暴露 `onContextLost` / `onContextRestored` 订阅 API

#### 2. composer pixelRatio bug 修复（治本）
- `src/render/PostFXChain.ts`：新增 `setPixelRatio(r)` 和 `getPixelRatio()` 方法
- `src/render/OfflineRenderer.ts`：导出开始前 `postFX.setPixelRatio(pipeline.composerPixelRatio)`，finally 里恢复
- 影响：导出 1080p 不再画 4K HalfFloat，**所有 GPU 立省 75% bloom 链显存**

#### 3. GPU 自动检测
- `src/render/GpuTier.ts`（新文件）：基于 `WEBGL_debug_renderer_info` 把 GPU 分成 `high / medium / low / lowest / unknown` 五档
  - `high`：RTX 30/40/50, RX 6000+, Arc A7xx, Apple M2 Pro+
  - `low`：iGPU（780M / Iris Xe / UHD）, MX, GT, M1 base
  - `lowest`：SwiftShader / 软件渲染
- `detectGpu(gl)` 入口，`classify(vendor, renderer)` 是纯函数（可测）
- 输出 `GpuInfo { tier, vendor, renderer, label, isSoftware }`

#### 4. 画质档（导出执行路径选择）
- `src/render/OfflineRenderer.ts`：新增 `QualityProfile = 'auto' | 'fast' | 'balanced' | 'ultra'`
- 新增 `resolvePipelineConfig(profile, tier) → PipelineConfig`：
  - `fast`: PBO 禁用 + composer 1× —— 兼容性最好
  - `balanced`: PBO 2 槽 + composer 1×
  - `ultra`: PBO 3 槽 + composer 1×
  - `auto`: 按 `gpuTier` 推断（high→ultra, low/lowest→fast, 其他→balanced）
- `OfflineRenderOptions` 新增 `qualityProfile?` / `gpuTier?` / `postFX?` 字段

#### 5. ExportDialog 画质档 UI
- `src/ui/ExportDialog.tsx`：新增「画质档」按钮组（自动 / 极速 / 平衡 / 极致）
- 显示「检测到的 GPU」+「实际路径」实时反馈
- `ExportSettings` 新增 `qualityProfile: QualityProfile` 字段

#### 6. zustand store 加 GPU 信息
- `src/store/app-store.ts`：新增 `gpuInfo: GpuInfo | null` + `setGpuInfo`
- App.tsx 启动时一次性探测并写入

### 行为变化对照

| 场景 | 之前 | 之后 |
|------|------|------|
| 1080p 导出（高 DPI 屏） | 内部画 4K HalfFloat | 内部画 1080p |
| PBO `WAIT_FAILED` | 整个导出崩溃 | 自动降级 sync readPixels，导出继续 |
| WebGL 上下文丢失 | 无任何提示，导出卡死 | 控制台报警 + 触发降级 |
| 弱 GPU 默认行为 | 用 PBO 3 槽 | 自动选「极速」，禁用 PBO |
| 强 GPU 默认行为 | 用 PBO 3 槽 | 自动选「极致」，PBO 3 槽 |

### 已知遗留
- [ ] 装机版（packaged）的 console 输出还是看不到，得 `Ctrl+Shift+I` 才能看错误。建议加日志文件到 `app.getPath('userData')/app.log`
- [ ] HalfFloat / MSAA 的"重质量妥协"开关还没做（用户当前不需要）
- [ ] 启动期 micro-benchmark 没做（A 方案够用了）

### 接力提示
- **不要再硬编码 PBO 槽数 = 3**，要走 `resolvePipelineConfig`
- **不要再 `composer.setSize()` 不调 `setPixelRatio()`**：高 DPI 屏会 4× 开销
- 默认导出档位是 'auto' —— 用户大部分时候不需要手动选，正确性靠 `detectGpu` + `resolvePipelineConfig` 保证
- 想新增"重质量妥协"档时，扩展 `QualityProfile` 联合类型 + `resolvePipelineConfig` 分支即可

---

## 2026-05-08（视频化预设 + 渐变系统 + 曝光控制 + 自动清理）

### 新增

#### 1. 渐变色系统（核心基础设施）
- **`src/visuals/GradientPresets.ts`**：定义 `GradientStop` / `GradientValue` / `GradientPresetMeta`，附带 30 个精选渐变（雾系 / 霓虹 / 极光海洋 / 暖色 / 单色 / 彩虹），以及工具函数
  - `sampleGradient(g, t, out?)` —— t∈[0,1] 在 stops 之间插值
  - `gradientToCss(g)` —— 渲染成 `linear-gradient(...)` 给 UI 预览
  - `defaultGradient()` —— 默认 `midnight-violet`
  - `gradientFromPreset(id, rotation)`
- **`src/ui/GradientPicker.tsx`**：自定义 React 控件，分组卡片选预设 + 「高级」模式可手动调起止/中间色 / 旋转角度
- **`src/visuals/ParamSchema.ts`**：`ParamDef` 联合类型新增 `type: 'gradient'` 分支
- **`src/ui/ParameterPanel.tsx`**：把 schema 拆成 Tweakpane 能处理的标量 + gradient 自定义控件两条路径

#### 2. 视频向预设（4 个，参考 Specterr / Kapwing / Clipchamp）
- `src/visuals/presets/radial-spectrum.ts` —— **圆环频谱**（柱子绕圆周径向辐射）
- `src/visuals/presets/circle-burst.ts` —— **节拍冲击环**（每个 beat 触发外扩光环）
- `src/visuals/presets/area-spectrum.ts` —— **填充频谱区域**（lofi/podcast 风的发光多边形）
- `src/visuals/presets/wave-line.ts` —— **流光波形线**（适合歌词视频的厚波形）
- **`src/visuals/PresetRegistry.ts`**：注册以上 4 个，并把现有列表分组成「频谱 / 粒子 / 着色器」

#### 3. 曝光 / 发光控制（解决"过曝"和"半曝光"违和感）
- **`src/visuals/ExposureUtils.ts`**（新文件）：导出 `EXPOSURE_SCHEMA` 和 `applyExposure(gradient, energy, params, out, offset)`，把 4 个新参数封装成可复用工具
  - `exposure` (float, 默认 0.85) —— 整体亮度倍率
  - `glowFloor` (float, 默认 0.5) —— 低能量柱子最低亮度地板
  - `glowBias` (float, 默认 0.15) —— 加性偏置，把整条频谱抬到 bloom threshold 之上
  - `softClip` (select, 默认"柔和") —— `linear` / `soft`（>0.8 软膝）/ `film`（ACES filmic）
- 已接入 `spectrum-bars` 和 `radial-spectrum` 两个预设，schema 用 `...EXPOSURE_SCHEMA` 展开
- **未接入**：`area-spectrum` / `wave-line`（它们走的是 BufferGeometry + vertexColors 路径，需要单独适配——TODO）

### 修复

#### 1. 「柱体不变色」严重 bug
- **症状**：spectrum-bars / radial-spectrum 改用 ShapeGeometry / PlaneGeometry 后，所有柱子变黑
- **原因**：`MeshBasicMaterial({ vertexColors: true })` 触发 shader 的 `USE_COLOR` 分支，里面有 `vColor.rgb *= color`；这两个几何体没有 `color` BufferAttribute，WebGL 给 `color` attribute 默认值 `(0,0,0,0)` → 所有像素被乘 0。后续的 `instanceColor` 也救不回来
- **修复**：用 `InstancedMesh` 时**只**靠 `instanceColor` 上色，材质上的 `vertexColors` 必须**关掉**
- 文件：`src/visuals/presets/spectrum-bars.ts`、`src/visuals/presets/radial-spectrum.ts`

#### 2. 「ParameterPanel 整片空白」
- **症状**：换预设或 store 还没 hydrate 时，Tweakpane 一个控件都不显示，控制台一长串 `addBinding 失败 value=undefined`
- **原因**：Tweakpane v4 的 `addBinding(target, key, opts)` 在 `target[key] === undefined` 时直接抛错，一个失败整个 Pane 就崩
- **修复**：在 `src/ui/ParameterPanel.tsx` 里新增 `isCompatibleValue(def, v)` 守卫，绑定前用 schema `default` 兜底缺失/类型不匹配的键

#### 3. TS 严格模式 lint
- `src/visuals/GradientPresets.ts` 的 `?? null ?? undefined` → `?.id`（TS2871: 表达式始终为 nullish）

### 工程

#### 1. 自动清理打包产物
- **`scripts/clean-release.mjs`**（新文件）：
  - 读 `package.json` 的 `version`，删 `release/` 里非当前版本的 `.exe` / `.blockmap`
  - 始终清理元数据（`*.yml`、`builder-debug.*`）
  - 始终清理中间目录（`win-unpacked/`），但**保留 `release/.cache/`**（electron 二进制下载，~80MB）
  - 顺手清空 `out/` 和 `node_modules/.vite/`，防止 stale 缓存进打包
- **`package.json` 改动**：新增 `"clean:release": "node scripts/clean-release.mjs"`，`package:win` 改为 `npm run clean:release && electron-vite build && electron-builder --win`
- **`打包发布.bat`**：提示文案更新，体现新增的自动清理步骤
- 副作用：第一次打包会触发 `release/.cache/` 重新下载（80MB 一次性代价）

#### 2. 日志/错误增强
- `src/App.tsx`：
  - `window.addEventListener('error')` 提取 `Error.message` / `stack`，避免 React 的 `[object Object]`
  - `reinitPreset` 先把 `preview.preset = null` 再 dispose，避免 rAF 循环撞上正在销毁的对象；包了 try-catch + `setErrorMsg`

### 已知遗留 / TODO

- [ ] `area-spectrum` / `wave-line` 还没接 `applyExposure`（它们 vertexColors 路径不一样）。如果体验到过曝，需要把 BufferGeometry 的 `color` 写入逻辑替换成"采样渐变 → 调用 applyExposure"
- [ ] 旧 JSON 预设导入时不会自动通知 Tweakpane 刷新（`useEffect` deps 是 `[presetId, paneEntries]`，不依赖 values）。低优先级
- [ ] `GradientPicker` 的「高级」模式只能调起/止/单个中间色，不支持任意数量 stops 的可视化拖拽
- [ ] 没做版本号比较（如果未来想保留"上一个版本"做对比，需要给 `clean-release.mjs` 加 semver 比较）

---

## 历史里程碑（早于 2026-05-08）

> 这部分根据现有代码状态回推，主要给 AI 一个"项目这一路怎么过来的"印象，不是逐次提交记录。

### 阶段 1：MVP 双时间源
- Electron + Vite + React 项目骨架
- `AudioEngine`（播放）/ `RealtimeFeatureExtractor`（实时特征）/ `OfflineAnalyzer` + `FeatureTimeline`（离线整轨预分析）
- `ThreeContext` 共享、`PreviewRenderer`（rAF）/ `OfflineRenderer`（逐帧）双管线
- 3 个示例预设：`spectrum-bars` / `particles-burst` / `shader-flow`
- 三种导出格式：MP4 (H.264) / ProRes 4444 / PNG 序列；自动 mux 音频；时间范围裁剪

### 阶段 2：性能加速
- **PBO 异步 readPixels**（`src/render/PBOReader.ts`）：WebGL2 `PIXEL_PACK_BUFFER` + `fenceSync`，把同步阻塞的 `readPixels` 改成异步
- **零拷贝 IPC**（`src/render/FrameTransport.ts`）：`MessagePort` + `transferList` 把 `Uint8Array` 所有权转给主进程，避免 Buffer.from 拷贝；带背压
- **GPU 硬件编码**：探测 `h264_nvenc` / `h264_qsv` / `h264_amf`，可选启用
- ffmpeg 用 `-vf vflip` 替代 CPU 翻转

### 阶段 3：视觉升级
- **PostFX 链**（`src/render/PostFXChain.ts`）：基于 `EffectComposer`，含 UnrealBloomPass + 自写 Chromatic / 扫描线 / Glitch
  - HalfFloat 渲染目标，bloom 高光保留 HDR
- **ShaderToy 包装器**（`src/visuals/ShaderPresetFactory.ts`）：把 GLSL 片段着色器一键包装成 VisualPreset，5 个示例（虫洞 / Plasma / Neon Grid / 液态金属 / 万花筒）
- **GPU 粒子**（`src/visuals/presets/gpu-particles.ts`）：百万级 InstancedBufferAttribute 粒子场

### 阶段 4：发布工程
- `electron-builder` NSIS 安装包 + Portable .exe
- `サウンド可視化.bat` 启动开发，`打包发布.bat` 一键打包（带 UAC 弹窗）

### 阶段 5：本次（2026-05-08）—— 视频实用化
- 渐变系统、4 个视频向预设、曝光控制、打包自动清理（见上文 2026-05-08 条目）

---

## 项目结构速查（current）

```
audio-visualizer/
├── electron/                       # 主进程 / preload / IPC / ffmpeg
│   ├── main.ts
│   ├── preload.ts
│   └── services/
│       ├── ipc-handlers.ts
│       ├── file-service.ts
│       ├── ffmpeg-service.ts
│       ├── ffmpeg-args.ts
│       └── ffmpeg-locator.ts
├── scripts/
│   └── clean-release.mjs           # ← 新增：打包前自动清理
├── src/
│   ├── audio/                      # 音频管线（实时 + 离线）
│   │   ├── AudioEngine.ts
│   │   ├── RealtimeFeatureExtractor.ts
│   │   ├── OfflineAnalyzer.ts
│   │   ├── FeatureTimeline.ts
│   │   └── types.ts
│   ├── visuals/
│   │   ├── VisualPreset.ts
│   │   ├── ParamSchema.ts          # 含 'gradient' 类型分支
│   │   ├── PresetRegistry.ts
│   │   ├── GradientPresets.ts      # ← 新：渐变库 + 工具
│   │   ├── ExposureUtils.ts        # ← 新：曝光控制
│   │   ├── ShaderPresetFactory.ts
│   │   └── presets/
│   │       ├── spectrum-bars.ts        # 镜像频谱条（含 gradient + exposure）
│   │       ├── radial-spectrum.ts      # ← 新：圆环频谱（含 gradient + exposure）
│   │       ├── area-spectrum.ts        # ← 新：填充频谱区域（gradient，未接 exposure）
│   │       ├── wave-line.ts            # ← 新：流光波形线（gradient，未接 exposure）
│   │       ├── circle-burst.ts         # ← 新：节拍冲击环
│   │       ├── particles-burst.ts
│   │       ├── gpu-particles.ts
│   │       ├── shader-flow.ts
│   │       └── shadertoy-presets.ts
│   ├── render/
│   │   ├── ThreeContext.ts
│   │   ├── PreviewRenderer.ts
│   │   ├── OfflineRenderer.ts
│   │   ├── PostFXChain.ts          # Bloom + Chromatic + Glitch
│   │   ├── PBOReader.ts            # 异步 readPixels
│   │   └── FrameTransport.ts       # 零拷贝 IPC
│   ├── store/app-store.ts          # zustand
│   ├── ui/
│   │   ├── ParameterPanel.tsx      # ← 改：分流 gradient + Tweakpane
│   │   ├── GradientPicker.tsx      # ← 新
│   │   ├── PresetSelector.tsx
│   │   ├── BackgroundPicker.tsx
│   │   ├── PresetIO.tsx
│   │   ├── WaveformBar.tsx
│   │   ├── ExportDialog.tsx
│   │   └── ExportProgress.tsx
│   ├── App.tsx                     # ← 改：错误日志加强 / reinitPreset 防竞态
│   ├── main.tsx                    # （已移除 React.StrictMode，因为和 ScriptProcessorNode 双挂载冲突）
│   ├── index.html
│   ├── index.css                   # ← 改：新增 .gradient-picker 样式
│   └── types.ts
├── electron.vite.config.ts
├── tsconfig.json (+ tsconfig.web/node.json)
├── package.json                    # ← 改：clean:release / package:win 改链
├── README.md
├── CHANGELOG.md                    # ← 新：本文件
├── サウンド可視化.bat               # 启动 dev
└── 打包发布.bat                    # 一键打包（自动清理）
```

## 换机器接力时的检查清单

1. `git clone` 后跑 `npm install`
2. **第一次跑**：`npx electron --version`（如失败，跑 `node node_modules/electron/install.js`）
3. 检查 `node` 版本 ≥ 22.12 或 ≥ 20.19（Vite 7 / electron-vite 5 要求）
4. 双击 `サウンド可視化.bat` 烟测：能加载音频 + 切换预设 + 调参数面板 = 健康
5. 想看历史决策细节：本文件 + `README.md`（README 比较简洁，本文件偏开发流水）
6. 打包前不用手动清 release，`npm run package:win` 会自动清

## 给 AI 助手的接力提示

- 项目用 **vibe-coding 节奏**：用户偏好简体中文回复 + 偶尔的方言/口语化措辞
- **不要主动建 README / 文档**，除非用户明确要求；本 CHANGELOG 是用户主动要求建的例外
- 改动前先 `Read` 相关文件、用 `tsc -p tsconfig.web.json --noEmit` 类型检查、必要时用 `ReadLints`
- **一定不要**重新打开 `vertexColors: true`（见上文 bug 1）
- **一定不要**重新加 `React.StrictMode`（会双挂载，破坏 ScriptProcessorNode / Three 上下文 / Meyda）
- 渐变 schema 的扩展模式：`...EXPOSURE_SCHEMA` 之类用展开运算符，不要复制粘贴
- `Pane.addBinding` 失败排查首选：是不是 `target[key]` 为 `undefined`（参考 ParameterPanel.tsx 的 `isCompatibleValue` 兜底）
