# CLAUDE.md — loro-whiteboard

Standalone local-first collaborative whiteboard. **Not part of the gameweb monorepo.**

## Stack

| Concern | Library |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack dev) |
| Canvas | tldraw 4.x (library mode) |
| CRDT | loro-crdt 1.x (WASM) |
| IndexedDB | idb 8.x |
| WebSocket server | ws (Node.js, `server/`) |
| Package manager | pnpm |
| Testing | Vitest |

## Commands

```sh
pnpm install
pnpm run dev:all      # Next.js :3000 + WS relay :4000 (concurrently)
pnpm run dev          # Next.js only
pnpm run dev:server   # WS relay only
pnpm test             # Vitest (24 tests)
pnpm test:watch       # Vitest watch mode
pnpm build            # Production build (uses webpack for WASM)
```

## Architecture

**Key invariant:** The Web Worker is the sole owner of the Loro CRDT doc. The main thread never imports `loro-crdt`.

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

Main → Worker: `INIT { roomId }`, `LOCAL_CHANGES { diff }`, `LOCAL_DELETE { ids }`
Worker → Main: `SNAPSHOT { shapes }`, `REMOTE_PATCH { diff }` *(reserved)*, `SYNC_STATUS { status }`

Remote updates currently send a full `SNAPSHOT` (not `REMOTE_PATCH`). The ShapeAdapter SNAPSHOT handler diffs against the current store and removes shapes no longer present.

### WebSocket relay (`server/index.ts`)

Stores the latest full snapshot per room in memory. Sends it to new joiners. Clients always send full snapshots (not deltas) so the server always has complete state.

## Data model

Each shape in the CRDT:
```
shapes[shapeId]: LoroMap { type, x, y, rotation, isLocked, opacity, parentId, index, props: LoroMap }
```

`opacity` is required by tldraw's record validator. Non-primitive `props` values are JSON-serialized.

## Code conventions

- **Filenames:** kebab-case. Components: PascalCase.
- **Types:** strict mode, no `any` except tldraw record casts in shape-adapter.
- **Worker boundary:** all types crossing `postMessage` must be structured-cloneable (no class instances). See `src/types/shape.ts`.
- **No tldraw imports in the worker** — `src/domains/crdt/` must not import from `tldraw`.

## Known limitations

- `REMOTE_PATCH` is wired but unused — remote updates send full `SNAPSHOT`.
- `pending-ops` IDB store is implemented but not flushed on reconnect (in-memory WsClient queue handles same-session offline).
- Server is in-memory only — room state lost on server restart.
- Single page per board (`parentId` defaults to `"page:page"`).
