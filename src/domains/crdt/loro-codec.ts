import { LoroMap } from "loro-crdt";
import { LoroDoc } from "./loro-doc";
import type { TldrawShape, TldrawShapeDiff } from "../../types/shape";

/**
 * Encodes/decodes TldrawShape data to/from LoroMap entries.
 *
 * LoroMap structure per shape:
 * ```
 * shapes[shapeId] = LoroMap {
 *   type: string
 *   x: number
 *   y: number
 *   rotation: number
 *   isLocked: boolean
 *   parentId: string  (empty string when undefined)
 *   props: LoroMap { ...serialised prop values }
 * }
 * ```
 */
export class LoroCodec {
  /** Encode a single shape into the doc's shapes map. */
  encodeShape(doc: LoroDoc, shape: TldrawShape): void {
    const shapesMap = doc.getShapesMap();
    const shapeMap = shapesMap.getOrCreateContainer(
      shape.id,
      new LoroMap(),
    );

    shapeMap.set("type", shape.type);
    shapeMap.set("x", shape.x);
    shapeMap.set("y", shape.y);
    shapeMap.set("rotation", shape.rotation);
    shapeMap.set("isLocked", shape.isLocked);
    shapeMap.set("parentId", shape.parentId ?? "");
    shapeMap.set("index", shape.index ?? "a1");

    const propsMap = shapeMap.getOrCreateContainer("props", new LoroMap());
    for (const [key, value] of Object.entries(shape.props)) {
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        propsMap.set(key, value);
      } else {
        // Non-primitive props are JSON-serialised for safe storage.
        propsMap.set(key, JSON.stringify(value));
      }
    }
  }

  /** Decode all shapes from the doc into a TldrawShape array. */
  decodeAll(doc: LoroDoc): TldrawShape[] {
    const shapesMap = doc.getShapesMap();
    const shapes: TldrawShape[] = [];

    for (const id of shapesMap.keys()) {
      const shapeMap = shapesMap.get(id as string) as LoroMap | undefined;
      if (!shapeMap) continue;

      const propsContainer = shapeMap.get("props");
      const rawProps: Record<string, unknown> =
        propsContainer && typeof propsContainer === "object" && "toJSON" in propsContainer
          ? (propsContainer as LoroMap).toJSON()
          : {};

      // Attempt to JSON-parse string prop values that were serialised.
      const props: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(rawProps)) {
        if (typeof value === "string") {
          try {
            const parsed: unknown = JSON.parse(value);
            // Only use parsed result for objects/arrays; plain strings
            // that happen to be valid JSON (e.g. `"hello"`) stay as-is.
            if (typeof parsed === "object" && parsed !== null) {
              props[key] = parsed;
              continue;
            }
          } catch {
            // Not valid JSON — use raw string.
          }
        }
        props[key] = value;
      }

      const parentIdRaw = shapeMap.get("parentId") as string;

      shapes.push({
        id: id as string,
        type: shapeMap.get("type") as string,
        x: shapeMap.get("x") as number,
        y: shapeMap.get("y") as number,
        rotation: shapeMap.get("rotation") as number,
        isLocked: shapeMap.get("isLocked") as boolean,
        parentId: parentIdRaw === "" ? undefined : parentIdRaw,
        index: (shapeMap.get("index") as string) ?? "a1",
        props,
      });
    }

    return shapes;
  }

  /**
   * Apply a diff (added + updated shapes) to the doc.
   *
   * For updated shapes, the second element of each tuple (the "after" state)
   * is written into the CRDT.
   */
  applyDiff(doc: LoroDoc, diff: TldrawShapeDiff): void {
    for (const shape of diff.added) {
      this.encodeShape(doc, shape);
    }
    for (const [, after] of diff.updated) {
      this.encodeShape(doc, after);
    }
  }

  /** Remove shapes by id from the doc. */
  removeShapes(doc: LoroDoc, ids: string[]): void {
    const shapesMap = doc.getShapesMap();
    for (const id of ids) {
      shapesMap.delete(id);
    }
  }
}
