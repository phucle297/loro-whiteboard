# loro-whiteboard

A local-first collaborative whiteboard built with [tldraw](https://tldraw.dev), [Loro CRDT](https://loro.dev), and Next.js.

Open a board URL in multiple tabs or browsers to collaborate in real time. Edits are persisted locally in IndexedDB and synced via a lightweight WebSocket relay.

## Stack

| Concern | Library |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack dev) |
| Canvas | tldraw 4.x (library mode) |
| CRDT | loro-crdt 1.x (WASM) |
| IndexedDB | idb 8.x |
| WebSocket relay | ws (Node.js) |
| Package manager | pnpm |
| Testing | Vitest |

## Getting started

```sh
pnpm install
pnpm run dev:all   # Next.js on :3000 + WebSocket relay on :4000
```

Navigate to `http://localhost:3000` — you'll be redirected to a new board with a random UUID. Share the URL to collaborate.

## Commands

```sh
pnpm run dev:all      # Next.js + WS relay (concurrently)
pnpm run dev          # Next.js only
pnpm run dev:server   # WS relay only
pnpm test             # Vitest (24 tests)
pnpm test:watch       # Vitest watch mode
pnpm build            # Production build (uses webpack for WASM)
```

## Architecture

**Key invariant:** The Web Worker is the sole owner of the Loro CRDT document. The main thread never imports `loro-crdt`.

```
Main thread:  tldraw → ShapeAdapter → WorkerBridge → postMessage
Worker:       postMessage → loro.worker.ts → LoroDoc + SnapshotStore + WsClient
```

### Domain structure (`src/domains/`)

| Domain | Files | Responsibility |
|---|---|---|
| `canvas/` | `whiteboard.tsx`, `shape-adapter.ts`, `worker-bridge.ts` | tldraw mount, store↔worker bridge |
| `crdt/` | `loro-doc.ts`, `loro-codec.ts`, `loro.worker.ts` | CRDT ownership, encode/decode shapes |
| `sync/` | `ws-client.ts` | WebSocket connect/reconnect/backoff |
| `storage/` | `idb.ts`, `snapshot-store.ts` | IndexedDB persistence (debounced) |

### Message protocol

| Direction | Type | Payload |
|---|---|---|
| Main → Worker | `INIT` | `{ roomId }` |
| Main → Worker | `LOCAL_CHANGES` | `{ diff: TldrawShapeDiff }` |
| Main → Worker | `LOCAL_DELETE` | `{ ids: string[] }` |
| Worker → Main | `SNAPSHOT` | `{ shapes: TldrawShape[] }` |
| Worker → Main | `SYNC_STATUS` | `{ status: "online" \| "offline" \| "syncing" }` |

Remote updates currently send a full `SNAPSHOT` (not `REMOTE_PATCH`). The ShapeAdapter SNAPSHOT handler diffs against the current store and removes shapes no longer present.

### WebSocket relay (`server/index.ts`)

Stores the latest full snapshot per room in memory. Sends it to new joiners. Clients always send full snapshots so the server always has complete state.

## Data model

Each shape in the CRDT:

```
shapes[shapeId]: LoroMap { type, x, y, rotation, isLocked, opacity, parentId, index, props: LoroMap }
```

`opacity` is required by tldraw's record validator. Non-primitive `props` values are JSON-serialized.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:4000` | WebSocket relay URL |

## Known limitations

- Server is in-memory only — room state is lost on server restart.
- `REMOTE_PATCH` is wired but unused — remote updates send full `SNAPSHOT`.
- `pending-ops` IDB store is implemented but not flushed on reconnect (in-memory WsClient queue handles same-session offline).
- Single page per board (`parentId` defaults to `"page:page"`).
