import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "loro-whiteboard";
const DB_VERSION = 1;

export interface SnapshotRecord {
  roomId: string;
  data: Uint8Array;
}

export interface PendingOpRecord {
  id?: number;
  roomId: string;
  op: Uint8Array;
}

export function openDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("snapshots")) {
        db.createObjectStore("snapshots", { keyPath: "roomId" });
      }

      if (!db.objectStoreNames.contains("pending-ops")) {
        db.createObjectStore("pending-ops", {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    },
  });
}
