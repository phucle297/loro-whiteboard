import { LoroDoc as Doc, LoroMap, VersionVector } from "loro-crdt";

/**
 * Wrapper around the Loro CRDT document.
 *
 * Provides a simplified API surface for the rest of the application,
 * hiding direct dependency on the loro-crdt internals.
 */
export class LoroDoc {
  private doc: Doc;

  constructor() {
    this.doc = new Doc();
  }

  /** Get the root "shapes" LoroMap container. */
  getShapesMap(): LoroMap {
    return this.doc.getMap("shapes");
  }

  /** Import a binary update or snapshot from remote/storage. */
  import(data: Uint8Array): void {
    this.doc.import(data);
  }

  /** Export a full snapshot (for persistence). */
  exportSnapshot(): Uint8Array {
    return this.doc.export({ mode: "snapshot" });
  }

  /** Export updates since a given version vector (for incremental sync). */
  exportFrom(version?: VersionVector): Uint8Array {
    return this.doc.export({ mode: "update", from: version });
  }

  /** Get the current version vector. */
  version(): VersionVector {
    return this.doc.version();
  }

  /**
   * Commit pending changes and return just the new update bytes.
   *
   * Captures the version before commit so `exportFrom` returns only
   * the delta produced by this transaction.
   */
  commit(): Uint8Array {
    const prevVersion = this.doc.version();
    this.doc.commit();
    return this.doc.export({ mode: "update", from: prevVersion });
  }
}
