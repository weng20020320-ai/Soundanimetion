import Meyda from 'meyda';
import { AudioFeatures, BAND_RANGES, AudioBands } from './types';
import type { AudioEngine } from './AudioEngine';

interface MeydaFeatures {
  rms?: number;
  loudness?: { total: number };
  spectralCentroid?: number;
}

/**
 * 实时特征提取器：把 AudioEngine 的 AnalyserNode + Meyda 输出归一化为 AudioFeatures。
 * 调用流程：
 *   const ext = new RealtimeFeatureExtractor(engine);
 *   ext.start();
 *   每帧 const f = ext.read();
 */
export class RealtimeFeatureExtractor {
  private engine: AudioEngine;
  private fftDb: Float32Array<ArrayBuffer>;
  private fftLinear: Float32Array<ArrayBuffer>;
  private prevFftLinear: Float32Array<ArrayBuffer>;
  private timeDomain: Float32Array<ArrayBuffer>;
  private meydaAnalyzer: { start: () => void; stop: () => void } | null = null;
  private lastMeyda: MeydaFeatures = {};

  // 节拍检测用滑动窗口
  private fluxHistory: number[] = [];
  private readonly fluxHistoryLen = 43; // ~1s @ ~43Hz callback rate
  private lastBeatAt = -Infinity;
  private readonly beatCooldownMs = 110; // ~ 545 BPM 上限

  constructor(engine: AudioEngine) {
    this.engine = engine;
    const bins = engine.analyser.frequencyBinCount;
    this.fftDb = new Float32Array(bins);
    this.fftLinear = new Float32Array(bins);
    this.prevFftLinear = new Float32Array(bins);
    this.timeDomain = new Float32Array(engine.analyser.fftSize);
  }

  start(): void {
    if (this.meydaAnalyzer) return;

    try {
      // 注意：Meyda 的 spectralFlux 特征提取器有 bug —— 第一帧
      // previousSignal 为 null 时会抛 TypeError，并使得 previousFrame
      // 永远不会被赋值，导致此后每一帧都抛错（每秒数百次）。这里我们只用
      // Meyda 算 rms/loudness/spectralCentroid，自己用 FFT 数据算 flux。
      const analyzer = (Meyda as any).createMeydaAnalyzer({
        audioContext: this.engine.audioCtx,
        source: this.engine.analyser,
        bufferSize: 1024,
        featureExtractors: ['rms', 'loudness', 'spectralCentroid'],
        callback: (features: MeydaFeatures) => {
          this.lastMeyda = features;
        },
      });
      analyzer.start();
      this.meydaAnalyzer = analyzer;
    } catch (e) {
      console.warn('[Meyda] 初始化失败，将退化为纯 AnalyserNode：', e);
    }
  }

  stop(): void {
    if (this.meydaAnalyzer) {
      try {
        this.meydaAnalyzer.stop();
      } catch {
        /* ignore */
      }
      // Meyda.stop() 只设了一个标志位，ScriptProcessorNode 仍然连接在 AudioContext 上。
      // 当 AudioEngine 被释放时，未断开的 spn 仍会触发回调，因此显式断开它。
      try {
        const a = this.meydaAnalyzer as unknown as { _m?: { spn?: AudioNode } };
        const spn = a?._m?.spn;
        if (spn && typeof spn.disconnect === 'function') {
          try {
            spn.disconnect();
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
      }
      this.meydaAnalyzer = null;
    }
  }

  /**
   * 读取当前帧特征（应在 rAF 内每帧调用一次）。
   */
  read(): AudioFeatures {
    const { analyser, audioCtx } = this.engine;

    analyser.getFloatFrequencyData(this.fftDb);
    analyser.getFloatTimeDomainData(this.timeDomain);

    // dB → 0..1 线性。Float dB 范围一般 -100..0
    const minDb = analyser.minDecibels; // -100
    const maxDb = analyser.maxDecibels; // -30
    const span = Math.max(1, maxDb - minDb);
    for (let i = 0; i < this.fftDb.length; i++) {
      const v = (this.fftDb[i] - minDb) / span;
      this.fftLinear[i] = v < 0 ? 0 : v > 1 ? 1 : v;
    }

    const sr = audioCtx.sampleRate;
    const fftSize = analyser.fftSize;
    const bands = computeBands(this.fftLinear, sr, fftSize);

    let rms = this.lastMeyda.rms ?? rmsFallback(this.timeDomain);
    let loudness = this.lastMeyda.loudness?.total ?? rms * 24; // 粗略量级
    let centroid = this.lastMeyda.spectralCentroid ?? 0;

    // 自己用线性 FFT 算 spectral flux：sum_max(0, |X_t[k]| - |X_{t-1}[k]|)
    // 替代 Meyda 自带 spectralFlux（其 bug 在 previousSignal=null 时永久抛错）。
    let flux = 0;
    for (let i = 0; i < this.fftLinear.length; i++) {
      const d = this.fftLinear[i] - this.prevFftLinear[i];
      if (d > 0) flux += d;
    }
    flux /= Math.max(1, this.fftLinear.length);
    this.prevFftLinear.set(this.fftLinear);

    const beat = this.detectBeat(flux);

    return {
      time: this.engine.getState().currentTime,
      fft: this.fftLinear,
      bands,
      rms,
      loudness,
      spectralCentroid: centroid,
      spectralFlux: flux,
      beat,
      bpm: null, // 离线分析阶段填
      onsetStrength: flux,
    };
  }

  private detectBeat(flux: number): boolean {
    const h = this.fluxHistory;
    h.push(flux);
    if (h.length > this.fluxHistoryLen) h.shift();
    if (h.length < 8) return false;

    let sum = 0;
    for (const v of h) sum += v;
    const mean = sum / h.length;
    let varSum = 0;
    for (const v of h) varSum += (v - mean) ** 2;
    const std = Math.sqrt(varSum / h.length);
    const threshold = mean + 1.4 * std;

    const now = performance.now();
    if (
      flux > threshold &&
      flux > 1e-3 &&
      now - this.lastBeatAt > this.beatCooldownMs
    ) {
      this.lastBeatAt = now;
      return true;
    }
    return false;
  }
}

function rmsFallback(timeDomain: Float32Array<ArrayBuffer>): number {
  let sum = 0;
  for (let i = 0; i < timeDomain.length; i++) sum += timeDomain[i] * timeDomain[i];
  return Math.sqrt(sum / timeDomain.length);
}

export function computeBands(
  fftLinear: Float32Array<ArrayBuffer>,
  sampleRate: number,
  fftSize: number
): AudioBands {
  const result: AudioBands = { bass: 0, lowMid: 0, mid: 0, high: 0 };
  for (const key of Object.keys(BAND_RANGES) as (keyof AudioBands)[]) {
    const [lo, hi] = BAND_RANGES[key];
    result[key] = bandEnergy(fftLinear, lo, hi, sampleRate, fftSize);
  }
  return result;
}

function bandEnergy(
  fft: Float32Array<ArrayBuffer>,
  lowHz: number,
  highHz: number,
  sampleRate: number,
  fftSize: number
): number {
  const nyq = sampleRate / 2;
  const binCount = fft.length;
  const lo = Math.max(0, Math.min(binCount - 1, Math.floor((lowHz / nyq) * binCount)));
  const hi = Math.max(lo, Math.min(binCount - 1, Math.ceil((highHz / nyq) * binCount)));
  let sum = 0;
  let count = 0;
  for (let i = lo; i <= hi; i++) {
    sum += fft[i];
    count++;
  }
  return count > 0 ? sum / count : 0;
}
