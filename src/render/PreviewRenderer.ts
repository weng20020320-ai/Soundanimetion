import type { ThreeContext } from './ThreeContext';
import type { VisualPreset } from '../visuals/VisualPreset';
import type { RealtimeFeatureExtractor } from '../audio/RealtimeFeatureExtractor';

/**
 * 预览渲染循环：rAF 拉特征 → 预设 update → renderer.render
 */
export class PreviewRenderer {
  private ctx: ThreeContext;
  private extractor: RealtimeFeatureExtractor;
  private rafId = 0;
  private running = false;
  private lastT = 0;

  preset: VisualPreset | null = null;
  presetParams: Record<string, unknown> = {};

  constructor(ctx: ThreeContext, extractor: RealtimeFeatureExtractor) {
    this.ctx = ctx;
    this.extractor = extractor;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastT = performance.now();
    const loop = () => {
      if (!this.running) return;
      const now = performance.now();
      const dt = Math.min(0.1, (now - this.lastT) / 1000);
      this.lastT = now;

      const features = this.extractor.read();
      if (this.preset) this.preset.update(features, this.presetParams, dt);
      this.ctx.frameFeatures = features;
      this.ctx.render(dt);

      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }
}
