import { describe, it, expect } from "vitest";
import { LoroDoc } from "./loro-doc";
import { LoroCodec } from "./loro-codec";

describe("LoroDoc", () => {
  it("starts with an empty shapes map", () => {
    const doc = new LoroDoc();
    const codec = new LoroCodec();
    expect(codec.decodeAll(doc)).toHaveLength(0);
  });

  it("commit returns a non-empty update when there are changes", () => {
    const doc = new LoroDoc();
    const codec = new LoroCodec();
    codec.encodeShape(doc, {
      id: "shape:1",
      type: "geo",
      x: 0,
      y: 0,
      rotation: 0,
      isLocked: false,
      parentId: undefined,
      index: "a1",
      props: {},
    });
    const update = doc.commit();
    expect(update).toBeInstanceOf(Uint8Array);
    expect(update.length).toBeGreaterThan(0);
  });

  it("exportSnapshot returns a Uint8Array that can be imported by another doc", () => {
    const doc = new LoroDoc();
    const snapshot = doc.exportSnapshot();
    expect(snapshot).toBeInstanceOf(Uint8Array);
    expect(snapshot.length).toBeGreaterThan(0);

    // Another fresh doc can import it without throwing
    const other = new LoroDoc();
    expect(() => other.import(snapshot)).not.toThrow();
  });

  it("snapshot import merges state into another doc", () => {
    const docA = new LoroDoc();
    const docB = new LoroDoc();
    const codec = new LoroCodec();

    codec.encodeShape(docA, {
      id: "shape:sync",
      type: "geo",
      x: 42,
      y: 0,
      rotation: 0,
      isLocked: false,
      parentId: undefined,
      index: "a1",
      props: {},
    });
    docA.commit();

    // Transfer full snapshot from A to B
    docB.import(docA.exportSnapshot());

    const shapes = codec.decodeAll(docB);
    expect(shapes).toHaveLength(1);
    expect(shapes[0].x).toBe(42);
  });

  it("exportFrom returns only the new changes after a commit", () => {
    const docA = new LoroDoc();
    const docB = new LoroDoc();
    const codec = new LoroCodec();

    // First change in A, import to B
    codec.encodeShape(docA, {
      id: "shape:1",
      type: "geo",
      x: 0,
      y: 0,
      rotation: 0,
      isLocked: false,
      parentId: undefined,
      index: "a1",
      props: {},
    });
    const firstUpdate = docA.commit();
    docB.import(firstUpdate);

    // Capture B's version, then add more to A
    const versionAfterFirst = docB.version();
    codec.encodeShape(docA, {
      id: "shape:2",
      type: "text",
      x: 100,
      y: 100,
      rotation: 0,
      isLocked: false,
      parentId: undefined,
      index: "a2",
      props: {},
    });
    docA.commit();

    // Export only changes since B's version
    const delta = docA.exportFrom(versionAfterFirst);
    docB.import(delta);

    expect(codec.decodeAll(docB)).toHaveLength(2);
  });
});
