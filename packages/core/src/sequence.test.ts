import { describe, it, expect } from "vitest";
import { buildSequence, validateSpec, renderSvg } from "./index.js";

const edges = [
  { id: "a->b", from: "a", to: "b" },
  { id: "b->c", from: "b", to: "c" },
  { id: "a->c", from: "a", to: "c" },
];

describe("buildSequence", () => {
  it("layers nodes along the arrows and attaches each edge to the node it arrives at", () => {
    expect(buildSequence(["a", "b", "c"], edges)).toEqual([["a"], ["b", "a->b"], ["c", "b->c", "a->c"]]);
  });
  it("survives cycles", () => {
    const seq = buildSequence(["a", "b"], [{ id: "a->b", from: "a", to: "b" }, { id: "b->a", from: "b", to: "a" }]);
    expect(seq.flat().sort()).toEqual(["a", "a->b", "b", "b->a"]);
  });
  it("honours an explicit sequence (lists are lit together, unlisted nodes go last)", () => {
    expect(buildSequence(["a", "b", "c", "d"], [], [["b", "a"], "c"])).toEqual([["a", "b"], ["c", "d"]]);
  });
});

describe("steps in the exported SVG", () => {
  it("embeds the reveal order in data-steps", async () => {
    const res = validateSpec({
      nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
      edges: [{ from: "a", to: "b" }],
      steps: [{ title: "s", show: ["a", "b"] }],
    });
    expect(res.ok).toBe(true);
    const svg = await renderSvg(res.spec!);
    expect(svg).toContain('"seq":[["a"],["b","a->b"]]');
  });
  it("rejects an unknown id in sequence", () => {
    const res = validateSpec({ nodes: [{ id: "a", label: "A" }], steps: [{ title: "s", show: ["a"], sequence: ["zzz"] }] });
    expect(res.ok).toBe(false);
  });
});
