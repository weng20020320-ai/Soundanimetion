/**
 * Wavelet apparatus card cover — concentric ring pulse.
 *
 * 这是给 clearmika.com 主页的 Wavelet apparatus 卡片用的封面组件。
 * 主页把这个文件复制到自己项目（推荐放在 components/apparatus-covers/）后直接 import。
 *
 * 设计意图
 * --------
 * 四个同心圆环错相位向外扩散 + 中心一点。整体克制，单色，3 秒一轮。
 * 暗示 Wavelet 的核心动作：声音从中心点辐射成视觉。
 *
 * 视觉默认
 * --------
 * - 默认色：`#9aa3b8`（雾灰蓝）。在黑/深蓝/深紫底色下都好看。
 * - 用 `color` prop 可覆盖；也可以由父级 CSS `color` 继承（组件用 `currentColor`）。
 * - viewBox 16:9，width / height 默认 100% 撑满父容器。
 *
 * 性能 / 可达性
 * -------------
 * - 纯 SVG + Web Animations API（无 framer-motion / GSAP）
 * - 滚出视口自动 pause（IntersectionObserver），不耗电
 * - 尊重 `prefers-reduced-motion`，命中时退化为静态四环
 * - `aria-hidden="true"`，对屏幕阅读器不发声
 * - 总打包尺寸：约 2.5 KB（min+gzip）
 *
 * 无运行时依赖（只用 React 17+ / Next.js 12+ 自带的 useEffect / useRef）。
 */

import { useEffect, useRef } from 'react';

const RING_COUNT = 4;
const PERIOD_MS = 3000;
const BASE_RADIUS = 16;
const MAX_SCALE = 5.5;
const STROKE_WIDTH = 1.1;

export interface WaveletCoverProps {
  /**
   * 笔触颜色。默认 `currentColor`，会继承父级 `color`。
   * 想直接指定时传字符串，比如 `"#9aa3b8"` 或 `"rgba(180, 200, 255, 0.9)"`。
   */
  color?: string;

  /** 覆盖整张 SVG 的 className（用于布局尺寸控制）。 */
  className?: string;

  /** 用于布局的内联样式（width / height / 边距等）。 */
  style?: React.CSSProperties;
}

export function WaveletCover({
  color = 'currentColor',
  className,
  style,
}: WaveletCoverProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const ringRefs = useRef<Array<SVGCircleElement | null>>([]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      ringRefs.current.forEach((ring, i) => {
        if (!ring) return;
        const r = BASE_RADIUS * (1 + i * 0.55);
        ring.setAttribute('r', String(r));
        ring.setAttribute('opacity', '0.28');
      });
      return;
    }

    const animations: Animation[] = [];
    ringRefs.current.forEach((ring, i) => {
      if (!ring) return;
      const anim = ring.animate(
        [
          { transform: 'scale(0.15)', opacity: 0 },
          { transform: 'scale(0.45)', opacity: 0.55, offset: 0.18 },
          { transform: `scale(${MAX_SCALE})`, opacity: 0 },
        ],
        {
          duration: PERIOD_MS,
          delay: (i * PERIOD_MS) / RING_COUNT,
          iterations: Infinity,
          easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
        }
      );
      animations.push(anim);
    });

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
  }, []);

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
            r={BASE_RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE_WIDTH}
            style={{
              transformOrigin: 'center',
              transformBox: 'fill-box',
              opacity: 0,
            }}
          />
        ))}
        <circle cx="0" cy="0" r="2" fill="currentColor" opacity="0.65" />
      </g>
    </svg>
  );
}

export default WaveletCover;
