export interface CoordinationActionContext {
  readonly groupId: string;
  readonly actionId: string;
  readonly cursorId: string;
  readonly signal: AbortSignal;
  /** Abort-aware delay. Resolves immediately for zero milliseconds. */
  wait(milliseconds: number): Promise<void>;
}

export interface CursorTimelineAction {
  /** Unique within the coordination group. */
  id: string;
  /** Work performed by this cursor. Return a promise that settles when its animation is complete. */
  run(context: CoordinationActionContext): void | Promise<void>;
  /** Action IDs that must finish successfully before this action starts. */
  dependsOn?: readonly string[];
  /** Additional delay before this action starts, in milliseconds. */
  delay?: number;
}

export interface CursorTimelineOptions {
  /** Run actions in order (default) or allow independent actions to start together. */
  mode?: "sequential" | "parallel";
  /** Delay before this cursor starts contributing work to a group, in milliseconds. */
  delay?: number;
}

export interface CoordinationGroupOptions {
  /** Delay before any cursor timeline starts, in milliseconds. */
  delay?: number;
}

export type CoordinationActionStatus = "pending" | "running" | "completed" | "cancelled" | "failed";
export type CoordinationGroupStatus = "idle" | "running" | "completed" | "cancelled" | "failed";

function validateDelay(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(label + " must be finite and non-negative.");
}

function abortError(): Error {
  if (typeof DOMException !== "undefined") return new DOMException("Coordination action aborted.", "AbortError");
  const error = new Error("Coordination action aborted.");
  error.name = "AbortError";
  return error;
}

function waitWithSignal(milliseconds: number, signal: AbortSignal): Promise<void> {
  validateDelay(milliseconds, "delay");
  if (signal.aborted) return Promise.reject(abortError());
  if (milliseconds === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * An independent action track owned by one cursor. Tracks are immutable
 * definitions; a coordinator combines several tracks into a shared group.
 */
export class CursorActionTimeline {
  readonly actions: readonly CursorTimelineAction[];
  readonly cursorId: string;
  readonly delay: number;

  constructor(cursorId: string, actions: readonly CursorTimelineAction[], options: CursorTimelineOptions = {}) {
    if (!cursorId.trim()) throw new Error("A cursor id is required for a coordination timeline.");
    if (!Array.isArray(actions) || actions.length === 0) throw new TypeError("A cursor timeline requires at least one action.");
    this.cursorId = cursorId;
    this.delay = options.delay ?? 0;
    validateDelay(this.delay, "timeline delay");
    const mode = options.mode ?? "sequential";
    if (mode !== "sequential" && mode !== "parallel") throw new TypeError("Timeline mode must be sequential or parallel.");
    const seen = new Set<string>();
    this.actions = actions.map((action, index) => {
      if (!action || typeof action.id !== "string" || !action.id.trim()) throw new TypeError("Every coordinated action needs an id.");
      if (seen.has(action.id)) throw new Error("Duplicate action id in cursor timeline: " + action.id);
      if (typeof action.run !== "function") throw new TypeError("Every coordinated action needs a run function.");
      validateDelay(action.delay ?? 0, "action delay");
      seen.add(action.id);
      const dependencies = [...(action.dependsOn ?? [])];
      if (mode === "sequential" && index > 0) dependencies.push(actions[index - 1]!.id);
      return { ...action, dependsOn: [...new Set(dependencies)] };
    });
  }
}

interface RuntimeAction {
  definition: CursorTimelineAction;
  cursorId: string;
  status: CoordinationActionStatus;
  controller?: AbortController;
  promise?: Promise<void>;
}

/** Read cancellation state outside the caller's narrowed control-flow path. */
function isActionCancelled(action: RuntimeAction): boolean {
  return action.status === "cancelled";
}

export class CoordinatedActionGroup {
  private readonly actions = new Map<string, RuntimeAction>();
  private readonly groupController = new AbortController();
  private groupStatus: CoordinationGroupStatus = "idle";
  private runPromise?: Promise<void>;
  private failure?: unknown;
  private hasFailure = false;

  constructor(
    readonly id: string,
    timelines: readonly CursorActionTimeline[],
    private readonly options: CoordinationGroupOptions = {}
  ) {
    if (!id.trim()) throw new Error("A coordination group id is required.");
    if (!Array.isArray(timelines) || timelines.length === 0) throw new TypeError("A coordination group requires at least one cursor timeline.");
    validateDelay(options.delay ?? 0, "group delay");
    for (const timeline of timelines) {
      if (!(timeline instanceof CursorActionTimeline)) throw new TypeError("Groups accept CursorActionTimeline instances.");
      timeline.actions.forEach((definition, index) => {
        if (this.actions.has(definition.id)) throw new Error("Duplicate action id in coordination group: " + definition.id);
        const withTimelineDelay = index === 0 && timeline.delay > 0
          ? { ...definition, delay: (definition.delay ?? 0) + timeline.delay }
          : definition;
        this.actions.set(definition.id, { definition: withTimelineDelay, cursorId: timeline.cursorId, status: "pending" });
      });
    }
    this.validateDependencies();
  }

  get status(): CoordinationGroupStatus { return this.groupStatus; }

  getActionStatus(actionId: string): CoordinationActionStatus | undefined {
    return this.actions.get(actionId)?.status;
  }

  getActionStatuses(): Readonly<Record<string, CoordinationActionStatus>> {
    const statuses: Record<string, CoordinationActionStatus> = {};
    this.actions.forEach((action, id) => { statuses[id] = action.status; });
    return statuses;
  }

  run(): Promise<void> {
    if (this.groupStatus === "running") return this.runPromise!;
    if (this.groupStatus !== "idle") throw new Error("Coordination group can only run once.");
    this.groupStatus = "running";
    this.runPromise = this.execute();
    return this.runPromise;
  }

  cancelAction(actionId: string): void {
    const action = this.actions.get(actionId);
    if (!action || action.status !== "pending" && action.status !== "running") return;
    action.status = "cancelled";
    action.controller?.abort();
  }

  cancel(): void {
    if (this.groupStatus !== "idle" && this.groupStatus !== "running") return;
    this.groupStatus = "cancelled";
    this.groupController.abort();
    this.actions.forEach((action) => {
      if (action.status === "pending" || action.status === "running") {
        action.status = "cancelled";
        action.controller?.abort();
      }
    });
  }

  private async execute(): Promise<void> {
    try {
      await waitWithSignal(this.options.delay ?? 0, this.groupController.signal);
      const jobs = [...this.actions.keys()].map((id) => this.executeAction(id));
      const results = await Promise.allSettled(jobs);
      const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
      if (rejected) {
        if (this.hasFailure) {
          this.groupStatus = "failed";
          throw this.failure;
        }
        this.groupStatus = "cancelled";
        return;
      }
      if (this.groupController.signal.aborted || [...this.actions.values()].some((action) => action.status === "cancelled")) {
        this.groupStatus = "cancelled";
        return;
      }
      this.groupStatus = "completed";
    } catch (error) {
      if (this.failure !== undefined) {
        this.groupStatus = "failed";
        throw this.failure;
      }
      if (this.groupController.signal.aborted || (error as { name?: string })?.name === "AbortError") {
        this.groupStatus = "cancelled";
        return;
      }
      this.groupStatus = "failed";
      throw error;
    }
  }

  private executeAction(actionId: string): Promise<void> {
    const action = this.actions.get(actionId)!;
    if (action.promise) return action.promise;
    action.promise = (async () => {
      try {
        for (const dependency of action.definition.dependsOn ?? []) {
          await this.executeAction(dependency);
          const dependencyStatus = this.actions.get(dependency)!.status;
          if (dependencyStatus !== "completed") throw abortError();
        }
        if (this.groupController.signal.aborted || isActionCancelled(action)) throw abortError();
        const controller = new AbortController();
        action.controller = controller;
        const abortFromGroup = () => controller.abort();
        this.groupController.signal.addEventListener("abort", abortFromGroup, { once: true });
        try {
          await waitWithSignal(action.definition.delay ?? 0, controller.signal);
          if (isActionCancelled(action) || controller.signal.aborted) throw abortError();
          action.status = "running";
          await action.definition.run({
            groupId: this.id,
            actionId,
            cursorId: action.cursorId,
            signal: controller.signal,
            wait: (milliseconds) => waitWithSignal(milliseconds, controller.signal)
          });
          if (controller.signal.aborted) throw abortError();
          action.status = "completed";
        } finally {
          this.groupController.signal.removeEventListener("abort", abortFromGroup);
        }
      } catch (error) {
        if (!isActionCancelled(action)) {
          action.status = (error as { name?: string })?.name === "AbortError" ? "cancelled" : "failed";
        }
        if (action.status === "failed") {
          this.failure = error;
          this.hasFailure = true;
          this.groupController.abort();
          this.actions.forEach((sibling) => {
            if (sibling.status === "pending" || sibling.status === "running") {
              sibling.status = "cancelled";
              sibling.controller?.abort();
            }
          });
        }
        throw error;
      }
    })();
    return action.promise;
  }

  private validateDependencies(): void {
    for (const [id, action] of this.actions) {
      for (const dependency of action.definition.dependsOn ?? []) {
        if (!this.actions.has(dependency)) throw new Error("Unknown dependency " + dependency + " for action " + id + ".");
        if (dependency === id) throw new Error("Action cannot depend on itself: " + id);
      }
    }
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string): void => {
      if (visiting.has(id)) throw new Error("Circular action dependency involving: " + id);
      if (visited.has(id)) return;
      visiting.add(id);
      for (const dependency of this.actions.get(id)!.definition.dependsOn ?? []) visit(dependency);
      visiting.delete(id);
      visited.add(id);
    };
    for (const id of this.actions.keys()) visit(id);
  }
}

/**
 * Coordinates independent cursor timelines without owning cursor rendering,
 * DOM events, animation libraries, or framework-specific state.
 */
export class MultiCursorCoordinationEngine {
  private readonly groups = new Map<string, CoordinatedActionGroup>();
  private destroyed = false;

  createTimeline(cursorId: string, actions: readonly CursorTimelineAction[], options: CursorTimelineOptions = {}): CursorActionTimeline {
    this.assertActive();
    return new CursorActionTimeline(cursorId, actions, options);
  }

  createGroup(id: string, timelines: readonly CursorActionTimeline[], options: CoordinationGroupOptions = {}): CoordinatedActionGroup {
    this.assertActive();
    if (this.groups.has(id)) throw new Error("Coordination group already exists: " + id);
    const group = new CoordinatedActionGroup(id, timelines, options);
    this.groups.set(id, group);
    return group;
  }

  getGroup(id: string): CoordinatedActionGroup | undefined {
    return this.groups.get(id);
  }

  cancelAction(groupId: string, actionId: string): void {
    this.groups.get(groupId)?.cancelAction(actionId);
  }

  cancelGroup(groupId: string): void {
    this.groups.get(groupId)?.cancel();
  }

  destroyGroup(groupId: string): void {
    this.groups.get(groupId)?.cancel();
    this.groups.delete(groupId);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.groups.forEach((group) => group.cancel());
    this.groups.clear();
  }

  private assertActive(): void {
    if (this.destroyed) throw new Error("MultiCursorCoordinationEngine has been destroyed.");
  }
}
