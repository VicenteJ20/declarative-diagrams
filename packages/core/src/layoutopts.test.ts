import { describe, it, expect } from "vitest";
import { validateSpec, renderSvg, applyVariant } from "./index.js";

const base = {
  nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
  edges: [{ from: "a", to: "b" }],
  notes: [{ target: "a", text: "A note that is long enough to need wrapping across several lines of the list below." }],
};
const dims = (svg: string) => {
  const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg)!;
  return { w: Number(m[1]), h: Number(m[2]) };
};

describe("aspect, padding, notes position, variants", () => {
  const spec = validateSpec(base).spec!;

  it("letterboxes to the requested aspect ratio without distorting", async () => {
    for (const aspect of [16 / 9, 1, 0.5]) {
      const { w, h } = dims(await renderSvg(spec, { aspect }));
      expect(Math.abs(w / h - aspect)).toBeLessThan(0.02);
    }
  });

  it("padding grows the canvas on every side", async () => {
    const a = dims(await renderSvg(spec, { padding: 0 }));
    const b = dims(await renderSvg(spec, { padding: 10 }));
    expect(b.w).toBe(a.w + 20);
    expect(b.h).toBe(a.h + 20);
    // the default keeps a margin (16) so titles/notes never touch the edge
    const d = dims(await renderSvg(spec));
    expect(d.w).toBe(a.w + 32);
  });

  it("notesPosition: below puts notes under the diagram instead of a side gutter", async () => {
    const side = dims(await renderSvg(spec));
    const below = dims(await renderSvg({ ...spec, notesPosition: "below" }));
    expect(below.w).toBeLessThan(side.w);
    expect(below.h).toBeGreaterThan(side.h);
  });

  it("variants.narrow is opt-in and defaults to vertical + notes below", () => {
    expect(applyVariant(spec, "narrow")).toBeNull();
    const v = validateSpec({ ...base, variants: { narrow: {} } }).spec!;
    const n = applyVariant(v, "narrow")!;
    expect(n.direction).toBe("DOWN");
    expect(n.notesPosition).toBe("below");
    expect(v.direction).toBe("RIGHT"); // original untouched
  });

  it("rejects unknown variant names", () => {
    expect(validateSpec({ ...base, variants: { tiny: {} } }).ok).toBe(false);
  });
});

describe("variants.narrow patches", () => {
  it("un-stacks, relabels and hides nodes for the phone version", () => {
    const res = validateSpec(
      {
        direction: "RIGHT",
        variants: { narrow: { hide: ["c"], nodes: { b: { stackWith: null, label: "B2" } } } },
        nodes: [{ id: "a", label: "A" }, { id: "b", label: "B", stackWith: "a" }, { id: "c", label: "C" }],
        edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }],
        notes: [{ text: "x", target: "c" }],
        steps: [{ title: "s", show: ["a", "c", "b->c"] }, { title: "only c", show: ["c"] }],
      }
    );
    expect(res.ok).toBe(true);
    const v = applyVariant(res.spec!, "narrow")!;
    expect(v.direction).toBe("DOWN");
    expect(v.nodes.map((n) => n.id)).toEqual(["a", "b"]);
    expect(v.nodes[1].stackWith).toBeUndefined();
    expect(v.nodes[1].label).toBe("B2");
    expect(v.edges).toHaveLength(1);
    expect(v.notes).toHaveLength(0);
    expect(v.steps).toEqual([{ title: "s", show: ["a"] }]);
  });
});
