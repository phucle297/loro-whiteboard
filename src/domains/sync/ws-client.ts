/**
 * WebSocket client with exponential-backoff reconnect logic.
 *
 * Runs inside the Loro Web Worker. Handles binary frames (arraybuffer),
 * queues outbound data while disconnected, and notifies the caller of
 * status transitions so the worker can re-initiate sync after reconnect.
 */

// Bundlers (Vite, Next.js) replace `process.env.*` at compile time.
// In a Web Worker context the global `process` object may not exist at
// runtime, so we declare a minimal ambient type to satisfy TypeScript
// without pulling in Node.js types.
declare const process: { env: { NEXT_PUBLIC_WS_URL?: string } };

const WS_URL =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_WS_URL) ||
  "ws://localhost:4000";

// Exponential backoff delays in milliseconds (1s, 2s, 4s, 8s, 16s, 30s cap).
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

export interface WsClientCallbacks {
  onUpdate: (update: Uint8Array) => void;
  onStatusChange: (status: "online" | "offline" | "syncing") => void;
  /** Called when the socket (re)connects so the worker can send the version vector. */
  onConnect?: () => void;
}

export class WsClient {
  private socket: WebSocket | null = null;
  private callbacks: WsClientCallbacks | null = null;
  private retryCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  /** Outbound messages queued while the socket is not yet open. */
  private sendQueue: Uint8Array[] = [];
  /** Set to true by `disconnect()` to prevent further reconnect attempts. */
  private stopped = false;

  constructor(private readonly roomId: string) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  connect(callbacks: WsClientCallbacks): void {
    this.callbacks = callbacks;
    this.stopped = false;
    this.openSocket();
  }

  send(data: Uint8Array): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(data);
    } else {
      this.sendQueue.push(data);
    }
  }

  disconnect(): void {
    this.stopped = true;
    this.clearRetryTimer();

    if (this.socket) {
      // Remove event handlers before closing so we don't trigger a reconnect.
      this.detachHandlers(this.socket);
      this.socket.close();
      this.socket = null;
    }

    this.callbacks?.onStatusChange("offline");
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private openSocket(): void {
    if (this.stopped) {
      return;
    }

    this.callbacks?.onStatusChange("syncing");

    const url = `${WS_URL}?room=${encodeURIComponent(this.roomId)}`;
    const socket = new WebSocket(url);
    socket.binaryType = "arraybuffer";
    this.socket = socket;

    socket.addEventListener("open", this.handleOpen);
    socket.addEventListener("message", this.handleMessage);
    socket.addEventListener("close", this.handleClose);
    socket.addEventListener("error", this.handleError);
  }

  private detachHandlers(socket: WebSocket): void {
    socket.removeEventListener("open", this.handleOpen);
    socket.removeEventListener("message", this.handleMessage);
    socket.removeEventListener("close", this.handleClose);
    socket.removeEventListener("error", this.handleError);
  }

  private flushQueue(): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }

    for (const data of this.sendQueue) {
      this.socket.send(data);
    }
    this.sendQueue = [];
  }

  private scheduleReconnect(): void {
    if (this.stopped) {
      return;
    }

    const delayMs = Math.min(
      BACKOFF_BASE_MS * 2 ** this.retryCount,
      BACKOFF_MAX_MS,
    );
    this.retryCount += 1;

    this.retryTimer = setTimeout(() => {
      this.openSocket();
    }, delayMs);
  }

  private clearRetryTimer(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // WebSocket event handlers (arrow functions to preserve `this`)
  // ---------------------------------------------------------------------------

  private handleOpen = (): void => {
    this.retryCount = 0;
    this.callbacks?.onStatusChange("online");
    this.flushQueue();
    this.callbacks?.onConnect?.();
  };

  private handleMessage = (event: MessageEvent): void => {
    const update = new Uint8Array(event.data as ArrayBuffer);
    this.callbacks?.onUpdate(update);
  };

  private handleClose = (): void => {
    if (this.stopped) {
      return;
    }

    this.callbacks?.onStatusChange("offline");
    this.scheduleReconnect();
  };

  private handleError = (): void => {
    // The "error" event is always followed by a "close" event, so we only
    // need to log here and let `handleClose` drive the reconnect logic.
    // Closing the socket explicitly ensures the "close" handler fires even
    // if the browser doesn't emit it automatically in some edge cases.
    if (this.socket) {
      this.socket.close();
    }
  };
}
