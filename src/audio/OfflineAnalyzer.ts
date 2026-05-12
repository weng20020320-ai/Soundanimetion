import Meyda from 'meyda';
import { guess } from 'web-audio-beat-detector';
import { FeatureTimeline, bandsForFrame } from './FeatureTimeline';

export interface OfflineAnalyzeOptions {
  frameSize?: number;
  hopSize?: number;
  /** 0..1 进度回调（包含分析与 BPM 检测） */
  onProgress?: (p: number) => void;
}

interface MeydaBatch {
  rms: number;
  spectralCentroid: number;
  amplitudeSpectrum: Float32Array;
}

const DEFAULT_FRAME_SIZE = 1024;
const DEFAULT_HOP_SIZE = 512;
const DB_MIN = -100;
const DB_MAX = -30;
const DB_RANGE = DB_MAX - DB_MIN;

/**
 * 把 AudioBuffer 离线分析为 FeatureTimeline（包含逐帧 FFT/RMS/Centroid/Flux + 节拍 + BPM）。
 */
export async function analyzeOffline(
  audioBuffer: AudioBuffer,
  opts: OfflineAnalyzeOptions = {}
): Promise<FeatureTimeline> {
  const frameSize = opts.frameSize ?? DEFAULT_FRAME_SIZE;
  const hopSize = opts.hopSize ?? DEFAULT_HOP_SIZE;
  const onProgress = opts.onProgress ?? (() => {});

  const sampleRate = audioBuffer.sampleRate;
  const mono = mixToMono(audioBuffer);
  const totalSamples = mono.length;

  const frameCount = Math.max(
    1,
    Math.floor((totalSamples - frameSize) / hopSize) + 1
  );
  const binCount = frameSize / 2;

  const fftFlat = new Float32Array(frameCount * binCount) as Float32Array<ArrayBuffer>;
  const rms = new Float32Array(frameCount) as Float32Array<ArrayBuffer>;
  const centroid = new Float32Array(frameCount) as Float32Array<ArrayBuffer>;
  const flux = new Float32Array(frameCount) as Float32Array<ArrayBuffer>;
  const bandsFlat = new Float32Array(frameCount * 4) as Float32Array<ArrayBuffer>;

  (Meyda as any).bufferSize = frameSize;
  (Meyda as any).sampleRate = sampleRate;

  let prevSpectrum: Float32Array | null = null;
  const window = hannWindow(frameSize);
  const windowed = new Float32Array(frameSize);

  /**
   * 时域平滑：与 Web Audio AnalyserNode 的 smoothingTimeConstant 完全一致语义。
   * Spec 公式：X̂_smoothed[k] = τ * X̂_smoothed_prev[k] + (1 − τ) * |X̂_current[k]|
   * 必须在"线性 amp 上"做，不能在 dB 后做（spec 要求）。
   *
   * τ 与 src/audio/AudioEngine.ts 里 analyser.smoothingTimeConstant 严格对齐。
   * 注意：preview 是按 rAF (~60Hz) 应用一次平滑，offline 是按 hop 率 (~94Hz @ 48kHz) 应用一次。
   * 频率不同所以"等效时间常数"略有差异（preview ~39ms / offline ~30ms），但已经足以让
   * 离线渲染的相邻帧之间产生足够的"惯性"来消除肉眼可见的抖动。
   */
  const SMOOTHING_TC = 0.65;
  const ampSmoothed = new Float32Array(binCount); // 线性 amp 的滚动平滑缓冲
  let smoothedInited = false;

  // 分析进度占总进度 0..0.9，BPM 占 0.9..1
  const yieldEvery = 256;

  for (let i = 0; i < frameCount; i++) {
    const start = i * hopSize;
    for (let k = 0; k < frameSize; k++) {
      windowed[k] = mono[start + k] * window[k];
    }

    let mFeatures: MeydaBatch;
    try {
      mFeatures = (Meyda as any).extract(
        ['rms', 'spectralCentroid', 'amplitudeSpectrum'],
        windowed
      ) as MeydaBatch;
    } catch (e) {
      console.warn('[OfflineAnalyzer] Meyda.extract 失败：', e);
      mFeatures = {
        rms: 0,
        spectralCentroid: 0,
        amplitudeSpectrum: new Float32Array(binCount),
      };
    }

    rms[i] = mFeatures.rms ?? 0;
    centroid[i] = mFeatures.spectralCentroid ?? 0;

    const spec = mFeatures.amplitudeSpectrum;
    const fftSliceStart = i * binCount;
    for (let k = 0; k < binCount; k++) {
      // 1) 归一化到 spec 等价的 |X̂[k]| 量级（除以 N = frameSize）
      //    ——修掉了 Meyda amplitudeSpectrum 不除 N 导致 dB 全是正数 → norm 全 clamp 到 1 的 bug
      const rawAmp = (spec[k] ?? 0) / frameSize;
      // 2) 在线性 amp 上做时域平滑（spec 要求）—— 这是修"导出抖动"的关键
      const smoothedAmp = smoothedInited
        ? ampSmoothed[k] * SMOOTHING_TC + rawAmp * (1 - SMOOTHING_TC)
        : rawAmp;
      ampSmoothed[k] = smoothedAmp;
      // 3) 再做 dB → norm
      const db = 20 * Math.log10(Math.max(1e-10, smoothedAmp));
      const norm = Math.max(0, Math.min(1, (db - DB_MIN) / DB_RANGE));
      fftFlat[fftSliceStart + k] = norm;
    }
    smoothedInited = true;

    if (prevSpectrum) {
      let f = 0;
      for (let k = 0; k < binCount; k++) {
        const d = (spec[k] ?? 0) - (prevSpectrum[k] ?? 0);
        if (d > 0) f += d;
      }
      flux[i] = f;
    } else {
      flux[i] = 0;
    }

    if (!prevSpectrum || prevSpectrum.length !== spec.length) {
      prevSpectrum = new Float32Array(spec.length);
    }
    prevSpectrum.set(spec);

    const fftView = fftFlat.subarray(
      fftSliceStart,
      fftSliceStart + binCount
    ) as Float32Array<ArrayBuffer>;
    const [b0, b1, b2, b3] = bandsForFrame(fftView, sampleRate, frameSize);
    const bIdx = i * 4;
    bandsFlat[bIdx + 0] = b0;
    bandsFlat[bIdx + 1] = b1;
    bandsFlat[bIdx + 2] = b2;
    bandsFlat[bIdx + 3] = b3;

    if ((i & (yieldEvery - 1)) === 0) {
      onProgress((i / frameCount) * 0.9);
      await yieldToUi();
    }
  }

  onProgress(0.9);
  const hopSec = hopSize / sampleRate;
  const beatTimes = detectBeatsFromFlux(flux, hopSec) as Float32Array<ArrayBuffer>;

  let bpm: number | null = null;
  try {
    const guessed = await guess(audioBuffer);
    bpm = guessed.bpm;
  } catch (e) {
    console.warn('[OfflineAnalyzer] BPM 检测失败：', e);
  }
  onProgress(1);

  return new FeatureTimeline({
    duration: audioBuffer.duration,
    sampleRate,
    hopSec,
    frameCount,
    binCount,
    fftFlat,
    rms,
    centroid,
    flux,
    bandsFlat,
    beatTimes,
    bpm,
  });
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function mixToMono(buf: AudioBuffer): Float32Array {
  const length = buf.length;
  const channels = buf.numberOfChannels;
  if (channels === 1) {
    const src = buf.getChannelData(0);
    const out = new Float32Array(length);
    out.set(src);
    return out;
  }
  const out = new Float32Array(length);
  for (let c = 0; c < channels; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < length; i++) out[i] += data[i];
  }
  const inv = 1 / channels;
  for (let i = 0; i < length; i++) out[i] *= inv;
  return out;
}

function hannWindow(N: number): Float32Array {
  const w = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    w[n] = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (N - 1)));
  }
  return w;
}

function detectBeatsFromFlux(
  flux: Float32Array<ArrayBuffer>,
  hopSec: number
): Float32Array {
  const beats: number[] = [];
  const n = flux.length;
  if (n < 4) return new Float32Array(beats);

  const window = Math.max(8, Math.floor(0.4 / hopSec)); // ~0.4s 半窗
  const cooldownSec = 0.11;
  let lastBeatTime = -Infinity;

  for (let i = 1; i < n - 1; i++) {
    const start = Math.max(0, i - window);
    const end = Math.min(n - 1, i + window);
    let sum = 0;
    let count = 0;
    for (let k = start; k <= end; k++) {
      sum += flux[k];
      count++;
    }
    const mean = sum / count;
    let varSum = 0;
    for (let k = start; k <= end; k++) varSum += (flux[k] - mean) ** 2;
    const std = Math.sqrt(varSum / count);
    const threshold = mean + 1.4 * std;

    if (
      flux[i] > threshold &&
      flux[i] > flux[i - 1] &&
      flux[i] >= flux[i + 1] &&
      flux[i] > 1e-3
    ) {
      const t = i * hopSec;
      if (t - lastBeatTime > cooldownSec) {
        beats.push(t);
        lastBeatTime = t;
      }
    }
  }
  return new Float32Array(beats);
}
