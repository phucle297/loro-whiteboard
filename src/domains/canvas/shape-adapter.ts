import type { TLRecord, TLStore } from "tldraw";
import { WorkerBridge } from "./worker-bridge";
import type { TldrawShape } from "@/types/shape";

function isShape(record: TLRecord): boolean {
  return record.typeName === "shape";
}

function tldrawRecordToShape(record: TLRecord): TldrawShape {
  const s = record as any;
  return {
    id: s.id,
    type: s.type,
    x: s.x ?? 0,
    y: s.y ?? 0,
    rotation: s.rotation ?? 0,
    isLocked: s.isLocked ?? false,
    parentId: s.parentId === "page:page" ? undefined : s.parentId,
    index: s.index ?? "a1",
    props: s.props ?? {},
  };
}

export class ShapeAdapter {
  private unsubscribe?: () => void;

  constructor(
    private store: TLStore,
    private bridge: WorkerBridge,
  ) {}

  start(): void {
    // Listen for tldraw store changes and forward to worker.
    // Uses filter { source: "user", scope: "document" } so we only capture
    // user-initiated changes to document records (not session/presence).
    this.unsubscribe = this.store.listen(
      (entry) => {
        const { changes } = entry;

        const added = Object.values(changes.added)
          .filter(isShape)
          .map(tldrawRecordToShape);

        const updated = (
          Object.values(changes.updated) as Array<[TLRecord, TLRecord]>
        )
          .filter(([, after]) => isShape(after))
          .map(
            ([before, after]) =>
              [tldrawRecordToShape(before), tldrawRecordToShape(after)] as [
                TldrawShape,
                TldrawShape,
              ],
          );

        const removedIds = Object.keys(changes.removed).filter((id) =>
          isShape((changes.removed as Record<string, TLRecord>)[id]),
        );

        if (added.length > 0 || updated.length > 0) {
          this.bridge.post({ type: "LOCAL_CHANGES", diff: { added, updated } });
        }
        if (removedIds.length > 0) {
          this.bridge.post({ type: "LOCAL_DELETE", ids: removedIds });
        }
      },
      { source: "user", scope: "document" },
    );

    // Handle remote patches from worker
    this.bridge.on("REMOTE_PATCH", ({ diff }) => {
      this.store.mergeRemoteChanges(() => {
        for (const shape of diff.added) {
          this.applyShape(shape);
        }
        for (const [, after] of diff.updated) {
          this.applyShape(after);
        }
      });
    });

    // Handle initial snapshot from worker
    this.bridge.on("SNAPSHOT", ({ shapes }) => {
      this.store.mergeRemoteChanges(() => {
        // Apply all incoming shapes
        for (const shape of shapes) {
          this.applyShape(shape);
        }
        // Remove shapes that no longer exist in the CRDT
        const incomingIds = new Set(shapes.map((s) => s.id));
        const existingShapes = this.store
          .allRecords()
          .filter((r) => r.typeName === "shape");
        const toRemove = existingShapes
          .filter((r) => !incomingIds.has(r.id))
          .map((r) => r.id);
        if (toRemove.length > 0) {
          this.store.remove(toRemove);
        }
      });
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.bridge.off("REMOTE_PATCH");
    this.bridge.off("SNAPSHOT");
  }

  private applyShape(shape: TldrawShape): void {
    const record = {
      id: shape.id,
      typeName: "shape" as const,
      type: shape.type,
      x: shape.x,
      y: shape.y,
      rotation: shape.rotation,
      isLocked: shape.isLocked,
      parentId: shape.parentId ?? "page:page",
      index: (shape.index ?? "a1") as any,
      props: shape.props,
      meta: {},
    };
    this.store.put([record as any]);
  }
}
