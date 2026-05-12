import { useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';

interface Props {
  /** 同一个 media element（可能是 HTMLAudioElement 或 HTMLVideoElement）。 */
  mediaElement: HTMLMediaElement | null;
  audioUrl: string | null;
  fileKey: string | null;
}

/**
 * 用 wavesurfer.js 显示当前音频的波形并与 AudioEngine 共享 media element。
 * 拖动/点击波形会通过 audio element 同步到 engine（engine 监听 timeupdate / play / pause）。
 */
export function WaveformBar({ mediaElement, audioUrl, fileKey }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!mediaElement || !audioUrl) {
      wsRef.current?.destroy();
      wsRef.current = null;
      return;
    }
    wsRef.current?.destroy();
    try {
      const ws = WaveSurfer.create({
        container: containerRef.current,
        height: 56,
        waveColor: '#3a4250',
        progressColor: '#6aa9ff',
        cursorColor: '#ffffff',
        cursorWidth: 1,
        normalize: true,
        media: mediaElement,
        url: audioUrl,
        interact: true,
      });
      wsRef.current = ws;
    } catch (e) {
      console.error('[WaveformBar] wavesurfer init failed:', e);
    }
    return () => {
      wsRef.current?.destroy();
      wsRef.current = null;
    };
  }, [mediaElement, audioUrl, fileKey]);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        minHeight: 56,
        background: 'transparent',
      }}
    />
  );
}
