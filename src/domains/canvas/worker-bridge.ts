import type {
  MainToWorkerMessage,
  WorkerToMainMessage,
} from "@/types/message";

type MessageHandler<T extends WorkerToMainMessage["type"]> = (
  msg: Extract<WorkerToMainMessage, { type: T }>,
) => void;

export class WorkerBridge {
  private worker: Worker;
  private handlers: Map<string, MessageHandler<any>>;

  constructor(worker: Worker) {
    this.worker = worker;
    this.handlers = new Map();
    this.worker.onmessage = (e: MessageEvent<WorkerToMainMessage>) => {
      const handler = this.handlers.get(e.data.type);
      if (handler) handler(e.data as any);
    };
  }

  post(msg: MainToWorkerMessage): void {
    this.worker.postMessage(msg);
  }

  on<T extends WorkerToMainMessage["type"]>(
    type: T,
    handler: MessageHandler<T>,
  ): void {
    this.handlers.set(type, handler as any);
  }

  off(type: WorkerToMainMessage["type"]): void {
    this.handlers.delete(type);
  }

  terminate(): void {
    this.worker.terminate();
  }
}
