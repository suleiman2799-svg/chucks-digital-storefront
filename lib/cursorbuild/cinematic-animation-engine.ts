import { gsap } from "gsap";

export type CinematicTarget = string | Element | readonly Element[];
export type RevealDirection = "left" | "right" | "top" | "bottom";
export interface CinematicAnimationOptions { duration?: number; ease?: string; delay?: number; stagger?: number; }
export interface CinematicAnimationEngineOptions { respectReducedMotion?: boolean; defaults?: CinematicAnimationOptions; }
export interface CinematicRevealOptions extends CinematicAnimationOptions { direction?: RevealDirection; }
export interface CinematicEntranceOptions extends CinematicAnimationOptions { from?: gsap.TweenVars; to?: gsap.TweenVars; }
export interface CinematicTransitionOptions extends CinematicAnimationOptions { from: gsap.TweenVars; to: gsap.TweenVars; }
export interface CinematicStaggerOptions extends CinematicTransitionOptions {}

export class CinematicAnimationEngine {
  private readonly active = new Map<gsap.core.Timeline, { targets: Element[]; finalVars: gsap.TweenVars }>();
  private readonly defaults: Required<CinematicAnimationOptions>;
  private readonly respectReducedMotion: boolean;
  private readonly mediaQuery?: MediaQueryList;
  private destroyed = false;

  constructor(options: CinematicAnimationEngineOptions = {}) {
    this.respectReducedMotion = options.respectReducedMotion ?? true;
    this.defaults = { duration: options.defaults?.duration ?? 0.8, ease: options.defaults?.ease ?? "power3.out", delay: options.defaults?.delay ?? 0, stagger: options.defaults?.stagger ?? 0 };
    this.validateTiming(this.defaults);
    this.mediaQuery = typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : undefined;
    this.mediaQuery?.addEventListener?.("change", this.handleMotionChange);
  }

  revealText(target: CinematicTarget, options: CinematicRevealOptions = {}) {
    const direction = options.direction ?? "left";
    return this.transition(target, { from: { clipPath: this.hiddenClip(direction), opacity: 0 }, to: { clipPath: "inset(0 0 0 0)", opacity: 1 }, ...options });
  }
  revealImage(target: CinematicTarget, options: CinematicRevealOptions = {}) {
    const direction = options.direction ?? "left";
    return this.transition(target, { from: { clipPath: this.hiddenClip(direction), scale: 1.08, opacity: 0, transformOrigin: "center center" }, to: { clipPath: "inset(0 0 0 0)", scale: 1, opacity: 1 }, ...options });
  }
  enterSection(target: CinematicTarget, options: CinematicEntranceOptions = {}) {
    return this.transition(target, { ...options, from: { y: 36, opacity: 0, ...(options.from ?? {}) }, to: { y: 0, opacity: 1, ...(options.to ?? {}) } });
  }
  assemble(target: CinematicTarget, options: CinematicEntranceOptions = {}) {
    return this.transition(target, { ...options, from: { opacity: 0, y: 24, scale: 0.94, ...(options.from ?? {}) }, to: { opacity: 1, y: 0, scale: 1, ...(options.to ?? {}) } });
  }
  stagger(target: CinematicTarget, options: CinematicStaggerOptions) { return this.transition(target, options); }
  transition(target: CinematicTarget, options: CinematicTransitionOptions) {
    this.assertActive();
    const targets = this.resolveTargets(target);
    if (!options?.from || !options?.to || typeof options.from !== "object" || typeof options.to !== "object") throw new TypeError("A transition requires from and to animation values.");
    const timing = this.resolveTiming(options);
    if (this.isReducedMotion()) { gsap.set(targets, options.to); return undefined; }
    const timeline = gsap.timeline();
    this.active.set(timeline, { targets, finalVars: options.to });
    const cleanup = () => this.active.delete(timeline);
    timeline.eventCallback("onComplete", cleanup);
    timeline.eventCallback("onReverseComplete", cleanup);
    timeline.eventCallback("onInterrupt", cleanup);
    timeline.fromTo(targets, options.from, { ...options.to, ...timing, immediateRender: false });
    return timeline;
  }
  killAll() { this.active.forEach((_record, timeline) => timeline.kill()); this.active.clear(); }
  destroy() { if (this.destroyed) return; this.destroyed = true; this.mediaQuery?.removeEventListener?.("change", this.handleMotionChange); this.killAll(); }
  private resolveTargets(target: CinematicTarget): Element[] {
    if (typeof target === "string") {
      if (typeof document === "undefined") throw new Error("Selector targets require a browser document.");
      let matches: NodeListOf<Element>;
      try { matches = document.querySelectorAll(target); } catch { throw new TypeError("Cinematic target must be a valid CSS selector."); }
      if (!matches.length) throw new Error("Cinematic selector did not match any elements: " + target);
      return Array.from(matches);
    }
    const targets = Array.isArray(target) ? [...target] : [target as Element];
    if (!targets.length || targets.some(item => !item || item.nodeType !== 1)) throw new TypeError("Cinematic targets must be an Element or non-empty array of Elements.");
    return targets;
  }
  private resolveTiming(options: CinematicAnimationOptions): Required<CinematicAnimationOptions> {
    const timing = { duration: options.duration ?? this.defaults.duration, ease: options.ease ?? this.defaults.ease, delay: options.delay ?? this.defaults.delay, stagger: options.stagger ?? this.defaults.stagger };
    this.validateTiming(timing); return timing;
  }
  private validateTiming(timing: Required<CinematicAnimationOptions>) {
    for (const key of ["duration", "delay", "stagger"] as const) if (!Number.isFinite(timing[key]) || timing[key] < 0) throw new RangeError(key + " must be finite and non-negative.");
    if (!timing.ease.trim()) throw new TypeError("ease must be a non-empty string.");
  }
  private hiddenClip(direction: RevealDirection) {
    switch (direction) { case "right": return "inset(0 0 0 100%)"; case "top": return "inset(100% 0 0 0)"; case "bottom": return "inset(0 0 100% 0)"; default: return "inset(0 100% 0 0)"; }
  }
  private isReducedMotion() { return this.respectReducedMotion && !!this.mediaQuery?.matches; }
  private handleMotionChange = (event: MediaQueryListEvent) => {
    if (!this.respectReducedMotion || !event.matches) return;
    this.active.forEach((record, timeline) => { if (record.targets.length) gsap.set(record.targets, record.finalVars); timeline.kill(); });
    this.active.clear();
  };
  private assertActive() { if (this.destroyed) throw new Error("CinematicAnimationEngine has been destroyed."); }
}
