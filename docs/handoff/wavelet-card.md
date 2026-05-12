# Apparatus 接入需求 · Wavelet

> 这份文档给 **clearmika.com 主页项目的 Cursor agent**。
> 目标：在主页 Apparatus 区添加一张 Wavelet 卡片。
> 风格保持主页一贯气质 —— 安静、克制、不要营销腔。

---

## 1. 是什么

Wavelet 是一个音频可视化桌面应用。功能上同一份预设代码同时驱动两条管线：实时 60 fps 预览 + 离线任意分辨率渲染（MP4 / ProRes 4444 / PNG 序列）。

- **桌面版**：Electron 42 + React 19 + Three.js，ffmpeg-static 编码，Windows / macOS 双平台
- **Web demo**：精简版，浏览器里只能预览试玩，导出按钮跳"下载桌面版"
- 主页这边需要把它当作 "instrument 002" 挂上 Apparatus 区

---

## 2. 数据源

| 内容 | 位置 |
|---|---|
| 源代码仓库 | https://github.com/weng20020320-ai/Soundanimetion |
| apparatus.json（卡片元数据，**单一事实源**） | https://raw.githubusercontent.com/weng20020320-ai/Soundanimetion/main/apparatus.json |
| **卡片封面组件**（**取代静态截图**） | `docs/handoff/wavelet-cover.tsx` —— 一段 ~2.5 KB 的 SVG 同心圆脉冲动画 |
| 封面动画视觉预览（黑底，浏览器双击即看） | `docs/handoff/wavelet-cover-preview.html` |
| 桌面安装包 | GitHub Releases（**第一个 tag 还没推**，下面"已知遗留"会说） |
| Web demo | https://wavelet.clearmika.com（**DNS 待配置**） |

**重要**：所有展示内容请从 `apparatus.json` 读取，**不要在主页代码里硬编码** Wavelet 相关字段（除了卡片骨架本身）。这样以后改一行 JSON 就能改卡片。

---

## 3. apparatus.json 当前内容

完整 schema 见仓库根目录 `apparatus.json`。这里只贴**字段说明**和**新写好的 ja / ko 翻译**（apparatus.json 已同步）：

```json
{
  "id": "wavelet",
  "version": "0.2.1",
  "tech": ["Electron", "TypeScript", "React", "Three.js", "Web Audio API", "ffmpeg"],
  "platforms": ["desktop", "web"],
  "demoUrl": "https://wavelet.clearmika.com",
  "demoNote": "Web demo is preview-only. Video export is desktop-only.",
  "sourceUrl": "https://github.com/weng20020320-ai/Soundanimetion",
  "downloads": {
    "windows": "https://github.com/weng20020320-ai/Soundanimetion/releases/latest/download/wavelet-win-x64-setup.exe",
    "macos": "https://github.com/weng20020320-ai/Soundanimetion/releases/latest/download/wavelet-mac-arm64.dmg",
    "linux": null
  },
  "screenshots": {
    "cover": null,
    "details": []
  },
  "coverComponent": {
    "path": "docs/handoff/wavelet-cover.tsx",
    "exportName": "WaveletCover",
    "preview": "docs/handoff/wavelet-cover-preview.html",
    "note": "Wavelet 是动态的；卡片封面用一段 ~2.5 KB 的 SVG 同心圆脉冲动画替代静态截图。复制 .tsx 到主页项目（建议 components/apparatus-covers/）后 import 默认导出。无运行时依赖（只用 React useEffect/useRef）。默认色 #9aa3b8，可通过 `color` prop 或父级 CSS `color` 覆盖。"
  },
  "i18n": {
    "en": { /* title, meta, description, overview, tags */ },
    "zh": { /* 同上 */ },
    "ja": { /* 同上 */ },
    "ko": { /* 同上 */ }
  }
}
```

### 四语文案（最终版）

#### English

```json
{
  "title": "Wavelet",
  "meta": "instrument 002 · desktop + web · 2026",
  "description": "A desktop tool that turns audio into a moving image.",
  "overview": "Two pipelines share the same preset code. A real-time pipeline runs at 60 fps for preview; an offline pipeline reads the full track, indexes features per frame, and renders any resolution to MP4, ProRes 4444, or a PNG sequence. The web demo is preview-only — for export, install the desktop build.",
  "tags": ["audio", "visualization", "rendering", "three.js"]
}
```

#### 简体中文

```json
{
  "title": "Wavelet",
  "meta": "instrument 002 · desktop + web · 2026",
  "description": "把音频变成会动的画面的桌面工具。",
  "overview": "两条管线共用同一套预设代码。实时管线以 60 fps 驱动预览；离线管线读取整段音频，逐帧索引特征，把任意分辨率渲染成 MP4、ProRes 4444 或 PNG 序列。网页版只用于预览试玩，导出需要安装桌面版。",
  "tags": ["音频", "可视化", "渲染", "three.js"]
}
```

#### 日本語

```json
{
  "title": "Wavelet",
  "meta": "instrument 002 · desktop + web · 2026",
  "description": "音声を映像に変えるデスクトップツール。",
  "overview": "二つのパイプラインが同じプリセットコードを共有する。リアルタイム側は 60 fps でプレビューを描き、オフライン側はトラック全体を読み、フレーム単位で特徴を索引し、任意の解像度で MP4・ProRes 4444・PNG 連番として書き出す。Web 版はプレビュー専用。書き出しはデスクトップ版が必要。",
  "tags": ["音声", "可視化", "レンダリング", "three.js"]
}
```

#### 한국어

```json
{
  "title": "Wavelet",
  "meta": "instrument 002 · desktop + web · 2026",
  "description": "소리를 움직이는 이미지로 바꾸는 데스크톱 도구.",
  "overview": "두 파이프라인이 같은 프리셋 코드를 공유한다. 실시간 파이프라인은 60 fps로 미리보기를 그리고, 오프라인 파이프라인은 트랙 전체를 읽어 프레임 단위로 특징을 색인한 뒤 임의 해상도로 MP4, ProRes 4444, PNG 시퀀스로 렌더링한다. 웹 데모는 미리보기 전용. 내보내기는 데스크톱 버전이 필요하다.",
  "tags": ["소리", "시각화", "렌더링", "three.js"]
}
```

---

## 4. 你需要做的事

### 4.1 把 apparatus.json 接进主页项目

两种方式，选你觉得更顺的：

- **方式 A（推荐）**：在主页项目里**复制一份** `apparatus.json` 到本地 `data/apparatus/wavelet.json`。每次 Soundanimetion 仓库的 apparatus.json 更新时，用 GitHub Actions / 手动 sync 把它拉下来。优点：build-time 静态，无 runtime 抓取，主页性能不受影响。
- **方式 B**：build 时 fetch GitHub raw URL，写入 props。每次主页重 build 时是最新的。优点：不用 sync。缺点：build 阶段多一次网络请求。

> 主页气质追求"快、安静、零依赖"，**方式 A 更合适**。

### 4.2 渲染 Apparatus 卡片

按主页现有的 Apparatus 卡片样式，渲染 Wavelet 这张。需要支持的字段：

| 字段 | 用途 |
|---|---|
| `i18n.<locale>.title` | 卡片标题 |
| `i18n.<locale>.meta` | 标题下的小字 metadata 行 |
| `i18n.<locale>.description` | 卡片正面那行简介（≤ 60 chars 已确认） |
| `i18n.<locale>.overview` | 详情弹窗 / Modal 里的长描述 |
| `i18n.<locale>.tags` | 标签 chips |
| `tech` | 技术栈标签（不本地化，原样显示） |
| `version` | 版本号徽章（可选） |
| `coverComponent` | **取代 screenshots**：渲染一段 live SVG 动画当卡片封面，详见下面 §4.2.1 |
| `screenshots.cover` | **已废弃，固定为 `null`**。Wavelet 用动态封面，不再提供静态截图。 |
| `screenshots.details[]` | **已废弃，固定为 `[]`**。详情弹窗只显示文字 + Try online 大按钮。 |
| `demoUrl` | "在线试用"按钮 |
| `sourceUrl` | "源码"按钮（跳 GitHub） |
| `downloads.windows` | "下载 Windows"按钮 |
| `downloads.macos` | "下载 macOS"按钮 |
| `downloads.linux` | **当前为 `null`**，按钮不渲染 |
| `demoNote` | demo URL 下方的小字提示（可选） |

### 4.2.1 卡片封面：用动画组件而不是静态截图

**Wavelet 不再交付 PNG 截图**。理由：

1. Wavelet 的核心价值是"会动"——静态截图不能表达节拍同步、波形流动；
2. 动画组件比 PNG 还小（~2.5 KB vs ~30 KB after 优化），首屏更快；
3. 主页"安静的科学笔记本"气质刚好适合一段克制的活物，而不是冷冻的画面；
4. UI 改了不用重截图，参数即可。

#### 文件位置

- 组件源码：`docs/handoff/wavelet-cover.tsx`（这就是要复制到主页项目的文件）
- 视觉预览：`docs/handoff/wavelet-cover-preview.html`（**双击在浏览器打开就能看效果**，黑底）

#### 集成步骤

1. **复制** `docs/handoff/wavelet-cover.tsx` 到主页项目，建议路径：

   ```
   components/apparatus-covers/wavelet-cover.tsx
   ```

2. 在 Wavelet 卡片组件里 `import`：

   ```tsx
   import { WaveletCover } from '@/components/apparatus-covers/wavelet-cover';
   ```

3. 替换原来 `<img src={cover} />` 的位置：

   ```tsx
   // 之前
   <img src={apparatus.screenshots.cover} alt={apparatus.i18n[locale].title} />

   // 现在
   <WaveletCover />
   ```

4. 想换色：传 `color` prop，或者让父容器 `color: <颜色>` 让组件继承（用了 `currentColor`）：

   ```tsx
   <WaveletCover color="#9aa3b8" />   // 显式
   <div style={{ color: '#9aa3b8' }}><WaveletCover /></div>  // 继承
   ```

#### 组件保证（无需主页 agent 操心）

- ✅ 纯 SVG + Web Animations API，**无运行时依赖**（除 React useEffect / useRef）
- ✅ **`prefers-reduced-motion`** 命中时退化成静态四环（不动）
- ✅ **`IntersectionObserver`** 滚出视口自动 pause，省电
- ✅ `aria-hidden="true"`，对屏幕阅读器透明
- ✅ 兼容 React 17+ / Next.js 12+，Safari 14+ / Chrome 90+ / Firefox 90+
- ✅ 总大小 ~2.5 KB（min+gzip）
- ✅ 无任何 random / Date.now()，**不会 hydration mismatch**

#### 默认色 vs 主页主题色

主页是黑色主题。组件默认 `#9aa3b8`（雾灰蓝），在黑底下读得清且不抢戏。

如果用户后续想统一改色（用户主页主色调一致），改一行：

```tsx
<WaveletCover color="#7c6bff" />
```

预览页 `wavelet-cover-preview.html` 已经放了 4 组色样（雾灰蓝 / 极光紫 / 青绿 / 近白），用户可以直接看选哪个。

### 4.3 容错

下面这些情况现在**就是真实状态**，需要 graceful 处理：

| 情况 | 处理 |
|---|---|
| `screenshots.cover` 是 `null`（**当前固定状态**） | 不要尝试渲染 `<img>`，直接用 `<WaveletCover />` 组件作为封面 |
| `screenshots.details` 是 `[]`（**当前固定状态**） | 详情弹窗不显示图 gallery；用 description / overview 文字 + Try online 大按钮代替 |
| `demoUrl` 返回 DNS 解析失败 / 404 | "在线试用"按钮仍渲染，让用户自己点进去看，**不要预先 probe**（probe 慢且不稳定） |
| `downloads.windows / macos` 跳到 404 GitHub Release | 同上，按钮渲染，让 GitHub 自己显示"还没有 release"页（第一个 tag 一打就好了） |

### 4.4 语言切换

主页支持 zh / en / ja / ko 四语。切换时 Wavelet 卡片的 `title` / `meta` / `description` / `overview` / `tags` 全部跟着切。`tech` 数组**不翻译**（技术栈名是国际化通用）。

---

## 5. 子域名部署（一次性，可能需要用户在 Vercel 控制台手动做）

Wavelet 的 Web demo 部署到**独立的 Vercel 项目**（不是主页项目），子域名是 `wavelet.clearmika.com`。

主页 Cursor 这边**不需要做这部分**，但你应该知道：

1. 用户会在 Vercel UI 里 Import `weng20020320-ai/Soundanimetion` 仓库
2. Vercel 会自动读 `vercel.json`（`buildCommand: npm run build:web`、`outputDirectory: web/dist`）
3. Project Settings → Domains → Add `wavelet.clearmika.com`
4. Vercel 给一条 CNAME，加到 `clearmika.com` 的 DNS（一般是 `cname.vercel-dns.com`）

如果你（主页 Cursor）有权限管 DNS / Vercel，可以代劳；如果没有，就在最终回复里**提醒用户**做这一步。

---

## 6. 视觉 / 文案风格再提醒

- ❌ 不要"震撼"、"颠覆"、"赋能"
- ❌ 不要花哨渐变、霓虹色、赛博朋克 —— 卡片整体仍保持主页的安静气质
- ❌ 不要给程序加追踪脚本 / GA
- ✓ 描述像写科学笔记：短句、名词、句号
- ✓ "instrument 002" 沿用主页的"实验仪器"叙事
- ✓ 程序内部的视觉（渐变色、霓虹后期效果）是程序功能 ≠ 卡片风格，**别担心程序自己的画面**

---

## 7. 当前状态 / 已知遗留

| 项 | 状态 | 影响 |
|---|---|---|
| GitHub 仓库 | ✓ 已就绪 | — |
| 源代码（桌面 + Web demo） | ✓ 已就绪、type-check 通过、双 build 通过 | — |
| apparatus.json | ✓ en/zh/ja/ko 全部填完 | — |
| `.github/workflows/release.yml`（自动构建） | ✓ 已就绪，但**还没触发过** | 第一个 `git tag v0.2.1 && git push --tags` 才有 release |
| 卡片封面组件 `docs/handoff/wavelet-cover.tsx` | ✓ 已就绪 | 取代静态截图，主页 agent 直接复制使用 |
| Vercel 部署（Soundanimetion 项目） | ⏳ 待用户在 Vercel UI 上 Import | `wavelet.clearmika.com` 现在不可访问 |
| DNS `wavelet.clearmika.com` CNAME | ⏳ 待用户操作 | 同上 |

---

## 8. 期望的最终交付（主页 Cursor 这边）

完成后请给用户：

1. **改动文件清单**（哪几个组件 / 数据文件被加了）
2. **本地预览截图**：Apparatus 卡片在 4 种语言下的样子各一张
3. **如果做了 sync 脚本**：怎么手动跑一次更新 apparatus.json
4. **PR / commit 链接**（如果走 PR 流程）

---

## 9. 联系点

如有问题：
- Wavelet 的 README：仓库根目录
- Wavelet 的 CHANGELOG（详细的踩坑记录）：仓库根目录 `CHANGELOG.md`
- Wavelet 当前版本：0.2.1（写在 apparatus.json 的 `version` 字段）

完。
