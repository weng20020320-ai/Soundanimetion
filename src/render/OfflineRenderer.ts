import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import type { ThreeContext } from './ThreeContext';
import type { FeatureTimeline } from '../audio/FeatureTimeline';
import type { VisualPreset } from '../visuals/VisualPreset';
import type {
  ExportFormat,
  ExportQuality,
  VideoEncoder,
} from '../../electron/preload';
import {
  PBOReader,
  PBOContextLostError,
  PBOFenceFailedError,
} from './PBOReader';
import { FrameTransport } from './FrameTransport';
import type { PostFXChain } from './PostFXChain';
import type { GpuTier } from './GpuTier';

const BLIT_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const BLIT_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(tDiffuse, vUv);
}
`;

/**
 * 导出画质档：决定 PBO 槽数、pixelRatio、是否启用 PBO 等"执行路径"。
 * 不影响最终输出像素分辨率（那个由 width/height 决定）。
 */
export type QualityProfile = 'auto' | 'fast' | 'balanced' | 'ultra';

export interface PipelineConfig {
  /** PBO 槽数。0 = 禁用 PBO（走同步 readPixels）。 */
  pboSlots: number;
  /** 强制 composer 内部 pixelRatio。1 = 1080p 实际就画 1080p；2 = super-sample。 */
  composerPixelRatio: number;
  /** 给 UI/日志用的人类可读描述。 */
  description: string;
}

/** 把档位 + GPU 等级翻译成具体执行参数。导出供单测/UI 使用。 */
export function resolvePipelineConfig(
  profile: QualityProfile,
  tier: GpuTier
): PipelineConfig {
  // 'auto' 根据 GPU 推断：强→ultra，中→balanced，弱→fast
  let effective: Exclude<QualityProfile, 'auto'>;
  if (profile === 'auto') {
    if (tier === 'high') effective = 'ultra';
    else if (tier === 'low' || tier === 'lowest') effective = 'fast';
    else effective = 'balanced'; // medium / unknown
  } else {
    effective = profile;
  }

  switch (effective) {
    case 'fast':
      return {
        pboSlots: 0,
        composerPixelRatio: 1,
        description: '极速：禁用 PBO + composer 1×（兼容性最好）',
      };
    case 'balanced':
      return {
        pboSlots: 2,
        composerPixelRatio: 1,
        description: '平衡：PBO 2 槽 + composer 1×',
      };
    case 'ultra':
      return {
        pboSlots: 3,
        composerPixelRatio: 1,
        description: '极致：PBO 3 槽 + composer 1×',
      };
  }
}

export interface OfflineRenderOptions {
  width: number;
  height: number;
  fps: number;
  startSec: number;
  endSec: number;
  format: ExportFormat;
  outputPath: string;
  audioPath: string | null;
  bgColor: string;
  bgAlpha: number;
  quality?: ExportQuality;
  encoder?: VideoEncoder;
  /** 画质档（'auto' = 按 gpuTier 决定）。默认 'auto'。 */
  qualityProfile?: QualityProfile;
  /** 当前检测到的 GPU 等级，'auto' 档下用来推断。 */
  gpuTier?: GpuTier;
  /** PostFXChain 实例。如果给了，会在导出前后强制 composer pixelRatio = 1 / 还原。 */
  postFX?: PostFXChain | null;
  /**
   * 当硬件编码器启动失败、自动回退到 libx264 时触发。
   * UI 可借此显示提示「检测到 NVENC 不可用，已切回 CPU 编码」。
   */
  onEncoderFallback?: (info: {
    from: VideoEncoder;
    to: VideoEncoder;
    reason: string;
  }) => void;
}

export interface OfflineRenderProgress {
  frame: number;
  totalFrames: number;
  ratio: number;
  fps: number;
  etaSec: number;
  /** 当前 FrameTransport 在途帧数（"等 ffmpeg ack"诊断用）。 */
  inFlight?: number;
  /** 渲染管线是否被 ffmpeg 背压挡住（true 时 UI 应该提示"等 ffmpeg 落盘"）。 */
  waitingForFfmpeg?: boolean;
}

/**
 * 离线渲染器：按帧推进 FeatureTimeline + Preset → PBO 异步回读 → 零拷贝 IPC → ffmpeg。
 */
export class OfflineRenderer {
  private cancelled = false;
  private currentSessionId: string | null = null;

  cancel(): void {
    this.cancelled = true;
    if (this.currentSessionId) {
      void window.api.ffmpegCancel(this.currentSessionId);
    }
  }

  async render(
    ctx: ThreeContext,
    timeline: FeatureTimeline,
    preset: VisualPreset,
    presetParams: Record<string, unknown>,
    opts: OfflineRenderOptions,
    onProgress: (p: OfflineRenderProgress) => void
  ): Promise<{ outputPath: string }> {
    this.cancelled = false;
    const requestedEncoder = opts.encoder ?? 'libx264';

    try {
      return await this._renderOnce(ctx, timeline, preset, presetParams, opts, onProgress);
    } catch (err) {
      // bug D 修复：硬件编码器在某些机器上会启动失败（驱动版本 / 非匹配 GPU / 编码器没装等）
      // 现在 ffmpeg-service 会在 first-frame 之前 close 时回 "首帧前就退出" 的错误信息
      // 这里捕获并自动用 libx264 重试一次（CPU 软编几乎不会失败）
      if (this.cancelled) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      const isEarlyExit = /首帧前就退出|进程异常退出|ffmpeg 进程启动失败/.test(msg);
      const isHwEncoder = requestedEncoder !== 'libx264';
      if (isEarlyExit && isHwEncoder) {
        console.warn(
          `[OfflineRenderer] ${requestedEncoder} 编码失败 → 自动回退到 libx264 重试。原因：${msg.slice(0, 200)}`
        );
        opts.onEncoderFallback?.({
          from: requestedEncoder,
          to: 'libx264',
          reason: msg,
        });
        // 重置取消状态（前一次错误不算用户取消），用 libx264 再跑一次
        this.cancelled = false;
        return await this._renderOnce(
          ctx,
          timeline,
          preset,
          presetParams,
          { ...opts, encoder: 'libx264' },
          onProgress
        );
      }
      throw err;
    }
  }

  private async _renderOnce(
    ctx: ThreeContext,
    timeline: FeatureTimeline,
    preset: VisualPreset,
    presetParams: Record<string, unknown>,
    opts: OfflineRenderOptions,
    onProgress: (p: OfflineRenderProgress) => void
  ): Promise<{ outputPath: string }> {
    const totalFrames = Math.max(
      1,
      Math.ceil((opts.endSec - opts.startSec) * opts.fps)
    );

    const profile = opts.qualityProfile ?? 'auto';
    const tier: GpuTier = opts.gpuTier ?? 'unknown';
    const pipeline = resolvePipelineConfig(profile, tier);
    console.info(
      `[OfflineRenderer] 启动导出 ${opts.width}×${opts.height}@${opts.fps} | GPU=${tier} | ${pipeline.description}`
    );

    const prevWidth = ctx.width;
    const prevHeight = ctx.height;
    const prevPixelRatio = ctx.renderer.getPixelRatio();
    const prevClearAlpha = ctx.renderer.getClearAlpha();
    const prevClearColor = new THREE.Color();
    ctx.renderer.getClearColor(prevClearColor);

    // 关键修复：把 PostFX composer 的 pixelRatio 也强制设为 pipeline 指定值，
    // 否则 composer 内部 target 会按 preview 的 pixelRatio (常见 = 2) 分配，
    // 导出 1080p 实际画 4K HalfFloat（4× 的开销）。
    const prevComposerPixelRatio =
      opts.postFX?.getPixelRatio() ?? prevPixelRatio;
    ctx.renderer.setPixelRatio(1);
    ctx.setSize(opts.width, opts.height, false);
    if (opts.postFX) {
      opts.postFX.setPixelRatio(pipeline.composerPixelRatio);
    }
    ctx.setBackground(opts.bgColor, opts.bgAlpha);

    const audioDurationSec =
      opts.audioPath && opts.endSec > opts.startSec
        ? opts.endSec - opts.startSec
        : undefined;

    const session = await window.api.ffmpegStart({
      format: opts.format,
      width: opts.width,
      height: opts.height,
      fps: opts.fps,
      outputPath: opts.outputPath,
      audioPath: opts.audioPath,
      audioStartSec: opts.audioPath ? opts.startSec : undefined,
      audioDurationSec,
      totalFrames,
      flipY: true,
      quality: opts.quality,
      encoder: opts.encoder,
    });
    this.currentSessionId = session.sessionId;

    // 给 preload 端注入 MessagePort 一点时间（异步）
    await new Promise<void>((r) => setTimeout(r, 0));

    // maxInFlight=8：给 ffmpeg 端的"首帧 init / 关键帧抖动"留更多余量
    // 1080p RGBA 8MB/帧 × 8 ≈ 64MB 上限，可接受
    const transport = new FrameTransport(session.sessionId, 8);

    const gl = ctx.renderer.getContext() as
      | WebGLRenderingContext
      | WebGL2RenderingContext;
    let pbo: PBOReader | null =
      pipeline.pboSlots > 0
        ? PBOReader.tryCreate(gl, opts.width, opts.height, pipeline.pboSlots)
        : null;
    /**
     * Step 8 修复：PBO 管线深度严格为 slots - 1。
     * 之前 Math.min(pbo.count, 2) 在 slots=2 时退化成 latency=2，
     * 第 N+2 帧 kickRead 会在第 N 帧 readSlot 之前重写同一个 PBO 槽，
     * 触发 Chromium 的"written, then fenced, but written again before being read back"警告，
     * 同时 GPU 把 shadow copy 抛掉，readback 退化到与同步路径同样的开销。
     *
     * 正确的不变量：在途的 kick 数（latency）必须 ≤ slots - 1，留一个槽给 drain 这一帧。
     */
    let readBackLatency = pbo ? Math.max(1, pbo.count - 1) : 0;

    const byteSize = opts.width * opts.height * 4;

    // ── 方案 B：离屏渲染目标（exportRT） ─────────────────────────────
    //
    // 之前：导出循环把场景画到默认 framebuffer，PBO/readPixels 从默认 fb 读。
    //   问题：Electron 窗口被遮挡 / 最小化 / 切桌面时，Chromium 把窗口标记为
    //   "occluded"，compositor 不再合成默认 fb；部分驱动顺势跳过 draw call，
    //   导致 readPixels 读到上一帧或全黑 → 长视频导出在切屏后突然全黑。
    //
    // 现在：所有 readback 都从一张离屏 8-bit RT (exportRT) 上读。离屏 framebuffer
    //   是普通 GPU 资源，和窗口可见性完全无关，driver 不会跳过对它的绘制。
    //
    // 色彩空间细节：
    //   - 无 PostFX 路径：renderer 直接画 scene → exportRT。要拿到「和 canvas 一样」
    //     的 sRGB 字节，需要 exportRT.texture.colorSpace = SRGBColorSpace，让 three.js
    //     在 shader 输出处自动注入 linear→sRGB 编码（与 outputColorSpace=SRGB 时
    //     画到 canvas 等价）。
    //   - 有 PostFX 路径：composer 的 OutputPass 在 fragment shader 内部已经做了
    //     tone mapping + linear→sRGB（受 renderer.outputColorSpace 触发）。结果以
    //     "已编码 sRGB 的 float 值"形式存进 composer.readBuffer（NoColorSpace 的
    //     HalfFloat）。再 blit 时只能用 NoColorSpace 的 exportRT，否则 three.js 会
    //     再编码一次 → 双重 sRGB → 画面偏暗。
    //   所以这里准备两张 RT，按当前路径切换。
    const exportRTDirect = new THREE.WebGLRenderTarget(opts.width, opts.height, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      colorSpace: THREE.SRGBColorSpace,
      depthBuffer: false,
      stencilBuffer: false,
    });
    const exportRTBlit = new THREE.WebGLRenderTarget(opts.width, opts.height, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      colorSpace: THREE.NoColorSpace,
      depthBuffer: false,
      stencilBuffer: false,
    });

    // PostFX 路径专用：把 composer 的 HalfFloat 输出 blit 到 8-bit exportRTBlit
    let blitMaterial: THREE.ShaderMaterial | null = null;
    let blitQuad: FullScreenQuad | null = null;
    let composerWasRenderToScreen = true;
    if (opts.postFX && opts.postFX.isActive()) {
      blitMaterial = new THREE.ShaderMaterial({
        uniforms: { tDiffuse: { value: null } },
        vertexShader: BLIT_VERT,
        fragmentShader: BLIT_FRAG,
        depthTest: false,
        depthWrite: false,
        transparent: false,
      });
      blitQuad = new FullScreenQuad(blitMaterial);
      // 关键：让 composer 最后一个 pass 写到内部 RT（readBuffer），而不是默认 fb
      composerWasRenderToScreen = opts.postFX.getRenderToScreen();
      opts.postFX.setRenderToScreen(false);
    }

    /**
     * 把一帧画到合适的 exportRT 上，并返回那张 RT（PBO/readPixels 用）。
     *   - 函数返回时，gl 当前 framebuffer = 返回 RT 的 framebuffer
     *   - 调用方完成 readback 后必须 setRenderTarget(null) 还原状态
     */
    const renderIntoExportRT = (dt: number): THREE.WebGLRenderTarget => {
      if (opts.postFX && opts.postFX.isActive() && blitQuad && blitMaterial) {
        // 1) composer 整链 → 它自己的 readBuffer（已 sRGB-encoded 的 float）
        ctx.render(dt);
        // 2) 把 readBuffer 的内容复制到 NoColorSpace 的 exportRTBlit
        //    （Blit shader 是 pass-through；不让 three.js 再加 sRGB 编码）
        blitMaterial.uniforms.tDiffuse.value =
          opts.postFX.getFinalOutputTexture();
        ctx.renderer.setRenderTarget(exportRTBlit);
        blitQuad.render(ctx.renderer);
        return exportRTBlit;
      } else {
        ctx.renderer.setRenderTarget(exportRTDirect);
        ctx.render(dt);
        return exportRTDirect;
      }
    };

    /**
     * 帧 Buffer 池：1080p RGBA = 8MB / 帧。
     * 之前每帧都 new Uint8Array(8MB) → 30fps = 240MB/s 的 GC 压力，老 GPU 上能让 V8 STW 几十 ms。
     * 用一个 LIFO 池循环复用，常态稳定在 4-8 个 buffer，告别周期性卡顿。
     *
     * 释放时机安全说明：
     *   - Fix A 之后 port.postMessage 是 structured clone（非 transfer），
     *     调用返回时数据已经被序列化进 Chromium IPC 队列了；
     *   - 所以 await transport.send 返回后立即 release，绝对安全。
     */
    const pool: Uint8Array[] = [];
    const acquireBuffer = (): Uint8Array =>
      pool.pop() ?? new Uint8Array(byteSize);
    const releaseBuffer = (buf: Uint8Array): void => {
      if (buf.byteLength === byteSize && pool.length < 16) {
        pool.push(buf);
      }
    };

    // 同步路径用的复用 buffer（PBO 失败降级 / WebGL1 fallback）
    let syncBuffer: Uint8Array | null = pbo ? null : new Uint8Array(byteSize);

    /**
     * 同步 readPixels 一帧并 send 到 ffmpeg。
     * 调用前必须已经通过 renderIntoExportRT(dt) 把帧画到 exportRT，且 exportRT 仍是当前绑定的 framebuffer。
     * 函数内部会在 readPixels 之后把 renderTarget 还原为 null。
     */
    const sendFrameSync = async (frameIdx: number): Promise<void> => {
      if (!syncBuffer) syncBuffer = new Uint8Array(byteSize);
      const glAny = ctx.renderer.getContext();
      glAny.readPixels(
        0,
        0,
        opts.width,
        opts.height,
        glAny.RGBA,
        glAny.UNSIGNED_BYTE,
        syncBuffer
      );
      ctx.renderer.setRenderTarget(null);
      const out = acquireBuffer();
      out.set(syncBuffer);
      await transport.send(frameIdx, out);
      releaseBuffer(out);
    };

    /**
     * PBO 失败时调用：把 PBO 拆掉、切到同步路径、并把"管道里还在飞的滞后帧"
     * 重渲染一次以同步方式补上，避免丢帧。
     *
     * @param failedStep 当前正在执行的 step（kickRead 或 readSlot 失败的那一步）
     * @returns 应当跳到的下一个 step（调用方继续 for 循环时使用）
     */
    const fallbackToSync = async (
      failedStep: number,
      reason: string
    ): Promise<number> => {
      console.warn(
        '[OfflineRenderer] PBO 异步路径失败，自动降级到同步 readPixels：',
        reason
      );
      const lostLatency = readBackLatency;
      pbo?.dispose();
      pbo = null;
      readBackLatency = 0;
      // 在管道里还没排空的滞后帧 [failedStep - lostLatency, failedStep) 已经丢失，
      // 需要重新渲染并同步发送。lostLatency 一般是 2。
      const reRenderFrom = Math.max(0, failedStep - lostLatency);
      for (let f = reRenderFrom; f < failedStep && f < totalFrames; f++) {
        if (this.cancelled) break;
        const t = opts.startSec + f / opts.fps;
        const features = timeline.at(t, t - 1 / opts.fps);
        preset.update(features, presetParams, 1 / opts.fps);
        ctx.frameFeatures = features;
        renderIntoExportRT(1 / opts.fps);
        await sendFrameSync(f);
      }
      // 当前 failedStep 的渲染已经在主循环里做过了，但 PBO kick/drain 失败
      // 所以重发一次它的 sync 版本（用 prevTime 当前位置）
      if (failedStep < totalFrames) {
        const t = opts.startSec + failedStep / opts.fps;
        const features = timeline.at(t, t - 1 / opts.fps);
        preset.update(features, presetParams, 1 / opts.fps);
        ctx.frameFeatures = features;
        renderIntoExportRT(1 / opts.fps);
        await sendFrameSync(failedStep);
      }
      return failedStep + 1;
    };

    const start = performance.now();
    let lastProgressAt = start;
    let prevTime = opts.startSec;
    /**
     * 进度回调的 watchdog：只要在主循环外（如 transport.send 因背压阻塞时）
     * 长时间没回调 onProgress，就会让 UI 显示「等 ffmpeg 落盘」提示。
     */
    let watchdog: ReturnType<typeof setInterval> | null = null;
    let lastSentFrame = -1;
    let lastSentAt = start;

    try {
      // watchdog：每秒探一次 transport.inFlight，发现"主循环长时间没推进"就 onProgress
      // 一个特殊 frame 记录（waitingForFfmpeg=true），让弹窗变成"等 ffmpeg 中..."
      watchdog = setInterval(() => {
        const idleMs = performance.now() - lastSentAt;
        if (idleMs > 2000 && lastSentFrame >= 0) {
          onProgress({
            frame: Math.min(totalFrames, lastSentFrame + 1),
            totalFrames,
            ratio: Math.min(1, (lastSentFrame + 1) / totalFrames),
            fps: 0,
            etaSec: 0,
            inFlight: transport.inFlight,
            waitingForFfmpeg: true,
          });
        }
      }, 1000);

      let step = 0;
      while (step < totalFrames + readBackLatency) {
        if (this.cancelled) break;

        // 1) 渲染当前帧 (step < totalFrames 时)
        if (step < totalFrames) {
          const t = opts.startSec + step / opts.fps;
          const features = timeline.at(t, prevTime);
          prevTime = t;

          preset.update(features, presetParams, 1 / opts.fps);
          ctx.frameFeatures = features;
          renderIntoExportRT(1 / opts.fps);

          if (pbo) {
            try {
              // exportRT 仍是当前绑定的 fb，PBO 从这里 readPixels
              pbo.kickRead(step % pbo.count, opts.width, opts.height);
              // PBO kickRead 完成后立刻解绑，让下一帧 ctx.render 之前能干净地重新绑定
              ctx.renderer.setRenderTarget(null);
            } catch (e) {
              ctx.renderer.setRenderTarget(null);
              if (
                e instanceof PBOContextLostError ||
                e instanceof PBOFenceFailedError
              ) {
                step = await fallbackToSync(step, (e as Error).message);
                continue;
              }
              throw e;
            }
          } else {
            // sendFrameSync 内部完成 readPixels 后会 setRenderTarget(null)
            await sendFrameSync(step);
          }
        }

        // 2) 排空滞后帧（仅 PBO 路径）
        if (pbo) {
          const drain = step - readBackLatency;
          if (drain >= 0 && drain < totalFrames) {
            const dst = acquireBuffer();
            try {
              await pbo.readSlot(drain % pbo.count, dst);
              await transport.send(drain, dst);
              releaseBuffer(dst);
            } catch (e) {
              releaseBuffer(dst); // 失败也要还回去，不然池泄漏
              if (
                e instanceof PBOContextLostError ||
                e instanceof PBOFenceFailedError
              ) {
                step = await fallbackToSync(drain, (e as Error).message);
                continue;
              }
              throw e;
            }
          }
        }

        const now = performance.now();
        const reportFrame = pbo ? step - readBackLatency : step;
        if (reportFrame >= 0) {
          lastSentFrame = reportFrame;
          lastSentAt = now;
        }
        if (
          (now - lastProgressAt >= 250 ||
            step === totalFrames + readBackLatency - 1) &&
          reportFrame >= 0
        ) {
          const elapsed = (now - start) / 1000;
          const renderFps = elapsed > 0 ? (reportFrame + 1) / elapsed : 0;
          const remain =
            (totalFrames - reportFrame - 1) / Math.max(0.5, renderFps);
          onProgress({
            frame: Math.min(totalFrames, reportFrame + 1),
            totalFrames,
            ratio: Math.min(1, (reportFrame + 1) / totalFrames),
            fps: renderFps,
            etaSec: Math.max(0, remain),
            inFlight: transport.inFlight,
            waitingForFfmpeg: false,
          });
          lastProgressAt = now;
          await new Promise<void>((r) => setTimeout(r, 0));
        }

        step++;
      }

      if (this.cancelled) {
        transport.dispose();
        await window.api.ffmpegCancel(session.sessionId);
        throw new Error('导出已取消');
      }

      // 等所有帧 ack 落盘后再 finish
      await transport.drain();

      const result = await window.api.ffmpegFinish(session.sessionId);
      transport.dispose();
      onProgress({
        frame: totalFrames,
        totalFrames,
        ratio: 1,
        fps: 0,
        etaSec: 0,
      });
      return result;
    } finally {
      if (watchdog) {
        clearInterval(watchdog);
        watchdog = null;
      }
      this.currentSessionId = null;
      try {
        pbo?.dispose();
      } catch {
        /* ignore */
      }
      // 方案 B：清理离屏 RT + blit quad，并把 composer 还原为 preview 模式
      try {
        ctx.renderer.setRenderTarget(null);
      } catch {
        /* ignore */
      }
      try {
        exportRTDirect.dispose();
      } catch {
        /* ignore */
      }
      try {
        exportRTBlit.dispose();
      } catch {
        /* ignore */
      }
      try {
        blitQuad?.dispose();
      } catch {
        /* ignore */
      }
      try {
        blitMaterial?.dispose();
      } catch {
        /* ignore */
      }
      if (opts.postFX && blitQuad) {
        try {
          opts.postFX.setRenderToScreen(composerWasRenderToScreen);
        } catch {
          /* ignore */
        }
      }
      ctx.renderer.setPixelRatio(prevPixelRatio);
      ctx.setSize(prevWidth, prevHeight, false);
      // 把 composer 的 pixelRatio 也还原回 preview 时的值，让预览继续保持原画质
      if (opts.postFX) {
        try {
          opts.postFX.setPixelRatio(prevComposerPixelRatio);
        } catch {
          /* ignore */
        }
      }
      ctx.setBackground('#' + prevClearColor.getHexString(), prevClearAlpha);
    }
  }
}
