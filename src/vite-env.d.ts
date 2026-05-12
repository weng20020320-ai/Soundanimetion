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

interface ImportMetaEnv {
  readonly VITE_PLATFORM?: 'electron' | 'web';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
