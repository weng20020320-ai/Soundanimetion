/**
 * GPU 分档检测：根据 WebGL 的 UNMASKED_RENDERER_WEBGL 字符串猜出 GPU 等级。
 * 用于让导出管线在弱 GPU 上自动降级（PBO 槽数 / pixelRatio 等），强 GPU 上保持满规格。
 *
 * 不做 micro-benchmark（启动开销），只做"瞬时分类"。
 * 不可识别时返回 'unknown'，调用方应当当作 'medium' 兜底（保守路径）。
 */

export type GpuTier = 'high' | 'medium' | 'low' | 'lowest' | 'unknown';

export interface GpuInfo {
  tier: GpuTier;
  vendor: string;
  renderer: string;
  /** 给 UI 显示的简短描述（中文）。 */
  label: string;
  /** 是否检测到软件渲染（SwiftShader / llvmpipe）。 */
  isSoftware: boolean;
}

const UNKNOWN: GpuInfo = {
  tier: 'unknown',
  vendor: '',
  renderer: '',
  label: '未识别（按"中档"兜底）',
  isSoftware: false,
};

/**
 * 入口：传入 WebGL 上下文（preview renderer 的 gl），同步返回分档信息。
 * 多次调用安全（内部带 weakmap 缓存）。
 */
const cache = new WeakMap<WebGLRenderingContext | WebGL2RenderingContext, GpuInfo>();

export function detectGpu(
  gl: WebGLRenderingContext | WebGL2RenderingContext
): GpuInfo {
  const cached = cache.get(gl);
  if (cached) return cached;

  let info: GpuInfo;
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) {
      info = UNKNOWN;
    } else {
      const vendor = String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) ?? '');
      const renderer = String(
        gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? ''
      );
      info = classify(vendor, renderer);
    }
  } catch {
    info = UNKNOWN;
  }
  cache.set(gl, info);
  return info;
}

/**
 * 字符串到分档的纯函数；导出供测试用。
 *
 * 标准化思路：把 renderer 转小写，按"已知关键词"打分。
 */
export function classify(vendor: string, renderer: string): GpuInfo {
  const r = renderer.toLowerCase();
  const v = vendor.toLowerCase();

  // 软件渲染 —— 任何一台机器跑这个都是出大事了
  if (
    /swiftshader|llvmpipe|software|microsoft basic render/.test(r) ||
    /software/.test(v)
  ) {
    return {
      tier: 'lowest',
      vendor,
      renderer,
      label: '软件渲染（强烈建议升级显卡驱动）',
      isSoftware: true,
    };
  }

  // 强档：RTX 30/40/50, RX 6000/7000/8000, Apple M2 以上独显
  if (
    /\brtx\s*(30|40|50)\d{2}/.test(r) ||
    /\bradeon\s*rx\s*(6|7|8|9)\d{3}/.test(r) ||
    /\barc\s*a(7|9)\d{2}/.test(r) || // Intel Arc A770/A750
    /\bm[2-9]\s+(pro|max|ultra)/.test(r) // Apple M2 Pro/Max/Ultra+
  ) {
    return {
      tier: 'high',
      vendor,
      renderer,
      label: tierLabel('high', renderer),
      isSoftware: false,
    };
  }

  // 弱档：iGPU / 老低端独显 / 笔电入门卡
  if (
    /radeon\s*(680|780|880|890)m/.test(r) || // AMD Ryzen 集显（680M/780M）
    /radeon\s*vega/.test(r) ||
    /iris\s*xe|iris\s*plus|uhd\s*graphics|hd\s*graphics/.test(r) || // Intel iGPU
    /\bmx\s*\d{2,3}/.test(r) || // NVIDIA MX 系列
    /\bgt\s*\d{3,4}/.test(r) || // 老 GT 系列
    /apple\s*m1\b/.test(r) // M1 base（无 Pro 后缀的 base 款）
  ) {
    return {
      tier: 'low',
      vendor,
      renderer,
      label: tierLabel('low', renderer),
      isSoftware: false,
    };
  }

  // 中档：兜底，包括没匹配上的所有 NVIDIA/AMD 独显
  // 例如 RTX 20 系、GTX 16 系、Radeon RX 5000 系，或叫不出名字的型号
  return {
    tier: 'medium',
    vendor,
    renderer,
    label: tierLabel('medium', renderer),
    isSoftware: false,
  };
}

/** 提取一个用户能读懂的简短显卡名（剪掉 ANGLE 前缀和驱动后缀）。 */
function tierLabel(tier: 'high' | 'medium' | 'low', renderer: string): string {
  // 典型字符串："ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)"
  const m = renderer.match(/\(([^)]+)\)/);
  let core = m ? m[1] : renderer;
  // 去掉常见噪音词
  core = core
    .replace(/^(NVIDIA|AMD|Intel|ATI|Apple|Google\s+Inc\.?)[\s,]*/i, '')
    .replace(/Direct3D\d*|D3D\d*|vs_\d+_\d+|ps_\d+_\d+|OpenGL.*$/gi, '')
    .replace(/[,\s]+$/g, '')
    .replace(/^\s*[,\s]+/g, '')
    .trim();
  if (core.length > 64) core = core.slice(0, 60) + '…';
  const tierTag = { high: '强', medium: '中', low: '弱' }[tier];
  return `${tierTag}档 · ${core}`;
}
