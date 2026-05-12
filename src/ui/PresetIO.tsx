import { useRef } from 'react';
import type { PostFXParams } from '../render/PostFXChain';
import { useT } from '../i18n';

interface Props {
  presetId: string;
  params: Record<string, unknown>;
  bgColor: string;
  bgAlpha: number;
  postFX?: PostFXParams;
  onLoad: (data: PresetExport) => void;
}

export interface PresetExport {
  version: 1 | 2;
  presetId: string;
  params: Record<string, unknown>;
  background: { color: string; alpha: number };
  /** v2 引入：后处理链参数。 */
  postFX?: PostFXParams;
}

export function PresetIO({
  presetId,
  params,
  bgColor,
  bgAlpha,
  postFX,
  onLoad,
}: Props) {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSave() {
    const payload: PresetExport = {
      version: 2,
      presetId,
      params,
      background: { color: bgColor, alpha: bgAlpha },
      postFX,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date()
      .toISOString()
      .replace(/[-:T.Z]/g, '')
      .slice(0, 14);
    a.href = url;
    a.download = `${presetId}-${stamp}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function handleLoadClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result || '')) as PresetExport;
        if (!obj || typeof obj !== 'object' || !obj.presetId) {
          throw new Error(t.presetIO.invalidFile);
        }
        onLoad(obj);
      } catch (err) {
        console.error('[PresetIO] 加载失败：', err);
        alert(t.presetIO.parseFailed((err as Error).message));
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="field">
      <label>{t.presetIO.label}</label>
      <div className="row">
        <button onClick={handleSave}>{t.presetIO.exportJson}</button>
        <button onClick={handleLoadClick}>{t.presetIO.importJson}</button>
        <input
          type="file"
          accept="application/json,.json"
          ref={fileInputRef}
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </div>
    </div>
  );
}
