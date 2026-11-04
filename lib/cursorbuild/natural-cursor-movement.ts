import { gsap } from "gsap";
import type { CursorPoint } from "./cursor-renderer.ts";

export interface NaturalMoveOptions {
  /** Duration in seconds for each segment. */
  duration?: number;
  /** Any GSAP easing string, for example "power3.inOut". */
  ease?: string;
  /** Curve height as a fraction of segment distance (0 = straight, 0.18 = subtle arc). */
  curvature?: number;
}

export interface NaturalMovementOptions extends NaturalMoveOptions {
  /** Optional pause between sequence steps, in seconds or a [minimum, maximum] range. */
  pauseBetween?: number | readonly [number, number];
}

export interface NaturalMovementStep extends NaturalMoveOptions {
  to: CursorPoint;
  duration?: number;
  ease?: string;
  curvature?: number;
  /** Pause after this step; overrides pauseBetween for this step. */
  pauseAfter?: number;
}

export interface NaturalCursorMovementAdapter {
  hasCursor(id: string): boolean;
  getPosition(id: string): CursorPoint | undefined;
  setPosition(id: string, point: CursorPoint): void;
  isReducedMotion(): boolean;
}

interface ResolvedOptions {
  duration: number;
  ease: string;
  curvature: number;
}

const DEFAULTS: ResolvedOptions = { duration: 0.72, ease: "power3.inOut", curvature: 0.18 };

/** Calculate the two control points for a deterministic cubic Bezier cursor arc. */
export function getNaturalControlPoints(
  from: CursorPoint,
  to: CursorPoint,
  curvature = DEFAULTS.curvature,
  cursorId = ""
): [CursorPoint, CursorPoint] {
  validatePoint(from, "from");
  validatePoint(to, "to");
  validateCurvature(curvature);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return [{ ...from }, { ...to }];
  const direction = (stableHash(cursorId) % 2 === 0 ? 1 : -1);
  const offset = distance * curvature * direction;
  const normalX = -dy / distance;
  const normalY = dx / distance;
  return [
    { x: from.x + dx / 3 + normalX * offset, y: from.y + dy / 3 + normalY * offset },
    { x: from.x + (2 * dx) / 3 + normalX * offset, y: from.y + (2 * dy) / 3 + normalY * offset }
  ];
}

function sampleBezier(from: CursorPoint, control1: CursorPoint, control2: CursorPoint, to: CursorPoint, progress: number): CursorPoint {
  const inverse = 1 - progress;
  const a = inverse * inverse * inverse;
  const b = 3 * inverse * inverse * progress;
  const c = 3 * inverse * progress * progress;
  const d = progress * progress * progress;
  return {
    x: a * from.x + b * control1.x + c * control2.x + d * to.x,
    y: a * from.y + b * control1.y + c * control2.y + d * to.y
  };
}

function validatePoint(point: CursorPoint, label: string): void {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new TypeError(`Cursor movement ${label} coordinates must be finite numbers.`);
  }
}
function validateDuration(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be finite and non-negative.`);
}
function validateCurvature(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError("curvature must be between 0 and 1.");
}
function stableHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index++) hash = (hash * 31 + value.charCodeAt(index)) | 0;
  return Math.abs(hash);
}

/**
 * Per-cursor natural motion controller. CursorRenderer owns its lifecycle and
 * supplies the adapter, so each identity has an independent GSAP timeline.
 */
export class NaturalCursorMovementEngine {
  private readonly active = new Map<string, gsap.core.Timeline>();
  private readonly destinations = new Map<string, CursorPoint>();
  private readonly defaults: ResolvedOptions;

  constructor(private readonly adapter: NaturalCursorMovementAdapter, options: NaturalMovementOptions = {}) {
    this.defaults = {
      duration: options.duration ?? DEFAULTS.duration,
      ease: options.ease ?? DEFAULTS.ease,
      curvature: options.curvature ?? DEFAULTS.curvature
    };
    validateDuration(this.defaults.duration, "duration");
    validateCurvature(this.defaults.curvature);
    this.defaultPause = options.pauseBetween;
    this.validatePause(this.defaultPause);
  }

  private readonly defaultPause?: number | readonly [number, number];

  /** Animate one identity along a curved, eased path. Returns its owned timeline. */
  moveTo(id: string, to: CursorPoint, options: NaturalMoveOptions = {}): gsap.core.Timeline | undefined {
    return this.playSequence(id, [{ to, ...options }]);
  }

  /** Move one identity through a sequence, optionally pausing between destinations. */
  playSequence(id: string, steps: NaturalMovementStep[], options: NaturalMovementOptions = {}): gsap.core.Timeline | undefined {
    if (!this.adapter.hasCursor(id)) throw new Error("Unknown rendered cursor: " + id);
    if (!Array.isArray(steps) || steps.length === 0) throw new Error("A natural movement sequence requires at least one step.");
    const resolved: ResolvedOptions = {
      duration: options.duration ?? this.defaults.duration,
      ease: options.ease ?? this.defaults.ease,
      curvature: options.curvature ?? this.defaults.curvature
    };
    validateDuration(resolved.duration, "duration");
    validateCurvature(resolved.curvature);
    const pauseBetween = options.pauseBetween ?? this.defaultPause;
    this.validatePause(pauseBetween);

    const start = this.adapter.getPosition(id);
    if (!start) throw new Error("Cursor has no starting position: " + id);
    let previous = { ...start };
    const validated = steps.map((step, index) => {
      validatePoint(step.to, `step ${index + 1}`);
      const duration = step.duration ?? resolved.duration;
      const ease = step.ease ?? resolved.ease;
      const curvature = step.curvature ?? resolved.curvature;
      validateDuration(duration, "step duration");
      validateCurvature(curvature);
      if (step.pauseAfter !== undefined) validateDuration(step.pauseAfter, "pauseAfter");
      const controls = getNaturalControlPoints(previous, step.to, curvature, id);
      const segment = { from: previous, to: { ...step.to }, controls, duration, ease, pauseAfter: step.pauseAfter };
      previous = { ...step.to };
      return segment;
    });

    this.cancel(id);
    if (this.adapter.isReducedMotion() || validated.every((step) => step.duration === 0)) {
      validated.forEach((step) => this.adapter.setPosition(id, step.to));
      return undefined;
    }

    const timeline = gsap.timeline();
    this.active.set(id, timeline);
    this.destinations.set(id, { ...validated[validated.length - 1].to });
    validated.forEach((step, index) => {
      const progress = { value: 0 };
      timeline.to(progress, {
        value: 1,
        duration: step.duration,
        ease: step.ease,
        onUpdate: () => this.adapter.setPosition(id, sampleBezier(step.from, step.controls[0], step.controls[1], step.to, progress.value)),
        onComplete: () => this.adapter.setPosition(id, step.to)
      });
      if (index < validated.length - 1) {
        const pause = step.pauseAfter ?? this.resolvePause(pauseBetween);
        if (pause > 0) timeline.to({}, { duration: pause });
      }
    });
    timeline.eventCallback("onComplete", () => {
      if (this.active.get(id) === timeline) {
        this.active.delete(id);
        this.destinations.delete(id);
      }
    });
    return timeline;
  }

  /** Cancel one cursor's active path without affecting any other cursor. */
  cancel(id: string): void {
    this.active.get(id)?.kill();
    this.active.delete(id);
    this.destinations.delete(id);
  }

  /** Finish active paths at their final destinations, used when reduced motion is enabled. */
  finishAll(): void {
    this.destinations.forEach((point, id) => this.adapter.setPosition(id, point));
    this.active.forEach((timeline) => timeline.kill());
    this.active.clear();
    this.destinations.clear();
  }

  destroy(): void {
    this.active.forEach((timeline) => timeline.kill());
    this.active.clear();
    this.destinations.clear();
  }

  private resolvePause(pause: number | readonly [number, number] | undefined): number {
    if (pause === undefined) return 0;
    if (typeof pause === "number") return pause;
    return pause[0] + Math.random() * (pause[1] - pause[0]);
  }

  private validatePause(pause: number | readonly [number, number] | undefined): void {
    if (pause === undefined) return;
    if (typeof pause === "number") {
      validateDuration(pause, "pauseBetween");
      return;
    }
    if (pause.length !== 2 || !Number.isFinite(pause[0]) || !Number.isFinite(pause[1]) || pause[0] < 0 || pause[1] < pause[0]) {
      throw new RangeError("pauseBetween range must contain non-negative [minimum, maximum] values in ascending order.");
    }
  }
}
