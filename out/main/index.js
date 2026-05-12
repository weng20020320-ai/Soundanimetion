import { dialog, app, MessageChannelMain, ipcMain, shell, BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";
import { basename, join, extname, dirname } from "node:path";
import { promises, existsSync, mkdirSync, createWriteStream, appendFileSync } from "node:fs";
import { spawnSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
const TABLE = {
  "zh-CN": {
    openTitle: "选择音频或视频文件",
    audioFilter: "音频",
    videoFilter: "视频",
    mediaFilter: "音频 / 视频",
    allFilesFilter: "所有文件",
    saveExportTitle: "导出到...",
    pngSeqDirTitle: "选择 PNG 序列输出文件夹",
    pngSeqFilterName: "PNG 序列文件夹（输入文件夹名）",
    mp4FilterName: "MP4 视频",
    proResFilterName: "QuickTime ProRes 4444",
    snapshotTitle: "保存快照",
    snapshotFilterName: "PNG 图像"
  },
  "ja-JP": {
    openTitle: "音声・動画ファイルを選択",
    audioFilter: "音声",
    videoFilter: "動画",
    mediaFilter: "音声 / 動画",
    allFilesFilter: "すべてのファイル",
    saveExportTitle: "保存先...",
    pngSeqDirTitle: "PNG 連番の出力フォルダを選択",
    pngSeqFilterName: "PNG 連番フォルダ（フォルダ名を入力）",
    mp4FilterName: "MP4 動画",
    proResFilterName: "QuickTime ProRes 4444",
    snapshotTitle: "スナップショットを保存",
    snapshotFilterName: "PNG 画像"
  },
  "en-US": {
    openTitle: "Choose an audio or video file",
    audioFilter: "Audio",
    videoFilter: "Video",
    mediaFilter: "Audio / Video",
    allFilesFilter: "All files",
    saveExportTitle: "Export to...",
    pngSeqDirTitle: "Choose PNG sequence output folder",
    pngSeqFilterName: "PNG sequence folder (enter folder name)",
    mp4FilterName: "MP4 video",
    proResFilterName: "QuickTime ProRes 4444",
    snapshotTitle: "Save snapshot",
    snapshotFilterName: "PNG image"
  }
};
let currentLocale = "zh-CN";
function setMainLocale(l) {
  if (l === "zh-CN" || l === "ja-JP" || l === "en-US") {
    currentLocale = l;
  }
}
function getDialogStrings() {
  return TABLE[currentLocale];
}
const AUDIO_EXTENSIONS = [
  "mp3",
  "wav",
  "flac",
  "ogg",
  "m4a",
  "aac",
  "opus"
];
const VIDEO_EXTENSIONS = [
  "mp4",
  "m4v",
  "mov",
  "webm",
  "mkv",
  "avi"
];
const MEDIA_EXTENSIONS = [
  ...AUDIO_EXTENSIONS,
  ...VIDEO_EXTENSIONS,
  "webm"
];
function detectKind(filePath) {
  const ext = extname(filePath).slice(1).toLowerCase();
  return VIDEO_EXTENSIONS.includes(ext) ? "video" : "audio";
}
async function readFileToBuffer(filePath) {
  const buf = await promises.readFile(filePath);
  return buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength
  );
}
async function openAudioDialog() {
  const s = getDialogStrings();
  const result = await dialog.showOpenDialog({
    title: s.openTitle,
    filters: [
      { name: s.mediaFilter, extensions: MEDIA_EXTENSIONS },
      { name: s.audioFilter, extensions: AUDIO_EXTENSIONS },
      { name: s.videoFilter, extensions: VIDEO_EXTENSIONS },
      { name: s.allFilesFilter, extensions: ["*"] }
    ],
    properties: ["openFile"]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const data = await readFileToBuffer(filePath);
  return {
    filePath,
    fileName: basename(filePath),
    data,
    kind: detectKind(filePath)
  };
}
async function loadMediaFromPath(filePath) {
  const ext = extname(filePath).slice(1).toLowerCase();
  if (!MEDIA_EXTENSIONS.includes(ext)) {
    throw new Error(`unsupported extension: .${ext}`);
  }
  const data = await readFileToBuffer(filePath);
  return {
    filePath,
    fileName: basename(filePath),
    data,
    kind: detectKind(filePath)
  };
}
async function saveExportDialog(opts) {
  const s = getDialogStrings();
  const filters = (() => {
    switch (opts.format) {
      case "mp4":
        return [{ name: s.mp4FilterName, extensions: ["mp4"] }];
      case "prores4444":
        return [{ name: s.proResFilterName, extensions: ["mov"] }];
      case "pngseq":
        return [{ name: s.pngSeqFilterName, extensions: [] }];
    }
  })();
  if (opts.format === "pngseq") {
    const r2 = await dialog.showOpenDialog({
      title: s.pngSeqDirTitle,
      properties: ["openDirectory", "createDirectory", "promptToCreate"],
      defaultPath: join(app.getPath("videos"), opts.defaultName)
    });
    if (r2.canceled || r2.filePaths.length === 0) return null;
    return r2.filePaths[0];
  }
  const r = await dialog.showSaveDialog({
    title: s.saveExportTitle,
    defaultPath: join(app.getPath("videos"), opts.defaultName),
    filters
  });
  if (r.canceled || !r.filePath) return null;
  return r.filePath;
}
async function saveSnapshotDialog(opts) {
  const s = getDialogStrings();
  const r = await dialog.showSaveDialog({
    title: s.snapshotTitle,
    defaultPath: join(app.getPath("pictures"), opts.defaultName),
    filters: [{ name: s.snapshotFilterName, extensions: ["png"] }]
  });
  if (r.canceled || !r.filePath) return null;
  await promises.writeFile(r.filePath, opts.data);
  return r.filePath;
}
const require$1 = createRequire(import.meta.url);
let cachedPath;
function resolveFFmpegPath() {
  if (cachedPath !== void 0) return cachedPath;
  try {
    const raw = require$1("ffmpeg-static");
    if (!raw) {
      cachedPath = null;
      return cachedPath;
    }
    let resolved = raw;
    if (app.isPackaged) {
      resolved = raw.replace("app.asar", "app.asar.unpacked");
    }
    if (existsSync(resolved)) {
      cachedPath = resolved;
      return cachedPath;
    }
    if (existsSync(raw)) {
      cachedPath = raw;
      return cachedPath;
    }
  } catch (e) {
    console.error("[ffmpeg-locator] failed to resolve ffmpeg-static", e);
  }
  const sysFfmpeg = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  cachedPath = sysFfmpeg;
  return cachedPath;
}
const DEFAULT_QUALITY = "standard";
function libx264QualityArgs(q) {
  const tune = ["-tune", "animation"];
  switch (q) {
    case "draft":
      return ["-preset", "ultrafast", "-crf", "23", ...tune];
    case "standard":
      return ["-preset", "fast", "-crf", "20", ...tune];
    case "high":
      return ["-preset", "medium", "-crf", "17", ...tune];
    case "best":
      return ["-preset", "slow", "-crf", "14", ...tune];
  }
}
function nvencQualityArgs(q, codec) {
  const presetCq = {
    draft: ["p1", "28"],
    standard: ["p3", "23"],
    high: ["p4", "19"],
    best: ["p7", "16"]
  };
  const [preset, cq] = presetCq[q];
  return ["-preset", preset, "-tune", "hq", "-rc", "vbr", "-cq", cq, "-b:v", "0"];
}
function amfQualityArgs(q) {
  const qpMap = {
    draft: "28",
    standard: "24",
    high: "20",
    best: "16"
  };
  return [
    "-quality",
    "quality",
    "-rc",
    "cqp",
    "-qp_i",
    qpMap[q],
    "-qp_p",
    qpMap[q]
  ];
}
function qsvQualityArgs(q) {
  const gqMap = {
    draft: "28",
    standard: "24",
    high: "20",
    best: "16"
  };
  return ["-preset", "medium", "-global_quality", gqMap[q]];
}
function isHwH264(enc) {
  return enc === "h264_nvenc" || enc === "h264_amf" || enc === "h264_qsv";
}
function isHwHevc(enc) {
  return enc === "hevc_nvenc" || enc === "hevc_amf" || enc === "hevc_qsv";
}
function videoEncoderArgs(encoder, quality) {
  switch (encoder) {
    case "libx264":
      return ["-c:v", "libx264", "-pix_fmt", "yuv420p", ...libx264QualityArgs(quality)];
    case "h264_nvenc":
      return [
        "-c:v",
        "h264_nvenc",
        "-pix_fmt",
        "yuv420p",
        ...nvencQualityArgs(quality)
      ];
    case "hevc_nvenc":
      return [
        "-c:v",
        "hevc_nvenc",
        "-pix_fmt",
        "yuv420p",
        ...nvencQualityArgs(quality)
      ];
    case "h264_amf":
      return ["-c:v", "h264_amf", "-pix_fmt", "yuv420p", ...amfQualityArgs(quality)];
    case "hevc_amf":
      return ["-c:v", "hevc_amf", "-pix_fmt", "yuv420p", ...amfQualityArgs(quality)];
    case "h264_qsv":
      return ["-c:v", "h264_qsv", "-pix_fmt", "yuv420p", ...qsvQualityArgs(quality)];
    case "hevc_qsv":
      return ["-c:v", "hevc_qsv", "-pix_fmt", "yuv420p", ...qsvQualityArgs(quality)];
  }
}
function buildFFmpegArgs(opts) {
  const {
    format,
    width,
    height,
    fps,
    outputPath,
    audioPath,
    audioStartSec,
    audioDurationSec,
    flipY = true,
    quality = DEFAULT_QUALITY,
    encoder = "libx264"
  } = opts;
  const videoInputArgs = [
    "-y",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgba",
    "-s",
    `${width}x${height}`,
    "-r",
    String(fps),
    "-i",
    "pipe:0"
  ];
  const audioInputArgs = [];
  if (audioPath && format !== "pngseq") {
    if (typeof audioStartSec === "number" && audioStartSec > 0) {
      audioInputArgs.push("-ss", audioStartSec.toFixed(3));
    }
    if (typeof audioDurationSec === "number" && audioDurationSec > 0) {
      audioInputArgs.push("-t", audioDurationSec.toFixed(3));
    }
    audioInputArgs.push("-i", audioPath);
  }
  const hasAudio = audioInputArgs.length > 0;
  const vfArgs = flipY ? ["-vf", "vflip"] : [];
  switch (format) {
    case "mp4": {
      const safeEncoder = isHwHevc(encoder) || isHwH264(encoder) || encoder === "libx264" ? encoder : "libx264";
      const venc = videoEncoderArgs(safeEncoder, quality);
      return [
        ...videoInputArgs,
        ...audioInputArgs,
        ...vfArgs,
        ...venc,
        "-movflags",
        "+faststart",
        ...hasAudio ? [
          "-c:a",
          "aac",
          "-b:a",
          "320k",
          "-shortest",
          "-map",
          "0:v:0",
          "-map",
          "1:a:0"
        ] : ["-an"],
        outputPath
      ];
    }
    case "prores4444": {
      const proresQscale = {
        draft: "13",
        standard: "11",
        high: "9",
        best: "5"
      };
      return [
        ...videoInputArgs,
        ...audioInputArgs,
        ...vfArgs,
        "-c:v",
        "prores_ks",
        "-profile:v",
        "4444",
        "-pix_fmt",
        "yuva444p10le",
        "-qscale:v",
        proresQscale[quality],
        "-vendor",
        "apl0",
        ...hasAudio ? [
          "-c:a",
          "pcm_s16le",
          "-shortest",
          "-map",
          "0:v:0",
          "-map",
          "1:a:0"
        ] : ["-an"],
        outputPath
      ];
    }
    case "pngseq":
      return [
        ...videoInputArgs,
        ...vfArgs,
        "-pix_fmt",
        "rgba",
        "-compression_level",
        "6",
        join(outputPath, "frame_%06d.png")
      ];
  }
}
const RECENT_STDERR_KEEP = 40;
function openSessionLog(sessionId, args) {
  try {
    const userData = app.getPath("userData");
    const dir = join(userData, "exports");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const ts = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    const file = join(dir, `${ts}_${sessionId.slice(0, 8)}.log`);
    const stream = createWriteStream(file, { encoding: "utf8" });
    stream.write(`=== ffmpeg session ${sessionId} ===
`);
    stream.write(`time: ${(/* @__PURE__ */ new Date()).toISOString()}
`);
    stream.write(`args: ${args.join(" ")}
`);
    stream.write(`---
`);
    return { stream, path: file };
  } catch (e) {
    console.warn("[ffmpeg] 打开日志文件失败：", e);
    return { stream: null, path: null };
  }
}
function pushStderr(session, line) {
  session.recentStderr.push(line);
  if (session.recentStderr.length > RECENT_STDERR_KEEP) {
    session.recentStderr.shift();
  }
  if (session.logStream) {
    try {
      session.logStream.write(line + "\n");
    } catch {
    }
  }
}
function closeLog(session, footer) {
  if (!session.logStream) return;
  try {
    session.logStream.write(`---
${footer}
`);
    session.logStream.end();
  } catch {
  }
  session.logStream = null;
}
const sessions = /* @__PURE__ */ new Map();
let cachedHwEncoders = null;
function getHardwareEncoders() {
  if (cachedHwEncoders) return cachedHwEncoders;
  const ffmpegPath = resolveFFmpegPath();
  if (!ffmpegPath) {
    cachedHwEncoders = { nvenc: false, amf: false, qsv: false, available: [] };
    return cachedHwEncoders;
  }
  let encodersText = "";
  try {
    const result = spawnSync(ffmpegPath, ["-hide_banner", "-encoders"], {
      encoding: "utf8",
      timeout: 8e3
    });
    encodersText = (result.stdout || "") + (result.stderr || "");
  } catch (e) {
    console.warn("[ffmpeg] 探测硬件编码器失败：", e);
  }
  const has = (name) => encodersText.includes(name);
  const available = [];
  if (has("h264_nvenc")) available.push("h264_nvenc");
  if (has("hevc_nvenc")) available.push("hevc_nvenc");
  if (has("h264_amf")) available.push("h264_amf");
  if (has("hevc_amf")) available.push("hevc_amf");
  if (has("h264_qsv")) available.push("h264_qsv");
  if (has("hevc_qsv")) available.push("hevc_qsv");
  cachedHwEncoders = {
    nvenc: available.some((e) => e.endsWith("nvenc")),
    amf: available.some((e) => e.endsWith("amf")),
    qsv: available.some((e) => e.endsWith("qsv")),
    available
  };
  return cachedHwEncoders;
}
async function ffmpegStart(sender, opts) {
  const ffmpegPath = resolveFFmpegPath();
  if (!ffmpegPath) throw new Error("未找到 ffmpeg 可执行文件");
  if (opts.format === "pngseq" && !existsSync(opts.outputPath)) {
    mkdirSync(opts.outputPath, { recursive: true });
  } else if (opts.format !== "pngseq") {
    const dir = dirname(opts.outputPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
  const args = buildFFmpegArgs(opts);
  let proc;
  try {
    proc = spawn(ffmpegPath, args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
  } catch (e) {
    throw new Error(`ffmpeg 进程启动失败：${e.message}`);
  }
  const id = randomUUID();
  let resolveFinish;
  let rejectFinish;
  const finishPromise = new Promise((resolve, reject) => {
    resolveFinish = resolve;
    rejectFinish = reject;
  });
  const { stream: logStream, path: logPath } = openSessionLog(id, [
    ffmpegPath,
    ...args
  ]);
  const session = {
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
    startedAt: Date.now()
  };
  proc.stderr.setEncoding("utf8");
  proc.stderr.on("data", (chunk) => {
    const lines = chunk.split(/\r?\n/);
    for (const line of lines) {
      if (line.trim().length === 0) continue;
      pushStderr(session, line);
      if (!sender.isDestroyed()) sender.send("ffmpeg:log", id, line);
    }
  });
  proc.stdin.on("error", (err) => {
    if (!session.cancelled) {
      console.error("[ffmpeg] stdin error", err);
      pushStderr(session, `[stdin error] ${err.message}`);
      if (session.port) {
        try {
          session.port.postMessage({ type: "error", message: String(err) });
        } catch {
        }
      }
    }
  });
  proc.stdin.on("drain", () => {
    const queued = session.pendingDrain;
    session.pendingDrain = [];
    for (const cb of queued) cb();
  });
  proc.on("close", (code) => {
    session.procExited = true;
    sessions.delete(id);
    const elapsed = ((Date.now() - session.startedAt) / 1e3).toFixed(2);
    closeLog(
      session,
      `closed code=${code} cancelled=${session.cancelled} framesWritten=${session.framesWritten} elapsed=${elapsed}s`
    );
    if (session.cancelled) {
      resolveFinish();
      return;
    }
    if (code === 0) {
      resolveFinish();
      return;
    }
    const earlyExit = session.framesWritten === 0;
    const tail = session.recentStderr.slice(-15).join("\n");
    const reason = earlyExit ? `ffmpeg 进程在收到首帧前就退出了（code=${code}）。
这通常是参数错误、找不到输入文件、或编码器初始化失败。` + (logPath ? `
完整日志：${logPath}` : "") + `
最近 stderr：
${tail || "(无输出)"}` : `ffmpeg 进程异常退出，code=${code}` + (logPath ? `
完整日志：${logPath}` : "") + (tail ? `
最近 stderr：
${tail}` : "");
    if (session.port) {
      try {
        session.port.postMessage({ type: "error", message: reason });
      } catch {
      }
    }
    rejectFinish(new Error(reason));
  });
  proc.on("error", (err) => {
    session.procExited = true;
    sessions.delete(id);
    closeLog(session, `spawn error: ${err.message}`);
    if (session.port) {
      try {
        session.port.postMessage({
          type: "error",
          message: `ffmpeg 进程启动失败：${err.message}`
        });
      } catch {
      }
    }
    rejectFinish(err);
  });
  sessions.set(id, session);
  try {
    await new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        proc.stderr.off("data", onStderr);
        proc.off("error", onError);
        proc.off("close", onClose);
        clearTimeout(timer);
      };
      const onStderr = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const onError = (err) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(`ffmpeg 进程启动失败：${err.message}`));
      };
      const onClose = (code) => {
        if (settled) return;
        settled = true;
        cleanup();
        const tail = session.recentStderr.slice(-10).join("\n");
        reject(
          new Error(
            `ffmpeg 进程在收到首帧前就退出了（code=${code}）。
这通常是参数错误、找不到输入文件、或编码器初始化失败。` + (logPath ? `
完整日志：${logPath}` : "") + (tail ? `
最近 stderr：
${tail}` : "")
          )
        );
      };
      proc.stderr.on("data", onStderr);
      proc.on("error", onError);
      proc.on("close", onClose);
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      }, 1200);
    });
  } catch (settleErr) {
    finishPromise.catch(() => {
    });
    sessions.delete(id);
    try {
      proc.kill("SIGKILL");
    } catch {
    }
    throw settleErr;
  }
  const channel = new MessageChannelMain();
  session.port = channel.port1;
  attachPort(session, channel.port1);
  if (!sender.isDestroyed()) {
    sender.postMessage("ffmpeg:port", { sessionId: id }, [channel.port2]);
  }
  return { sessionId: id };
}
function attachPort(session, port) {
  port.on("message", (event) => {
    const data = event.data;
    if (!data || !data.pixels) {
      console.error(
        "[ffmpeg-service] 收到空 message —— Electron MessagePort 又坏了？",
        "event.data =",
        event.data
      );
      return;
    }
    if (session.cancelled) return;
    const u8 = data.pixels;
    const buf = Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);
    const expected = session.width * session.height * 4;
    if (buf.byteLength !== expected) {
      const msg = `帧大小不匹配：expected=${expected} actual=${buf.byteLength}`;
      console.error("[ffmpeg]", msg);
      try {
        port.postMessage({ type: "error", message: msg });
      } catch {
      }
      return;
    }
    const ok = session.proc.stdin.write(buf);
    const ack = () => {
      session.framesWritten += 1;
      try {
        port.postMessage({ type: "ack", frameIndex: data.frameIndex });
      } catch {
      }
    };
    if (ok) {
      ack();
    } else {
      session.pendingDrain.push(ack);
    }
  });
  port.start();
}
async function ffmpegFinish(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    return { outputPath: "" };
  }
  await new Promise((r) => setTimeout(r, 0));
  session.proc.stdin.end();
  await session.finishPromise;
  return { outputPath: session.outputPath };
}
async function ffmpegCancel(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.cancelled = true;
  try {
    session.proc.stdin.end();
  } catch {
  }
  if (session.port) {
    try {
      session.port.close();
    } catch {
    }
  }
  session.proc.kill("SIGKILL");
}
const DEBUG_LOG_PATH = join(process.cwd(), ".cursor", "debug-5269e2.log");
function appendDebugLog(line) {
  try {
    const dir = dirname(DEBUG_LOG_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(DEBUG_LOG_PATH, line + "\n", "utf8");
  } catch {
  }
}
function registerIpcHandlers() {
  ipcMain.handle("dialog:openAudio", async () => openAudioDialog());
  ipcMain.handle(
    "dialog:saveExport",
    async (_e, opts) => saveExportDialog(opts)
  );
  ipcMain.handle(
    "file:loadFromPath",
    async (_e, path) => loadMediaFromPath(path)
  );
  ipcMain.handle(
    "dialog:saveSnapshot",
    async (_e, opts) => saveSnapshotDialog(opts)
  );
  ipcMain.on("i18n:setLocale", (_e, locale) => {
    setMainLocale(locale);
  });
  ipcMain.handle("app:getHardwareEncoders", async () => getHardwareEncoders());
  ipcMain.handle(
    "ffmpeg:start",
    async (e, opts) => ffmpegStart(e.sender, opts)
  );
  ipcMain.handle(
    "ffmpeg:finish",
    async (_e, sessionId) => ffmpegFinish(sessionId)
  );
  ipcMain.handle(
    "ffmpeg:cancel",
    async (_e, sessionId) => ffmpegCancel(sessionId)
  );
  ipcMain.handle("shell:showItemInFolder", async (_e, path) => {
    shell.showItemInFolder(path);
  });
  ipcMain.handle("app:getVersion", async () => app.getVersion());
  ipcMain.on("debug:log", (_e, line) => {
    if (typeof line === "string") appendDebugLog(line);
  });
}
const __dirname$1 = dirname(fileURLToPath(import.meta.url));
let mainWindow = null;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: "#0b0d12",
    title: "Audio Visualizer",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname$1, "../preload/preload.cjs"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });
  mainWindow.on("ready-to-show", () => mainWindow?.show());
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.webContents.on(
      "console-message",
      (_event, level, message, line, sourceId) => {
        if (level >= 2) {
          const tag = level === 2 ? "W" : "E";
          process.stdout.write(
            `[renderer:${tag}] ${message} (${sourceId}:${line})
`
          );
        }
      }
    );
  }
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(join(__dirname$1, "../renderer/index.html"));
  }
}
app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
function getMainWindow() {
  return mainWindow;
}
export {
  getMainWindow
};
