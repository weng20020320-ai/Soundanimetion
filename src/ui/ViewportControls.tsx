import {
  useAppStore,
  ASPECT_OPTIONS,
  VIEW_SCALE_MIN,
  VIEW_SCALE_MAX,
  type AspectId,
} from '../store/app-store';
import { useT } from '../i18n';

/**
 * 顶栏的"取景"控件：画幅 (aspect) 下拉 + 缩放 (viewScale) 滑块。
 *
 * - aspect 影响相机宽高比 + 预览 letterbox + 导出默认分辨率
 * - viewScale 同时影响预览和导出（WYSIWYG），通过 presetGroup.scale 实现
 *
 * disabled：导出期间传 true，避免用户在导出中途改这两个值导致输出帧被打断。
 */
interface ViewportControlsProps {
  disabled?: boolean;
}

export function ViewportControls({ disabled = false }: ViewportControlsProps) {
  const t = useT();
  const aspectId = useAppStore((s) => s.targetAspectId);
  const setAspectId = useAppStore((s) => s.setTargetAspectId);
  const viewScale = useAppStore((s) => s.viewScale);
  const setViewScale = useAppStore((s) => s.setViewScale);

  const aspectLabelMap: Record<AspectId, string> = {
    '16:9': t.viewport.aspect169,
    '9:16': t.viewport.aspect916,
    '1:1': t.viewport.aspect11,
    '4:5': t.viewport.aspect45,
  };

  return (
    <>
      <span className="label">{t.viewport.aspectLabel}</span>
      <select
        className="viewport-aspect-select"
        value={aspectId}
        onChange={(e) => setAspectId(e.target.value as AspectId)}
        disabled={disabled}
      >
        {ASPECT_OPTIONS.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {aspectLabelMap[opt.id]}
          </option>
        ))}
      </select>

      <span className="label" title={t.viewport.zoomTitle}>
        {t.viewport.zoomLabel}
      </span>
      <input
        className="viewport-zoom-slider"
        type="range"
        min={VIEW_SCALE_MIN}
        max={VIEW_SCALE_MAX}
        step={0.05}
        value={viewScale}
        onChange={(e) => setViewScale(parseFloat(e.target.value))}
        title={t.viewport.zoomTitle}
        disabled={disabled}
      />
      <span className="dim viewport-zoom-readout">
        {viewScale.toFixed(2)}×
      </span>
    </>
  );
}
