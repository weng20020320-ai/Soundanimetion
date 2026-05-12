import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { listPresets, type PresetMood } from '../visuals/PresetRegistry';
import { useT } from '../i18n';

export interface PresetSelectorProps {
  value: string;
  onChange: (id: string) => void;
}

/**
 * Preset 选择器：卡片式面板。
 *
 * 顶栏里只显示一个触发按钮（当前 preset 名）；点击弹出全屏 backdrop + 居中面板，
 * 面板里按 mood（氛围）分组浏览，每张卡片显示：preset 名 / 一句话描述 / 推荐音乐标签。
 *
 * 设计原则：
 *   - 面板是"可浏览的目录"，不是"快速切换的下拉"
 *   - mood 是首要分类维度（用户从"想要什么感觉"出发，而不是"频谱还是粒子"）
 *   - 描述 + 音乐标签让没经验的用户也能快速判断哪个 preset 适合手头的曲子
 */

// 用 unicode 给每个 mood 配一个最小化的"色彩 hint"（不是 emoji，是单色块），
// 视觉上能快速区分 6 个 mood，又不抢主信息（preset 名 / 描述）的注意力。
const MOOD_COLOR: Record<PresetMood, string> = {
  energetic: '#ff6b3d',
  ambient: '#5e9eff',
  abstract: '#c879ff',
  minimal: '#9aa5b8',
  retro: '#ff5dc8',
  organic: '#7dd87f',
};

const MOOD_ORDER: PresetMood[] = [
  'energetic',
  'ambient',
  'abstract',
  'minimal',
  'retro',
  'organic',
];

export function PresetSelector({ value, onChange }: PresetSelectorProps) {
  const t = useT();
  const presets = listPresets();
  const [isOpen, setIsOpen] = useState(false);
  const [activeMood, setActiveMood] = useState<PresetMood | 'all'>('all');
  const triggerRef = useRef<HTMLButtonElement>(null);

  // ESC 关闭
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  const current = presets.find((p) => p.id === value) ?? presets[0];
  const currentName = current ? (t.presetNames[current.id] ?? current.name) : '';

  const filtered = useMemo(
    () =>
      activeMood === 'all'
        ? presets
        : presets.filter((p) => p.mood === activeMood),
    [presets, activeMood]
  );

  const handleSelect = (id: string) => {
    onChange(id);
    setIsOpen(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          minWidth: 200,
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: 2,
            background: current ? MOOD_COLOR[current.mood] : 'transparent',
            flexShrink: 0,
          }}
        />
        <span style={{ flex: 1, textAlign: 'left' }}>{currentName}</span>
        <span style={{ opacity: 0.6, fontSize: 10 }}>▾</span>
      </button>

      {isOpen &&
        createPortal(
          <PresetPanel
            value={value}
            presets={presets}
            filtered={filtered}
            activeMood={activeMood}
            setActiveMood={setActiveMood}
            onSelect={handleSelect}
            onClose={() => setIsOpen(false)}
            t={t}
          />,
          document.body
        )}
    </>
  );
}

interface PanelProps {
  value: string;
  presets: ReturnType<typeof listPresets>;
  filtered: ReturnType<typeof listPresets>;
  activeMood: PresetMood | 'all';
  setActiveMood: (m: PresetMood | 'all') => void;
  onSelect: (id: string) => void;
  onClose: () => void;
  t: ReturnType<typeof useT>;
}

function PresetPanel({
  value,
  presets,
  filtered,
  activeMood,
  setActiveMood,
  onSelect,
  onClose,
  t,
}: PanelProps) {
  // 每个 mood 在当前 preset 列表里的数量，给 tab 加 badge
  const moodCounts = useMemo(() => {
    const counts: Record<string, number> = { all: presets.length };
    for (const m of MOOD_ORDER) counts[m] = 0;
    for (const p of presets) counts[p.mood] = (counts[p.mood] ?? 0) + 1;
    return counts;
  }, [presets]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-1)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 16,
          width: 'min(900px, 92vw)',
          maxHeight: '82vh',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* mood 切换栏 */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            paddingBottom: 10,
            borderBottom: '1px solid var(--border)',
          }}
        >
          <MoodTab
            label={t.presetSelector.allMoods}
            color={null}
            count={moodCounts.all}
            active={activeMood === 'all'}
            onClick={() => setActiveMood('all')}
          />
          {MOOD_ORDER.map((m) => (
            <MoodTab
              key={m}
              label={t.presetMoods[m]}
              color={MOOD_COLOR[m]}
              count={moodCounts[m] ?? 0}
              active={activeMood === m}
              onClick={() => setActiveMood(m)}
            />
          ))}
        </div>

        {/* preset 卡片网格 */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
            gap: 10,
            overflowY: 'auto',
            paddingRight: 4,
          }}
        >
          {filtered.length === 0 && (
            <div
              style={{
                color: 'var(--text-dim)',
                fontSize: 12,
                padding: 24,
                textAlign: 'center',
                gridColumn: '1 / -1',
              }}
            >
              {t.presetSelector.empty}
            </div>
          )}
          {filtered.map((p) => {
            const name = t.presetNames[p.id] ?? p.name;
            const desc = t.presetDescriptions[p.id] ?? '';
            const moodLabel = t.presetMoods[p.mood];
            const isActive = p.id === value;
            return (
              <button
                key={p.id}
                onClick={() => onSelect(p.id)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 6,
                  padding: 12,
                  background: isActive ? 'var(--accent-soft)' : 'var(--bg-2)',
                  border: `1px solid ${
                    isActive ? 'var(--accent)' : 'var(--border)'
                  }`,
                  borderRadius: 8,
                  cursor: 'pointer',
                  textAlign: 'left',
                  // 用 minHeight 而不是 fixed height：日文长描述/4 个 tag 时
                  // 自然撑高，不会把内容挤出
                  minHeight: 120,
                }}
                // 标题行没法显示完整时，hover 看完整名称 + mood
                title={`${name} · ${moodLabel}\n${desc}`}
              >
                {/* 标题行：色块 + name 独占（去掉右上角 mood 文字，
                    左上色块 + 顶部 tabs 已经表达 mood，避免日文 mood 名挤占 name 宽度） */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    width: '100%',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: MOOD_COLOR[p.mood],
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: 13,
                      flex: 1,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {name}
                  </span>
                </div>
                {desc && (
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--text-dim)',
                      lineHeight: 1.45,
                      // 描述限制 3 行，超长省略 — 卡片高度不会被极端长描述拉爆
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {desc}
                  </div>
                )}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    flexWrap: 'wrap',
                    marginTop: 'auto',
                    paddingTop: 4,
                    // 整个 tag 行宽度严格限制为卡片内宽，溢出 chip 只能换行
                    width: '100%',
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      color: 'var(--text-dim)',
                      marginRight: 2,
                      flexShrink: 0,
                    }}
                  >
                    {t.presetSelector.musicTagsLabel}
                  </span>
                  {p.musicTags.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        fontSize: 10,
                        padding: '2px 5px',
                        borderRadius: 999,
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                        whiteSpace: 'nowrap',
                        // 极端长 tag（中文环境的 "Vaporwave" 等）超出单行宽度时
                        // 让单个 chip 内部省略而不是把整张卡片撑宽
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {t.musicTags[tag]}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MoodTab({
  label,
  color,
  count,
  active,
  onClick,
}: {
  label: string;
  color: string | null;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        background: active ? 'var(--accent-soft)' : 'transparent',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 999,
        fontSize: 12,
      }}
    >
      {color && (
        <span
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: 2,
            background: color,
          }}
        />
      )}
      <span>{label}</span>
      <span style={{ fontSize: 10, opacity: 0.6 }}>{count}</span>
    </button>
  );
}
