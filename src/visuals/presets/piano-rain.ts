import * as THREE from 'three';
import type { VisualPreset } from '../VisualPreset';
import type { ParamSchema } from '../ParamSchema';
import type { AudioFeatures } from '../../audio/types';
import type { ThreeContext } from '../../render/ThreeContext';
import {
  type GradientValue,
  defaultGradient,
  gradientFromPreset,
  createGradientLUT,
  bakeGradientToLUT,
  gradientChanged,
} from '../GradientPresets';

/**
 * Piano Rain · 下落音符
 *
 * 灵感：DEEMO 的"音符落到判定线"音游视觉。
 *
 * ★ 设计 ★
 *   - 节拍那一刻挑出 FFT 能量最强的 top-K 列，spawn 独立"音符方块"。
 *   - 每个音符从顶端 (y=1) 下落到判定线 (y=judgeY)，带柔光拖尾。
 *   - 撞到判定线消失，触发该 column 的"爆点闪光"。
 *
 * ★ 渐变色作用范围 ★
 *   渐变色 (gradient) 只用于音符层：音符方块本体、拖尾、外发光、水面反射的音符。
 *   背景、星空、判定线、命中爆点、水面 tone 全部使用中性色（白 / 灰 / 蓝黑）。
 *   这样用户切换 gradient 时不会影响整张图的氛围，只换音符颜色。
 *
 * ★ 装饰层 ★
 *   背景层 (starfield / waterSurface / bgIntensity) 默认全部关闭，画面就是纯黑
 *   + 音符。用户可以单独打开任意一项添加氛围（这些装饰也用中性色不被 gradient 染）。
 *
 * 适合：钢琴、Lofi、新世纪、Ambient、慢节奏电子。
 */

const COLUMNS = 16;
const MAX_NOTES = 32;

const schema: ParamSchema = {
  notesPerBeat: {
    type: 'int',
    label: '每拍音符数',
    min: 1,
    max: 6,
    step: 1,
    default: 3,
  },
  fallSpeed: {
    type: 'float',
    label: '下落速度',
    min: 0.2,
    max: 3,
    step: 0.05,
    // NDC y 每秒移动量。0.7 = 从 y=1 飞到 y=0.28 用约 1s
    default: 0.7,
  },
  energyThreshold: {
    type: 'float',
    label: '触发阈值',
    min: 0.02,
    max: 0.5,
    step: 0.01,
    default: 0.1,
  },
  beatThreshold: {
    type: 'float',
    label: '节拍 RMS 阈值',
    min: 0,
    max: 0.5,
    step: 0.01,
    default: 0.05,
  },
  noteWidth: {
    type: 'float',
    label: '音符宽度',
    min: 0.3,
    max: 1.5,
    step: 0.05,
    default: 0.7,
  },
  noteHeight: {
    type: 'float',
    label: '音符高度',
    min: 0.02,
    max: 0.15,
    step: 0.005,
    default: 0.055,
  },
  noteTrail: {
    type: 'float',
    label: '音符拖尾长度',
    min: 0,
    max: 0.4,
    step: 0.01,
    // 拖尾的 NDC y 长度（0 = 不拖尾）
    default: 0.12,
  },
  noteGlow: {
    type: 'float',
    label: '音符发光',
    min: 0,
    max: 3,
    step: 0.05,
    default: 1.2,
  },
  judgeLineY: {
    type: 'float',
    label: '判定线位置',
    min: 0.05,
    max: 0.45,
    step: 0.01,
    // 没有水面时判定线可以靠下一点
    default: 0.2,
  },
  judgeLineGlow: {
    type: 'float',
    label: '判定线辉光',
    min: 0,
    max: 2,
    step: 0.05,
    default: 1.0,
  },
  hitBurst: {
    type: 'float',
    label: '命中爆点强度',
    min: 0,
    max: 3,
    step: 0.05,
    // 音符撞到判定线时的爆点闪光
    default: 1.2,
  },
  // —— 以下为"背景层"参数，默认全部关闭。打开后这些装饰仍然用中性色，
  //     不会被渐变色染色（用户希望渐变只影响音符本身）。
  waterSurface: {
    type: 'bool',
    label: '水面反射',
    default: false,
  },
  waterIntensity: {
    type: 'float',
    label: '水面反射强度',
    min: 0,
    max: 1,
    step: 0.02,
    default: 0.45,
  },
  starfield: {
    type: 'float',
    label: '星点密度',
    min: 0,
    max: 1,
    step: 0.02,
    default: 0,
  },
  bgIntensity: {
    type: 'float',
    label: '背景微光',
    min: 0,
    max: 1,
    step: 0.02,
    // 0 = 纯黑背景；大于 0 时是非常微弱的冷色调（不受 gradient 影响）
    default: 0,
  },
  gradient: {
    type: 'gradient',
    label: '音符渐变色',
    default: gradientFromPreset('twilight-blue', 0),
  },
};

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// 注意：GLSL ES1 不允许 break by uniform，所以总是 loop MAX_NOTES，靠 alpha=0 跳过。
//
// ★ 渐变色作用范围 ★
//   gradient(t) 只用于"音符层"：音符方块本体、拖尾、外发光、水面反射里的音符。
//   背景、星空、判定线、命中爆点、水面 tone 全部用中性色（白/灰/蓝黑），
//   这样用户切换 gradient 时不会影响背景色，只改变音符颜色。
const FRAG = `
precision highp float;

#define MAX_NOTES 32

varying vec2 vUv;

uniform vec4 uNotes[MAX_NOTES];      // (col_idx, y_norm, hueT, alpha)
uniform float uNoteWidthMul;
uniform float uNoteHeight;
uniform float uNoteTrail;
uniform float uNoteGlow;
uniform float uColumns;
uniform float uJudgeLineY;
uniform float uJudgeLineGlow;
uniform float uHitBurst;
uniform float uWaterSurface;          // 0/1
uniform float uWaterIntensity;
uniform float uStarfield;
uniform float uBgIntensity;
uniform sampler2D uColumnHitsTex;
uniform sampler2D uColumnHitTimeTex;
uniform sampler2D uGradientTex;
uniform float uBeatEnv;
uniform float uTime;

// 中性色常量（不受 gradient 影响）
const vec3 NEUTRAL_LINE = vec3(0.92, 0.96, 1.0);   // 判定线/爆点/水面波光：冷白
const vec3 BG_FAR       = vec3(0.018, 0.022, 0.035); // 远端微光：深蓝黑
const vec3 BG_NEAR      = vec3(0.045, 0.055, 0.08);  // 判定线附近：略亮
const vec3 WATER_TONE   = vec3(0.025, 0.035, 0.06);  // 水面本身：深蓝黑

vec3 gradient(float t) {
  return texture2D(uGradientTex, vec2(clamp(t, 0.0, 1.0), 0.5)).rgb;
}

float columnHit(float colNorm) {
  return texture2D(uColumnHitsTex, vec2(colNorm, 0.5)).r;
}

float columnHitTime(float colNorm) {
  return texture2D(uColumnHitTimeTex, vec2(colNorm, 0.5)).r;
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// 累加所有音符在 (uv.x, y) 处的色彩贡献。gradient 只在这里被使用。
vec4 accumulateNotes(vec2 uv, float y, float trailMul, float glowMul) {
  float colWidthHalf = (0.5 / uColumns) * uNoteWidthMul;
  float noteHalfH = uNoteHeight * 0.5;
  float feather = 0.004;

  vec3 acc = vec3(0.0);
  float accA = 0.0;

  for (int i = 0; i < MAX_NOTES; i++) {
    vec4 note = uNotes[i];
    if (note.w < 0.005) continue;

    float noteX = (note.x + 0.5) / uColumns;
    float noteY = note.y;

    float dx = uv.x - noteX;
    float dy = y - noteY;
    float adx = abs(dx);
    float ady = abs(dy);

    // 越靠近判定线越偏 gradient 的"亮端"（0.95），刚出现时偏中段（0.7）
    float prox = clamp(1.0 - (noteY - uJudgeLineY) /
                              max(0.01, 1.0 - uJudgeLineY), 0.0, 1.0);
    vec3 noteCol = mix(gradient(0.65), gradient(0.95),
                       smoothstep(0.4, 1.0, prox));

    // 主体方块
    float vx = smoothstep(colWidthHalf + feather, colWidthHalf - feather, adx);
    float vy = smoothstep(noteHalfH + feather, noteHalfH - feather, ady);
    float body = vx * vy * note.w;
    acc += noteCol * body;
    accA = max(accA, body);

    // 拖尾（音符上方）
    float trailLen = uNoteTrail * trailMul;
    if (trailLen > 0.001) {
      float trailT = (y - noteY) / max(0.001, trailLen);
      if (trailT > 0.0 && trailT < 1.0) {
        float trailFade = 1.0 - trailT;
        float trailWHalf = colWidthHalf * (1.0 - trailT * 0.5);
        float tvx = smoothstep(trailWHalf + feather, trailWHalf - feather, adx);
        float trailV = tvx * trailFade * trailFade * note.w * 0.55;
        acc += noteCol * trailV;
        accA = max(accA, trailV);
      }
    }

    // 外发光晕
    float glow = exp(-adx * 28.0 - ady * 55.0) * note.w * 0.4 * glowMul;
    acc += noteCol * glow;
  }

  return vec4(acc, accA);
}

void main() {
  vec2 uv = vUv;
  float judgeY = uJudgeLineY;

  // —— 背景：默认纯黑。bgIntensity > 0 时叠加非常微弱的冷色微光（不是 gradient） ——
  vec3 col = vec3(0.0);
  if (uBgIntensity > 0.001) {
    float bgT = clamp((uv.y - judgeY) / max(0.01, 1.0 - judgeY), 0.0, 1.0);
    col = mix(BG_NEAR, BG_FAR, bgT) * uBgIntensity;
  }

  // —— 星空（中性冷白点，不受 gradient） ——
  if (uv.y > judgeY && uStarfield > 0.001) {
    vec2 starUV = uv * vec2(220.0, 220.0);
    float starHash = hash(floor(starUV));
    float star = pow(starHash, 80.0) * 1.4;
    vec2 bigUV = uv * vec2(50.0, 50.0);
    float bigHash = hash(floor(bigUV));
    float bigStar = pow(bigHash, 110.0) * 2.2;
    float twinkle = 0.6 + 0.4 * sin(uTime * 1.8 + starHash * 30.0);
    col += NEUTRAL_LINE * (star + bigStar) * twinkle * uStarfield;
  }

  // —— 音符（上半屏，gradient 唯一作用区域） ——
  if (uv.y >= judgeY) {
    vec4 notesAcc = accumulateNotes(uv, uv.y, 1.0, uNoteGlow);
    col = mix(col, notesAcc.rgb, clamp(notesAcc.a, 0.0, 1.0));
    col += notesAcc.rgb * 0.6;
  }

  // —— 水面反射（下半屏；水面 tone 中性，但反射的音符仍是 gradient 色） ——
  if (uWaterSurface > 0.5 && uv.y < judgeY) {
    float waterT = (judgeY - uv.y) / max(0.01, judgeY);
    float wave1 = sin(uv.x * 40.0 + uTime * 1.8) * 0.004;
    float wave2 = sin(uv.x * 17.0 - uTime * 1.1 + 1.7) * 0.006;
    float ripple = (wave1 + wave2) * (0.4 + 0.6 * (1.0 - waterT));

    float mirrorY = 2.0 * judgeY - uv.y + ripple;
    float reflFade = (1.0 - waterT) * uWaterIntensity;
    if (mirrorY <= 1.0) {
      vec2 mirrorUV = vec2(uv.x + ripple * 0.5, mirrorY);
      vec4 reflAcc = accumulateNotes(mirrorUV, mirrorY, 0.6, uNoteGlow * 0.7);
      col = mix(col, reflAcc.rgb * 0.85,
                clamp(reflAcc.a * reflFade, 0.0, 1.0));
      col += reflAcc.rgb * 0.4 * reflFade;
    }

    float waterMix = 0.55 + 0.25 * waterT;
    col = mix(col, WATER_TONE, waterMix * 0.5);

    float strip = sin(uv.x * 80.0 + uTime * 0.8 + ripple * 100.0) * 0.5 + 0.5;
    col += NEUTRAL_LINE * 0.05 * strip * (1.0 - waterT) * 0.15;
  }

  // —— 判定线（中性冷白） ——
  float distToLine = abs(uv.y - judgeY);
  float linePx = 1.2 / 1080.0;
  float lineCore = smoothstep(linePx * 1.5, 0.0, distToLine);

  float colNorm = clamp(uv.x, 0.0, 1.0);
  float hitEnergy = columnHit(colNorm);
  float hitTime = columnHitTime(colNorm);

  float hitGlow = exp(-distToLine * 45.0) * hitEnergy * uJudgeLineGlow;
  float beatLineGlow = lineCore * uBeatEnv * 0.35;
  col += NEUTRAL_LINE * (lineCore * 0.45 + hitGlow + beatLineGlow);

  // —— 命中爆点（中性纯白） ——
  if (uHitBurst > 0.01 && hitTime > 0.01) {
    float colF = uv.x * uColumns;
    float colIdx = floor(colF);
    float colCenter = (colIdx + 0.5) / uColumns;
    float dxToCenter = uv.x - colCenter;
    float dyToLine = uv.y - judgeY;
    float distRadial = length(vec2(dxToCenter * 3.0, dyToLine));

    float burstRing = exp(-distRadial * 28.0) * hitTime;
    float burstStreak = exp(-abs(dxToCenter) * 200.0 - abs(dyToLine) * 12.0) *
                        hitTime * 1.4;
    float ringExpand = exp(-pow(distRadial - (1.0 - hitTime) * 0.08, 2.0) * 400.0) *
                       hitTime * 0.8;

    vec3 burstColor = vec3(1.0);
    col += burstColor * (burstRing + burstStreak * 0.6 + ringExpand) *
           uHitBurst * hitEnergy;
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

interface Note {
  col: number;
  y: number;
  hueT: number;
  alpha: number;
  alive: boolean;
}

interface PresetState {
  ctx: ThreeContext | null;
  mesh: THREE.Mesh | null;
  geometry: THREE.PlaneGeometry | null;
  material: THREE.ShaderMaterial | null;
  notes: Note[];
  /** 每 column 命中能量（强度），时间衰减 */
  columnHits: Float32Array;
  /** 每 column 命中的"新鲜度"（0..1）：1=刚命中, 0=已消失。爆点放射光用这个 */
  columnHitTime: Float32Array;
  columnHitsTex: THREE.DataTexture | null;
  columnHitsBuffer: Uint8Array<ArrayBuffer> | null;
  columnHitTimeTex: THREE.DataTexture | null;
  columnHitTimeBuffer: Uint8Array<ArrayBuffer> | null;
  columnSmooth: Float32Array;
  beatEnv: number;
  time: number;
  gradientTex: THREE.DataTexture | null;
  gradientBuffer: Uint8Array<ArrayBuffer> | null;
  lastGradient: GradientValue | null;
}

export function createPianoRainPreset(): VisualPreset {
  const state: PresetState = {
    ctx: null,
    mesh: null,
    geometry: null,
    material: null,
    notes: [],
    columnHits: new Float32Array(COLUMNS),
    columnHitTime: new Float32Array(COLUMNS),
    columnHitsTex: null,
    columnHitsBuffer: null,
    columnHitTimeTex: null,
    columnHitTimeBuffer: null,
    columnSmooth: new Float32Array(COLUMNS),
    beatEnv: 0,
    time: 0,
    gradientTex: null,
    gradientBuffer: null,
    lastGradient: null,
  };

  function makeColumnTex(): {
    buf: Uint8Array<ArrayBuffer>;
    tex: THREE.DataTexture;
  } {
    const buf = new Uint8Array(COLUMNS) as Uint8Array<ArrayBuffer>;
    const tex = new THREE.DataTexture(
      buf,
      COLUMNS,
      1,
      THREE.RedFormat,
      THREE.UnsignedByteType
    );
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return { buf, tex };
  }

  return {
    id: 'piano-rain',
    name: '下落音符 · Piano Rain',
    category: 'shader',
    paramSchema: schema,

    init(ctx: ThreeContext, params) {
      state.ctx = ctx;
      state.notes = [];
      state.beatEnv = 0;
      state.time = 0;
      state.columnSmooth.fill(0);
      state.columnHits.fill(0);
      state.columnHitTime.fill(0);

      const hits = makeColumnTex();
      const hitsTime = makeColumnTex();
      state.columnHitsTex = hits.tex;
      state.columnHitsBuffer = hits.buf;
      state.columnHitTimeTex = hitsTime.tex;
      state.columnHitTimeBuffer = hitsTime.buf;

      const { buffer: gBuf, texture: gTex } = createGradientLUT();
      state.gradientBuffer = gBuf;
      state.gradientTex = gTex;
      const initialGradient =
        (params.gradient as GradientValue | undefined) ?? defaultGradient();
      bakeGradientToLUT(initialGradient, gBuf, gTex);
      state.lastGradient = initialGradient;

      const notesArr: THREE.Vector4[] = [];
      for (let i = 0; i < MAX_NOTES; i++) {
        notesArr.push(new THREE.Vector4(0, 0, 0, 0));
      }

      const material = new THREE.ShaderMaterial({
        uniforms: {
          uNotes: { value: notesArr },
          uNoteWidthMul: { value: 0.7 },
          uNoteHeight: { value: 0.055 },
          uNoteTrail: { value: 0.12 },
          uNoteGlow: { value: 1.2 },
          uColumns: { value: COLUMNS },
          uJudgeLineY: { value: 0.2 },
          uJudgeLineGlow: { value: 1.0 },
          uHitBurst: { value: 1.2 },
          uWaterSurface: { value: 0 },
          uWaterIntensity: { value: 0.45 },
          uStarfield: { value: 0 },
          uBgIntensity: { value: 0 },
          uColumnHitsTex: { value: hits.tex },
          uColumnHitTimeTex: { value: hitsTime.tex },
          uGradientTex: { value: gTex },
          uBeatEnv: { value: 0 },
          uTime: { value: 0 },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        depthTest: false,
        depthWrite: false,
      });

      const geometry = new THREE.PlaneGeometry(2, 2);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      ctx.presetGroup.add(mesh);

      state.mesh = mesh;
      state.geometry = geometry;
      state.material = material;
    },

    update(features: AudioFeatures, params, dt) {
      const {
        material,
        columnSmooth,
        columnHits,
        columnHitTime,
        columnHitsBuffer,
        columnHitsTex,
        columnHitTimeBuffer,
        columnHitTimeTex,
        notes,
        gradientBuffer,
        gradientTex,
      } = state;
      if (
        !material ||
        !columnHitsTex ||
        !columnHitsBuffer ||
        !columnHitTimeTex ||
        !columnHitTimeBuffer
      )
        return;

      state.time += dt;
      if (features.beat) state.beatEnv = 1;
      state.beatEnv = Math.max(0, state.beatEnv - dt * 2.0);

      // —— FFT 分箱到 COLUMNS 列（log 频率） ——
      const fft = features.fft;
      const M = fft.length;
      const minBin = 1;
      const maxBin = Math.min(M - 1, Math.floor(M * 0.6));
      const logMin = Math.log(minBin);
      const logMax = Math.log(maxBin);

      const attack = 0.6;
      const release = 0.82;
      for (let i = 0; i < COLUMNS; i++) {
        const t = i / (COLUMNS - 1);
        const lo = Math.floor(Math.exp(logMin + (logMax - logMin) * t));
        const hi = Math.floor(
          Math.exp(logMin + (logMax - logMin) * Math.min(1, t + 1 / COLUMNS))
        );
        let s = 0;
        let c = 0;
        for (let k = lo; k <= Math.max(lo, hi); k++) {
          s += fft[k];
          c++;
        }
        const raw = c > 0 ? s / c : 0;
        const prev = columnSmooth[i];
        columnSmooth[i] =
          raw > prev ? prev + (raw - prev) * attack : prev * release;
      }

      const fallSpeed = params.fallSpeed as number;
      const energyThreshold = params.energyThreshold as number;
      const beatThreshold = params.beatThreshold as number;
      const notesPerBeat = params.notesPerBeat as number;
      const judgeY = params.judgeLineY as number;

      // —— 节拍触发：扫描 top-K 能量 column，spawn Note ——
      if (
        features.beat &&
        features.rms >= beatThreshold &&
        notesPerBeat > 0
      ) {
        const candidates: Array<{ idx: number; e: number }> = [];
        for (let i = 0; i < COLUMNS; i++) {
          if (columnSmooth[i] >= energyThreshold) {
            candidates.push({ idx: i, e: columnSmooth[i] });
          }
        }
        candidates.sort((a, b) => b.e - a.e);

        const centroidNorm = Math.min(1, features.spectralCentroid / 8000);
        const K = Math.min(notesPerBeat, candidates.length);

        for (let i = 0; i < K; i++) {
          const cand = candidates[i];
          const alreadyTop = notes.some(
            (n) => n.alive && n.col === cand.idx && n.y > 0.85
          );
          if (alreadyTop) continue;

          if (notes.length < MAX_NOTES) {
            notes.push({
              col: cand.idx,
              y: 1.0 + Math.random() * 0.04,
              hueT: Math.max(
                0,
                Math.min(
                  1,
                  centroidNorm * 0.3 +
                    (cand.idx / (COLUMNS - 1)) * 0.4 +
                    cand.e * 0.4
                )
              ),
              alpha: Math.min(1, 0.85 + cand.e * 0.4),
              alive: true,
            });
          }
        }
      }

      // —— 更新 note：下落 + 判定线检测 ——
      for (const n of notes) {
        if (!n.alive) continue;
        n.y -= fallSpeed * dt;
        if (n.y <= judgeY) {
          columnHits[n.col] = Math.max(columnHits[n.col], n.alpha);
          columnHitTime[n.col] = 1.0;  // 重置爆点新鲜度
          n.alive = false;
        }
      }
      for (let i = notes.length - 1; i >= 0; i--) {
        if (!notes[i].alive) notes.splice(i, 1);
      }

      // 时间衰减
      for (let i = 0; i < COLUMNS; i++) {
        columnHits[i] *= 0.86;
        // 爆点新鲜度衰减得快一点（爆点是短暂闪光）
        columnHitTime[i] = Math.max(0, columnHitTime[i] - dt * 3.5);
      }

      // 写纹理
      for (let i = 0; i < COLUMNS; i++) {
        columnHitsBuffer[i] = Math.min(
          255,
          Math.max(0, Math.floor(columnHits[i] * 255))
        );
        columnHitTimeBuffer[i] = Math.min(
          255,
          Math.max(0, Math.floor(columnHitTime[i] * 255))
        );
      }
      columnHitsTex.needsUpdate = true;
      columnHitTimeTex.needsUpdate = true;

      // 写 uNotes
      const u = material.uniforms;
      const notesArr = u.uNotes.value as THREE.Vector4[];
      const count = Math.min(MAX_NOTES, notes.length);
      for (let i = 0; i < count; i++) {
        const n = notes[i];
        notesArr[i].set(n.col, n.y, n.hueT, n.alive ? n.alpha : 0);
      }
      for (let i = count; i < MAX_NOTES; i++) {
        notesArr[i].set(0, 0, 0, 0);
      }

      u.uTime.value = state.time;
      u.uBeatEnv.value = state.beatEnv;
      u.uJudgeLineY.value = judgeY;
      u.uJudgeLineGlow.value = params.judgeLineGlow as number;
      u.uNoteWidthMul.value = params.noteWidth as number;
      u.uNoteHeight.value = params.noteHeight as number;
      u.uNoteTrail.value = params.noteTrail as number;
      u.uNoteGlow.value = params.noteGlow as number;
      u.uHitBurst.value = params.hitBurst as number;
      u.uWaterSurface.value = (params.waterSurface as boolean) ? 1 : 0;
      u.uWaterIntensity.value = params.waterIntensity as number;
      u.uStarfield.value = params.starfield as number;
      u.uBgIntensity.value = params.bgIntensity as number;

      const g = params.gradient as GradientValue | undefined;
      if (g && gradientBuffer && gradientTex) {
        if (gradientChanged(state.lastGradient, g)) {
          bakeGradientToLUT(g, gradientBuffer, gradientTex);
          state.lastGradient = {
            presetId: g.presetId,
            stops: g.stops.map((s) => ({ ...s })),
            rotation: g.rotation,
          };
        }
      }
    },

    dispose(ctx) {
      if (state.mesh) ctx.presetGroup.remove(state.mesh);
      state.geometry?.dispose();
      state.material?.dispose();
      state.columnHitsTex?.dispose();
      state.columnHitTimeTex?.dispose();
      state.gradientTex?.dispose();
      state.mesh = null;
      state.geometry = null;
      state.material = null;
      state.columnHitsTex = null;
      state.columnHitsBuffer = null;
      state.columnHitTimeTex = null;
      state.columnHitTimeBuffer = null;
      state.gradientTex = null;
      state.gradientBuffer = null;
      state.lastGradient = null;
      state.notes = [];
      state.ctx = null;
    },
  };
}
