import { gsap } from "gsap";
import type { CursorManager } from "./cursor-manager";
import type { CursorIdentity } from "../types";
import { NaturalCursorMovementEngine } from "./natural-cursor-movement";
import type { NaturalMoveOptions, NaturalMovementOptions, NaturalMovementStep } from "./natural-cursor-movement";
import { getNaturalControlPoints } from "./natural-cursor-movement";

export interface CursorPoint { x: number; y: number; }
export type CursorClickStyle = "ripple" | "press" | "ripple-press";
export interface CursorClickFeedbackOptions {
  /** Total press/release animation duration, in seconds. */
  duration?: number;
  /** Maximum ripple diameter relative to its resting size. */
  rippleSize?: number;
  /** Ripple opacity multiplier from 0 (invisible) to 1 (full strength). */
  intensity?: number;
  /** Render only the ripple, only the button press, or both. */
  style?: CursorClickStyle;
}
export type DragTarget = string | HTMLElement;
export type ResizeTarget = string | HTMLElement;
export type ResizeHandle = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "top" | "right" | "bottom" | "left";
export interface CursorResizeOptions {
  target: ResizeTarget;
  to: { width: number; height: number };
  duration?: number;
  curvature?: number;
  handle?: ResizeHandle;
}
export type TextInsertionTarget = string | HTMLElement;
export type TextInsertionMode = "append" | "replace";
export interface CursorTextInsertionOptions {
  target: TextInsertionTarget;
  text: string;
  duration?: number;
  characterIntervalMs?: number;
  initialDelay?: number;
  mode?: TextInsertionMode;
  curvature?: number;
}
export interface CursorDragOptions {
  /** CSS selector or an element contained by the mounted container. */
  target: DragTarget;
  /** Destination top-left coordinate, in container-relative CSS pixels. */
  to: CursorPoint;
  /** Total approach + grab + drag duration, in seconds. */
  duration?: number;
  /** Curvature of the approach and drag paths (0 = straight, 1 = strong arc). */
  curvature?: number;
  /** Cursor pointer compression while the element is grabbed (0–1). */
  grabScale?: number;
}
export interface CursorRendererOptions {
  duration?: number;
  ease?: string;
  zIndex?: number;
  maxVisible?: number;
  tabletMaxVisible?: number;
  mobileMaxVisible?: number;
  /** Maximum visible cursors when a coarse/touch pointer is available. */
  touchMaxVisible?: number;
  respectReducedMotion?: boolean;
  /** Allow resize simulations to target live page elements outside the cursor overlay container. */
  allowExternalResizeTargets?: boolean;
  initialPositions?: Record<string, CursorPoint>;
  naturalMovement?: NaturalMovementOptions;
  clickFeedback?: CursorClickFeedbackOptions;
}
interface CursorNode { element: HTMLDivElement; label: HTMLSpanElement; color: string; name: string; }
interface TextInsertionRecord {
  element: HTMLElement;
  timeline: gsap.core.Timeline;
  caret: HTMLSpanElement;
  originalValue?: string;
  originalChildren?: DocumentFragment;
  textNode?: Text;
  text: string;
  baseText: string;
  caretColor: string;
  clickTimeline?: gsap.core.Timeline;
}
interface ResizeRecord {
  element: HTMLElement;
  timeline: gsap.core.Timeline;
  frame: HTMLDivElement;
  originalWidth: string;
  originalHeight: string;
  originalTranslate: string;
  cssTargetWidth: number;
  cssTargetHeight: number;
  cssTargetTranslate: string;
  handle: ResizeHandle;
  clickTimeline?: gsap.core.Timeline;
}
interface DragRecord {
  element: HTMLElement;
  startElement: CursorPoint;
  timeline: gsap.core.Timeline;
  originalTranslate: string;
  baseTranslateX: string;
  baseTranslateY: string;
  cursorEnd: CursorPoint;
  destination: CursorPoint;
  grabScale: number;
}

const CLICK_DEFAULTS: Required<CursorClickFeedbackOptions> = {
  duration: 0.32, rippleSize: 2.15, intensity: 0.72, style: "ripple-press"
};

const RESIZE_HANDLES: ResizeHandle[] = ["top-left", "top", "top-right", "right", "bottom-right", "bottom", "bottom-left", "left"];
function sampleDragBezier(from: CursorPoint, c1: CursorPoint, c2: CursorPoint, to: CursorPoint, t: number): CursorPoint {
  const u = 1 - t;
  return {
    x: u * u * u * from.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * to.x,
    y: u * u * u * from.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * to.y
  };
}

/** Renders cursor identities into a non-interactive overlay. Coordinates are container-relative CSS pixels. */
export class CursorRenderer {
  private readonly overlay: HTMLDivElement;
  readonly naturalMovement: NaturalCursorMovementEngine;
  private readonly nodes = new Map<string, CursorNode>();
  private readonly positions = new Map<string, CursorPoint>();
  private readonly tweens = new Map<string, gsap.core.Tween>();
  private readonly clickTimelines = new Map<string, gsap.core.Timeline>();
  private readonly dragTimelines = new Map<string, gsap.core.Timeline>();
  private readonly activeDrags = new Map<string, DragRecord>();
  private readonly dragLocks = new Map<HTMLElement, string>();
  private readonly activeTextInsertions = new Map<string, TextInsertionRecord>();
  private readonly textLocks = new Map<HTMLElement, string>();
  private readonly activeResizes = new Map<string, ResizeRecord>();
  private readonly resizeLocks = new Map<HTMLElement, string>();
  private readonly mutationObserver: MutationObserver;
  private readonly unsubscribe: () => void;
  private readonly options: Required<Omit<CursorRendererOptions, "initialPositions" | "naturalMovement" | "clickFeedback">>;
  private readonly initialPositions: Record<string, CursorPoint>;
  private readonly allowExternalResizeTargets: boolean;
  private readonly clickOptions: Required<CursorClickFeedbackOptions>;
  private readonly originalPosition: string;
  private readonly changedContainerPosition: boolean;
  private reducedMotion: boolean;
  private mediaQuery?: MediaQueryList;
  private pointerQuery?: MediaQueryList;
  private readonly visualViewport?: VisualViewport;
  private visibilityFrame?: number;
  private destroyed = false;

  constructor(private readonly manager: CursorManager, private readonly container: HTMLElement, options: CursorRendererOptions = {}) {
    if (typeof window === "undefined" || typeof document === "undefined") throw new Error("CursorRenderer requires a browser DOM.");
    this.options = {
      duration: options.duration ?? 0.72, ease: options.ease ?? "power3.out", zIndex: options.zIndex ?? 50,
      maxVisible: options.maxVisible ?? 8, tabletMaxVisible: options.tabletMaxVisible ?? 3,
      mobileMaxVisible: options.mobileMaxVisible ?? 2, touchMaxVisible: options.touchMaxVisible ?? 2,
      respectReducedMotion: options.respectReducedMotion ?? true
    };
    if (!Number.isFinite(this.options.duration) || this.options.duration < 0) throw new RangeError("duration must be finite and non-negative.");
    for (const limit of [this.options.maxVisible, this.options.tabletMaxVisible, this.options.mobileMaxVisible, this.options.touchMaxVisible]) {
      if (!Number.isInteger(limit) || limit < 0) throw new RangeError("Visible cursor limits must be non-negative integers.");
    }
    this.clickOptions = { ...CLICK_DEFAULTS, ...options.clickFeedback };
    this.validateClickOptions(this.clickOptions);
    this.initialPositions = options.initialPositions ?? {};
    this.allowExternalResizeTargets = options.allowExternalResizeTargets ?? false;
    this.mediaQuery = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : undefined;
    this.pointerQuery = typeof window.matchMedia === "function" ? window.matchMedia("(pointer: coarse)") : undefined;
    this.visualViewport = window.visualViewport ?? undefined;
    this.reducedMotion = this.options.respectReducedMotion && !!this.mediaQuery?.matches;

    this.originalPosition = container.style.position;
    const computedPosition = window.getComputedStyle(container).position;
    this.changedContainerPosition = !computedPosition || computedPosition === "static";
    if (this.changedContainerPosition) container.style.position = "relative";

    this.overlay = document.createElement("div");
    this.overlay.className = "cursorbuild-overlay";
    this.overlay.setAttribute("aria-hidden", "true");
    Object.assign(this.overlay.style, {
      position: "absolute", inset: "0", width: "100%", height: "100%", overflow: "visible",
      pointerEvents: "none", zIndex: String(this.options.zIndex), contain: "layout style", isolation: "isolate"
    });
    container.appendChild(this.overlay);

    this.naturalMovement = new NaturalCursorMovementEngine({
      hasCursor: (id) => this.nodes.has(id), getPosition: (id) => this.getPosition(id),
      setPosition: (id, point) => this.setNaturalPosition(id, point), isReducedMotion: () => this.reducedMotion
    }, { duration: this.options.duration, ease: this.options.ease, ...options.naturalMovement });

    this.unsubscribe = manager.subscribe(() => this.sync());
    this.mutationObserver = new MutationObserver(() => { this.cancelRemovedDrags(); this.cancelRemovedTextInsertions(); this.cancelRemovedResizes(); });
    this.mutationObserver.observe(container, { childList: true, subtree: true });
    this.mediaQuery?.addEventListener?.("change", this.handleMotionChange);
    this.pointerQuery?.addEventListener?.("change", this.handlePointerChange);
    window.addEventListener("resize", this.handleResize, { passive: true });
    window.addEventListener("orientationchange", this.handleResize, { passive: true });
    this.visualViewport?.addEventListener("resize", this.handleResize, { passive: true });
    this.sync();
  }

  moveTo(id: string, point: CursorPoint, duration = this.options.duration): void {
    this.assertActive();
    if (!this.nodes.has(id)) throw new Error("Unknown rendered cursor: " + id);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new TypeError("Cursor coordinates must be finite numbers.");
    if (!Number.isFinite(duration) || duration < 0) throw new RangeError("Movement duration must be finite and non-negative.");
    this.stopTextInsertion(id);
    this.stopDrag(id);
    this.stopResize(id);
    this.naturalMovement.cancel(id);
    this.positions.set(id, { ...point });
    const node = this.nodes.get(id)!.element;
    this.tweens.get(id)?.kill();
    if (this.reducedMotion || duration <= 0) { gsap.set(node, { x: point.x, y: point.y }); return; }
    const tween = gsap.to(node, { x: point.x, y: point.y, duration, ease: this.options.ease, overwrite: "auto" });
    this.tweens.set(id, tween);
  }

  moveNaturally(id: string, point: CursorPoint, options: NaturalMoveOptions = {}): gsap.core.Timeline | undefined {
    this.assertActive(); this.stopTextInsertion(id); this.stopDrag(id); this.stopResize(id); this.cancelRendererTween(id); return this.naturalMovement.moveTo(id, point, options);
  }
  moveSequence(id: string, steps: NaturalMovementStep[], options: NaturalMovementOptions = {}): gsap.core.Timeline | undefined {
    this.assertActive(); this.stopTextInsertion(id); this.stopDrag(id); this.stopResize(id); this.cancelRendererTween(id); return this.naturalMovement.playSequence(id, steps, options);
  }
  stopNaturalMovement(id: string): void { this.assertActive(); this.naturalMovement.cancel(id); }

  /**
   * Play visual click feedback only; this never dispatches a DOM click.
   * Per-call values override renderer-level clickFeedback defaults.
   */
  click(id: string, options: CursorClickFeedbackOptions = {}): void {
    this.assertActive();
    const cursor = this.nodes.get(id);
    if (!cursor) throw new Error("Unknown rendered cursor: " + id);
    if (this.reducedMotion) return;
    const config = { ...this.clickOptions, ...options };
    this.validateClickOptions(config);
    const pointer = cursor.element.querySelector<HTMLElement>(".cursorbuild-cursor__pointer");
    const button = cursor.element.querySelector<SVGElement>(".cursorbuild-cursor__button");
    const halo = cursor.element.querySelector<HTMLElement>(".cursorbuild-cursor__halo");
    if (!pointer || !button || !halo) return;

    this.clickTimelines.get(id)?.kill();
    gsap.set(button, { scale: 1, transformOrigin: "3px 3px" });
    gsap.set(halo, { scale: 0.45, opacity: 0 });
    const timeline = gsap.timeline();
    const pressDuration = config.duration * 0.28;
    const releaseDuration = config.duration * 0.72;
    if (config.style === "press" || config.style === "ripple-press") {
      timeline.to(button, { scale: 0.82, duration: pressDuration, ease: "power2.out" });
      timeline.to(button, { scale: 1, duration: releaseDuration, ease: "back.out(2.2)" });
    }
    if (config.style === "ripple" || config.style === "ripple-press") {
      timeline.fromTo(halo,
        { scale: 0.45, opacity: config.intensity },
        { scale: config.rippleSize, opacity: 0, duration: config.duration, ease: "power2.out" },
        0
      );
    }
    timeline.eventCallback("onComplete", () => {
      if (this.clickTimelines.get(id) === timeline) this.clickTimelines.delete(id);
      gsap.set(button, { scale: 1 });
      gsap.set(halo, { scale: 0.45, opacity: 0 });
    });
    this.clickTimelines.set(id, timeline);
  }

  /**
   * Approach, visually grab, and move an element. This is a visual DOM
   * simulation: it never dispatches browser mouse or pointer events.
   */
  drag(id: string, options: CursorDragOptions): gsap.core.Timeline | undefined {
    this.assertActive();
    if (!this.nodes.has(id)) throw new Error("Unknown rendered cursor: " + id);
    if (!options || !options.target) throw new TypeError("A drag target is required.");
    if (!options.to || !Number.isFinite(options.to.x) || !Number.isFinite(options.to.y)) {
      throw new TypeError("Drag destination coordinates must be finite numbers.");
    }
    const duration = options.duration ?? 1.2;
    const curvature = options.curvature ?? 0.16;
    const grabScale = options.grabScale ?? 0.82;
    if (!Number.isFinite(duration) || duration < 0) throw new RangeError("Drag duration must be finite and non-negative.");
    if (!Number.isFinite(curvature) || curvature < 0 || curvature > 1) throw new RangeError("Drag curvature must be between 0 and 1.");
    if (!Number.isFinite(grabScale) || grabScale <= 0 || grabScale > 1) throw new RangeError("grabScale must be greater than 0 and at most 1.");

    const element = typeof options.target === "string"
      ? this.resolveDragSelector(options.target)
      : options.target;
    if (!(element instanceof HTMLElement) || element === this.container || !this.container.contains(element)) {
      throw new Error("Drag target must be an HTMLElement contained by the mounted container.");
    }
    const resizeOwner = this.resizeLocks.get(element);
    if (resizeOwner && resizeOwner !== id) throw new Error("Target is being resized by cursor: " + resizeOwner);
    const textOwner = this.textLocks.get(element);
    if (textOwner && textOwner !== id) throw new Error("Target is being used by text insertion cursor: " + textOwner);
    const owner = this.dragLocks.get(element);
    if (owner && owner !== id) throw new Error("Drag target is already being dragged by cursor: " + owner);
    this.stopDrag(id);
    this.stopTextInsertion(id);
    this.stopResize(id);
    this.naturalMovement.cancel(id);
    this.cancelRendererTween(id);
    this.clickTimelines.get(id)?.kill();
    this.clickTimelines.delete(id);

    const containerRect = this.container.getBoundingClientRect();
    const targetRect = element.getBoundingClientRect();
    const startElement = {
      x: targetRect.left - containerRect.left - this.container.clientLeft + this.container.scrollLeft,
      y: targetRect.top - containerRect.top - this.container.clientTop + this.container.scrollTop
    };
    const startCursor = this.getPosition(id);
    if (!startCursor) throw new Error("Cursor has no starting position: " + id);
    const targetCenter = { x: startElement.x + targetRect.width / 2, y: startElement.y + targetRect.height / 2 };
    const destination = { ...options.to };
    const cursorEnd = { x: destination.x + targetRect.width / 2, y: destination.y + targetRect.height / 2 };
    const computedTranslate = window.getComputedStyle(element).translate;
    const [baseTranslateX, baseTranslateY] = computedTranslate && computedTranslate !== "none"
      ? computedTranslate.split(/\s+/).slice(0, 2)
      : ["0px", "0px"];
    const originalTranslate = element.style.translate;

    const approachControls = getNaturalControlPoints(startCursor, targetCenter, curvature, id);
    const dragControls = getNaturalControlPoints(targetCenter, cursorEnd, curvature, id + ":drag");
    const pointer = this.nodes.get(id)!.element.querySelector<SVGElement>(".cursorbuild-cursor__button");
    const setElementOffset = (dx: number, dy: number) => {
      element.style.translate = `calc(${baseTranslateX} + ${dx}px) calc(${baseTranslateY} + ${dy}px)`;
    };
    if (this.reducedMotion || duration === 0) {
      this.setNaturalPosition(id, cursorEnd);
      setElementOffset(destination.x - startElement.x, destination.y - startElement.y);
      if (pointer) gsap.set(pointer, { scale: 1 });
      return undefined;
    }

    const approach = { value: 0 };
    const progress = { value: 0 };
    const timeline = gsap.timeline();
    const record: DragRecord = {
      element, startElement, timeline, originalTranslate, baseTranslateX, baseTranslateY,
      cursorEnd, destination, grabScale
    };
    this.dragLocks.set(element, id);
    this.activeDrags.set(id, record);
    this.dragTimelines.set(id, timeline);

    const setCursor = (point: CursorPoint) => {
      if (!element.isConnected || !this.container.contains(element)) { this.cancelDragRecord(id, record); return; }
      this.setNaturalPosition(id, point);
    };
    const approachPoint = (t: number) => sampleDragBezier(startCursor, approachControls[0], approachControls[1], targetCenter, t);
    const dragPoint = (t: number) => sampleDragBezier(targetCenter, dragControls[0], dragControls[1], cursorEnd, t);
    const approachDuration = duration * 0.32;
    const dragDuration = duration * 0.68;
    timeline.to(approach, {
      value: 1, duration: approachDuration, ease: "power2.inOut",
      onUpdate: () => setCursor(approachPoint(approach.value))
    });
    timeline.to(progress, {
      value: 1, duration: dragDuration, ease: "power2.inOut",
      onStart: () => { if (this.activeDrags.get(id) === record) { element.setAttribute("data-cursorbuild-dragging", ""); if (pointer) gsap.to(pointer, { scale: grabScale, duration: 0.12, transformOrigin: "3px 3px" }); } },
      onUpdate: () => {
        if (this.activeDrags.get(id) !== record || !element.isConnected || !this.container.contains(element)) {
          this.cancelDragRecord(id, record); return;
        }
        const point = dragPoint(progress.value);
        setCursor(point);
        setElementOffset((destination.x - startElement.x) * progress.value, (destination.y - startElement.y) * progress.value);
      }
    });
    timeline.eventCallback("onComplete", () => this.finishDragRecord(id, record, pointer));
    return timeline;
  }

  /** Cancel a drag and restore the target's original inline translate value. */
  stopDrag(id: string): void {
    const record = this.activeDrags.get(id);
    if (record) this.cancelDragRecord(id, record);
  }

  /** Whether this cursor currently owns an active drag operation. */
  isDragging(id: string): boolean {
    const record = this.activeDrags.get(id);
    if (record && (!record.element.isConnected || !this.container.contains(record.element))) this.cancelDragRecord(id, record);
    return this.activeDrags.has(id);
  }

  /**
   * Visually focus a supported text target and insert plain text progressively.
   * No keyboard or input events are dispatched.
   */
  typeText(id: string, options: CursorTextInsertionOptions): gsap.core.Timeline | undefined {
    this.assertActive();
    if (!this.nodes.has(id)) throw new Error("Unknown rendered cursor: " + id);
    if (!options || typeof options.text !== "string") throw new TypeError("Text insertion requires a string.");
    if (!options.target) throw new TypeError("A text insertion target is required.");
    const duration = options.duration ?? 1.8;
    const interval = options.characterIntervalMs;
    const delay = options.initialDelay ?? 0.12;
    const curvature = options.curvature ?? 0.12;
    const mode = options.mode ?? "replace";
    const characters = Array.from(options.text);
    if (!Number.isFinite(duration) || duration < 0) throw new RangeError("Typing duration must be finite and non-negative.");
    if (interval !== undefined && (!Number.isFinite(interval) || interval < 0)) throw new RangeError("characterIntervalMs must be finite and non-negative.");
    if (!Number.isFinite(delay) || delay < 0) throw new RangeError("initialDelay must be finite and non-negative.");
    if (!Number.isFinite(curvature) || curvature < 0 || curvature > 1) throw new RangeError("Typing curvature must be between 0 and 1.");
    if (mode !== "append" && mode !== "replace") throw new TypeError("Text insertion mode must be append or replace.");

    const element = typeof options.target === "string" ? this.resolveTextSelector(options.target) : options.target;
    if (!(element instanceof HTMLElement) || !this.container.contains(element) || !this.isSupportedTextTarget(element)) {
      throw new TypeError('Text insertion target must be a contained input, textarea, or [contenteditable="true"] element.');
    }
    const dragOwner = this.dragLocks.get(element);
    if (dragOwner) throw new Error("Target is already being dragged by cursor: " + dragOwner);
    const resizeOwner = this.resizeLocks.get(element);
    if (resizeOwner && resizeOwner !== id) throw new Error("Target is already being resized by cursor: " + resizeOwner);
    const textOwner = this.textLocks.get(element);
    if (textOwner && textOwner !== id) throw new Error("Text target is already being typed into by cursor: " + textOwner);

    this.stopTextInsertion(id);
    this.stopDrag(id);
    this.stopResize(id);
    this.naturalMovement.cancel(id);
    this.cancelRendererTween(id);
    this.clickTimelines.get(id)?.kill();
    this.clickTimelines.delete(id);

    const isInput = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
    const originalValue = isInput ? element.value : undefined;
    const originalChildren = isInput ? undefined : document.createDocumentFragment();
    let textNode: Text | undefined;
    let baseText: string;
    if (isInput) {
      baseText = mode === "append" ? originalValue! : "";
      if (mode === "replace") element.value = "";
    } else {
      if (mode === "replace") while (element.firstChild) originalChildren!.appendChild(element.firstChild);
      textNode = document.createTextNode("");
      element.appendChild(textNode);
      baseText = "";
    }

    const caret = document.createElement("span");
    caret.className = "cursorbuild-typing-caret";
    caret.setAttribute("aria-hidden", "true");
    caret.style.display = "none";
    caret.style.backgroundColor = this.nodes.get(id)!.color;
    caret.style.color = this.nodes.get(id)!.color;
    this.overlay.appendChild(caret);
    const typingDuration = interval === undefined ? duration : (interval * characters.length) / 1000;
    const startCursor = this.getPosition(id);
    if (!startCursor) throw new Error("Cursor has no starting position: " + id);
    const rect = element.getBoundingClientRect();
    const containerRect = this.container.getBoundingClientRect();
    const targetPoint = {
      x: rect.left - containerRect.left - this.container.clientLeft + this.container.scrollLeft + rect.width / 2,
      y: rect.top - containerRect.top - this.container.clientTop + this.container.scrollTop + rect.height / 2
    };
    const controls = getNaturalControlPoints(startCursor, targetPoint, curvature, id + ":type");
    const approach = { value: 0 };
    const progress = { value: 0 };
    const timeline = gsap.timeline();
    const record: TextInsertionRecord = {
      element, timeline, caret, originalValue, originalChildren, textNode,
      text: options.text, baseText, caretColor: this.nodes.get(id)!.color
    };
    this.textLocks.set(element, id);
    this.activeTextInsertions.set(id, record);

    const updateText = (count: number) => {
      const value = baseText + characters.slice(0, count).join("");
      if (isInput) element.value = value;
      else if (textNode) textNode.data = characters.slice(0, count).join("");
      this.positionTypingCaret(id, record, value);
    };
    if (this.reducedMotion || characters.length === 0 || (typingDuration === 0 && delay === 0)) {
      element.focus({ preventScroll: true });
      updateText(characters.length);
      this.setNaturalPosition(id, this.positionForTypingCaret(record, baseText + characters.join("")));
      this.finishTextInsertion(id, record);
      return undefined;
    }

    const approachDuration = Math.min(0.38, Math.max(0.12, duration * 0.22));
    timeline.to(approach, {
      value: 1, duration: approachDuration, ease: "power2.inOut",
      onUpdate: () => {
        if (!element.isConnected || !this.container.contains(element)) { this.cancelTextInsertionRecord(id, record); return; }
        this.setNaturalPosition(id, sampleDragBezier(startCursor, controls[0], controls[1], targetPoint, approach.value));
      }
    });
    const totalTime = delay + typingDuration;
    timeline.to(progress, {
      value: 1, duration: totalTime, ease: "none",
      onStart: () => {
        if (this.activeTextInsertions.get(id) !== record) return;
        element.focus();
        this.click(id, { style: "press", duration: 0.16 });
        record.clickTimeline = this.clickTimelines.get(id);
        caret.style.display = "block";
      },
      onUpdate: () => {
        if (this.activeTextInsertions.get(id) !== record || !element.isConnected || !this.container.contains(element)) {
          this.cancelTextInsertionRecord(id, record); return;
        }
        const elapsed = progress.value * totalTime;
        const typingProgress = typingDuration <= 0 ? (elapsed >= delay ? 1 : 0) : Math.max(0, Math.min(1, (elapsed - delay) / typingDuration));
        updateText(Math.min(characters.length, Math.floor(typingProgress * characters.length + 1e-8)));
      }
    });
    timeline.eventCallback("onComplete", () => {
      if (this.activeTextInsertions.get(id) !== record) return;
      updateText(characters.length);
      this.setNaturalPosition(id, this.positionForTypingCaret(record, baseText + options.text));
      this.finishTextInsertion(id, record);
    });
    return timeline;
  }

  stopTextInsertion(id: string): void {
    const record = this.activeTextInsertions.get(id);
    if (record) this.cancelTextInsertionRecord(id, record);
  }

  isTyping(id: string): boolean {
    const record = this.activeTextInsertions.get(id);
    if (record && (!record.element.isConnected || !this.container.contains(record.element))) this.cancelTextInsertionRecord(id, record);
    return this.activeTextInsertions.has(id);
  }

  /**
   * Approach an element, acquire one of its eight handles, and animate its size.
   * This visual simulation never dispatches synthetic mouse or pointer events.
   */
  resize(id: string, options: CursorResizeOptions): gsap.core.Timeline | undefined {
    this.assertActive();
    if (!this.nodes.has(id)) throw new Error("Unknown rendered cursor: " + id);
    if (!options || !options.target) throw new TypeError("A resize target is required.");
    if (!options.to || !Number.isFinite(options.to.width) || !Number.isFinite(options.to.height) || options.to.width <= 0 || options.to.height <= 0) {
      throw new RangeError("Resize dimensions must be finite positive numbers.");
    }
    const duration = options.duration ?? 1.2, curvature = options.curvature ?? 0.16, handle = options.handle ?? "bottom-right";
    if (!Number.isFinite(duration) || duration < 0) throw new RangeError("Resize duration must be finite and non-negative.");
    if (!Number.isFinite(curvature) || curvature < 0 || curvature > 1) throw new RangeError("Resize curvature must be between 0 and 1.");
    if (!RESIZE_HANDLES.includes(handle)) throw new TypeError("Unknown resize handle.");
    const element = typeof options.target === "string" ? this.resolveResizeSelector(options.target) : options.target;
    if (!(element instanceof HTMLElement) || element === this.container || !element.isConnected || (!this.allowExternalResizeTargets && !this.container.contains(element))) throw new Error("Resize target must be a connected HTMLElement; external targets require allowExternalResizeTargets.");
    const dragOwner = this.dragLocks.get(element);
    if (dragOwner && dragOwner !== id) throw new Error("Target is already being dragged by cursor: " + dragOwner);
    const textOwner = this.textLocks.get(element);
    if (textOwner && textOwner !== id) throw new Error("Target is being used by text insertion cursor: " + textOwner);
    const owner = this.resizeLocks.get(element);
    if (owner && owner !== id) throw new Error("Target is already being resized by cursor: " + owner);
    this.stopResize(id); this.stopDrag(id); this.stopTextInsertion(id);
    this.naturalMovement.cancel(id); this.cancelRendererTween(id);
    this.clickTimelines.get(id)?.kill(); this.clickTimelines.delete(id);

    const rect = element.getBoundingClientRect(), containerRect = this.container.getBoundingClientRect();
    // The pointer layer is fixed to the viewport. External page targets therefore
    // use viewport coordinates rather than the overlay container scroll origin.
    const externalTarget = !this.container.contains(element);
    const ox = externalTarget ? containerRect.left : containerRect.left + this.container.clientLeft - this.container.scrollLeft;
    const oy = externalTarget ? containerRect.top : containerRect.top + this.container.clientTop - this.container.scrollTop;
    const computed = window.getComputedStyle(element);
    const extraW = (parseFloat(computed.paddingLeft)||0)+(parseFloat(computed.paddingRight)||0)+(parseFloat(computed.borderLeftWidth)||0)+(parseFloat(computed.borderRightWidth)||0);
    const extraH = (parseFloat(computed.paddingTop)||0)+(parseFloat(computed.paddingBottom)||0)+(parseFloat(computed.borderTopWidth)||0)+(parseFloat(computed.borderBottomWidth)||0);
    // Use untransformed CSS box dimensions: getBoundingClientRect() includes
    // rotation/scale and would make the requested dimensions drift on transformed targets.
    const computedWidth = parseFloat(computed.width), computedHeight = parseFloat(computed.height);
    const startCssWidth = Number.isFinite(computedWidth)
      ? computedWidth
      : Math.max(0, (element.offsetWidth || rect.width) - (computed.boxSizing === "border-box" ? 0 : extraW));
    const startCssHeight = Number.isFinite(computedHeight)
      ? computedHeight
      : Math.max(0, (element.offsetHeight || rect.height) - (computed.boxSizing === "border-box" ? 0 : extraH));
    const startBoxWidth = computed.boxSizing === "border-box" ? startCssWidth : startCssWidth + extraW;
    const startBoxHeight = computed.boxSizing === "border-box" ? startCssHeight : startCssHeight + extraH;
    // Edge handles resize only their own axis; corner handles resize both.
    const resizeWidth = handle.includes("left") || handle.includes("right");
    const resizeHeight = handle.includes("top") || handle.includes("bottom");
    const targetBoxWidth = resizeWidth ? options.to.width : startBoxWidth;
    const targetBoxHeight = resizeHeight ? options.to.height : startBoxHeight;
    const cssW = computed.boxSizing === "border-box" ? targetBoxWidth : Math.max(0,targetBoxWidth-extraW);
    const cssH = computed.boxSizing === "border-box" ? targetBoxHeight : Math.max(0,targetBoxHeight-extraH);
    const originalWidth = element.style.width, originalHeight = element.style.height;
    const originalTranslate = element.style.translate;
    const computedTranslate = originalTranslate || computed.translate;
    const translateParts = computedTranslate && computedTranslate !== "none" ? computedTranslate.split(/\s+/) : [];
    const baseTranslateX = translateParts[0] || "0px";
    const baseTranslateY = translateParts[1] || "0px";
    const baseTranslateZ = translateParts[2];
    const composeTranslate = (dx: number, dy: number) =>
      `calc(${baseTranslateX} + ${dx}px) calc(${baseTranslateY} + ${dy}px)${baseTranslateZ ? " " + baseTranslateZ : ""}`;
    // CSS transforms can rotate, scale, or skew the resized box. A change to
    // its dimensions moves the fixed local anchor by both the transformed
    // anchor delta and the transform-origin delta. Counter-translate that
    // screen-space displacement so the opposite anchor stays stationary.
    const transformMatrix = (() => {
      const value = computed.transform;
      if (!value || value === "none") return [1, 0, 0, 1] as const;
      const match2d = value.match(/^matrix\(([^)]+)\)$/);
      if (match2d) {
        const values = match2d[1]!.split(",").map(Number);
        if (values.length === 6 && values.every(Number.isFinite)) return [values[0]!, values[1]!, values[2]!, values[3]!] as const;
      }
      const match3d = value.match(/^matrix3d\(([^)]+)\)$/);
      if (match3d) {
        const values = match3d[1]!.split(",").map(Number);
        if (values.length === 16 && values.every(Number.isFinite)) return [values[0]!, values[1]!, values[4]!, values[5]!] as const;
      }
      // Browsers expose computed transforms as matrices. Fall back to the
      // identity for non-matrix values in DOM shims that do not resolve CSS.
      return [1, 0, 0, 1] as const;
    })();
    const [ma, mb, mc, md] = transformMatrix;
    const originParts = computed.transformOrigin.trim().split(/\s+/).filter(Boolean);
    const originFraction = (value: string | undefined, dimension: number): number => {
      if (!value) return 0.5;
      const token = value.toLowerCase();
      if (token === "center") return 0.5;
      if (token === "left" || token === "top") return 0;
      if (token === "right" || token === "bottom") return 1;
      if (value.endsWith("%")) {
        const percentage = Number.parseFloat(value);
        return Number.isFinite(percentage) ? percentage / 100 : 0.5;
      }
      const pixels = Number.parseFloat(value);
      return Number.isFinite(pixels) && dimension > 0 ? pixels / dimension : 0.5;
    };
    let [originTokenX, originTokenY] = originParts;
    if (originParts.length === 1) {
      if (originTokenX === "top" || originTokenX === "bottom") {
        originTokenY = originTokenX;
        originTokenX = "center";
      } else {
        originTokenY = "center";
      }
    } else if (
      (originTokenX === "top" || originTokenX === "bottom") &&
      (originTokenY === "left" || originTokenY === "right")
    ) {
      [originTokenX, originTokenY] = [originTokenY, originTokenX];
    }
    const originX = originFraction(originTokenX, startBoxWidth);
    const originY = originFraction(originTokenY, startBoxHeight);
    const getAnchorTranslate = (width: number, height: number): string => {
      const deltaWidth = width - startBoxWidth;
      const deltaHeight = height - startBoxHeight;
      const anchorX = handle.includes("left") ? deltaWidth : 0;
      const anchorY = handle.includes("top") ? deltaHeight : 0;
      const originDeltaX = originX * deltaWidth;
      const originDeltaY = originY * deltaHeight;
      const transformedAnchorX = ma * anchorX + mc * anchorY;
      const transformedAnchorY = mb * anchorX + md * anchorY;
      const transformedOriginX = (1 - ma) * originDeltaX - mc * originDeltaY;
      const transformedOriginY = -mb * originDeltaX + (1 - md) * originDeltaY;
      const dx = -(transformedAnchorX + transformedOriginX);
      const dy = -(transformedAnchorY + transformedOriginY);
      return Math.abs(dx) < 1e-8 && Math.abs(dy) < 1e-8
        ? originalTranslate
        : composeTranslate(dx, dy);
    };
    const setAnchorOffset = (width: number, height: number) => {
      element.style.translate = getAnchorTranslate(width, height);
    };
    const cssTargetTranslate = getAnchorTranslate(targetBoxWidth, targetBoxHeight);
    const frame = document.createElement("div");
    frame.className = "cursorbuild-resize-frame"; frame.setAttribute("aria-hidden","true");
    RESIZE_HANDLES.forEach((name)=>{
      const node=document.createElement("span");
      node.className="cursorbuild-resize-handle cursorbuild-resize-handle--"+name;
      node.dataset.handle=name; frame.appendChild(node);
    });
    this.overlay.appendChild(frame);
    const updateFrame=()=>{
      if(!element.isConnected || (!this.allowExternalResizeTargets && !this.container.contains(element)))return;
      const r=element.getBoundingClientRect();
      Object.assign(frame.style,{left:(r.left-ox)+"px",top:(r.top-oy)+"px",width:r.width+"px",height:r.height+"px"});
    };
    const handlePoint=():CursorPoint=>{
      const r=element.getBoundingClientRect();
      const x=handle.includes("left")?r.left:handle.includes("right")?r.right:r.left+r.width/2;
      const y=handle.includes("top")?r.top:handle.includes("bottom")?r.bottom:r.top+r.height/2;
      return {x:x-ox,y:y-oy};
    };
    updateFrame();
    const start=this.getPosition(id);
    if(!start){frame.remove();throw new Error("Cursor has no starting position: "+id);}
    const destination=handlePoint(), controls=getNaturalControlPoints(start,destination,curvature,id+":resize");
    const approach={value:0}, progress={value:0}, timeline=gsap.timeline();
    const record:ResizeRecord={element,timeline,frame,originalWidth,originalHeight,originalTranslate,cssTargetWidth:cssW,cssTargetHeight:cssH,cssTargetTranslate,handle};
    this.resizeLocks.set(element,id);this.activeResizes.set(id,record);
    const removed=()=>{
      if(!element.isConnected || (!this.allowExternalResizeTargets && !this.container.contains(element))){this.cancelResizeRecord(id,record);return true;}
      return false;
    };
    if(this.reducedMotion || duration===0){
      if(resizeWidth)element.style.width=cssW+"px";
      if(resizeHeight)element.style.height=cssH+"px";
      setAnchorOffset(targetBoxWidth,targetBoxHeight);
      updateFrame();this.setNaturalPosition(id,handlePoint());this.finishResizeRecord(id,record);return undefined;
    }
    timeline.to(approach,{value:1,duration:duration*0.3,ease:"power2.inOut",onUpdate:()=>{
      if(!removed())this.setNaturalPosition(id,sampleDragBezier(start,controls[0],controls[1],destination,approach.value));
    }});
    timeline.to(progress,{value:1,duration:duration*0.7,ease:"power2.inOut",
      onStart:()=>{
        if(this.activeResizes.get(id)!==record)return;
        frame.setAttribute("data-grabbed","");
        frame.querySelector('[data-handle="'+handle+'"]')?.classList.add("is-grabbed");
        this.click(id,{style:"press",duration:0.16});record.clickTimeline=this.clickTimelines.get(id);
      },
      onUpdate:()=>{
        if(this.activeResizes.get(id)!==record || removed())return;
        const w=startBoxWidth+(targetBoxWidth-startBoxWidth)*progress.value;
        const h=startBoxHeight+(targetBoxHeight-startBoxHeight)*progress.value;
        if(resizeWidth)element.style.width=(startCssWidth+(cssW-startCssWidth)*progress.value)+"px";
        if(resizeHeight)element.style.height=(startCssHeight+(cssH-startCssHeight)*progress.value)+"px";
        setAnchorOffset(w,h);
        updateFrame();this.setNaturalPosition(id,handlePoint());
      }
    });
    timeline.eventCallback("onComplete",()=>{
      if(this.activeResizes.get(id)!==record)return;
      if(resizeWidth)element.style.width=cssW+"px";
      if(resizeHeight)element.style.height=cssH+"px";
      element.style.translate=cssTargetTranslate;
      updateFrame();this.setNaturalPosition(id,handlePoint());this.finishResizeRecord(id,record);
    });
    return timeline;
  }
  stopResize(id:string):void{
    const record=this.activeResizes.get(id);if(record)this.cancelResizeRecord(id,record);
  }
  isResizing(id:string):boolean{
    const record=this.activeResizes.get(id);
    if(record && (!record.element.isConnected || (!this.allowExternalResizeTargets && !this.container.contains(record.element))))this.cancelResizeRecord(id,record);
    return this.activeResizes.has(id);
  }
  private resolveResizeSelector(selector:string):HTMLElement{
    let element:Element|null;
    try{element=this.allowExternalResizeTargets ? document.querySelector(selector) : this.container.querySelector(selector);}catch{throw new TypeError("Resize target must be a valid CSS selector.");}
    if(!(element instanceof HTMLElement))throw new Error("Resize selector did not match a connected HTMLElement.");
    return element;
  }
  private cancelRemovedResizes():void{
    [...this.activeResizes.entries()].forEach(([id,record])=>{
      if(!record.element.isConnected || (!this.allowExternalResizeTargets && !this.container.contains(record.element)))this.cancelResizeRecord(id,record);
    });
  }
  private cancelResizeRecord(id:string,record:ResizeRecord):void{
    if(this.activeResizes.get(id)!==record)return;
    record.timeline.kill();
    if(record.clickTimeline && this.clickTimelines.get(id)===record.clickTimeline){record.clickTimeline.kill();this.clickTimelines.delete(id);}
    record.element.style.width=record.originalWidth;record.element.style.height=record.originalHeight;
    record.element.style.translate=record.originalTranslate;
    record.frame.remove();this.resizeLocks.delete(record.element);this.activeResizes.delete(id);
  }
  private finishResizeRecord(id:string,record:ResizeRecord):void{
    if(this.activeResizes.get(id)!==record)return;
    record.frame.remove();this.resizeLocks.delete(record.element);this.activeResizes.delete(id);
  }
  private completeResize(id:string,record:ResizeRecord):void{
    if(this.activeResizes.get(id)!==record)return;
    record.timeline.kill();
    if(record.handle.includes("left") || record.handle.includes("right"))record.element.style.width=record.cssTargetWidth+"px";
    if(record.handle.includes("top") || record.handle.includes("bottom"))record.element.style.height=record.cssTargetHeight+"px";
    record.element.style.translate=record.cssTargetTranslate;
    const r=record.element.getBoundingClientRect(),c=this.container.getBoundingClientRect();
    const ox=c.left+this.container.clientLeft-this.container.scrollLeft,oy=c.top+this.container.clientTop-this.container.scrollTop;
    const x=record.handle.includes("left")?r.left:record.handle.includes("right")?r.right:r.left+r.width/2;
    const y=record.handle.includes("top")?r.top:record.handle.includes("bottom")?r.bottom:r.top+r.height/2;
    this.setNaturalPosition(id,{x:x-ox,y:y-oy});this.finishResizeRecord(id,record);
  }

  getPosition(id: string): CursorPoint | undefined { const point = this.positions.get(id); return point ? { ...point } : undefined; }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true; this.unsubscribe(); this.naturalMovement.destroy();
    this.mediaQuery?.removeEventListener?.("change", this.handleMotionChange);
    this.pointerQuery?.removeEventListener?.("change", this.handlePointerChange);
    this.mutationObserver.disconnect();
    if (this.visibilityFrame !== undefined) {
      window.cancelAnimationFrame?.(this.visibilityFrame);
      this.visibilityFrame = undefined;
    }
    [...this.activeDrags.entries()].forEach(([id, record]) => this.cancelDragRecord(id, record));
    [...this.activeTextInsertions.entries()].forEach(([id, record]) => this.cancelTextInsertionRecord(id, record));
    [...this.activeResizes.entries()].forEach(([id, record]) => this.cancelResizeRecord(id, record));
    window.removeEventListener("resize", this.handleResize);
    window.removeEventListener("orientationchange", this.handleResize);
    this.visualViewport?.removeEventListener("resize", this.handleResize);
    this.tweens.forEach((tween) => tween.kill());
    this.clickTimelines.forEach((timeline) => timeline.kill());
    this.nodes.forEach(({ element }) => gsap.killTweensOf(element));
    this.tweens.clear(); this.clickTimelines.clear(); this.nodes.clear(); this.positions.clear();
    this.overlay.remove();
    if (this.changedContainerPosition && this.container.style.position === "relative") this.container.style.position = this.originalPosition;
  }

  private readonly handleMotionChange = (event: MediaQueryListEvent): void => {
    this.reducedMotion = this.options.respectReducedMotion && event.matches;
    if (this.reducedMotion) {
      this.naturalMovement.finishAll();
      this.tweens.forEach((tween) => tween.kill()); this.tweens.clear();
      this.positions.forEach((point, id) => { const node = this.nodes.get(id); if (node) gsap.set(node.element, { x: point.x, y: point.y }); });
      this.clickTimelines.forEach((timeline) => timeline.kill()); this.clickTimelines.clear();
      [...this.activeTextInsertions.entries()].forEach(([id, record]) => this.completeTextInsertion(id, record));
      [...this.activeResizes.entries()].forEach(([id, record]) => this.completeResize(id, record));
      [...this.activeDrags.entries()].forEach(([id, record]) => {
        const pointer = this.nodes.get(id)?.element.querySelector<SVGElement>(".cursorbuild-cursor__button");
        record.timeline.kill();
        if (record.element.isConnected && this.container.contains(record.element)) {
          record.element.style.translate = `calc(${record.baseTranslateX} + ${record.destination.x - record.startElement.x}px) calc(${record.baseTranslateY} + ${record.destination.y - record.startElement.y}px)`;
          this.setNaturalPosition(id, record.cursorEnd);
        }
        this.finishDragRecord(id, record, pointer);
      });
      this.nodes.forEach(({ element }) => {
        const button = element.querySelector(".cursorbuild-cursor__button");
        const halo = element.querySelector(".cursorbuild-cursor__halo");
        if (button) gsap.set(button, { scale: 1 });
        if (halo) gsap.set(halo, { scale: 0.45, opacity: 0 });
      });
    }
  };
  private readonly handleResize = (): void => this.scheduleVisibilityUpdate();
  private readonly handlePointerChange = (): void => this.scheduleVisibilityUpdate();
  private scheduleVisibilityUpdate(): void {
    if (this.destroyed || this.visibilityFrame !== undefined) return;
    if (typeof window.requestAnimationFrame !== "function") {
      this.updateVisibility();
      return;
    }
    this.visibilityFrame = window.requestAnimationFrame(() => {
      this.visibilityFrame = undefined;
      if (!this.destroyed) this.updateVisibility();
    });
  }
  private assertActive(): void { if (this.destroyed) throw new Error("CursorRenderer has been destroyed."); }
  private validateClickOptions(options: Required<CursorClickFeedbackOptions>): void {
    if (!Number.isFinite(options.duration) || options.duration < 0) throw new RangeError("Click duration must be finite and non-negative.");
    if (!Number.isFinite(options.rippleSize) || options.rippleSize <= 0) throw new RangeError("rippleSize must be finite and greater than zero.");
    if (!Number.isFinite(options.intensity) || options.intensity < 0 || options.intensity > 1) throw new RangeError("intensity must be between 0 and 1.");
    if (!["ripple", "press", "ripple-press"].includes(options.style)) throw new TypeError("Unknown click feedback style.");
  }
  private resolveDragSelector(selector: string): HTMLElement {
    let element: Element | null;
    try { element = this.container.querySelector(selector); }
    catch { throw new TypeError("Drag target must be a valid CSS selector."); }
    if (!(element instanceof HTMLElement)) throw new Error("Drag selector did not match an HTMLElement inside the mounted container.");
    return element;
  }
  private isSupportedTextTarget(element: HTMLElement): boolean {
    if (element instanceof HTMLTextAreaElement) return true;
    if (element instanceof HTMLInputElement) return ["text", "search", "email", "url", "tel", "password"].includes(element.type);
    return element.getAttribute("contenteditable")?.toLowerCase() === "true";
  }
  private resolveTextSelector(selector: string): HTMLElement {
    let element: Element | null;
    try { element = this.container.querySelector(selector); }
    catch { throw new TypeError("Text insertion target must be a valid CSS selector."); }
    if (!(element instanceof HTMLElement)) throw new Error("Text insertion selector did not match an HTMLElement inside the mounted container.");
    return element;
  }
  private positionForTypingCaret(record: TextInsertionRecord, text: string): CursorPoint {
    const element = record.element;
    const rect = element.getBoundingClientRect();
    const containerRect = this.container.getBoundingClientRect();
    const originX = containerRect.left + this.container.clientLeft - this.container.scrollLeft;
    const originY = containerRect.top + this.container.clientTop - this.container.scrollTop;
    const style = window.getComputedStyle(element);
    let x = rect.left + rect.width - 2;
    let y = rect.top + rect.height / 2;
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const lines = element instanceof HTMLTextAreaElement ? text.split("\n") : [text];
      const lastLine = lines[lines.length - 1] ?? "";
      const measure = document.createElement("span");
      Object.assign(measure.style, { position: "absolute", visibility: "hidden", whiteSpace: "pre", font: style.font });
      measure.textContent = lastLine;
      this.overlay.appendChild(measure);
      const measuredWidth = measure.getBoundingClientRect().width || lastLine.length * (Number.parseFloat(style.fontSize) || 16) * 0.55;
      measure.remove();
      x = rect.left + (Number.parseFloat(style.paddingLeft) || 0) + measuredWidth - element.scrollLeft;
      y = element instanceof HTMLTextAreaElement
        ? rect.top + (Number.parseFloat(style.paddingTop) || 0) + (lines.length - 1) * (Number.parseFloat(style.lineHeight) || 18) - element.scrollTop
        : rect.top + rect.height / 2;
    } else if (record.textNode) {
      try {
        const range = document.createRange();
        range.setStart(record.textNode, record.textNode.length);
        range.collapse(true);
        if (typeof range.getBoundingClientRect === "function") {
          const caretRect = range.getBoundingClientRect();
          if (caretRect.width || caretRect.height) { x = caretRect.left; y = caretRect.top + caretRect.height / 2; }
        }
      } catch { /* Use the contenteditable target's trailing edge as a fallback. */ }
    }
    const fontSize = Number.parseFloat(style.fontSize) || 16;
    record.caret.style.left = (x - originX) + "px";
    record.caret.style.top = (y - originY - fontSize / 2) + "px";
    record.caret.style.height = (Number.parseFloat(style.lineHeight) || fontSize * 1.2) + "px";
    record.caret.style.backgroundColor = record.caretColor;
    return { x: x - originX, y: y - originY };
  }
  private positionTypingCaret(id: string, record: TextInsertionRecord, text: string): void {
    this.setNaturalPosition(id, this.positionForTypingCaret(record, text));
  }
  private restoreTextTarget(record: TextInsertionRecord): void {
    if (record.originalValue !== undefined) {
      (record.element as HTMLInputElement | HTMLTextAreaElement).value = record.originalValue;
    } else if (record.textNode) {
      record.textNode.remove();
      if (record.originalChildren) record.element.appendChild(record.originalChildren);
    }
  }
  private cancelTextInsertionRecord(id: string, record: TextInsertionRecord): void {
    if (this.activeTextInsertions.get(id) !== record) return;
    record.timeline.kill();
    if (record.clickTimeline && this.clickTimelines.get(id) === record.clickTimeline) { record.clickTimeline.kill(); this.clickTimelines.delete(id); }
    this.restoreTextTarget(record);
    record.caret.remove();
    this.textLocks.delete(record.element);
    this.activeTextInsertions.delete(id);
  }
  private finishTextInsertion(id: string, record: TextInsertionRecord): void {
    if (this.activeTextInsertions.get(id) !== record) return;
    record.caret.remove();
    this.textLocks.delete(record.element);
    this.activeTextInsertions.delete(id);
  }
  private completeTextInsertion(id: string, record: TextInsertionRecord): void {
    if (this.activeTextInsertions.get(id) !== record) return;
    record.timeline.kill();
    if (record.originalValue !== undefined) {
      (record.element as HTMLInputElement | HTMLTextAreaElement).value = record.baseText + record.text;
    } else if (record.textNode) record.textNode.data = record.text;
    const point = this.positionForTypingCaret(record, record.baseText + record.text);
    this.setNaturalPosition(id, point);
    this.finishTextInsertion(id, record);
  }
  private cancelRemovedTextInsertions(): void {
    [...this.activeTextInsertions.entries()].forEach(([id, record]) => {
      if (!record.element.isConnected || !this.container.contains(record.element)) this.cancelTextInsertionRecord(id, record);
    });
  }
  private cancelRemovedDrags(): void {
    [...this.activeDrags.entries()].forEach(([id, record]) => {
      if (!record.element.isConnected || !this.container.contains(record.element)) this.cancelDragRecord(id, record);
    });
  }
  private cancelDragRecord(id: string, record: DragRecord): void {
    if (this.activeDrags.get(id) !== record) return;
    record.timeline.kill();
    record.element.style.translate = record.originalTranslate;
    record.element.removeAttribute("data-cursorbuild-dragging");
    this.dragLocks.delete(record.element);
    this.activeDrags.delete(id);
    this.dragTimelines.delete(id);
    const pointer = this.nodes.get(id)?.element.querySelector<SVGElement>(".cursorbuild-cursor__button");
    if (pointer) gsap.set(pointer, { scale: 1 });
  }
  private finishDragRecord(id: string, record: DragRecord, pointer?: SVGElement | null): void {
    if (this.activeDrags.get(id) !== record) return;
    record.element.removeAttribute("data-cursorbuild-dragging");
    this.dragLocks.delete(record.element);
    this.activeDrags.delete(id);
    this.dragTimelines.delete(id);
    if (pointer) gsap.to(pointer, { scale: 1, duration: this.reducedMotion ? 0 : 0.12, transformOrigin: "3px 3px" });
  }
  private sync(): void {
    if (this.destroyed) return;
    const identities = this.manager.getAll(); const activeIds = new Set(identities.map((identity) => identity.id));
    for (const id of this.nodes.keys()) if (!activeIds.has(id)) this.removeNode(id);
    identities.forEach((identity, index) => this.upsertNode(identity, index)); this.updateVisibility();
  }
  private upsertNode(identity: CursorIdentity, index: number): void {
    let cursor = this.nodes.get(identity.id);
    if (!cursor) {
      const element = document.createElement("div");
      element.className = "cursorbuild-cursor"; element.dataset.cursorId = identity.id;
      Object.assign(element.style, {
        position: "absolute", left: "0", top: "0", display: "flex", alignItems: "flex-start",
        gap: "5px", pointerEvents: "none", willChange: "transform", transform: "translate3d(0,0,0)"
      });
      element.innerHTML = '<span class="cursorbuild-cursor__pointer"><span class="cursorbuild-cursor__halo"></span><svg viewBox="0 0 24 30" width="25" height="30" aria-hidden="true"><path class="cursorbuild-cursor__shape" d="M2 1.5v22l5.8-5.5 4.1 9 4-1.8-4.2-8.8 8-.2L2 1.5Z" stroke="white" stroke-width="1.7" stroke-linejoin="round"/></svg></span><span class="cursorbuild-cursor__label"></span>';
      const label = element.querySelector<HTMLSpanElement>(".cursorbuild-cursor__label")!;
      const svg = element.querySelector<SVGElement>("svg")!;
      svg.classList.add("cursorbuild-cursor__button");
      cursor = { element, label, color: "", name: "" };
      this.nodes.set(identity.id, cursor); this.overlay.appendChild(element);
      const initial = this.initialPositions[identity.id] ?? { x: 24 + (index % 4) * 38, y: 28 + (index % 3) * 32 };
      if (!Number.isFinite(initial.x) || !Number.isFinite(initial.y)) throw new TypeError("Initial cursor coordinates must be finite numbers.");
      this.positions.set(identity.id, { ...initial }); gsap.set(element, { x: initial.x, y: initial.y });
    }
    if (cursor.name !== identity.name) { cursor.name = identity.name; cursor.label.textContent = identity.name; }
    if (cursor.color !== identity.color) {
      cursor.color = identity.color; cursor.element.style.setProperty("--cursorbuild-color", identity.color);
      const shape = cursor.element.querySelector<SVGPathElement>(".cursorbuild-cursor__shape");
      if (shape) shape.setAttribute("fill", identity.color);
      cursor.label.style.backgroundColor = identity.color;
    }
  }
  private cancelRendererTween(id: string): void { this.tweens.get(id)?.kill(); this.tweens.delete(id); }
  private setNaturalPosition(id: string, point: CursorPoint): void {
    const cursor = this.nodes.get(id); if (!cursor) return;
    this.positions.set(id, { ...point }); gsap.set(cursor.element, { x: point.x, y: point.y });
  }
  private removeNode(id: string): void {
    this.stopDrag(id);
    this.stopTextInsertion(id);
    this.stopResize(id);
    this.naturalMovement.cancel(id);
    this.tweens.get(id)?.kill(); this.tweens.delete(id);
    this.clickTimelines.get(id)?.kill(); this.clickTimelines.delete(id);
    const cursor = this.nodes.get(id);
    if (cursor) { gsap.killTweensOf(cursor.element); cursor.element.remove(); this.nodes.delete(id); }
    this.positions.delete(id);
  }
  private updateVisibility(): void {
    const width = window.innerWidth;
    const responsiveLimit = width <= 600 ? this.options.mobileMaxVisible : width <= 900 ? this.options.tabletMaxVisible : this.options.maxVisible;
    const touchDevice = !!this.pointerQuery?.matches || (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0);
    const limit = touchDevice ? Math.min(responsiveLimit, this.options.touchMaxVisible) : responsiveLimit;
    const entries = [...this.nodes.entries()];
    const visibleIds = new Set(entries.slice(Math.max(0, entries.length - limit)).map(([id]) => id));
    entries.forEach(([id, cursor]) => { const display = visibleIds.has(id) ? "flex" : "none"; if (cursor.element.style.display !== display) cursor.element.style.display = display; });
  }
}
