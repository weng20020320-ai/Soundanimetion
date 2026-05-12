import * as THREE from 'three';
import type { AudioFeatures } from '../audio/types';

export interface ThreeContextOptions {
  alpha?: boolean;
  antialias?: boolean;
}

export type RenderHook = (
  ctx: ThreeContext,
  dt: number
) => void;

/**
 * 共享的 Three.js 上下文：renderer + scene + camera。
 * 预设可读写 scene，渲染管线（preview/offline）共用同一份 ThreeContext。
 *
 * 渲染入口统一走 ctx.render(dt)：默认调用 renderer.render(scene, camera)；
 * 当后处理链开启时由 PostFXChain 注入 hook，改走 composer.render(dt)。
 */
export class ThreeContext {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly clock: THREE.Clock;

  /** 预设可挂任何对象到这里，切换预设时整组清空。 */
  readonly presetGroup: THREE.Group;

  width = 1;
  height = 1;

  /** 相机基础距离（z 坐标）。aspect < 1 时会按比例拉远，保证圆形内容横向也装得下。 */
  private baseCameraZ = 6;

  /** 当前帧的音频特征；preview / offline 渲染循环写入，hook 读取用于参数调制。 */
  frameFeatures: AudioFeatures | null = null;

  /** 后处理链等可注入的渲染钩子；若为 null 走默认 renderer.render。 */
  private renderHook: RenderHook | null = null;

  /** 监听 setSize 的回调（PostFXChain 用于同步 composer.setSize）。 */
  private resizeListeners: Array<(w: number, h: number) => void> = [];

  constructor(canvas: HTMLCanvasElement, opts: ThreeContextOptions = {}) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: opts.antialias ?? true,
      alpha: opts.alpha ?? true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // 监听 WebGL 上下文丢失/恢复（驱动重置、GPU 进程崩溃、VRAM OOM 等场景）。
    // 默认行为是 preventDefault 让浏览器帮我们重建上下文，并把事件转发给监听者。
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      console.error(
        '[ThreeContext] WebGL 上下文已丢失。导出/预览将尝试自我恢复。\n' +
          '常见原因：导出分辨率过高 / 显存紧张 / 后处理 + HalfFloat 触发驱动 reset。'
      );
      for (const cb of this.contextLostListeners) cb();
    });
    canvas.addEventListener('webglcontextrestored', () => {
      console.warn('[ThreeContext] WebGL 上下文已恢复。');
      for (const cb of this.contextRestoredListeners) cb();
    });

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 400);
    this.camera.position.set(0, 0, this.baseCameraZ);

    this.presetGroup = new THREE.Group();
    this.presetGroup.name = 'PresetRoot';
    this.scene.add(this.presetGroup);

    this.clock = new THREE.Clock();
  }

  private contextLostListeners: Array<() => void> = [];
  private contextRestoredListeners: Array<() => void> = [];

  /** 订阅 WebGL 上下文丢失。返回取消订阅函数。 */
  onContextLost(cb: () => void): () => void {
    this.contextLostListeners.push(cb);
    return () => {
      const i = this.contextLostListeners.indexOf(cb);
      if (i >= 0) this.contextLostListeners.splice(i, 1);
    };
  }

  /** 订阅 WebGL 上下文恢复。返回取消订阅函数。 */
  onContextRestored(cb: () => void): () => void {
    this.contextRestoredListeners.push(cb);
    return () => {
      const i = this.contextRestoredListeners.indexOf(cb);
      if (i >= 0) this.contextRestoredListeners.splice(i, 1);
    };
  }

  setSize(width: number, height: number, updateStyle = false): void {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.renderer.setSize(this.width, this.height, updateStyle);
    this.camera.aspect = this.width / this.height;
    this.applyAspectDependentCameraDistance();
    this.camera.updateProjectionMatrix();
    for (const cb of this.resizeListeners) cb(this.width, this.height);
  }

  /**
   * 当 aspect < 1（竖屏/方形）时，把相机往后拉一点：
   * 默认 FOV 是垂直 FOV，所以横向可视宽度 = 垂直高度 × aspect。竖屏 aspect 越小，
   * 横向越窄，圆形内容会被裁掉。等比拉远相机后水平可视宽度恢复，能装下半径 ~2.8 的圆。
   *
   * landscape (aspect >= 1)：保持 baseCameraZ，不动。
   */
  private applyAspectDependentCameraDistance(): void {
    const a = this.camera.aspect;
    const z = a >= 1 ? this.baseCameraZ : this.baseCameraZ / a;
    this.camera.position.z = z;
  }

  /**
   * 设置预览缩放（presetGroup.scale）。不影响相机和分辨率，
   * 因此不影响导出像素，只是把所有 preset 整体放大缩小给用户看清楚细节。
   */
  setViewScale(scale: number): void {
    const s = Math.max(0.1, Math.min(4, scale));
    this.presetGroup.scale.setScalar(s);
  }

  onResize(cb: (w: number, h: number) => void): () => void {
    this.resizeListeners.push(cb);
    return () => {
      const i = this.resizeListeners.indexOf(cb);
      if (i >= 0) this.resizeListeners.splice(i, 1);
    };
  }

  setBackground(hex: string, alpha: number): void {
    const color = new THREE.Color(hex);
    this.renderer.setClearColor(color, alpha);
  }

  /** 注入自定义渲染钩子（如后处理链）；传 null 取消。 */
  setRenderHook(hook: RenderHook | null): void {
    this.renderHook = hook;
  }

  /** 渲染入口：所有渲染循环都应调用此方法。 */
  render(dt = 1 / 60): void {
    if (this.renderHook) {
      this.renderHook(this, dt);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  isWebGL2(): boolean {
    return this.renderer.capabilities.isWebGL2;
  }

  clearPreset(): void {
    while (this.presetGroup.children.length > 0) {
      const obj = this.presetGroup.children[0];
      this.presetGroup.remove(obj);
      disposeObject(obj);
    }
  }

  dispose(): void {
    this.clearPreset();
    this.renderer.dispose();
  }
}

function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else if (mat) mat.dispose();
  });
}
