export interface AudioLoadResult {
  duration: number;
  sampleRate: number;
  fileName: string;
  filePath: string | null;
  kind: MediaKind;
  audioBuffer: AudioBuffer;
}

export type AudioStateListener = (state: AudioEngineState) => void;

export type MediaKind = 'audio' | 'video';

export interface AudioEngineState {
  loaded: boolean;
  fileName: string | null;
  filePath: string | null;
  /** 'audio' | 'video' —— 影响顶栏标签和未来的视频背景层。 */
  kind: MediaKind;
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  volume: number;
}

const AUDIO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  opus: 'audio/ogg',
};

const VIDEO_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
};

function guessMime(fileName: string, kind: MediaKind): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (kind === 'video') return VIDEO_MIME[ext] || 'video/*';
  return AUDIO_MIME[ext] || 'audio/*';
}

/**
 * AudioEngine 用一个 HTMLMediaElement 做播放（易 seek/暂停），
 * 同时把 AudioContext 的图形管线挂出来给 RealtimeFeatureExtractor 抽特征。
 * 解码出的 AudioBuffer 留给 OfflineAnalyzer 做整轨预分析。
 *
 * 历史改动：原来只用 `new Audio()`，仅支持纯音频文件。
 * 为了支持 mp4 / mov 等视频文件作为"音频源"，统一用 `<video>` 元素：
 *  - 视频元素同时支持音频文件（videoWidth=0，但音轨正常播放）
 *  - 也支持 video 容器（提取其中音轨给 AnalyserNode）
 *  - 不挂到 DOM 上，所以 mp4 的画面不会显示，与现有 UI 完全兼容
 */
export class AudioEngine {
  readonly audioCtx: AudioContext;
  readonly analyser: AnalyserNode;
  readonly gain: GainNode;
  readonly destination: AudioDestinationNode;

  private element: HTMLVideoElement;
  private source: MediaElementAudioSourceNode | null = null;
  private blobUrl: string | null = null;
  private listeners = new Set<AudioStateListener>();
  private rafId = 0;

  private state: AudioEngineState = {
    loaded: false,
    fileName: null,
    filePath: null,
    kind: 'audio',
    duration: 0,
    currentTime: 0,
    isPlaying: false,
    volume: 1,
  };

  audioBuffer: AudioBuffer | null = null;

  /** 暴露给 wavesurfer 共享同一个 media element。 */
  getMediaElement(): HTMLMediaElement {
    return this.element;
  }

  getBlobUrl(): string | null {
    return this.blobUrl;
  }

  constructor() {
    this.audioCtx = new AudioContext();
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.65;
    this.gain = this.audioCtx.createGain();
    this.destination = this.audioCtx.destination;

    // 用 <video> 而不是 new Audio()：兼容音频和视频，不挂 DOM 不显示画面。
    this.element = document.createElement('video');
    this.element.crossOrigin = 'anonymous';
    this.element.preload = 'auto';
    // 不显示在 DOM 里，但要让浏览器仍然解码音轨
    this.element.muted = false;
    this.element.playsInline = true;

    this.element.addEventListener('play', () => this.update({ isPlaying: true }));
    this.element.addEventListener('pause', () =>
      this.update({ isPlaying: false })
    );
    this.element.addEventListener('ended', () =>
      this.update({ isPlaying: false })
    );
    this.element.addEventListener('loadedmetadata', () =>
      this.update({ duration: this.element.duration || 0 })
    );

    const tick = () => {
      if (this.state.loaded) {
        const t = this.element.currentTime || 0;
        if (t !== this.state.currentTime) this.update({ currentTime: t });
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  async load(opts: {
    data: ArrayBuffer;
    fileName: string;
    filePath: string | null;
    kind?: MediaKind;
    mime?: string;
  }): Promise<AudioLoadResult> {
    if (this.state.isPlaying) this.element.pause();

    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }

    const kind: MediaKind = opts.kind ?? 'audio';
    const mime = opts.mime || guessMime(opts.fileName, kind);

    const blob = new Blob([opts.data], { type: mime });
    this.blobUrl = URL.createObjectURL(blob);
    this.element.src = this.blobUrl;
    await new Promise<void>((resolve, reject) => {
      const onLoad = () => {
        cleanup();
        resolve();
      };
      const onErr = () => {
        cleanup();
        // MediaError code 可以帮助定位（4 = src not supported）
        const err = this.element.error;
        const detail = err
          ? ` (code=${err.code}: ${err.message || 'unknown'})`
          : '';
        reject(new Error(`媒体元素加载失败${detail}`));
      };
      const cleanup = () => {
        this.element.removeEventListener('canplay', onLoad);
        this.element.removeEventListener('error', onErr);
      };
      this.element.addEventListener('canplay', onLoad);
      this.element.addEventListener('error', onErr);
      this.element.load();
    });

    if (!this.source) {
      this.source = this.audioCtx.createMediaElementSource(this.element);
      this.source.connect(this.analyser);
      this.analyser.connect(this.gain);
      this.gain.connect(this.destination);
    }

    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = await this.audioCtx.decodeAudioData(opts.data.slice(0));
    } catch (e) {
      // 视频容器（如 mkv/avi）里的音轨 Chromium 可能不支持 decodeAudioData。
      // 媒体元素本身可以播（用浏览器的内部解码器），但离线分析（FeatureTimeline）就拿不到 PCM。
      // 抛一个能让用户看懂的错误，让 UI 显示"请改用 mp4 / mov / webm"。
      const reason = (e as Error)?.message || String(e);
      throw new Error(
        `${opts.fileName} 的音轨无法解码用于离线分析（${reason}）。请改用 mp3 / wav / mp4 / mov / webm。`
      );
    }
    this.audioBuffer = audioBuffer;

    this.update({
      loaded: true,
      fileName: opts.fileName,
      filePath: opts.filePath,
      kind,
      duration: audioBuffer.duration,
      currentTime: 0,
    });

    return {
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      fileName: opts.fileName,
      filePath: opts.filePath,
      kind,
      audioBuffer,
    };
  }

  async play(): Promise<void> {
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }
    await this.element.play();
  }

  pause(): void {
    this.element.pause();
  }

  togglePlay(): void {
    if (this.state.isPlaying) this.pause();
    else void this.play();
  }

  seek(timeSec: number): void {
    if (!this.state.loaded) return;
    const t = Math.max(0, Math.min(this.state.duration, timeSec));
    this.element.currentTime = t;
    this.update({ currentTime: t });
  }

  setVolume(v: number): void {
    const clamped = Math.max(0, Math.min(1, v));
    this.element.volume = clamped;
    this.update({ volume: clamped });
  }

  getState(): AudioEngineState {
    return this.state;
  }

  subscribe(cb: AudioStateListener): () => void {
    this.listeners.add(cb);
    cb(this.state);
    return () => this.listeners.delete(cb);
  }

  private update(patch: Partial<AudioEngineState>): void {
    this.state = { ...this.state, ...patch };
    for (const cb of this.listeners) cb(this.state);
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.element.pause();
    if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
    void this.audioCtx.close();
  }
}
