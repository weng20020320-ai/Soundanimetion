export interface AudioBands {
  bass: number;
  lowMid: number;
  mid: number;
  high: number;
}

export interface AudioFeatures {
  time: number;
  fft: Float32Array<ArrayBuffer>;
  bands: AudioBands;
  rms: number;
  loudness: number;
  spectralCentroid: number;
  spectralFlux: number;
  beat: boolean;
  bpm: number | null;
  onsetStrength: number;
}

export const BAND_RANGES: Record<keyof AudioBands, [number, number]> = {
  bass: [20, 250],
  lowMid: [250, 500],
  mid: [500, 2000],
  high: [2000, 8000],
};

export function emptyFeatures(fftSize: number): AudioFeatures {
  return {
    time: 0,
    fft: new Float32Array(fftSize / 2),
    bands: { bass: 0, lowMid: 0, mid: 0, high: 0 },
    rms: 0,
    loudness: 0,
    spectralCentroid: 0,
    spectralFlux: 0,
    beat: false,
    bpm: null,
    onsetStrength: 0,
  };
}
