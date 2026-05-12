import { useEffect, useMemo, useState } from 'react';
import type {
  ExportFormat,
  ExportQuality,
  HardwareEncodersInfo,
  VideoEncoder,
} from '../../electron/preload';
import type { GpuInfo } from '../render/GpuTier';
import {
  resolvePipelineConfig,
  type QualityProfile,
} from '../render/OfflineRenderer';
import {
  pickDefaultEncoder,
  describeEncoderChoice,
} from '../render/EncoderSelector';
import { estimateExportSize } from '../render/SizeEstimator';
import { useT } from '../i18n';
import { useAppStore, getAspectRatio } from '../store/app-store';

export interface ExportSettings {
  format: ExportFormat;
  width: number;
  height: number;
  fps: number;
  startSec: number;
  endSec: number;
  bgColor: string;
  bgAlpha: number;
  quality: ExportQuality;
  encoder: VideoEncoder;
  qualityProfile: QualityProfile;
  /** 导出时强制关闭 PostFX 颗粒和暗角，背景保持纯色，方便后期抠像 / 合成。 */
  cleanBackground: boolean;
}

interface ExportDialogProps {
  duration: number;
  defaultBgColor: string;
  defaultBgAlpha: number;
  audioFileName: string | null;
  hwEncoders: HardwareEncodersInfo | null;
  gpuInfo: GpuInfo | null;
  onCancel: () => void;
  onConfirm: (settings: ExportSettings) => void;
}

/**
 * 根据当前 aspect ratio 生成 720p/1080p/1440p/4K 四档分辨率预设。
 * 命名采用「短边」规则：1080p 横屏 = 1920×1080，1080p 竖屏 = 1080×1920。
 * 这样 1080p 在所有 aspect 下都是相同感觉的"主流流媒体清晰度"。
 */
function buildResolutionPresets(
  aspect: number
): ReadonlyArray<{ label: string; w: number; h: number }> {
  const tiers: ReadonlyArray<{ name: string; min: number }> = [
    { name: '720p', min: 720 },
    { name: '1080p', min: 1080 },
    { name: '1440p', min: 1440 },
    { name: '4K', min: 2160 },
  ];
  return tiers.map(({ name, min }) => {
    let w: number;
    let h: number;
    if (aspect >= 1) {
      h = min;
      w = Math.round(min * aspect);
    } else {
      w = min;
      h = Math.round(min / aspect);
    }
    if (w % 2) w += 1;
    if (h % 2) h += 1;
    return { label: `${name} (${w}×${h})`, w, h };
  });
}

const FPS_PRESETS = [24, 30, 60];

export function ExportDialog({
  duration,
  defaultBgColor,
  defaultBgAlpha,
  audioFileName,
  hwEncoders,
  gpuInfo,
  onCancel,
  onConfirm,
}: ExportDialogProps) {
  const t = useT();
  const targetAspectId = useAppStore((s) => s.targetAspectId);
  const targetAspect = getAspectRatio(targetAspectId);

  const aspectPresets = useMemo(
    () => buildResolutionPresets(targetAspect),
    [targetAspect]
  );

  const [format, setFormat] = useState<ExportFormat>('mp4');
  const [resPresetIdx, setResPresetIdx] = useState(1); // 1080p
  const [customW, setCustomW] = useState(aspectPresets[1].w);
  const [customH, setCustomH] = useState(aspectPresets[1].h);
  const [fps, setFps] = useState(30);
  const [startSec, setStartSec] = useState(0);
  const [endSec, setEndSec] = useState(duration);
  const [bgColor, setBgColor] = useState(defaultBgColor);
  const [bgAlpha, setBgAlpha] = useState(defaultBgAlpha);
  const [cleanBackground, setCleanBackground] = useState(false);
  // 默认 standard（CRF 20）：1080p60 20s ≈ 25-35MB，肉眼几乎和 high (CRF 17, ≈80MB) 没差别
  // 之前默认 high 导致 20s 视频出 400+ MB
  const [quality, setQuality] = useState<ExportQuality>('standard');
  const [qualityProfile, setQualityProfile] = useState<QualityProfile>('auto');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const resolutionPresets = useMemo(
    () => [
      ...aspectPresets,
      { label: t.exportDialog.resolutionCustom, w: 0, h: 0 },
    ],
    [t, aspectPresets]
  );

  // aspect 变化时把 custom 字段重置到新 aspect 的 1080p tier，避免上次的 16:9 1920×1080
  // 还残留在用户切到竖屏后的输入框里。
  useEffect(() => {
    setCustomW(aspectPresets[1].w);
    setCustomH(aspectPresets[1].h);
  }, [aspectPresets]);

  const qualityLabels = useMemo(
    () =>
      [
        {
          id: 'draft' as const,
          label: t.exportDialog.qualityDraft,
          hint: t.exportDialog.qualityDraftHint,
        },
        {
          id: 'standard' as const,
          label: t.exportDialog.qualityStandard,
          hint: t.exportDialog.qualityStandardHint,
        },
        {
          id: 'high' as const,
          label: t.exportDialog.qualityHigh,
          hint: t.exportDialog.qualityHighHint,
        },
        {
          id: 'best' as const,
          label: t.exportDialog.qualityBest,
          hint: t.exportDialog.qualityBestHint,
        },
      ],
    [t]
  );

  const profileLabels = useMemo(
    () =>
      [
        {
          id: 'auto' as const,
          label: t.exportDialog.profileAuto,
          hint: t.exportDialog.profileAutoHint,
        },
        {
          id: 'fast' as const,
          label: t.exportDialog.profileFast,
          hint: t.exportDialog.profileFastHint,
        },
        {
          id: 'balanced' as const,
          label: t.exportDialog.profileBalanced,
          hint: t.exportDialog.profileBalancedHint,
        },
        {
          id: 'ultra' as const,
          label: t.exportDialog.profileUltra,
          hint: t.exportDialog.profileUltraHint,
        },
      ],
    [t]
  );

  const mp4Encoders: VideoEncoder[] = useMemo(() => {
    const list: VideoEncoder[] = ['libx264'];
    const hw = hwEncoders?.available || [];
    for (const e of hw) {
      if (e.startsWith('h264_')) list.push(e);
    }
    return list;
  }, [hwEncoders]);

  // bug A 修复：编码器要按"用户实际显卡 vendor"匹配，不能拿 ffmpeg 二进制能编的编码器列表当默认
  // 否则 A 卡机器永远默认 NVENC、I 卡机器永远默认 NVENC，要用户每次手动切
  const [encoder, setEncoder] = useState<VideoEncoder>(() =>
    pickDefaultEncoder(gpuInfo, hwEncoders)
  );
  // 用户是否手动改过编码器（手动改过就别再被自动覆盖）
  const [encoderUserOverride, setEncoderUserOverride] = useState(false);

  useEffect(() => {
    setEndSec(duration);
  }, [duration]);

  useEffect(() => {
    // 当 GPU/编码器探测结果变化（异步到达）时，若用户没动过手，自动选"匹配 vendor"的硬件编码器
    if (encoderUserOverride) return;
    const next = pickDefaultEncoder(gpuInfo, hwEncoders);
    setEncoder(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hwEncoders, gpuInfo]);

  const supportsAlpha = format === 'prores4444' || format === 'pngseq';

  useEffect(() => {
    if (!supportsAlpha && bgAlpha === 0) {
      setBgAlpha(1);
    }
  }, [supportsAlpha, bgAlpha]);

  const { width, height } = useMemo(() => {
    const preset = resolutionPresets[resPresetIdx];
    if (preset.w === 0) {
      return { width: customW, height: customH };
    }
    return { width: preset.w, height: preset.h };
  }, [resPresetIdx, customW, customH, resolutionPresets]);

  const totalFrames = Math.max(1, Math.ceil((endSec - startSec) * fps));
  const estimatedBytesPerFrame = width * height * 4;
  const sizeEstimate = useMemo(
    () =>
      estimateExportSize({
        format,
        width,
        height,
        fps,
        durationSec: Math.max(0, endSec - startSec),
        encoder,
        quality,
        hasAudio: !!audioFileName && format !== 'pngseq',
      }),
    [format, width, height, fps, endSec, startSec, encoder, quality, audioFileName]
  );

  function handleConfirm() {
    if (endSec <= startSec) return;
    onConfirm({
      format,
      width,
      height,
      fps,
      startSec,
      endSec,
      bgColor,
      bgAlpha,
      quality,
      encoder,
      qualityProfile,
      cleanBackground,
    });
  }

  // 把 OfflineRenderer 的 description（zh-CN 硬编码）映射成本地化文本，确保 UI 一致性。
  const effectiveDescription = useMemo(() => {
    const cfg = resolvePipelineConfig(qualityProfile, gpuInfo?.tier ?? 'unknown');
    if (cfg.description.startsWith('极速'))
      return t.exportDialog.pipelineDescFast;
    if (cfg.description.startsWith('平衡'))
      return t.exportDialog.pipelineDescBalanced;
    if (cfg.description.startsWith('极致'))
      return t.exportDialog.pipelineDescUltra;
    return cfg.description;
  }, [qualityProfile, gpuInfo, t]);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t.exportDialog.title}</h2>

        <div className="field">
          <label>{t.exportDialog.formatLabel}</label>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as ExportFormat)}
          >
            <option value="mp4">{t.exportDialog.formatMp4}</option>
            <option value="prores4444">{t.exportDialog.formatProRes}</option>
            <option value="pngseq">{t.exportDialog.formatPngSeq}</option>
          </select>
          {format === 'pngseq' && (
            <span className="dim" style={{ fontSize: 11 }}>
              {t.exportDialog.pngSeqHint}
            </span>
          )}
        </div>

        <div className="field">
          <label>{t.exportDialog.qualityLabel}</label>
          <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
            {qualityLabels.map((q) => (
              <button
                key={q.id}
                onClick={() => setQuality(q.id)}
                style={{
                  background: quality === q.id ? 'var(--accent-soft)' : 'var(--bg-2)',
                  borderColor:
                    quality === q.id ? 'var(--accent)' : 'var(--border)',
                  padding: '4px 10px',
                }}
                title={q.hint}
              >
                {q.label}
              </button>
            ))}
            <span className="dim" style={{ fontSize: 11 }}>
              {qualityLabels.find((q) => q.id === quality)?.hint}
            </span>
          </div>
        </div>

        <div className="field">
          <label>{t.exportDialog.resolutionLabel}</label>
          <select
            value={resPresetIdx}
            onChange={(e) => setResPresetIdx(Number(e.target.value))}
          >
            {resolutionPresets.map((p, i) => (
              <option key={i} value={i}>
                {p.label}
              </option>
            ))}
          </select>
          {resolutionPresets[resPresetIdx].w === 0 && (
            <div className="row" style={{ marginTop: 4 }}>
              <input
                type="number"
                value={customW}
                min={2}
                step={2}
                onChange={(e) =>
                  setCustomW(
                    Math.max(2, Math.floor(Number(e.target.value) / 2) * 2)
                  )
                }
                style={{ width: 90 }}
              />
              <span className="dim">×</span>
              <input
                type="number"
                value={customH}
                min={2}
                step={2}
                onChange={(e) =>
                  setCustomH(
                    Math.max(2, Math.floor(Number(e.target.value) / 2) * 2)
                  )
                }
                style={{ width: 90 }}
              />
              <span className="dim">{t.exportDialog.resolutionEvenHint}</span>
            </div>
          )}
        </div>

        <div className="field">
          <label>{t.exportDialog.fpsLabel}</label>
          <div className="row">
            {FPS_PRESETS.map((p) => (
              <label
                key={p}
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <input
                  type="radio"
                  name="fps"
                  value={p}
                  checked={fps === p}
                  onChange={() => setFps(p)}
                />
                {p}
              </label>
            ))}
          </div>
        </div>

        <div className="field">
          <label>{t.exportDialog.timeRangeLabel}</label>
          <div className="row">
            <input
              type="number"
              min={0}
              max={duration}
              step={0.01}
              value={startSec}
              onChange={(e) =>
                setStartSec(Math.max(0, Math.min(duration, Number(e.target.value))))
              }
              style={{ width: 100 }}
            />
            <span className="dim">→</span>
            <input
              type="number"
              min={0}
              max={duration}
              step={0.01}
              value={endSec}
              onChange={(e) =>
                setEndSec(Math.max(0, Math.min(duration, Number(e.target.value))))
              }
              style={{ width: 100 }}
            />
            <span className="dim">
              {t.exportDialog.timeRangeSummary(endSec - startSec, totalFrames)}
            </span>
          </div>
        </div>

        <div className="field">
          <label>{t.exportDialog.backgroundLabel}</label>
          <div className="row">
            <input
              type="color"
              value={bgColor}
              onChange={(e) => setBgColor(e.target.value)}
              style={{
                width: 36,
                height: 24,
                padding: 0,
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 4,
              }}
              disabled={bgAlpha === 0}
            />
            <label
              className="dim"
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <input
                type="checkbox"
                checked={bgAlpha === 0}
                onChange={(e) => setBgAlpha(e.target.checked ? 0 : 1)}
                disabled={!supportsAlpha}
              />
              {t.exportDialog.transparentLabel}
            </label>
          </div>
          {!supportsAlpha && (
            <span className="dim" style={{ fontSize: 11 }}>
              {t.exportDialog.transparentNotSupported}
            </span>
          )}
          <label
            className="dim"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 4,
            }}
            title={t.exportDialog.cleanBackgroundHint}
          >
            <input
              type="checkbox"
              checked={cleanBackground}
              onChange={(e) => setCleanBackground(e.target.checked)}
            />
            {t.exportDialog.cleanBackgroundLabel}
          </label>
        </div>

        <div className="field">
          <span className="dim" style={{ fontSize: 11 }}>
            {t.exportDialog.audioInfo(
              audioFileName ?? t.exportDialog.audioNotLoaded,
              estimatedBytesPerFrame / 1024 / 1024
            )}
          </span>
        </div>

        <div
          className="field"
          style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '8px 10px',
          }}
        >
          <label style={{ fontSize: 12, marginBottom: 2 }}>
            {t.exportDialog.sizeEstimateLabel}
          </label>
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            {t.exportDialog.sizeEstimateValue({
              totalMB: sizeEstimate.totalMB,
              videoMB: sizeEstimate.videoMB,
              audioMB: sizeEstimate.audioMB,
              uncertaintyPct: sizeEstimate.uncertaintyPct,
              hasAudio: sizeEstimate.hasAudio,
            })}
          </span>
          <span className="dim" style={{ fontSize: 11, display: 'block' }}>
            {sizeEstimate.videoMbps.toFixed(1)} Mbps
          </span>
        </div>

        {/* 高级折叠区：把"编码器"和"渲染管线"两个工程性选项收起来；普通用户不用看 */}
        <div className="field">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-2)',
              padding: '4px 0',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            {advancedOpen ? '▼ ' : '▶ '}
            {t.exportDialog.advancedToggle}
          </button>

          {advancedOpen && (
            <div
              style={{
                marginTop: 6,
                padding: '8px 10px',
                background: 'var(--bg-2)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {format === 'mp4' && (
                <div>
                  <label style={{ fontSize: 12 }}>
                    {t.exportDialog.encoderLabel}
                  </label>
                  <select
                    value={encoder}
                    onChange={(e) => {
                      setEncoder(e.target.value as VideoEncoder);
                      setEncoderUserOverride(true);
                    }}
                    style={{ width: '100%' }}
                  >
                    {mp4Encoders.map((enc) => (
                      <option key={enc} value={enc}>
                        {t.exportDialog.encoderName(enc)}
                      </option>
                    ))}
                  </select>
                  {!encoderUserOverride && (
                    <span
                      className="dim"
                      style={{ fontSize: 11, display: 'block', marginTop: 2 }}
                    >
                      {(() => {
                        const r = describeEncoderChoice(encoder, gpuInfo);
                        switch (r.kind) {
                          case 'detecting':
                            return t.exportDialog.encoderDetecting;
                          case 'cpu':
                            return t.exportDialog.encoderCpuFallback;
                          case 'auto-matched':
                            return t.exportDialog.encoderAutoMatched(r.gpuLabel);
                        }
                      })()}
                    </span>
                  )}
                  {encoder !== 'libx264' && (
                    <span
                      className="dim"
                      style={{ fontSize: 11, display: 'block', marginTop: 2 }}
                    >
                      {t.exportDialog.encoderHint}
                    </span>
                  )}
                </div>
              )}

              <div>
                <label style={{ fontSize: 12 }}>
                  {t.exportDialog.profileLabel}
                </label>
                <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                  {profileLabels.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setQualityProfile(p.id)}
                      style={{
                        background:
                          qualityProfile === p.id
                            ? 'var(--accent-soft)'
                            : 'var(--bg-1)',
                        borderColor:
                          qualityProfile === p.id
                            ? 'var(--accent)'
                            : 'var(--border)',
                        padding: '4px 10px',
                      }}
                      title={p.hint}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <span className="dim" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>
                  {gpuInfo
                    ? t.exportDialog.detectedGpu(gpuInfo.label)
                    : t.exportDialog.detectingGpu}
                </span>
                <span className="dim" style={{ fontSize: 11, display: 'block' }}>
                  {t.exportDialog.actualPath(effectiveDescription)}
                </span>
                <span className="dim" style={{ fontSize: 11, display: 'block' }}>
                  {t.exportDialog.profileNote}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCancel}>{t.exportDialog.cancel}</button>
          <button
            onClick={handleConfirm}
            disabled={endSec <= startSec || width <= 0 || height <= 0}
            style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent)' }}
          >
            {t.exportDialog.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
