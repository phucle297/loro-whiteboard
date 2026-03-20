import { describe, it, expect, beforeEach } from "vitest";
import { LoroDoc } from "./loro-doc";
import { LoroCodec } from "./loro-codec";
import type { TldrawShape, TldrawShapeDiff } from "../../types/shape";

const makeShape = (overrides: Partial<TldrawShape> = {}): TldrawShape => ({
  id: "shape:1",
  type: "geo",
  x: 100,
  y: 200,
  rotation: 0,
  isLocked: false,
  parentId: undefined,
  index: "a1",
  props: { w: 120, h: 80, color: "blue" },
  ...overrides,
});

describe("LoroCodec", () => {
  let doc: LoroDoc;
  let codec: LoroCodec;

  beforeEach(() => {
    doc = new LoroDoc();
    codec = new LoroCodec();
  });

  describe("encodeShape + decodeAll roundtrip", () => {
    it("roundtrips a basic shape", () => {
      const shape = makeShape();
      codec.encodeShape(doc, shape);
      doc.commit();

      const decoded = codec.decodeAll(doc);
      expect(decoded).toHaveLength(1);
      expect(decoded[0]).toMatchObject({
        id: "shape:1",
        type: "geo",
        x: 100,
        y: 200,
        rotation: 0,
        isLocked: false,
        index: "a1",
      });
    });

    it("preserves undefined parentId as undefined (not empty string)", () => {
      codec.encodeShape(doc, makeShape({ parentId: undefined }));
      doc.commit();
      const [s] = codec.decodeAll(doc);
      expect(s.parentId).toBeUndefined();
    });

    it("preserves a defined parentId", () => {
      codec.encodeShape(doc, makeShape({ parentId: "page:abc" }));
      doc.commit();
      const [s] = codec.decodeAll(doc);
      expect(s.parentId).toBe("page:abc");
    });

    it("serialises object props and deserialises them back", () => {
      const props = { style: { color: "red", size: 3 }, points: [1, 2, 3] };
      codec.encodeShape(doc, makeShape({ props }));
      doc.commit();
      const [s] = codec.decodeAll(doc);
      expect(s.props.style).toEqual({ color: "red", size: 3 });
      expect(s.props.points).toEqual([1, 2, 3]);
    });

    it("keeps primitive props as-is", () => {
      const props = { w: 200, h: 100, hidden: true, label: "hello" };
      codec.encodeShape(doc, makeShape({ props }));
      doc.commit();
      const [s] = codec.decodeAll(doc);
      expect(s.props.w).toBe(200);
      expect(s.props.h).toBe(100);
      expect(s.props.hidden).toBe(true);
      expect(s.props.label).toBe("hello");
    });

    it("encodes multiple shapes", () => {
      codec.encodeShape(doc, makeShape({ id: "shape:1" }));
      codec.encodeShape(doc, makeShape({ id: "shape:2", x: 300 }));
      codec.encodeShape(doc, makeShape({ id: "shape:3", type: "text" }));
      doc.commit();

      const shapes = codec.decodeAll(doc);
      expect(shapes).toHaveLength(3);
      const ids = shapes.map((s) => s.id).sort();
      expect(ids).toEqual(["shape:1", "shape:2", "shape:3"]);
    });
  });

  describe("applyDiff", () => {
    it("adds new shapes", () => {
      const diff: TldrawShapeDiff = {
        added: [makeShape({ id: "shape:a" }), makeShape({ id: "shape:b" })],
        updated: [],
      };
      codec.applyDiff(doc, diff);
      doc.commit();

      const shapes = codec.decodeAll(doc);
      expect(shapes).toHaveLength(2);
    });

    it("updates existing shapes (uses after state)", () => {
      const before = makeShape({ x: 0, y: 0 });
      const after = makeShape({ x: 50, y: 75 });
      codec.encodeShape(doc, before);
      doc.commit();

      codec.applyDiff(doc, { added: [], updated: [[before, after]] });
      doc.commit();

      const [s] = codec.decodeAll(doc);
      expect(s.x).toBe(50);
      expect(s.y).toBe(75);
    });
  });

  describe("removeShapes", () => {
    it("removes a shape by id", () => {
      codec.encodeShape(doc, makeShape({ id: "shape:keep" }));
      codec.encodeShape(doc, makeShape({ id: "shape:remove" }));
      doc.commit();

      codec.removeShapes(doc, ["shape:remove"]);
      doc.commit();

      const shapes = codec.decodeAll(doc);
      expect(shapes).toHaveLength(1);
      expect(shapes[0].id).toBe("shape:keep");
    });

    it("is a no-op for non-existent ids", () => {
      codec.encodeShape(doc, makeShape());
      doc.commit();

      expect(() => codec.removeShapes(doc, ["shape:ghost"])).not.toThrow();
      expect(codec.decodeAll(doc)).toHaveLength(1);
    });
  });
});
