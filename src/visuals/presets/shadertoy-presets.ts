import type { VisualPreset } from '../VisualPreset';
import type { ParamSchema } from '../ParamSchema';
import { createShaderPreset } from '../ShaderPresetFactory';
import { gradientFromPreset } from '../GradientPresets';

/* =====================================================================
 * 工具：通用参数 schema
 * ===================================================================== */

function commonSpeedSchema(defaultSpeed = 1): ParamSchema {
  return {
    speed: {
      type: 'float',
      label: '速度',
      min: 0,
      max: 4,
      step: 0.01,
      default: defaultSpeed,
    },
    intensity: {
      type: 'float',
      label: '强度',
      min: 0,
      max: 4,
      step: 0.01,
      default: 1,
    },
  };
}

/* =====================================================================
 * 1) Audio Wormhole - 频谱驱动的虫洞隧道
 * ===================================================================== */

export function createAudioWormhole(): VisualPreset {
  return createShaderPreset({
    id: 'st-wormhole',
    name: '虫洞 · 频谱驱动',
    paramSchema: {
      ...commonSpeedSchema(0.6),
      twist: {
        type: 'float',
        label: '扭曲',
        min: 0,
        max: 4,
        step: 0.01,
        default: 1.5,
      },
      glow: {
        type: 'float',
        label: '辉光',
        min: 0,
        max: 3,
        step: 0.01,
        default: 1.2,
      },
      gradient: {
        type: 'gradient',
        label: '渐变色',
        // 赛博朋克：粉→蓝，配合虫洞的科幻感
        default: gradientFromPreset('cyberpunk', 0),
      },
    },
    uniformsFromParams: (p) => ({
      uSpeed: p.speed as number,
      uIntensity: p.intensity as number,
      uTwist: p.twist as number,
      uGlow: p.glow as number,
    }),
    extraUniforms: () => ({
      uSpeed: { value: 0.6 },
      uIntensity: { value: 1 },
      uTwist: { value: 1.5 },
      uGlow: { value: 1.2 },
    }),
    mainImage: /* glsl */ `
      uniform float uSpeed;
      uniform float uIntensity;
      uniform float uTwist;
      uniform float uGlow;
      void mainImage(out vec4 fragColor, in vec2 fragCoord) {
        vec2 uv = fragCoord / iResolution.xy * 2.0 - 1.0;
        uv.x *= uAspect;
        float r = length(uv);
        float a = atan(uv.y, uv.x);
        float t = uTime * uSpeed + uBeatEnv * 0.6;
        float depth = 1.0 / max(0.05, r);
        float fft = audioFft(fract(depth * 0.18 + t * 0.3));
        float swirl = sin(a * 4.0 + depth * 1.2 - t * 2.0 + fft * uTwist * 4.0);
        // gradient 采样位置：swirl 主轴 + fft 推到亮端
        float gt = clamp(0.4 + 0.4 * swirl + smoothstep(0.4, 1.0, fft) * 0.3, 0.0, 1.0);
        vec3 col = gradient(gt);
        col *= 0.4 + uIntensity * (fft * 1.6 + uRms * 1.2);
        // 节拍辉光取 gradient 亮端
        col += gradient(0.95) * uGlow * uBeatEnv * exp(-r * 1.5);
        col *= smoothstep(1.6, 0.2, r);
        fragColor = vec4(col, 1.0);
      }
    `,
  });
}

/* =====================================================================
 * 2) Plasma Pulse - 经典 plasma 加节拍脉冲
 * ===================================================================== */

export function createPlasmaPulse(): VisualPreset {
  return createShaderPreset({
    id: 'st-plasma',
    name: 'Plasma · 节拍脉冲',
    paramSchema: {
      ...commonSpeedSchema(0.6),
      scale: {
        type: 'float',
        label: '尺度',
        min: 0.5,
        max: 8,
        step: 0.01,
        default: 3,
      },
      pulse: {
        type: 'float',
        label: '脉冲幅度',
        min: 0,
        max: 1.2,
        step: 0.01,
        // 旧默认 0.6 + 旧 shader 还额外加 col += uColorC * uBeatEnv * 0.4，
        // 每拍直接打一个全屏亮闪 → 用户反馈"闪眼"。
        // 新默认 0.25 让脉冲是"密度涨一点"而不是"亮度撞一下"。
        default: 0.25,
      },
      gradient: {
        type: 'gradient',
        label: '渐变色',
        default: gradientFromPreset('aurora', 0),
      },
    },
    uniformsFromParams: (p) => ({
      uSpeed: p.speed as number,
      uIntensity: p.intensity as number,
      uScale: p.scale as number,
      uPulse: p.pulse as number,
    }),
    extraUniforms: () => ({
      uSpeed: { value: 0.6 },
      uIntensity: { value: 0.6 },
      uScale: { value: 3 },
      uPulse: { value: 0.25 },
    }),
    mainImage: /* glsl */ `
      uniform float uSpeed;
      uniform float uIntensity;
      uniform float uScale;
      uniform float uPulse;
      void mainImage(out vec4 fragColor, in vec2 fragCoord) {
        vec2 uv = fragCoord / iResolution.xy * 2.0 - 1.0;
        uv.x *= uAspect;
        float t = uTime * uSpeed;
        // 脉冲改为只在节拍峰值附近瞬时放大，平时几乎不动
        // pow 让节拍包络衰减更快，避免长时间维持高密度
        float beatShape = pow(uBeatEnv, 2.0);
        float pulse = 1.0 + beatShape * uPulse;
        vec2 p = uv * uScale * pulse;
        float v = sin(p.x + t)
                + sin(p.y + t * 1.3)
                + sin((p.x + p.y) * 0.7 + t * 0.6 + uBass * 3.0)
                + sin(length(p) * 1.4 - t * 1.2 + uRms * 3.0);
        v *= 0.25;
        // 把 plasma 标量场归一化到 [0,1] 当作 gradient 采样 t，
        // 加 mid/high/centroid 让 t 在频谱影响下有微扰（色彩位置漂移而不是亮度脉动）
        float gt = 0.5 + 0.5 * sin(v + uMid * 1.6 + uCentroid * 1.2);
        vec3 col = gradient(gt);
        // 总亮度温和提升，避免曾经那种 (0.5 + uRms*1.4) 直接冲到 ~2.0 过曝
        col *= 0.6 + uIntensity * (uRms * 0.7 + 0.3);
        fragColor = vec4(col, 1.0);
      }
    `,
  });
}

/* =====================================================================
 * 3) Neon Grid - 80s 视觉，地平线 + 网格
 * ===================================================================== */

export function createNeonGrid(): VisualPreset {
  return createShaderPreset({
    id: 'st-neon-grid',
    name: 'Neon Grid · 80s',
    paramSchema: {
      ...commonSpeedSchema(0.7),
      density: {
        type: 'float',
        label: '密度',
        min: 4,
        max: 40,
        step: 0.5,
        default: 14,
      },
      horizon: {
        type: 'float',
        label: '地平线',
        min: 0.2,
        max: 0.8,
        step: 0.01,
        default: 0.45,
      },
      gradient: {
        type: 'gradient',
        label: '渐变色',
        // 蒸汽波：粉→蓝紫，是 80s synthwave 视觉的标志色
        default: gradientFromPreset('synthwave', 0),
      },
    },
    uniformsFromParams: (p) => ({
      uSpeed: p.speed as number,
      uIntensity: p.intensity as number,
      uDensity: p.density as number,
      uHorizon: p.horizon as number,
    }),
    extraUniforms: () => ({
      uSpeed: { value: 0.7 },
      uIntensity: { value: 1 },
      uDensity: { value: 14 },
      uHorizon: { value: 0.45 },
    }),
    mainImage: /* glsl */ `
      uniform float uSpeed;
      uniform float uIntensity;
      uniform float uDensity;
      uniform float uHorizon;
      void mainImage(out vec4 fragColor, in vec2 fragCoord) {
        vec2 uv = fragCoord / iResolution.xy;
        float horizonY = uHorizon;
        vec3 col = vec3(0.0);

        // gradient 取样规则：
        //   gradient(0.0) = 天空顶/地面远端（暗端）
        //   gradient(0.5) = 地平线（中段）
        //   gradient(1.0) = 太阳/亮线（亮端）
        vec3 farColor = gradient(0.0);
        vec3 horizonColor = gradient(0.55);
        vec3 brightColor = gradient(0.95);

        if (uv.y < horizonY) {
          float floorY = (horizonY - uv.y) / horizonY;
          float depth = 1.0 / max(0.001, floorY);
          float scroll = uTime * uSpeed * 1.5 + uBeatEnv * 0.6;
          float gx = abs(fract((uv.x - 0.5) * depth * uDensity * 0.05) - 0.5);
          float gz = abs(fract(depth * 1.0 + scroll) - 0.5);
          float lineX = smoothstep(0.04, 0.0, gx);
          float lineZ = smoothstep(0.04, 0.0, gz);
          float fade = exp(-depth * 0.06);
          // 地面网格：远处暗，近处亮（地平线色 → 亮色）
          vec3 grid = mix(horizonColor, brightColor, smoothstep(0.0, 1.0, floorY));
          col = grid * (lineX + lineZ) * fade * uIntensity;
          col += brightColor * pow(1.0 - floorY, 6.0) * (uRms + 0.2);
        } else {
          // sky
          float sy = (uv.y - horizonY) / (1.0 - horizonY);
          // 顶部暗（远端），地平线亮 → gradient 从 0.0 上升到 0.55
          vec3 sky = mix(horizonColor, farColor, sy);
          // sun
          vec2 c = vec2(0.5, horizonY + 0.18);
          float d = length((uv - c) * vec2(uAspect, 1.0));
          float sun = smoothstep(0.18, 0.0, d);
          float bands = step(0.5, fract(uv.y * 26.0 + uTime * 0.4));
          sun *= mix(1.0, bands, smoothstep(0.18, 0.04, d));
          col = sky;
          col += brightColor * sun * (1.4 + uBeatEnv * 1.5);
          // stars
          float st = step(0.997, fract(sin(dot(uv, vec2(91.7, 41.3))) * 43758.5));
          col += vec3(st);
        }

        // FFT overlay along bottom
        float fx = audioFft(uv.x);
        float bar = step(uv.y, horizonY * 0.05 + fx * horizonY * 0.5);
        col += brightColor * bar * 0.6;

        fragColor = vec4(col, 1.0);
      }
    `,
  });
}

/* =====================================================================
 * 4) Liquid Mercury - 流体感铬色金属
 * ===================================================================== */

export function createLiquidMercury(): VisualPreset {
  return createShaderPreset({
    id: 'st-mercury',
    name: '液态金属 · Mercury',
    paramSchema: {
      ...commonSpeedSchema(0.5),
      thickness: {
        type: 'float',
        label: '厚度',
        min: 0.5,
        max: 6,
        step: 0.01,
        default: 2,
      },
      shine: {
        type: 'float',
        label: '高光',
        min: 0,
        max: 4,
        step: 0.01,
        default: 1.5,
      },
      gradient: {
        type: 'gradient',
        label: '渐变色',
        // 银雾：深炭→银雾，符合"液态金属"质感（也可换金条/玫瑰金等）
        default: gradientFromPreset('silver-mist', 0),
      },
    },
    uniformsFromParams: (p) => ({
      uSpeed: p.speed as number,
      uIntensity: p.intensity as number,
      uThickness: p.thickness as number,
      uShine: p.shine as number,
    }),
    extraUniforms: () => ({
      uSpeed: { value: 0.5 },
      uIntensity: { value: 1 },
      uThickness: { value: 2 },
      uShine: { value: 1.5 },
    }),
    mainImage: /* glsl */ `
      uniform float uSpeed;
      uniform float uIntensity;
      uniform float uThickness;
      uniform float uShine;

      vec2 hash2(vec2 p) {
        p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
        return -1.0 + 2.0 * fract(sin(p) * 43758.5453);
      }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(dot(hash2(i + vec2(0,0)), f - vec2(0,0)),
              dot(hash2(i + vec2(1,0)), f - vec2(1,0)), u.x),
          mix(dot(hash2(i + vec2(0,1)), f - vec2(0,1)),
              dot(hash2(i + vec2(1,1)), f - vec2(1,1)), u.x),
          u.y);
      }
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * vnoise(p);
          p *= 2.0;
          a *= 0.5;
        }
        return v;
      }

      void mainImage(out vec4 fragColor, in vec2 fragCoord) {
        vec2 uv = fragCoord / iResolution.xy * 2.0 - 1.0;
        uv.x *= uAspect;

        float t = uTime * uSpeed;
        vec2 p = uv * uThickness;
        float n = fbm(p + vec2(t, -t * 0.7) + uBass * 1.5);
        float n2 = fbm(p * 1.7 - vec2(t * 0.4, t) + uMid * 1.2);
        float h = (n + n2) * 0.5;

        // 视为高度场，估法线
        float eps = 0.01;
        float hx = fbm(p + vec2(eps, 0)) - fbm(p - vec2(eps, 0));
        float hy = fbm(p + vec2(0, eps)) - fbm(p - vec2(0, eps));
        vec3 N = normalize(vec3(-hx, -hy, 0.05));
        vec3 L = normalize(vec3(0.4, 0.6, 0.7));
        vec3 V = vec3(0.0, 0.0, 1.0);
        vec3 R = reflect(-L, N);
        float spec = pow(max(0.0, dot(R, V)), 18.0);

        // 金属"高度场"映射到 gradient：h 是 fbm 噪声中心值（典型 -0.5..0.5）
        // 把 h + 节拍偏移 归一化到 [0,1] 当 gradient 采样 t
        float gt = clamp(
          0.5 + 0.5 * (h + uBeatEnv * 0.3 + uRms * 0.2),
          0.0,
          1.0
        );
        vec3 base = gradient(gt);
        // 高光保持白色（金属的物理高光不染色）
        base += vec3(spec) * uShine * (0.6 + uHigh * 1.5);
        // 整体亮度收一档：旧 0.5 + intensity*(rms*1.4+0.6) 在 rms=1 时 = 2.5，
        // 现在 0.6 + intensity*(rms*0.8+0.4) 在 rms=1 时 = 1.8，过曝可控
        base *= 0.6 + uIntensity * (uRms * 0.8 + 0.4);

        fragColor = vec4(base, 1.0);
      }
    `,
  });
}

/* =====================================================================
 * 5) Spectral Tunnel - 万花筒 + 频谱
 * ===================================================================== */

export function createSpectralTunnel(): VisualPreset {
  return createShaderPreset({
    id: 'st-kaleido',
    name: '万花筒 · 频谱',
    paramSchema: {
      ...commonSpeedSchema(0.7),
      slices: {
        type: 'float',
        label: '镜面数',
        min: 3,
        max: 16,
        step: 1,
        default: 8,
      },
      zoom: {
        type: 'float',
        label: '缩放',
        min: 0.5,
        max: 4,
        step: 0.01,
        default: 1.4,
      },
      gradient: {
        type: 'gradient',
        label: '渐变色',
        // 彩虹：万花筒最适合多色彩
        default: gradientFromPreset('rainbow', 0),
      },
    },
    uniformsFromParams: (p) => ({
      uSpeed: p.speed as number,
      uIntensity: p.intensity as number,
      uSlices: p.slices as number,
      uZoom: p.zoom as number,
    }),
    extraUniforms: () => ({
      uSpeed: { value: 0.7 },
      uIntensity: { value: 1 },
      uSlices: { value: 8 },
      uZoom: { value: 1.4 },
    }),
    mainImage: /* glsl */ `
      uniform float uSpeed;
      uniform float uIntensity;
      uniform float uSlices;
      uniform float uZoom;
      const float PI = 3.14159265359;
      void mainImage(out vec4 fragColor, in vec2 fragCoord) {
        vec2 uv = fragCoord / iResolution.xy * 2.0 - 1.0;
        uv.x *= uAspect;

        float r = length(uv);
        float a = atan(uv.y, uv.x);
        float seg = 2.0 * PI / uSlices;
        a = abs(mod(a + seg * 0.5, seg) - seg * 0.5);
        vec2 p = vec2(cos(a), sin(a)) * r;

        p *= uZoom;
        float t = uTime * uSpeed + uBeatEnv * 0.5;
        p += vec2(sin(t * 0.3), cos(t * 0.4)) * 0.4;

        float fft = audioFft(fract(r * 0.5 + t * 0.3));
        float band = sin(p.x * 6.0 + t * 2.0 + fft * 6.0)
                   * cos(p.y * 6.0 - t * 1.4 + uMid * 4.0);
        // gradient 采样：band 主轴 + fft/bass 让色彩位置随能量漂移
        // band ∈ [-1,1]，fft+bass ∈ [0,~2]，组合后归一化到 [0,1]
        float gt = fract(0.5 + 0.5 * band + (fft + uBass) * 0.3 + t * 0.05);
        vec3 col = gradient(gt);
        col *= 0.4 + uIntensity * (fft * 2.0 + uRms * 1.2 + uBeatEnv * 0.5);

        // 中心暗点
        col *= smoothstep(0.0, 0.04, r);
        // 边缘衰减
        col *= smoothstep(1.6, 0.2, r);
        fragColor = vec4(col, 1.0);
      }
    `,
  });
}
