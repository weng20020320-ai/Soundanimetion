import { useT } from '../i18n';

export interface ExportProgressState {
  phase: 'analyzing' | 'rendering';
  ratio: number;
  message: string;
  fps?: number;
  etaSec?: number;
  frame?: number;
  totalFrames?: number;
  /** 当前在 transport 中等待 ack 的帧数。 */
  inFlight?: number;
  /** true = 主循环被 ffmpeg 背压挡住，UI 应当提示用户"在等 ffmpeg 落盘"。 */
  waitingForFfmpeg?: boolean;
  /** 最近一行 ffmpeg stderr 日志（diagnose 用，可空）。 */
  lastFfmpegLog?: string | null;
  /** 编码器自动回退提示（硬编失败 → libx264）。可空。 */
  encoderFallbackNotice?: string | null;
}

interface Props {
  state: ExportProgressState;
  onCancel: () => void;
}

export function ExportProgress({ state, onCancel }: Props) {
  const t = useT();
  const isWaiting = !!state.waitingForFfmpeg;
  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: 520 }}>
        <h2>
          {state.phase === 'analyzing'
            ? t.exportProgress.titleAnalyzing
            : t.exportProgress.titleRendering}
        </h2>
        <div className="progress-bar">
          <div style={{ width: `${Math.round(state.ratio * 100)}%` }} />
        </div>
        <span className="dim" style={{ fontSize: 12 }}>
          {Math.round(state.ratio * 100)}% ·{' '}
          {isWaiting ? t.exportProgress.waitingFfmpeg : state.message}
        </span>
        {state.phase === 'rendering' && state.frame !== undefined && (
          <span className="dim" style={{ fontSize: 11 }}>
            {t.exportProgress.frameStats(
              state.frame,
              state.totalFrames ?? 0,
              state.fps ?? null,
              state.etaSec ?? null,
              state.inFlight ?? null
            )}
          </span>
        )}
        {isWaiting && (
          <span
            className="dim"
            style={{
              fontSize: 11,
              color: 'var(--accent, #b88)',
              display: 'block',
              whiteSpace: 'pre-line',
            }}
          >
            {t.exportProgress.waitingFfmpegHint}
          </span>
        )}
        {state.encoderFallbackNotice && (
          <div
            style={{
              fontSize: 11,
              margin: '6px 0 0',
              padding: '6px 8px',
              background: 'rgba(255,180,0,0.12)',
              border: '1px solid rgba(255,180,0,0.4)',
              borderRadius: 4,
              color: '#ffcc66',
              whiteSpace: 'pre-line',
            }}
          >
            {state.encoderFallbackNotice}
          </div>
        )}
        {state.lastFfmpegLog && (
          <pre
            style={{
              fontSize: 10,
              margin: '6px 0 0',
              padding: 6,
              maxHeight: 60,
              overflow: 'auto',
              background: 'var(--bg-2, #111)',
              border: '1px solid var(--border, #333)',
              borderRadius: 4,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              color: 'var(--text-dim, #888)',
            }}
            title="ffmpeg log"
          >
            {t.exportProgress.ffmpegLogPrefix} {state.lastFfmpegLog}
          </pre>
        )}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button onClick={onCancel}>{t.exportProgress.cancel}</button>
        </div>
      </div>
    </div>
  );
}
