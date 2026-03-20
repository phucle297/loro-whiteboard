"use client";

import { useEffect, useRef } from "react";
import { Tldraw, createTLStore, defaultShapeUtils } from "tldraw";
import "tldraw/tldraw.css";
import { WorkerBridge } from "./worker-bridge";
import { ShapeAdapter } from "./shape-adapter";

interface WhiteboardProps {
  roomId: string;
}

export function Whiteboard({ roomId }: WhiteboardProps) {
  const bridgeRef = useRef<WorkerBridge | null>(null);
  const adapterRef = useRef<ShapeAdapter | null>(null);
  const storeRef = useRef(
    createTLStore({ shapeUtils: defaultShapeUtils }),
  );

  useEffect(() => {
    const store = storeRef.current;

    const worker = new Worker(
      new URL("../crdt/loro.worker.ts", import.meta.url),
      { type: "module" },
    );
    const bridge = new WorkerBridge(worker);
    bridgeRef.current = bridge;

    const adapter = new ShapeAdapter(store, bridge);
    adapterRef.current = adapter;
    adapter.start();

    // Initialize the worker with roomId
    bridge.post({ type: "INIT", roomId });

    return () => {
      adapter.stop();
      bridge.terminate();
    };
  }, [roomId]);

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Tldraw store={storeRef.current} />
    </div>
  );
}
