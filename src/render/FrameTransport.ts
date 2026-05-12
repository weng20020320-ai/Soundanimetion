/**
 * 帧传输：Renderer → Main 进程的零拷贝管道（基于 MessagePort + transferList）
 *
 * 主要职责：
 * 1) 把 GPU readback 的 Uint8Array 通过 transferList 移交给主进程；
 * 2) 用 ack 计数实现「至多 N 帧在途」的背压，避免内存堆积。
 */
export class FrameTransport {
  private pending = 0;
  private waiters: Array<() => void> = [];
  private unsubAck: () => void;
  private unsubError: () => void;
  private errorMessage: string | null = null;
  private cancelled = false;
  /** 被背压阻塞时的告警计数（节流避免 console 洪水）。 */
  private lastBackpressureWarnAt = 0;

  /** 当 send() 因背压等待超过这个秒数时，触发一次 console.warn。 */
  static readonly BACKPRESSURE_WARN_SEC = 5;

  constructor(
    private readonly sessionId: string,
    /**
     * 同时在途的最大帧数。值越大越能吸收 ffmpeg 端的抖动（首帧编码慢、关键帧抖动等），
     * 但会让取消/错误的反应更慢，并占用更多 Buffer 内存。
     * 1080p RGBA = 8MB/帧，maxInFlight=8 ≈ 64MB 最大占用。
     */
    private readonly maxInFlight: number = 8
  ) {
    this.unsubAck = window.api.onFfmpegFrameWritten(sessionId, () => {
      this.pending = Math.max(0, this.pending - 1);
      const w = this.waiters.shift();
      if (w) w();
    });
    this.unsubError = window.api.onFfmpegSessionError(sessionId, (msg) => {
      this.errorMessage = msg;
      // 唤醒所有等待者
      const waiters = this.waiters.splice(0);
      for (const w of waiters) w();
    });
  }

  /** 当前在途帧数（导出 UI 用来显示「等 ffmpeg 落盘」时的样子）。 */
  get inFlight(): number {
    return this.pending;
  }

  /**
   * 发送一帧（pixels.buffer 会被 transfer，发送后不可再访问）。
   * 当在途 ≥ maxInFlight 时阻塞 await ack。
   */
  async send(frameIndex: number, pixels: Uint8Array): Promise<void> {
    if (this.cancelled) return;
    if (this.pending >= this.maxInFlight) {
      const startWait = performance.now();
      while (this.pending >= this.maxInFlight) {
        if (this.errorMessage) throw new Error(this.errorMessage);
        if (this.cancelled) return;
        await new Promise<void>((r) => this.waiters.push(r));
        // 长时间被背压挡住 → 几乎一定是 ffmpeg 端卡住（编码慢 / 写盘慢 / 首帧 init）
        const waited = (performance.now() - startWait) / 1000;
        if (
          waited > FrameTransport.BACKPRESSURE_WARN_SEC &&
          performance.now() - this.lastBackpressureWarnAt > 5000
        ) {
          this.lastBackpressureWarnAt = performance.now();
          console.warn(
            `[FrameTransport] 背压等待 ${waited.toFixed(1)}s 仍未收到 ack | ` +
              `frame=${frameIndex} pending=${this.pending}/${this.maxInFlight} session=${this.sessionId}` +
              ` | 通常是 ffmpeg 编码器 init 慢或写盘慢，请观察上方 [ffmpeg] 日志`
          );
        }
      }
    }
    if (this.errorMessage) throw new Error(this.errorMessage);
    if (this.cancelled) return;
    this.pending += 1;
    window.api.ffmpegWriteFrame(this.sessionId, frameIndex, pixels);
  }

  /** 等待所有在途帧都被 ack（用于 ffmpegFinish 之前确认全部写入）。 */
  async drain(timeoutMs = 60_000): Promise<void> {
    const deadline = performance.now() + timeoutMs;
    while (this.pending > 0) {
      if (this.errorMessage) throw new Error(this.errorMessage);
      if (this.cancelled) return;
      if (performance.now() > deadline) {
        throw new Error('帧背压排空超时');
      }
      await new Promise<void>((r) => this.waiters.push(r));
    }
  }

  cancel(): void {
    this.cancelled = true;
    const waiters = this.waiters.splice(0);
    for (const w of waiters) w();
  }

  dispose(): void {
    this.cancel();
    try {
      this.unsubAck();
    } catch {
      /* ignore */
    }
    try {
      this.unsubError();
    } catch {
      /* ignore */
    }
  }
}
