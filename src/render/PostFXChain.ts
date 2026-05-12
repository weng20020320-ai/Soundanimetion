import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { ThreeContext } from './ThreeContext';
import type { AudioFeatures } from '../audio/types';
import type { ParamSchema } from '../visuals/ParamSchema';

/* ------------------------------------------------------------------ */
/* PostFX 参数定义（独立于预设，全局生效） */
/* ------------------------------------------------------------------ */

export interface PostFXParams {
  // 整链总开关
  enabled: boolean;

  // Bloom
  bloomEnabled: boolean;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  bloomBeatBoost: number;

  // Chromatic Aberration
  chromaticEnabled: boolean;
  chromaticOffset: number;
  chromaticBeatBoost: number;

  // Beat Glitch
  glitchEnabled: boolean;
  glitchIntensity: number;

  // Film Grain
  grainEnabled: boolean;
  grainIntensity: number;

  // Vignette
  vignetteEnabled: boolean;
  vignetteAmount: number;
  vignetteSoftness: number;
}

export const POSTFX_DEFAULTS: PostFXParams = {
  enabled: true,
  bloomEnabled: true,
  bloomStrength: 0.55,
  bloomRadius: 0.4,
  bloomThreshold: 0.6,
  bloomBeatBoost: 0.4,
  chromaticEnabled: true,
  chromaticOffset: 0.4,
  chromaticBeatBoost: 1.4,
  glitchEnabled: false,
  glitchIntensity: 0.5,
  grainEnabled: true,
  grainIntensity: 0.06,
  vignetteEnabled: true,
  vignetteAmount: 0.35,
  vignetteSoftness: 0.5,
};

/**
 * 组装 POSTFX_SCHEMA 时只接受一份本地化标签（保持本文件不依赖 i18n 模块）。
 */
export interface PostFXLabels {
  enabled: string;
  bloom: string;
  bloomStrength: string;
  bloomRadius: string;
  bloomThreshold: string;
  bloomBeatBoost: string;
  chromatic: string;
  chromaticOffset: string;
  chromaticBeatBoost: string;
  glitch: string;
  glitchIntensity: string;
  grain: string;
  grainIntensity: string;
  vignette: string;
  vignetteAmount: string;
  vignetteSoftness: string;
}

const ZH_LABELS: PostFXLabels = {
  enabled: '启用后处理',
  bloom: '◆ Bloom',
  bloomStrength: ' 强度',
  bloomRadius: ' 半径',
  bloomThreshold: ' 阈值',
  bloomBeatBoost: ' 节拍增益',
  chromatic: '◆ 色散',
  chromaticOffset: ' 偏移',
  chromaticBeatBoost: ' 节拍增益',
  glitch: '◆ 节拍故障',
  glitchIntensity: ' 强度',
  grain: '◆ 颗粒',
  grainIntensity: ' 强度',
  vignette: '◆ 暗角',
  vignetteAmount: ' 强度',
  vignetteSoftness: ' 柔和',
};

export function buildPostFXSchema(labels: PostFXLabels = ZH_LABELS): ParamSchema {
  return {
    enabled: { type: 'bool', label: labels.enabled, default: true },

    bloomEnabled: { type: 'bool', label: labels.bloom, default: true },
    bloomStrength: {
      type: 'float',
      label: labels.bloomStrength,
      default: 0.55,
      min: 0,
      max: 3,
      step: 0.01,
    },
    bloomRadius: {
      type: 'float',
      label: labels.bloomRadius,
      default: 0.4,
      min: 0,
      max: 1.5,
      step: 0.01,
    },
    bloomThreshold: {
      type: 'float',
      label: labels.bloomThreshold,
      default: 0.6,
      min: 0,
      max: 1,
      step: 0.01,
    },
    bloomBeatBoost: {
      type: 'float',
      label: labels.bloomBeatBoost,
      default: 0.4,
      min: 0,
      max: 2,
      step: 0.01,
    },

    chromaticEnabled: { type: 'bool', label: labels.chromatic, default: true },
    chromaticOffset: {
      type: 'float',
      label: labels.chromaticOffset,
      default: 0.4,
      min: 0,
      max: 4,
      step: 0.01,
    },
    chromaticBeatBoost: {
      type: 'float',
      label: labels.chromaticBeatBoost,
      default: 1.4,
      min: 0,
      max: 6,
      step: 0.01,
    },

    glitchEnabled: { type: 'bool', label: labels.glitch, default: false },
    glitchIntensity: {
      type: 'float',
      label: labels.glitchIntensity,
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
    },

    grainEnabled: { type: 'bool', label: labels.grain, default: true },
    grainIntensity: {
      type: 'float',
      label: labels.grainIntensity,
      default: 0.06,
      min: 0,
      max: 0.4,
      step: 0.005,
    },

    vignetteEnabled: { type: 'bool', label: labels.vignette, default: true },
    vignetteAmount: {
      type: 'float',
      label: labels.vignetteAmount,
      default: 0.35,
      min: 0,
      max: 1,
      step: 0.01,
    },
    vignetteSoftness: {
      type: 'float',
      label: labels.vignetteSoftness,
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
    },
  };
}

/** 默认（中文）schema —— 用于 PresetIO 的 v1 兼容路径。 */
export const POSTFX_SCHEMA: ParamSchema = buildPostFXSchema();

/* ------------------------------------------------------------------ */
/* GLSL 片段 */
/* ------------------------------------------------------------------ */

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CHROMATIC_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uOffset;
  uniform vec2 uResolution;
  varying vec2 vUv;
  void main() {
    vec2 c = vUv - 0.5;
    float r = dot(c, c);  // 0..0.5
    vec2 px = vec2(uOffset / uResolution.x, uOffset / uResolution.y);
    vec2 dirR = normalize(c + 1e-6) * r * 4.0 * px.x * 4.0;
    vec2 dirB = -dirR;
    float rch = texture2D(tDiffuse, vUv + dirR).r;
    vec4 base = texture2D(tDiffuse, vUv);
    float bch = texture2D(tDiffuse, vUv + dirB).b;
    gl_FragColor = vec4(rch, base.g, bch, base.a);
  }
`;

const GLITCH_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uTrigger;
  uniform float uIntensity;
  uniform float uTime;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    if (uTrigger < 0.001) {
      gl_FragColor = texture2D(tDiffuse, vUv);
      return;
    }
    float row = floor(vUv.y * 32.0);
    float seed = floor(uTime * 12.0);
    float r = hash(vec2(row, seed)) - 0.5;
    float threshold = mix(0.85, 0.6, uTrigger * uIntensity);
    float on = step(threshold, hash(vec2(row, seed * 0.7))) * uTrigger;
    vec2 uv = vUv + vec2(r * uIntensity * 0.4 * on, 0.0);
    float k = uIntensity * 0.012 * uTrigger;
    float rch = texture2D(tDiffuse, uv + vec2(k, 0.0)).r;
    vec4 base = texture2D(tDiffuse, uv);
    float bch = texture2D(tDiffuse, uv - vec2(k, 0.0)).b;
    gl_FragColor = vec4(rch, base.g, bch, base.a);
  }
`;

const GRAIN_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uTime;
  uniform float uIntensity;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec4 c = texture2D(tDiffuse, vUv);
    float n = hash(vUv * 1024.0 + uTime * 100.0) - 0.5;
    c.rgb += n * uIntensity;
    gl_FragColor = c;
  }
`;

const VIGNETTE_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uAmount;
  uniform float uSoftness;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(tDiffuse, vUv);
    float d = distance(vUv, vec2(0.5));
    float inner = mix(0.7, 0.25, uAmount);
    float outer = inner + 0.05 + (1.0 - uSoftness) * 0.05 + uSoftness * 0.6;
    float fall = smoothstep(inner, outer, d) * uAmount;
    c.rgb *= 1.0 - fall;
    gl_FragColor = c;
  }
`;

/* ------------------------------------------------------------------ */
/* PostFXChain */
/* ------------------------------------------------------------------ */

export class PostFXChain {
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private bloomPass: UnrealBloomPass;
  private chromaticPass: ShaderPass;
  private glitchPass: ShaderPass;
  private grainPass: ShaderPass;
  private vignettePass: ShaderPass;
  private outputPass: OutputPass;

  private uTime = 0;
  private beatEnv = 0;
  private chromaticEnv = 0;
  private bloomBeatEnv = 0;

  private params: PostFXParams = { ...POSTFX_DEFAULTS };
  private ctx: ThreeContext;
  private detachResize: () => void;

  constructor(ctx: ThreeContext) {
    this.ctx = ctx;

    const w = Math.max(1, ctx.width);
    const h = Math.max(1, ctx.height);

    // 用 HalfFloat 提升 bloom 高光质量
    const target = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      colorSpace: THREE.NoColorSpace,
    });
    this.composer = new EffectComposer(ctx.renderer, target);
    this.composer.setPixelRatio(ctx.renderer.getPixelRatio());
    this.composer.setSize(w, h);

    this.renderPass = new RenderPass(ctx.scene, ctx.camera);
    this.composer.addPass(this.renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      this.params.bloomStrength,
      this.params.bloomRadius,
      this.params.bloomThreshold
    );
    this.composer.addPass(this.bloomPass);

    this.chromaticPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uOffset: { value: this.params.chromaticOffset },
        uResolution: { value: new THREE.Vector2(w, h) },
      },
      vertexShader: VERT,
      fragmentShader: CHROMATIC_FRAG,
    });
    this.composer.addPass(this.chromaticPass);

    this.glitchPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uTrigger: { value: 0 },
        uIntensity: { value: this.params.glitchIntensity },
        uTime: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: GLITCH_FRAG,
    });
    this.composer.addPass(this.glitchPass);

    this.grainPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uIntensity: { value: this.params.grainIntensity },
      },
      vertexShader: VERT,
      fragmentShader: GRAIN_FRAG,
    });
    this.composer.addPass(this.grainPass);

    this.vignettePass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uAmount: { value: this.params.vignetteAmount },
        uSoftness: { value: this.params.vignetteSoftness },
      },
      vertexShader: VERT,
      fragmentShader: VIGNETTE_FRAG,
    });
    this.composer.addPass(this.vignettePass);

    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    this.applyEnabled();

    this.detachResize = ctx.onResize((rw, rh) => this.setSize(rw, rh));
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
    this.bloomPass.resolution.set(width, height);
    (this.chromaticPass.uniforms.uResolution.value as THREE.Vector2).set(
      width,
      height
    );
  }

  /**
   * 把 composer 内部的像素比单独设置一遍。
   *
   * 为什么需要：构造时抓的是 preview renderer 的 pixelRatio（高 DPI 屏 = 2），
   * 之后 ctx.renderer.setPixelRatio(1) 不会同步到 composer。
   * 导出时如果不显式调这个方法，composer 内部 target 会按 width*2 × height*2 分配
   * （比如 1080p 实际画 4K HalfFloat），是一个隐性的 4 倍开销。
   */
  setPixelRatio(pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    // setPixelRatio 不会自动重建 target，再补一次 setSize 让 ping-pong target 重新分配
    this.composer.setSize(this.ctx.width, this.ctx.height);
    this.bloomPass.resolution.set(this.ctx.width, this.ctx.height);
  }

  /** 给调用方查询当前 composer 实际用的 pixelRatio（保存/恢复用）。 */
  getPixelRatio(): number {
    // EffectComposer 没暴露 getter，只能从内部字段读；用 unknown 强转避开 TS 私有字段保护
    const c = this.composer as unknown as { _pixelRatio?: number };
    return c._pixelRatio ?? 1;
  }

  setParams(params: PostFXParams): void {
    this.params = { ...params };
    this.applyEnabled();
  }

  private applyEnabled(): void {
    const p = this.params;
    this.bloomPass.enabled = p.enabled && p.bloomEnabled;
    this.chromaticPass.enabled = p.enabled && p.chromaticEnabled;
    this.glitchPass.enabled = p.enabled && p.glitchEnabled;
    this.grainPass.enabled = p.enabled && p.grainEnabled;
    this.vignettePass.enabled = p.enabled && p.vignetteEnabled;
    this.outputPass.enabled = p.enabled;
  }

  /** 是否真正进入后处理路径；如果整链关掉就走 renderer.render fallback。 */
  isActive(): boolean {
    return this.params.enabled;
  }

  /**
   * 离屏导出专用：控制 composer 最后一个 pass 是否写到默认 framebuffer。
   *
   * 默认 true（preview 时输出到 canvas）；导出时设 false，让最后一个 pass
   * 写进 composer 的内部 readBuffer，然后由 OfflineRenderer 把 readBuffer
   * 的内容 blit 到我们自己的 8-bit exportRT 上读回。
   *
   * 这是 "render-to-target 修窗口最小化导致黑屏" 方案 B 的必要钩子。
   */
  setRenderToScreen(value: boolean): void {
    this.composer.renderToScreen = value;
  }

  /** 当前 renderToScreen 状态（用于导出前后保存/还原）。 */
  getRenderToScreen(): boolean {
    return this.composer.renderToScreen;
  }

  /**
   * 离屏导出专用：拿到 composer 最近一次 render 后，最终输出所在的纹理。
   *
   * 注意：EffectComposer 内部 readBuffer/writeBuffer 是 HalfFloat sRGB。
   * 直接 readPixels(UNSIGNED_BYTE) 行为未定义，所以调用方需要先把这张纹理
   * blit 到一张 UnsignedByte 的离屏 RT，再从那张 RT 读 pixel。
   */
  getFinalOutputTexture(): THREE.Texture {
    // composer.render() 结束后，最新输出在 readBuffer（最后一次 swap 之后）
    return this.composer.readBuffer.texture;
  }

  /** 由渲染循环调用：传入当前帧特征用于 uniforms 调制。 */
  render(features: AudioFeatures | null, dt: number): void {
    this.uTime += dt;

    // 节拍包络衰减
    const decay = Math.exp(-dt * 4);
    this.beatEnv *= decay;
    this.chromaticEnv *= Math.exp(-dt * 6);
    this.bloomBeatEnv *= Math.exp(-dt * 5);

    if (features?.beat) {
      this.beatEnv = 1;
      this.chromaticEnv = 1;
      this.bloomBeatEnv = 1;
    }

    const p = this.params;

    // Bloom + 节拍增益
    this.bloomPass.strength =
      p.bloomStrength * (1 + this.bloomBeatEnv * p.bloomBeatBoost);
    this.bloomPass.radius = p.bloomRadius;
    this.bloomPass.threshold = p.bloomThreshold;

    this.chromaticPass.uniforms.uOffset.value =
      p.chromaticOffset * (1 + this.chromaticEnv * p.chromaticBeatBoost);

    this.glitchPass.uniforms.uTrigger.value = this.beatEnv;
    this.glitchPass.uniforms.uIntensity.value = p.glitchIntensity;
    this.glitchPass.uniforms.uTime.value = this.uTime;

    this.grainPass.uniforms.uTime.value = this.uTime;
    this.grainPass.uniforms.uIntensity.value = p.grainIntensity;

    this.vignettePass.uniforms.uAmount.value = p.vignetteAmount;
    this.vignettePass.uniforms.uSoftness.value = p.vignetteSoftness;

    this.composer.render(dt);
  }

  dispose(): void {
    try {
      this.detachResize();
    } catch {
      /* ignore */
    }
    try {
      this.composer.dispose();
    } catch {
      /* ignore */
    }
  }
}
