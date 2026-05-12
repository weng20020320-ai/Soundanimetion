/**
 * 基于 WebGL2 PBO（Pixel Buffer Object）+ fenceSync 的异步像素回读环。
 *
 * 关键路径：
 *   render → bindBuffer(PBO[slot]) → readPixels(0) → bindBuffer(null) → fenceSync
 *   N 帧之后再 getBufferSubData(slot)，使 GPU→CPU 传输与 GPU 渲染并行。
 *
 * 落到 WebGL1（无 PBO）时返回 null，调用方走同步 fallback。
 *
 * 错误分类：
 *  - PBOContextLostError：WebGL 上下文丢失（驱动重置 / GPU 进程崩溃 / VRAM OOM）
 *  - PBOFenceFailedError：clientWaitSync 返回 WAIT_FAILED（同样是上下文层面的失败）
 *  调用方应当捕获这两种错误后**降级到同步 readPixels**，而不是中断整个导出。
 */
export class PBOContextLostError extends Error {
  constructor() {
    super('WebGL 上下文已丢失');
    this.name = 'PBOContextLostError';
  }
}

export class PBOFenceFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PBOFenceFailedError';
  }
}

export class PBOReader {
  private gl: WebGL2RenderingContext;
  private pbos: WebGLBuffer[] = [];
  private fences: Array<WebGLSync | null>;
  private byteSize: number;
  private slotCount: number;

  constructor(
    gl: WebGL2RenderingContext,
    width: number,
    height: number,
    slotCount = 3
  ) {
    this.gl = gl;
    this.byteSize = width * height * 4;
    this.slotCount = slotCount;
    this.fences = new Array(slotCount).fill(null);

    for (let i = 0; i < slotCount; i++) {
      const buf = gl.createBuffer();
      if (!buf) throw new Error('createBuffer 失败');
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buf);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, this.byteSize, gl.STREAM_READ);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      this.pbos.push(buf);
    }
  }

  static tryCreate(
    gl: WebGLRenderingContext | WebGL2RenderingContext,
    width: number,
    height: number,
    slotCount = 3
  ): PBOReader | null {
    if (typeof WebGL2RenderingContext === 'undefined') return null;
    if (!(gl instanceof WebGL2RenderingContext)) return null;
    try {
      return new PBOReader(gl, width, height, slotCount);
    } catch (e) {
      console.warn('[PBOReader] 创建失败：', e);
      return null;
    }
  }

  get count(): number {
    return this.slotCount;
  }

  /**
   * 在当前默认 framebuffer 上发起到 PBO[slot] 的异步 readPixels。
   * 注意：必须在 renderer.render(...) 之后立即调用。
   */
  kickRead(slot: number, width: number, height: number): void {
    const gl = this.gl;
    if (gl.isContextLost()) throw new PBOContextLostError();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbos[slot]);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    if (this.fences[slot]) gl.deleteSync(this.fences[slot]);
    const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (!fence) {
      throw new PBOFenceFailedError(
        `fenceSync 返回 null（可能上下文已丢失）`
      );
    }
    this.fences[slot] = fence;
    gl.flush();
  }

  /**
   * 读取 PBO[slot] 中的像素到 dst。dst.byteLength 必须等于构造时的 size。
   * 若 fence 尚未完成，会以非阻塞方式 yield 等待。
   */
  async readSlot(slot: number, dst: Uint8Array): Promise<void> {
    if (dst.byteLength !== this.byteSize) {
      throw new Error(
        `PBOReader: dst 大小不匹配 expected=${this.byteSize} actual=${dst.byteLength}`
      );
    }
    const gl = this.gl;
    if (gl.isContextLost()) throw new PBOContextLostError();
    const fence = this.fences[slot];
    if (fence) {
      await this.waitFence(fence);
      gl.deleteSync(fence);
      this.fences[slot] = null;
    }
    if (gl.isContextLost()) throw new PBOContextLostError();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbos[slot]);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, dst);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  }

  private async waitFence(fence: WebGLSync): Promise<void> {
    const gl = this.gl;
    const start = performance.now();
    let attempts = 0;

    /**
     * 重要历史教训：Chromium 把 MAX_CLIENT_WAIT_TIMEOUT_WEBGL 硬编码成 0
     * （防 renderer 线程被 GPU 阻塞 jank）。任何非 0 的 timeout 都会立刻抛
     * INVALID_OPERATION → 返回 WAIT_FAILED → 触发我们的"GPU 上下文丢失"伪降级。
     *
     * 唯一正确的写法：永远 timeout=0，纯 polling。
     * 节奏：先紧凑 (setTimeout 0) 抢回早完成的帧；持续 100ms 没好就放慢
     *      （setTimeout 1 / requestAnimationFrame）让 CPU 有空写盘 / 处理 IPC。
     */
    while (true) {
      if (gl.isContextLost()) throw new PBOContextLostError();
      const status = gl.clientWaitSync(fence, 0, 0);
      if (
        status === gl.ALREADY_SIGNALED ||
        status === gl.CONDITION_SATISFIED
      ) {
        return;
      }
      if (status === gl.WAIT_FAILED) {
        // 真正的 WAIT_FAILED（不是 timeout 问题）—— 上下文确实出问题
        throw new PBOFenceFailedError('clientWaitSync 轮询返回 WAIT_FAILED');
      }
      // status === TIMEOUT_EXPIRED / SYNC_FLUSH_COMMANDS_BIT 之类 → 继续等

      attempts++;
      const elapsed = performance.now() - start;

      // 第 1 次 poll 失败时主动 flush 一次，让 GPU 知道我们在等
      if (attempts === 1) {
        gl.flush();
      }

      // 超过 5 秒还没完成，认定 GPU 真的出问题了，让上层降级
      if (elapsed > 5000) {
        throw new PBOFenceFailedError(
          `clientWaitSync 5s 仍未完成 (attempts=${attempts}) —— GPU 真的卡了`
        );
      }

      // 节奏控制：前 100ms 紧凑轮询（setTimeout 0），之后放慢到 1ms / 帧
      const delay = elapsed < 100 ? 0 : 1;
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  dispose(): void {
    const gl = this.gl;
    for (const f of this.fences) if (f) gl.deleteSync(f);
    this.fences.fill(null);
    for (const b of this.pbos) gl.deleteBuffer(b);
    this.pbos = [];
  }
}
