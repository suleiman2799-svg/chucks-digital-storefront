import type { CursorIdentity, Unsubscribe } from "../types";
/** Identity registry only; rendering and pointer tracking belong to adapters. */
export class CursorManager {
 private readonly cursors = new Map<string, CursorIdentity>();
 private readonly listeners = new Set<() => void>();
 private snapshot: readonly CursorIdentity[] = [];
 private destroyed = false;
 getAll(): CursorIdentity[] { return [...this.cursors.values()]; }
 /** Stable immutable snapshot for useSyncExternalStore consumers. */
 getSnapshot(): readonly CursorIdentity[] { return this.snapshot; }
 get(id: string): CursorIdentity | undefined { return this.cursors.get(id); }
 add(identity: CursorIdentity): void { this.assertActive(); if (!identity.id.trim()) throw new Error("A cursor id is required."); if (this.cursors.has(identity.id)) throw new Error("Cursor already exists: " + identity.id); this.cursors.set(identity.id, { ...identity }); this.notify(); }
 update(id: string, patch: Partial<Omit<CursorIdentity, "id">>): void { this.assertActive(); const current = this.cursors.get(id); if (!current) throw new Error("Unknown cursor: " + id); this.cursors.set(id, { ...current, ...patch, id }); this.notify(); }
 remove(id: string): boolean { if (this.destroyed) return false; const removed = this.cursors.delete(id); if (removed) this.notify(); return removed; }
 subscribe(listener: () => void): Unsubscribe { this.assertActive(); this.listeners.add(listener); return () => this.listeners.delete(listener); }
 destroy(): void { if (this.destroyed) return; this.destroyed = true; this.cursors.clear(); this.snapshot = []; this.listeners.clear(); }
 private notify(): void { this.snapshot = [...this.cursors.values()]; this.listeners.forEach((listener) => listener()); }
 private assertActive(): void { if (this.destroyed) throw new Error("CursorManager has been destroyed."); }
}