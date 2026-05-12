import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from './store/app-store';
import { AudioEngine, type MediaKind } from './audio/AudioEngine';
import { RealtimeFeatureExtractor } from './audio/RealtimeFeatureExtractor';
import { ThreeContext } from './render/ThreeContext';
import { PreviewRenderer } from './render/PreviewRenderer';
import { OfflineRenderer } from './render/OfflineRenderer';
import { PostFXChain, buildPostFXSchema } from './render/PostFXChain';
import { detectGpu } from './render/GpuTier';
import { analyzeOffline } from './audio/OfflineAnalyzer';
import { FeatureTimeline } from './audio/FeatureTimeline';
import { createPreset } from './visuals/PresetRegistry';
import { mergeWithDefaults } from './visuals/ParamSchema';
import type { VisualPreset } from './visuals/VisualPreset';
import { PresetSelector } from './ui/PresetSelector';
import { ParameterPanel } from './ui/ParameterPanel';
import { BackgroundPicker } from './ui/BackgroundPicker';
import { ExportDialog, type ExportSettings } from './ui/ExportDialog';
import { ExportProgress, type ExportProgressState } from './ui/ExportProgress';
import { WaveformBar } from './ui/WaveformBar';
import { PresetIO, type PresetExport } from './ui/PresetIO';
import { LanguageSwitcher } from './ui/LanguageSwitcher';
import { useT, useLocale } from './i18n';
import type { HardwareEncodersInfo } from '../electron/preload';
import './types';

const VIDEO_EXTS = new Set(['mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi']);
const AUDIO_EXTS = new Set([
  'mp3',
  'wav',
  'flac',
  'ogg',
  'm4a',
  'aac',
  'opus',
  'webm',
]);

function detectKindFromName(name: string): MediaKind {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (VIDEO_EXTS.has(ext)) return 'video';
  return 'audio';
}

function isMediaFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return VIDEO_EXTS.has(ext) || AUDIO_EXTS.has(ext);
}

export default function App() {
  const t = useT();
  const { locale } = useLocale();

  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<AudioEngine | null>(null);
  const extractorRef = useRef<RealtimeFeatureExtractor | null>(null);
  const ctxRef = useRef<ThreeContext | null>(null);
  const previewRef = useRef<PreviewRenderer | null>(null);
  const presetRef = useRef<VisualPreset | null>(null);
  const offlineRef = useRef<OfflineRenderer | null>(null);
  const postFXRef = useRef<PostFXChain | null>(null);
  const timelineRef = useRef<FeatureTimeline | null>(null);
  const timelineForFileRef = useRef<string | null>(null);
  const lastFfmpegLogRef = useRef<string | null>(null);
  const encoderFallbackNoticeRef = useRef<string | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportProgress, setExportProgress] =
    useState<ExportProgressState | null>(null);
  const [activeSchema, setActiveSchema] = useState<VisualPreset['paramSchema']>(
    {}
  );
  const [waveformKey, setWaveformKey] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [hwEncoders, setHwEncoders] = useState<HardwareEncodersInfo | null>(
    null
  );
  const [isDragging, setIsDragging] = useState(false);

  const audioLoaded = useAppStore((s) => s.audioLoaded);
  const fileName = useAppStore((s) => s.audioFileName);
  const filePath = useAppStore((s) => s.audioFilePath);
  const audioKind = useAppStore((s) => s.audioKind);
  const duration = useAppStore((s) => s.duration);
  const currentTime = useAppStore((s) => s.currentTime);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const volume = useAppStore((s) => s.volume);
  const bgColor = useAppStore((s) => s.bgColor);
  const bgAlpha = useAppStore((s) => s.bgAlpha);
  const activePresetId = useAppStore((s) => s.activePresetId);
  const presetParams = useAppStore((s) => s.presetParams);
  const postFXParams = useAppStore((s) => s.postFXParams);
  const setAudioMeta = useAppStore((s) => s.setAudioMeta);
  const setTime = useAppStore((s) => s.setTime);
  const setPlaying = useAppStore((s) => s.setPlaying);
  const setVolume = useAppStore((s) => s.setVolume);
  const setActivePreset = useAppStore((s) => s.setActivePreset);
  const setPresetParam = useAppStore((s) => s.setPresetParam);
  const setPresetParams = useAppStore((s) => s.setPresetParams);
  const setBgColor = useAppStore((s) => s.setBgColor);
  const setBgAlpha = useAppStore((s) => s.setBgAlpha);
  const setPostFXParam = useAppStore((s) => s.setPostFXParam);
  const setPostFXParams = useAppStore((s) => s.setPostFXParams);
  const gpuInfo = useAppStore((s) => s.gpuInfo);
  const setGpuInfo = useAppStore((s) => s.setGpuInfo);

  // 当前语言对应的 POSTFX schema（label 跟着翻译走）。
  const postFXSchema = useMemo(
    () => buildPostFXSchema(t.postFX),
    [t]
  );

  // 把启动时检测到的语言同步给主进程，让原生对话框第一时间用对的文案。
  useEffect(() => {
    try {
      window.api.setLocale(locale);
    } catch (e) {
      console.warn('[App] setLocale 失败：', e);
    }
  }, [locale]);

  useEffect(() => {
    const container = viewportRef.current;
    if (!container) return;

    // 捕获并展开窗口级错误：默认情况下 React 会用 console.error 打 Error 对象，
    // Electron 的 console-message 事件只会把它格式化成 "[object Object]"，
    // 导致主进程 stdout 看不到 message/stack。这里显式把 message+stack 单独打一行。
    const onErr = (e: ErrorEvent) => {
      const err = e.error as Error | undefined;
      const msg = err?.message || e.message || String(err);
      const stack = err?.stack || '(no stack)';
      console.error('[App] window error:', msg, '\n', stack);
    };
    window.addEventListener('error', onErr);

    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    container.appendChild(canvas);
    canvasRef.current = canvas;

    const ctx = new ThreeContext(canvas);
    ctx.setSize(container.clientWidth, container.clientHeight);
    ctxRef.current = ctx;

    // 启动时一次性探测 GPU 等级，存进 store；ExportDialog / OfflineRenderer 会读它来选执行路径。
    try {
      const gl = ctx.renderer.getContext() as
        | WebGLRenderingContext
        | WebGL2RenderingContext;
      const info = detectGpu(gl);
      setGpuInfo(info);
      console.info(
        `[App] GPU 探测：tier=${info.tier} | ${info.label} | renderer="${info.renderer}"`
      );
    } catch (e) {
      console.warn('[App] GPU 探测失败：', e);
    }

    const engine = new AudioEngine();
    engineRef.current = engine;
    const unsubAudio = engine.subscribe((s) => {
      setAudioMeta({
        audioLoaded: s.loaded,
        audioFileName: s.fileName,
        audioFilePath: s.filePath,
        audioKind: s.kind,
        duration: s.duration,
      });
      setTime(s.currentTime);
      setPlaying(s.isPlaying);
    });

    const extractor = new RealtimeFeatureExtractor(engine);
    extractor.start();
    extractorRef.current = extractor;

    const preview = new PreviewRenderer(ctx, extractor);
    preview.start();
    previewRef.current = preview;

    offlineRef.current = new OfflineRenderer();

    const postFX = new PostFXChain(ctx);
    postFX.setParams(useAppStore.getState().postFXParams);
    postFXRef.current = postFX;
    ctx.setRenderHook((c, dt) => {
      if (postFX.isActive()) {
        postFX.render(c.frameFeatures, dt);
      } else {
        c.renderer.render(c.scene, c.camera);
      }
    });

    const resize = () => {
      ctx.setSize(container.clientWidth, container.clientHeight);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    return () => {
      window.removeEventListener('error', onErr);
      unsubAudio();
      preview.stop();
      if (presetRef.current) presetRef.current.dispose(ctx);
      extractor.stop();
      engine.dispose();
      ro.disconnect();
      postFX.dispose();
      ctx.setRenderHook(null);
      ctx.dispose();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }, [setAudioMeta, setTime, setPlaying, setGpuInfo]);

  useEffect(() => {
    postFXRef.current?.setParams(postFXParams);
  }, [postFXParams]);

  useEffect(() => {
    ctxRef.current?.setBackground(bgColor, bgAlpha);
  }, [bgColor, bgAlpha]);

  useEffect(() => {
    let cancelled = false;
    window.api
      .getHardwareEncoders()
      .then((info) => {
        if (!cancelled) setHwEncoders(info);
      })
      .catch((e) => console.warn('[App] 探测硬件编码器失败：', e));
    return () => {
      cancelled = true;
    };
  }, []);

  // 全局订阅 ffmpeg 日志：写到 Console（dev 模式下 bat 终端能看到），
  // 同时把最近一行注入到 ExportProgress 弹窗（导出卡住时一目了然）。
  useEffect(() => {
    const unsub = window.api.onFfmpegLog((sessionId, line) => {
      console.info(`[ffmpeg ${sessionId.slice(0, 8)}]`, line);
      lastFfmpegLogRef.current = line;
      setExportProgress((p) =>
        p ? { ...p, lastFfmpegLog: line } : p
      );
    });
    return () => {
      try {
        unsub();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const reinitPreset = useCallback(
    (presetId: string) => {
      const ctx = ctxRef.current;
      const preview = previewRef.current;
      if (!ctx || !preview) return;
      try {
        if (presetRef.current) {
          // 先把 preview 引用清掉，避免 rAF 撞到正在销毁的对象
          preview.preset = null;
          presetRef.current.dispose(ctx);
          ctx.clearPreset();
        }
        const preset = createPreset(presetId);
        const stored = useAppStore.getState().presetParams[presetId];
        const params = mergeWithDefaults(preset.paramSchema, stored);
        preset.init(ctx, params);
        preview.preset = preset;
        preview.presetParams = params;
        presetRef.current = preset;
        setActiveSchema(preset.paramSchema);
        setPresetParams(presetId, params);
      } catch (e) {
        console.error('[App] 切换预设失败：', presetId, e);
        setErrorMsg(t.errors.presetSwitchFailed((e as Error)?.message || String(e)));
      }
    },
    [setPresetParams, t]
  );

  useEffect(() => {
    reinitPreset(activePresetId);
  }, [activePresetId, reinitPreset]);

  const handleParamChange = useCallback(
    (key: string, value: unknown, structural: boolean) => {
      const presetId = useAppStore.getState().activePresetId;
      setPresetParam(presetId, key, value);
      const preview = previewRef.current;
      if (preview) {
        preview.presetParams = {
          ...preview.presetParams,
          [key]: value,
        };
      }
      if (structural) {
        reinitPreset(presetId);
      }
    },
    [setPresetParam, reinitPreset]
  );

  // 共享的载入逻辑：openAudio / loadFromPath / drop 都进这里。
  const loadMediaResult = useCallback(
    async (result: {
      filePath: string | null;
      fileName: string;
      data: ArrayBuffer;
      kind?: MediaKind;
    }) => {
      const engine = engineRef.current;
      if (!engine) return;
      const kind: MediaKind = result.kind ?? detectKindFromName(result.fileName);
      await engine.load({
        data: result.data,
        fileName: result.fileName,
        filePath: result.filePath,
        kind,
      });
      timelineRef.current = null;
      timelineForFileRef.current = null;
      setAudioUrl(engine.getBlobUrl());
      setWaveformKey(result.filePath || result.fileName);
    },
    []
  );

  async function handleOpen() {
    if (!engineRef.current) return;
    setErrorMsg(null);
    setLoading(true);
    try {
      const result = await window.api.openAudio();
      if (!result) {
        setLoading(false);
        return;
      }
      await loadMediaResult(result);
    } catch (e) {
      console.error('[App] 加载音频失败：', e);
      setErrorMsg(t.errors.audioLoadFailed((e as Error).message));
    } finally {
      setLoading(false);
    }
  }

  function handlePresetLoad(data: PresetExport) {
    if (!data.params) return;
    setPresetParams(data.presetId, data.params);
    if (data.background) {
      setBgColor(data.background.color);
      setBgAlpha(data.background.alpha);
    }
    if (data.postFX) {
      setPostFXParams(data.postFX);
    }
    if (data.presetId !== activePresetId) {
      setActivePreset(data.presetId);
    } else {
      reinitPreset(data.presetId);
    }
  }

  function handleTogglePlay() {
    engineRef.current?.togglePlay();
  }
  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    engineRef.current?.seek(Number(e.target.value));
  }
  function handleVolume(e: React.ChangeEvent<HTMLInputElement>) {
    const v = Number(e.target.value);
    engineRef.current?.setVolume(v);
    setVolume(v);
  }

  function handleOpenExport() {
    if (!audioLoaded) {
      setErrorMsg(t.errors.needAudioFirst);
      return;
    }
    setErrorMsg(null);
    setShowExportDialog(true);
  }

  // 拖拽：支持把音频/视频文件直接拖入窗口加载。
  // 注意 Electron 32+ 后 file.path 已被移除，需要走 webUtils.getPathForFile（在 preload 里转发）。
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // 只在拖出整个窗口时熄灭（drop target 内部子元素切换不算）
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      if (!isMediaFile(file.name)) {
        setErrorMsg(t.errors.unsupportedDrop(file.name));
        return;
      }
      setErrorMsg(null);
      setLoading(true);
      try {
        // 先尝试拿到磁盘路径（FeatureTimeline 用作缓存 key + ffmpeg 复用音轨需要）。
        let filePath: string | null = null;
        try {
          filePath = window.api.getDroppedFilePath(file);
        } catch {
          /* 主进程拿不到 path 的话，退化到 ArrayBuffer 路径 */
        }
        if (filePath) {
          const result = await window.api.loadFromPath(filePath);
          await loadMediaResult(result);
        } else {
          // 没有路径就走 File API（导出时仍能用，只是 audioPath 为 null = 不打包音频）。
          const data = await file.arrayBuffer();
          await loadMediaResult({
            filePath: null,
            fileName: file.name,
            data,
            kind: detectKindFromName(file.name),
          });
        }
      } catch (err) {
        console.error('[App] 拖拽加载失败：', err);
        setErrorMsg(t.errors.audioLoadFailed((err as Error).message));
      } finally {
        setLoading(false);
      }
    },
    [loadMediaResult, t]
  );

  // 快照：抓取当前 canvas 像素，弹"另存为 PNG"对话框。
  // canvas 已经设置 preserveDrawingBuffer:true，所以即使在 rAF 之外抓也能拿到当前帧。
  const handleSnapshot = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setErrorMsg(null);
    try {
      // 先强制再渲染一帧，确保抓到的是「点击瞬间」而不是上一帧。
      const ctx = ctxRef.current;
      ctx?.render(0);
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png')
      );
      if (!blob) throw new Error('canvas.toBlob returned null');
      const arrayBuf = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuf);
      const stem = (fileName ?? 'snapshot')
        .replace(/\.[^.]+$/, '')
        .replace(/[<>:"/\\|?*]/g, '_');
      const stamp = new Date()
        .toISOString()
        .replace(/[-:T.Z]/g, '')
        .slice(0, 14);
      const defaultName = `${stem}-${stamp}.png`;
      const savedPath = await window.api.saveSnapshot({
        defaultName,
        data: bytes,
      });
      if (savedPath) {
        const ok = window.confirm(t.topbar.snapshotSaved(savedPath));
        if (ok) await window.api.showItemInFolder(savedPath);
      }
    } catch (e) {
      console.error('[App] 快照失败：', e);
      setErrorMsg(t.errors.snapshotFailed((e as Error).message));
    }
  }, [fileName, t]);

  async function ensureTimeline(
    onProgress: (p: number) => void
  ): Promise<FeatureTimeline | null> {
    const engine = engineRef.current;
    if (!engine || !engine.audioBuffer) return null;
    const cacheKey = engine.getState().filePath || engine.getState().fileName;
    if (timelineRef.current && timelineForFileRef.current === cacheKey) {
      onProgress(1);
      return timelineRef.current;
    }
    const tl = await analyzeOffline(engine.audioBuffer, {
      onProgress,
    });
    timelineRef.current = tl;
    timelineForFileRef.current = cacheKey;
    return tl;
  }

  async function handleExportConfirm(settings: ExportSettings) {
    setShowExportDialog(false);
    const engine = engineRef.current;
    const ctx = ctxRef.current;
    const preview = previewRef.current;
    const offline = offlineRef.current;
    const preset = presetRef.current;
    if (!engine || !ctx || !preview || !offline || !preset) return;

    const params = preview.presetParams;

    const defaultName = makeDefaultExportName(
      engine.getState().fileName,
      settings.format
    );
    const outputPath = await window.api.saveExportPath({
      defaultName,
      format: settings.format,
    });
    if (!outputPath) return;

    engine.pause();
    preview.stop();
    encoderFallbackNoticeRef.current = null;

    setExportProgress({
      phase: 'analyzing',
      ratio: 0,
      message: t.exportProgress.analyzingFeatures,
    });

    try {
      const timeline = await ensureTimeline((p) =>
        setExportProgress({
          phase: 'analyzing',
          ratio: p,
          message:
            p < 0.9
              ? t.exportProgress.analyzingFeatures
              : t.exportProgress.detectingBpm,
        })
      );
      if (!timeline) throw new Error(t.errors.timelineMissing);

      setExportProgress({
        phase: 'rendering',
        ratio: 0,
        message: t.exportProgress.renderingFrames,
        frame: 0,
        totalFrames: Math.ceil((settings.endSec - settings.startSec) * settings.fps),
      });

      const result = await offline.render(
        ctx,
        timeline,
        preset,
        params,
        {
          width: settings.width,
          height: settings.height,
          fps: settings.fps,
          startSec: settings.startSec,
          endSec: settings.endSec,
          format: settings.format,
          outputPath,
          audioPath: engine.getState().filePath,
          bgColor: settings.bgColor,
          bgAlpha: settings.bgAlpha,
          quality: settings.quality,
          encoder: settings.encoder,
          qualityProfile: settings.qualityProfile,
          gpuTier: gpuInfo?.tier,
          postFX: postFXRef.current,
          onEncoderFallback: ({ from, to }) => {
            encoderFallbackNoticeRef.current = t.exportProgress.encoderFallback(
              from,
              to
            );
          },
        },
        (p) => {
          setExportProgress({
            phase: 'rendering',
            ratio: p.ratio,
            message: t.exportProgress.renderingFrames,
            frame: p.frame,
            totalFrames: p.totalFrames,
            fps: p.fps,
            etaSec: p.etaSec,
            inFlight: p.inFlight,
            waitingForFfmpeg: p.waitingForFfmpeg,
            lastFfmpegLog: lastFfmpegLogRef.current,
            encoderFallbackNotice: encoderFallbackNoticeRef.current,
          });
        }
      );

      setExportProgress(null);
      const ok = window.confirm(t.exportProgress.completed(result.outputPath));
      if (ok) {
        await window.api.showItemInFolder(result.outputPath);
      }
    } catch (e) {
      setErrorMsg(t.errors.exportFailed((e as Error).message));
      setExportProgress(null);
    } finally {
      preview.start();
    }
  }

  function handleExportCancel() {
    offlineRef.current?.cancel();
    setExportProgress(null);
  }

  const currentParams = presetParams[activePresetId] || {};

  const sourceTypeLabel =
    audioKind === 'video' ? t.topbar.sourceTypeVideo : t.topbar.sourceTypeAudio;

  return (
    <div
      className="app-shell"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={
        isDragging
          ? { outline: '2px dashed var(--accent)', outlineOffset: -8 }
          : undefined
      }
    >
      <div className="top-bar">
        <span className="brand">{t.topbar.brand}</span>
        <button onClick={handleOpen} disabled={loading || !!exportProgress}>
          {loading ? t.topbar.loadingAudio : t.topbar.loadAudio}
        </button>
        <span className="dim">
          {fileName ? `${fileName} · ${sourceTypeLabel}` : t.topbar.notLoadedHint}
        </span>
        <div className="spacer" />
        <span className="label">{t.topbar.presetLabel}</span>
        <PresetSelector value={activePresetId} onChange={setActivePreset} />
        <button
          onClick={handleSnapshot}
          disabled={!audioLoaded || !!exportProgress}
          title={t.topbar.snapshotTitle}
        >
          {t.topbar.snapshot}
        </button>
        <button
          onClick={handleOpenExport}
          disabled={!audioLoaded || !!exportProgress}
        >
          {t.topbar.exportVideo}
        </button>
        <LanguageSwitcher />
        {errorMsg && (
          <span style={{ color: 'var(--danger)', marginLeft: 12 }}>
            {errorMsg}
          </span>
        )}
      </div>

      <div className="viewport" ref={viewportRef} />

      <div className="side-panel">
        <BackgroundPicker />
        <PresetIO
          presetId={activePresetId}
          params={currentParams}
          bgColor={bgColor}
          bgAlpha={bgAlpha}
          postFX={postFXParams}
          onLoad={handlePresetLoad}
        />
        <ParameterPanel
          presetId={activePresetId}
          schema={activeSchema}
          values={currentParams}
          onChange={handleParamChange}
        />
        <ParameterPanel
          presetId="__postfx__"
          schema={postFXSchema}
          values={postFXParams as unknown as Record<string, unknown>}
          onChange={(key, value) =>
            setPostFXParam(
              key as keyof typeof postFXParams,
              value as never
            )
          }
        />
      </div>

      <div className="bottom-bar">
        <div className="waveform-host">
          <WaveformBar
            mediaElement={engineRef.current?.getMediaElement() ?? null}
            audioUrl={audioUrl}
            fileKey={waveformKey}
          />
        </div>
        <div className="row">
          <button onClick={handleTogglePlay} disabled={!audioLoaded}>
            {isPlaying ? t.playback.pause : t.playback.play}
          </button>
          <input
            type="range"
            min={0}
            max={Math.max(0.01, duration)}
            step={0.01}
            value={currentTime}
            onChange={handleSeek}
            disabled={!audioLoaded}
            style={{ flex: 1 }}
          />
          <span className="dim" style={{ minWidth: 92, textAlign: 'right' }}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          <span className="dim">{t.playback.volume}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={handleVolume}
            style={{ width: 100 }}
          />
        </div>
      </div>

      {showExportDialog && (
        <ExportDialog
          duration={duration}
          defaultBgColor={bgColor}
          defaultBgAlpha={bgAlpha}
          audioFileName={fileName}
          hwEncoders={hwEncoders}
          gpuInfo={gpuInfo}
          onCancel={() => setShowExportDialog(false)}
          onConfirm={handleExportConfirm}
        />
      )}

      {exportProgress && (
        <ExportProgress
          state={exportProgress}
          onCancel={handleExportCancel}
        />
      )}

      {void filePath}
    </div>
  );
}

function makeDefaultExportName(
  audioName: string | null,
  format: 'mp4' | 'prores4444' | 'pngseq'
): string {
  const stem = (audioName ?? 'visual')
    .replace(/\.[^.]+$/, '')
    .replace(/[<>:"/\\|?*]/g, '_');
  const stamp = new Date()
    .toISOString()
    .replace(/[-:T.Z]/g, '')
    .slice(0, 14);
  switch (format) {
    case 'mp4':
      return `${stem}-${stamp}.mp4`;
    case 'prores4444':
      return `${stem}-${stamp}.mov`;
    case 'pngseq':
      return `${stem}-${stamp}-frames`;
  }
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
