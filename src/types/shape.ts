/**
 * Simplified, serializable representation of a tldraw shape.
 *
 * We define our own type here (rather than importing from tldraw) because the
 * CRDT worker cannot import tldraw's full bundle, and all values crossing the
 * message-channel boundary must be structured-cloneable.
 */
export interface TldrawShape {
  id: string;
  type: string;
  x: number;
  y: number;
  rotation: number;
  isLocked: boolean;
  parentId: string | undefined;
  props: Record<string, unknown>;
}

/**
 * Represents the set of changes to apply to the local shape store.
 *
 * - `added`   — shapes that are new and must be inserted.
 * - `updated` — pairs of [previous, next] for shapes that changed; the first
 *               element is the before-state and the second is the after-state.
 */
export interface TldrawShapeDiff {
  added: TldrawShape[];
  updated: Array<[TldrawShape, TldrawShape]>;
}
