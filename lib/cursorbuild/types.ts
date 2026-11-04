export interface CursorIdentity { id: string; name: string; color: string; avatarUrl?: string; }
export interface CursorBuildConfig { respectReducedMotion: boolean; defaultDuration: number; debug: boolean; }
export type Unsubscribe = () => void;
export interface ActionContext { signal: AbortSignal; }
export interface ActionStep { id: string; run: (context: ActionContext) => void | Promise<void>; }