/// <reference types="vite/client" />

declare module 'meyda' {
  const Meyda: any;
  export default Meyda;
}

declare module 'web-audio-beat-detector' {
  export function analyze(audioBuffer: AudioBuffer): Promise<number>;
  export function guess(
    audioBuffer: AudioBuffer
  ): Promise<{ bpm: number; offset: number }>;
}
