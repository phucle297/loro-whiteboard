import { openDb, type PendingOpRecord, type SnapshotRecord } from "./idb";

export class SnapshotStore {
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private roomId: string) {}

  async load(): Promise<Uint8Array | null> {
    const db = await openDb();
    const record = await db.get("snapshots", this.roomId);
    if (!record) return null;
    return (record as SnapshotRecord).data;
  }

  save(data: Uint8Array): void {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = setTimeout(async () => {
      this.saveTimer = null;
      const db = await openDb();
      const record: SnapshotRecord = { roomId: this.roomId, data };
      await db.put("snapshots", record);
    }, 500);
  }

  async queuePendingOp(op: Uint8Array): Promise<void> {
    const db = await openDb();
    const record: PendingOpRecord = { roomId: this.roomId, op };
    await db.add("pending-ops", record);
  }

  async getPendingOps(): Promise<Array<{ id: number; op: Uint8Array }>> {
    const db = await openDb();
    const all = await db.getAll("pending-ops");
    return (all as PendingOpRecord[])
      .filter((r) => r.roomId === this.roomId)
      .map((r) => ({ id: r.id as number, op: r.op }));
  }

  async deletePendingOps(ids: number[]): Promise<void> {
    const db = await openDb();
    const tx = db.transaction("pending-ops", "readwrite");
    await Promise.all(ids.map((id) => tx.store.delete(id)));
    await tx.done;
  }
}
