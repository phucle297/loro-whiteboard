/**
 * Web Worker entrypoint — sole owner of the Loro CRDT document.
 *
 * All mutations to the Loro doc happen here. The main thread communicates
 * via structured-cloneable messages defined in `../../types/message.ts`.
 */
import { LoroDoc } from "./loro-doc";
import { LoroCodec } from "./loro-codec";
import { SnapshotStore } from "../storage/snapshot-store";
import { WsClient } from "../sync/ws-client";
import type {
  MainToWorkerMessage,
  WorkerToMainMessage,
} from "../../types/message";

const loroDoc = new LoroDoc();
const loroCodec = new LoroCodec();
let snapshotStore: SnapshotStore | null = null;
let wsClient: WsClient | null = null;

self.onmessage = async (e: MessageEvent<MainToWorkerMessage>) => {
  const msg = e.data;

  if (msg.type === "INIT") {
    snapshotStore = new SnapshotStore(msg.roomId);
    wsClient = new WsClient(msg.roomId);

    // Load persisted snapshot from IndexedDB.
    const snapshot = await snapshotStore.load();
    if (snapshot) {
      loroDoc.import(snapshot);
    }

    // Connect to the WebSocket relay server.
    wsClient.connect({
      onUpdate: (update: Uint8Array) => {
        loroDoc.import(update);
        snapshotStore!.save(loroDoc.exportSnapshot());

        // Send a full snapshot to the main thread so it can reconcile.
        const shapes = loroCodec.decodeAll(loroDoc);
        self.postMessage({
          type: "SNAPSHOT",
          shapes,
        } satisfies WorkerToMainMessage);
      },
      onStatusChange: (status: "online" | "offline" | "syncing") => {
        self.postMessage({
          type: "SYNC_STATUS",
          status,
        } satisfies WorkerToMainMessage);
      },
    });

    // Send the initial snapshot to the main thread.
    const shapes = loroCodec.decodeAll(loroDoc);
    self.postMessage({
      type: "SNAPSHOT",
      shapes,
    } satisfies WorkerToMainMessage);
  }

  if (msg.type === "LOCAL_CHANGES") {
    loroCodec.applyDiff(loroDoc, msg.diff);
    const update = loroDoc.commit();
    wsClient?.send(update);
    snapshotStore?.save(loroDoc.exportSnapshot());
  }

  if (msg.type === "LOCAL_DELETE") {
    loroCodec.removeShapes(loroDoc, msg.ids);
    const update = loroDoc.commit();
    wsClient?.send(update);
    snapshotStore?.save(loroDoc.exportSnapshot());
  }
};
