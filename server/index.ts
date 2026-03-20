import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { parse } from "url";

const PORT = 4000;
const server = createServer();
const wss = new WebSocketServer({ server });

// In-memory state
const rooms = new Map<string, Set<WebSocket>>();  // room → connected clients
const snapshots = new Map<string, Uint8Array>();  // room → latest Loro snapshot

wss.on("connection", (ws, req) => {
  const { query } = parse(req.url ?? "", true);
  const roomId = String(query.room ?? "default");

  // Add to room
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  rooms.get(roomId)!.add(ws);

  // Send existing snapshot to new peer
  const snapshot = snapshots.get(roomId);
  if (snapshot) {
    ws.send(snapshot);
  }

  ws.on("message", (data) => {
    const update =
      Buffer.isBuffer(data)
        ? new Uint8Array(data)
        : new Uint8Array(data as ArrayBuffer);

    // Update stored snapshot - for simplicity, store as the latest binary.
    // In a real app, you'd merge the Loro docs. For this demo, we store the latest update.
    snapshots.set(roomId, update);

    // Broadcast to all other peers in the room
    const clients = rooms.get(roomId);
    if (clients) {
      for (const client of clients) {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(update);
        }
      }
    }
  });

  ws.on("close", () => {
    rooms.get(roomId)?.delete(ws);
    if (rooms.get(roomId)?.size === 0) {
      rooms.delete(roomId);
      // Keep snapshot in memory for late joiners
    }
  });

  ws.on("error", (err) => {
    console.error(`[ws] error in room ${roomId}:`, err.message);
  });
});

server.listen(PORT, () => {
  console.log(`[ws-server] listening on ws://localhost:${PORT}`);
});
