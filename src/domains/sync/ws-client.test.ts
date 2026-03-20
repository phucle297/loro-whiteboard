import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import { WsClient, type WsClientCallbacks } from "./ws-client";

// ---------------------------------------------------------------------------
// Minimal WebSocket mock
// ---------------------------------------------------------------------------

type WsEventType = "open" | "message" | "close" | "error";

class MockWebSocket {
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState: number;
  binaryType = "arraybuffer";
  url: string;

  private listeners: Map<string, Array<(e: unknown) => void>> = new Map();

  // Track all instances created so tests can access the latest socket.
  static instances: MockWebSocket[] = [];

  constructor(url: string) {
    this.url = url;
    this.readyState = 0; // CONNECTING
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: WsEventType, fn: (e: unknown) => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(fn);
  }

  removeEventListener(type: WsEventType, fn: (e: unknown) => void): void {
    const list = this.listeners.get(type) ?? [];
    const idx = list.indexOf(fn);
    if (idx !== -1) list.splice(idx, 1);
  }

  send = vi.fn();

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.emit("close", {});
  }

  // Test helpers
  emit(type: WsEventType, event: unknown = {}): void {
    (this.listeners.get(type) ?? []).forEach((fn) => fn(event));
  }

  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.emit("open", {});
  }

  simulateMessage(data: ArrayBuffer): void {
    this.emit("message", { data });
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WsClient", () => {
  let callbacks: { [K in keyof WsClientCallbacks]-?: Mock };

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    // Install mock
    vi.stubGlobal("WebSocket", MockWebSocket);
    callbacks = {
      onUpdate: vi.fn(),
      onStatusChange: vi.fn(),
      onConnect: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const latestSocket = () =>
    MockWebSocket.instances[MockWebSocket.instances.length - 1];

  it("emits 'syncing' on connect()", () => {
    const client = new WsClient("room-1");
    client.connect(callbacks);
    expect(callbacks.onStatusChange).toHaveBeenCalledWith("syncing");
  });

  it("emits 'online' and calls onConnect when socket opens", () => {
    const client = new WsClient("room-1");
    client.connect(callbacks);
    latestSocket().simulateOpen();

    expect(callbacks.onStatusChange).toHaveBeenCalledWith("online");
    expect(callbacks.onConnect).toHaveBeenCalledOnce();
  });

  it("forwards binary messages as Uint8Array", () => {
    const client = new WsClient("room-1");
    client.connect(callbacks);
    latestSocket().simulateOpen();

    const payload = new Uint8Array([1, 2, 3]).buffer;
    latestSocket().simulateMessage(payload);

    expect(callbacks.onUpdate).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
  });

  it("sends immediately when socket is open", () => {
    const client = new WsClient("room-1");
    client.connect(callbacks);
    latestSocket().simulateOpen();

    const data = new Uint8Array([42]);
    client.send(data);

    expect(latestSocket().send).toHaveBeenCalledWith(data);
  });

  it("queues sends while disconnected and flushes on open", () => {
    const client = new WsClient("room-1");
    client.connect(callbacks);

    const data1 = new Uint8Array([1]);
    const data2 = new Uint8Array([2]);
    client.send(data1);
    client.send(data2);
    expect(latestSocket().send).not.toHaveBeenCalled();

    latestSocket().simulateOpen();
    expect(latestSocket().send).toHaveBeenCalledTimes(2);
  });

  it("reconnects with exponential backoff after close", () => {
    const client = new WsClient("room-1");
    client.connect(callbacks);
    latestSocket().simulateOpen();

    // Simulate disconnect
    latestSocket().close();
    expect(callbacks.onStatusChange).toHaveBeenCalledWith("offline");
    expect(MockWebSocket.instances).toHaveLength(1);

    // After 1s, new socket opens (first retry: 1000ms * 2^0 = 1000ms)
    vi.advanceTimersByTime(1000);
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it("resets backoff counter on successful reconnect", () => {
    const client = new WsClient("room-1");
    client.connect(callbacks);
    latestSocket().simulateOpen();

    // Disconnect and reconnect
    latestSocket().close();
    vi.advanceTimersByTime(1000);
    latestSocket().simulateOpen(); // resets retryCount to 0

    // Another disconnect — should still wait 1s (not 2s)
    latestSocket().close();
    vi.advanceTimersByTime(999);
    const countBefore = MockWebSocket.instances.length;
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances.length).toBe(countBefore + 1);
  });

  it("stops reconnecting after disconnect()", () => {
    const client = new WsClient("room-1");
    client.connect(callbacks);
    latestSocket().simulateOpen();

    client.disconnect();
    expect(callbacks.onStatusChange).toHaveBeenCalledWith("offline");

    const countAfterDisconnect = MockWebSocket.instances.length;
    vi.advanceTimersByTime(60_000);
    expect(MockWebSocket.instances.length).toBe(countAfterDisconnect);
  });

  it("includes roomId in the WebSocket URL", () => {
    const client = new WsClient("my-room");
    client.connect(callbacks);
    expect(latestSocket().url).toContain("room=my-room");
  });
});
