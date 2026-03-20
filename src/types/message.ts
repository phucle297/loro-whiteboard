import type { TldrawShape, TldrawShapeDiff } from "./shape";

// ---------------------------------------------------------------------------
// Main → Worker messages
// ---------------------------------------------------------------------------

/** Initialise the worker for a given room and user. */
export interface InitMessage {
  type: "INIT";
  roomId: string;
  userId: string;
}

/** Notify the worker of locally-made shape additions or updates. */
export interface LocalChangesMessage {
  type: "LOCAL_CHANGES";
  diff: TldrawShapeDiff;
}

/** Notify the worker that shapes were deleted locally. */
export interface LocalDeleteMessage {
  type: "LOCAL_DELETE";
  ids: string[];
}

/** Discriminated union of every message the main thread can post to the worker. */
export type MainToWorkerMessage =
  | InitMessage
  | LocalChangesMessage
  | LocalDeleteMessage;

// ---------------------------------------------------------------------------
// Worker → Main messages
// ---------------------------------------------------------------------------

/** Full snapshot sent to the main thread on initialisation. */
export interface SnapshotMessage {
  type: "SNAPSHOT";
  shapes: TldrawShape[];
}

/** Incremental patch forwarded to the main thread after a remote update. */
export interface RemotePatchMessage {
  type: "REMOTE_PATCH";
  diff: TldrawShapeDiff;
}

/** Sync-status notification so the UI can reflect connectivity state. */
export interface SyncStatusMessage {
  type: "SYNC_STATUS";
  status: "online" | "offline" | "syncing";
}

/** Discriminated union of every message the worker can post to the main thread. */
export type WorkerToMainMessage =
  | SnapshotMessage
  | RemotePatchMessage
  | SyncStatusMessage;
