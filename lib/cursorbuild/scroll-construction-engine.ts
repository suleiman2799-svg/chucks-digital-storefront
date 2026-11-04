import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { ScrollTrigger as ScrollTriggerInstance } from "gsap/ScrollTrigger";

export interface ScrollConstructionSceneOptions {
  /** Element or selector whose scroll position controls this scene. */
  trigger: Element | string;
  /** ScrollTrigger start expression. Defaults to "top 80%". */
  start?: string | number;
  /** ScrollTrigger end expression. Defaults to "bottom 20%". */
  end?: string | number;
  /** When false, progress never decreases while scrolling backwards. Defaults to true. */
  reverse?: boolean;
  /** Receives the normalized scene progress (0–1). */
  onProgress?: (progress: number) => void;
  /** Complete the scene immediately when reduced motion is preferred. Defaults to true. */
  respectReducedMotion?: boolean;
}

export type ScrollConstructionBuilder = (timeline: gsap.core.Timeline) => void;

/** A timeline whose progress is driven by the scroll position of one section. */
export class ScrollConstructionScene {
  private currentProgress = 0;
  private pausedState = false;
  private destroyed = false;
  private readonly triggerInstance: ScrollTriggerInstance;
  private readonly allowReverse: boolean;
  private readonly onProgress?: (progress: number) => void;
  private readonly respectReducedMotion: boolean;
  private readonly mediaQuery?: MediaQueryList;
  private reducedMotion = false;
  private readonly handleMotionChange = (event: MediaQueryListEvent): void => {
    this.reducedMotion = this.respectReducedMotion && event.matches;
    if (this.reducedMotion) {
      this.applyProgress(1);
    } else if (!this.pausedState && !this.destroyed) {
      const next = this.allowReverse ? this.triggerInstance.progress : Math.max(this.currentProgress, this.triggerInstance.progress);
      this.applyProgress(next);
    }
  };

  constructor(
    readonly id: string,
    private readonly timeline: gsap.core.Timeline,
    options: ScrollConstructionSceneOptions,
    private readonly onDestroy?: () => void
  ) {
    this.allowReverse = options.reverse ?? true;
    this.onProgress = options.onProgress;
    this.respectReducedMotion = options.respectReducedMotion ?? true;
    this.mediaQuery = this.respectReducedMotion && typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : undefined;
    this.reducedMotion = !!this.mediaQuery?.matches;
    this.triggerInstance = ScrollTrigger.create({
      trigger: options.trigger,
      start: options.start ?? "top 80%",
      end: options.end ?? "bottom 20%",
      onUpdate: (self) => {
        if (this.pausedState || this.destroyed || this.reducedMotion) return;
        const next = this.allowReverse ? self.progress : Math.max(this.currentProgress, self.progress);
        this.applyProgress(next);
      }
    });
    this.mediaQuery?.addEventListener?.("change", this.handleMotionChange);
    this.applyProgress(this.reducedMotion ? 1 : this.triggerInstance.progress);
  }

  /** Current normalized scroll progress, from 0 to 1. */
  get progress(): number { return this.currentProgress; }

  /** Whether scroll updates are currently paused. */
  get isPaused(): boolean { return this.pausedState; }

  /** The underlying GSAP timeline, for advanced inspection and composition. */
  get animation(): gsap.core.Timeline { return this.timeline; }

  pause(): void {
    if (this.destroyed || this.pausedState) return;
    this.pausedState = true;
    this.timeline.pause();
  }

  /** Resume scroll synchronization at the trigger's current position. */
  resume(): void {
    if (this.destroyed || !this.pausedState) return;
    this.pausedState = false;
    const next = this.reducedMotion ? 1 : this.allowReverse
      ? this.triggerInstance.progress
      : Math.max(this.currentProgress, this.triggerInstance.progress);
    this.applyProgress(next);
  }

  refresh(): void {
    if (!this.destroyed) this.triggerInstance.refresh();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.triggerInstance.kill();
    this.mediaQuery?.removeEventListener?.("change", this.handleMotionChange);
    this.timeline.kill();
    this.onDestroy?.();
  }

  private applyProgress(progress: number): void {
    const normalized = Math.max(0, Math.min(1, progress));
    this.currentProgress = normalized;
    this.timeline.progress(normalized);
    this.onProgress?.(normalized);
  }
}

/**
 * Creates independently managed scroll-driven construction scenes.
 * Scene timelines are paused and seeked from ScrollTrigger progress, so
 * multiple scenes can run independently without owning cursor simulation.
 */
export class ScrollConstructionEngine {
  private readonly scenes = new Map<string, ScrollConstructionScene>();
  private destroyed = false;

  constructor() {
    gsap.registerPlugin(ScrollTrigger);
  }

  createScene(
    id: string,
    options: ScrollConstructionSceneOptions,
    build: ScrollConstructionBuilder
  ): ScrollConstructionScene {
    if (this.destroyed) throw new Error("ScrollConstructionEngine has been destroyed.");
    if (!id.trim()) throw new Error("A construction scene id is required.");
    if (this.scenes.has(id)) throw new Error("Construction scene already exists: " + id);
    if (!options || !options.trigger || (typeof options.trigger === "string" && !options.trigger.trim())) {
      throw new TypeError("A scene trigger element or selector is required.");
    }
    if (typeof build !== "function") throw new TypeError("A construction scene builder is required.");

    const timeline = gsap.timeline({ paused: true });
    try {
      build(timeline);
      timeline.progress(0);
      const scene = new ScrollConstructionScene(id, timeline, options, () => {
        if (this.scenes.get(id) === scene) this.scenes.delete(id);
      });
      this.scenes.set(id, scene);
      return scene;
    } catch (error) {
      timeline.kill();
      throw error;
    }
  }

  getScene(id: string): ScrollConstructionScene | undefined {
    return this.scenes.get(id);
  }

  destroyScene(id: string): void {
    this.scenes.get(id)?.destroy();
    this.scenes.delete(id);
  }

  refresh(): void {
    if (!this.destroyed) ScrollTrigger.refresh();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scenes.forEach((scene) => scene.destroy());
    this.scenes.clear();
  }
}
