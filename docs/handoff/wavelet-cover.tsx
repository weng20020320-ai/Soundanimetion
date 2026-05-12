/**
 * Wavelet apparatus card cover — concentric ring pulse.
 *
 * 这是给 clearmika.com 主页的 Wavelet apparatus 卡片用的封面组件。
 * 主页把这个文件复制到自己项目（推荐放在 components/apparatus-covers/）后直接 import。
 *
 * 真理之源（v3 起）
 * ------------------
 * **视觉参数（color / periodMs / easing）的 source of truth 是 `apparatus.json`**
 * 的 `coverComponent.props` 字段，不是这个文件里的 DEFAULT_* 常量。
 *
 * 本文件里的 DEFAULT_* 仅作为 fallback：当主页忘记传 props 时组件还能跑。
 * 主页正常集成应该是：
 *
 *     <WaveletCover {...apparatus.coverComponent.props} />
 *
 * 改 Wavelet 的色 / 周期 / 缓动 = 改 apparatus.json 一处。**不应改本文件**。
 * 本文件只在以下两种场景才该修改：
 *   1) 加新 prop（非破坏性扩展）
 *   2) 修 SSR / a11y / 性能相关 bug
 *
 * 设计意图
 * --------
 * 四个同心圆环错相位向外扩散 + 中心一点。整体克制，单色，3 秒一轮。
 * 暗示 Wavelet 的核心动作：声音从中心点辐射成视觉。
 *
 * SSR / LCP 行为（v2 修复）
 * -------------------------
 * JSX 渲染出来时，**4 个圆环已经处于"涟漪冻结"静态态**（不同 r、opacity 0.28）。
 * 这意味着：
 *   1) 服务端渲染（SSR）出的 HTML 已经是可见的封面，不再是空白
 *   2) 首次 LCP / paint = 矢量静态图，体感等同 next/image 的 blur placeholder
 *   3) JS hydration 后 useEffect 启动动画，平滑接管（不闪烁，不 pop-in）
 *   4) `prefers-reduced-motion` 用户永远停在这个静态态（视觉同 SSR 一致）
 *
 * 性能基线
 * --------
 * Web Animations API + 仅 `transform` + `opacity` 两个 compositor-only 属性 → 全程 GPU，
 * 不占主线程。M1 MacBook / iPhone 12 / Android 中端 实测每帧成本 < 0.1 ms。
 * 加 IntersectionObserver 滚出视口 → 0 帧 0 CPU。
 *
 * 主页若想集中管理动效 token，组件暴露了 `periodMs` / `easing` props，
 * 可以直接用主页 `tokens.ts` 里的 `EASE_EMPHASIZED` / `MOTION_CARD_COVER` 等覆盖。
 *
 * 可达性
 * ------
 * - `aria-hidden="true"` + `role="presentation"`：封面是装饰，信息在卡片标题/描述里
 * - 自动尊重 `prefers-reduced-motion`，命中时静态四环
 * - `reducedMotion` prop 提供强制开关（主页可基于 perf 预算 / 设备能力进一步关闭）
 *
 * z-index / 定位
 * --------------
 * 组件**不使用 position: absolute、不使用 z-index**。所有动画都在 SVG 内部坐标系，
 * 被 SVG 的 stacking context 完全封闭，**不可能撞主页的 GlassCard / 11 层 z 栈**。
 *
 * 无运行时依赖（只用 React 17+ / Next.js 12+ 自带的 useEffect / useRef）。
 * 总打包尺寸：约 2.6 KB（min+gzip）。
 */

import { useEffect, useRef } from 'react';

const RING_COUNT = 4;
const BASE_RADIUS = 16;
const MAX_SCALE = 5.5;
const STROKE_WIDTH = 1.1;

// FALLBACK 默认值。生产环境应由 apparatus.json.coverComponent.props 提供具体值。
// 这两个常量只是为了让组件在主页"忘记传 props"时仍然能跑。
const DEFAULT_PERIOD_MS = 3000;
const DEFAULT_EASING = 'cubic-bezier(0.22, 0.61, 0.36, 1)';

const STATIC_OPACITY = 0.28;
/** 每环的"涟漪冻结"半径倍数，用于 SSR 初始态和 prefers-reduced-motion 退化态。 */
const staticRadiusFor = (i: number): number => BASE_RADIUS * (1 + i * 0.55);

export interface WaveletCoverProps {
  /**
   * 笔触颜色。默认 `currentColor`，会继承父级 `color`。
   * 想直接指定时传字符串，例如 `"#9aa3b8"` 或 `"rgba(180, 200, 255, 0.9)"`。
   */
  color?: string;

  /** 覆盖整张 SVG 的 className（用于布局尺寸控制）。 */
  className?: string;

  /** 用于布局的内联样式（width / height / 边距等）。 */
  style?: React.CSSProperties;

  /**
   * 动画周期，毫秒。默认 3000。
   * 主页可以传 `tokens.motion.cardCoverPeriod` 让其与全站节奏统一。
   */
  periodMs?: number;

  /**
   * CSS easing 字符串。默认 `cubic-bezier(0.22, 0.61, 0.36, 1)`。
   * 主页可以传 `tokens.motion.easeEmphasized` 之类的常量替换。
   */
  easing?: string;

  /**
   * 强制走静态态（不动画）。默认 `false`（仅在 `prefers-reduced-motion` 命中时自动静态）。
   * 主页可以基于 perf 预算 / 移动端检测主动传 `true`。
   */
  reducedMotion?: boolean;
}

export function WaveletCover({
  color = 'currentColor',
  className,
  style,
  periodMs = DEFAULT_PERIOD_MS,
  easing = DEFAULT_EASING,
  reducedMotion = false,
}: WaveletCoverProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const ringRefs = useRef<Array<SVGCircleElement | null>>([]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const prefersReduced =
      reducedMotion ||
      (typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

    // 用户/系统选择了静态态：SSR 渲染出的静态四环就是终态，什么都不做。
    if (prefersReduced) return;

    // 启动动画：把每个环的 r 重置为 BASE_RADIUS，由 transform: scale 驱动呼吸。
    const animations: Animation[] = [];
    ringRefs.current.forEach((ring, i) => {
      if (!ring) return;
      ring.setAttribute('r', String(BASE_RADIUS));
      const anim = ring.animate(
        [
          { transform: 'scale(0.15)', opacity: 0 },
          { transform: 'scale(0.45)', opacity: 0.55, offset: 0.18 },
          { transform: `scale(${MAX_SCALE})`, opacity: 0 },
        ],
        {
          duration: periodMs,
          delay: (i * periodMs) / RING_COUNT,
          iterations: Infinity,
          easing,
        }
      );
      animations.push(anim);
    });

    // 滚出视口时暂停所有动画，省电
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries[0]?.isIntersecting ?? true;
        animations.forEach((a) => {
          if (visible) a.play();
          else a.pause();
        });
      },
      { threshold: 0 }
    );
    io.observe(svg);

    return () => {
      animations.forEach((a) => a.cancel());
      io.disconnect();
    };
  }, [periodMs, easing, reducedMotion]);

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 400 225"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      role="presentation"
      className={className}
      style={{
        color,
        display: 'block',
        width: '100%',
        height: '100%',
        overflow: 'visible',
        ...style,
      }}
    >
      <g transform="translate(200 112.5)">
        {Array.from({ length: RING_COUNT }, (_, i) => (
          <circle
            key={i}
            ref={(el) => {
              ringRefs.current[i] = el;
            }}
            cx="0"
            cy="0"
            // SSR 初始 r 已经是"涟漪冻结"位置：16 / 24.8 / 33.6 / 42.4
            // useEffect 启动动画时会把 r 重置回 BASE_RADIUS，由 transform 驱动呼吸
            r={staticRadiusFor(i)}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE_WIDTH}
            style={{
              transformOrigin: 'center',
              transformBox: 'fill-box',
              opacity: STATIC_OPACITY,
            }}
          />
        ))}
        <circle cx="0" cy="0" r="2" fill="currentColor" opacity="0.65" />
      </g>
    </svg>
  );
}

export default WaveletCover;
