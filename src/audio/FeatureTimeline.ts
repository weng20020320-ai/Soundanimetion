import {
  AudioFeatures,
  AudioBands,
  BAND_RANGES,
} from './types';

export interface FeatureTimelineData {
  duration: number;
  sampleRate: number;
  hopSec: number;
  frameCount: number;
  binCount: number;
  /** [frameCount * binCount] 0..1 归一化频谱（与实时路径一致） */
  fftFlat: Float32Array<ArrayBuffer>;
  rms: Float32Array<ArrayBuffer>;
  centroid: Float32Array<ArrayBuffer>;
  flux: Float32Array<ArrayBuffer>;
  /** [frameCount * 4]：bass / lowMid / mid / high */
  bandsFlat: Float32Array<ArrayBuffer>;
  beatTimes: Float32Array<ArrayBuffer>;
  bpm: number | null;
}

/**
 * 离线分析输出：按时间索引的特征时间轴。
 * 所有数组长度与 frameCount 对齐；fft 与 bands 是 flat layout。
 */
export class FeatureTimeline {
  readonly data: FeatureTimelineData;

  private scratchBands: AudioBands = { bass: 0, lowMid: 0, mid: 0, high: 0 };
  private lastBeatLookupIdx = 0;

  constructor(data: FeatureTimelineData) {
    this.data = data;
  }

  get duration(): number {
    return this.data.duration;
  }

  get bpm(): number | null {
    return this.data.bpm;
  }

  get beatTimes(): Float32Array<ArrayBuffer> {
    return this.data.beatTimes;
  }

  /** 给定时间，返回该时刻的 AudioFeatures。fft 是 flat 数组的视图，调用方不应缓存。 */
  at(time: number, sinceTime?: number): AudioFeatures {
    const { hopSec, frameCount, binCount, fftFlat, rms, centroid, flux, bandsFlat } = this.data;
    const idx = Math.max(0, Math.min(frameCount - 1, Math.round(time / hopSec)));
    const fftStart = idx * binCount;
    const fft = fftFlat.subarray(fftStart, fftStart + binCount) as Float32Array<ArrayBuffer>;

    const bandStart = idx * 4;
    this.scratchBands.bass = bandsFlat[bandStart + 0];
    this.scratchBands.lowMid = bandsFlat[bandStart + 1];
    this.scratchBands.mid = bandsFlat[bandStart + 2];
    this.scratchBands.high = bandsFlat[bandStart + 3];

    const beat =
      sinceTime !== undefined
        ? this.beatBetween(sinceTime, time)
        : this.beatNear(time, hopSec);

    return {
      time,
      fft,
      bands: { ...this.scratchBands },
      rms: rms[idx],
      loudness: rms[idx] * 24,
      spectralCentroid: centroid[idx],
      spectralFlux: flux[idx],
      beat,
      bpm: this.data.bpm,
      onsetStrength: flux[idx],
    };
  }

  /** 时间区间 (t0, t1] 内是否存在 beat。优化为带状态的近似线性扫描。 */
  beatBetween(t0: number, t1: number): boolean {
    const beats = this.data.beatTimes;
    if (beats.length === 0) return false;
    if (t1 <= t0) return false;

    // 重置：若 t0 比上次缓存的位置早很多
    if (t0 < beats[Math.max(0, this.lastBeatLookupIdx - 1)]) {
      this.lastBeatLookupIdx = 0;
    }
    let i = this.lastBeatLookupIdx;
    while (i < beats.length && beats[i] <= t0) i++;
    if (i < beats.length && beats[i] <= t1) {
      this.lastBeatLookupIdx = i + 1;
      return true;
    }
    this.lastBeatLookupIdx = i;
    return false;
  }

  beatNear(time: number, tolerance: number): boolean {
    const beats = this.data.beatTimes;
    if (beats.length === 0) return false;
    // 二分查找最近的
    let lo = 0;
    let hi = beats.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (beats[mid] < time) lo = mid + 1;
      else hi = mid - 1;
    }
    const cand = [];
    if (lo < beats.length) cand.push(beats[lo]);
    if (lo > 0) cand.push(beats[lo - 1]);
    return cand.some((b) => Math.abs(b - time) <= tolerance);
  }
}

export function bandsForFrame(
  fft: Float32Array<ArrayBuffer>,
  sampleRate: number,
  fftSize: number
): [number, number, number, number] {
  const nyq = sampleRate / 2;
  const binCount = fft.length;
  const out: [number, number, number, number] = [0, 0, 0, 0];
  const keys: (keyof AudioBands)[] = ['bass', 'lowMid', 'mid', 'high'];
  for (let bi = 0; bi < 4; bi++) {
    const [low, high] = BAND_RANGES[keys[bi]];
    const lo = Math.max(0, Math.min(binCount - 1, Math.floor((low / nyq) * binCount)));
    const hi = Math.max(lo, Math.min(binCount - 1, Math.ceil((high / nyq) * binCount)));
    let sum = 0;
    let count = 0;
    for (let i = lo; i <= hi; i++) {
      sum += fft[i];
      count++;
    }
    out[bi] = count > 0 ? sum / count : 0;
  }
  void fftSize;
  return out;
}
