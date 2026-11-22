import { describe, it, expect } from "vitest";
import { validateSpec, renderSvg, renderPng } from "./index.js";

const spec = {
  title: "T",
  subtitle: "Sub",
  nodes: [
    { id: "u", label: "User", icon: "lu-user" },
    { id: "g", label: "Group", kind: "group", color: "#E7157B", border: "dashed", children: [{ id: "a", label: "A", icon: "lu-database", badge: 1 }] },
  ],
  edges: [{ from: "u", to: "a" }],
  notes: [{ target: "a", text: "n" }],
};

describe("look: official", () => {
  it("draws flat icons, outlined groups, square badges and a title rule", async () => {
    const r = validateSpec({ ...spec, look: "official" });
    expect(r.ok).toBe(true);
    const svg = await renderSvg(r.spec!, { static: true });
    expect(svg).toContain('class="dgm look-official"');
    expect(svg).toContain("stroke:#E7157B;stroke-dasharray:6 4");
    expect(svg).toContain('class="rule"');
    expect(svg).toContain('<rect x="-10" y="-10" width="20" height="20" rx="3"/>'); // badge
    expect(svg).not.toContain('class="badge t-'); // no tinted tile behind mono icons
    expect((await renderPng(r.spec!)).length).toBeGreaterThan(100);
  });
  it("is opt-in: the default look is unchanged", async () => {
    const svg = await renderSvg(validateSpec(spec).spec!, { static: true });
    expect(svg).not.toContain("look-official");
    expect(svg).toContain("<circle");
  });
  it("can be forced at render time", async () => {
    const svg = await renderSvg(validateSpec(spec).spec!, { static: true, look: "official" });
    expect(svg).toContain("look-official");
  });
  it("rejects a container colour that is not a #hex (it ends up in a style attribute)", () => {
    const bad = { ...spec, nodes: [{ id: "g", label: "G", color: 'red" onload="x', children: [{ id: "a", label: "A" }] }] };
    expect(validateSpec({ ...bad, look: "official" }).ok).toBe(false);
  });
});

describe("look: official — one connector per port", () => {
  it("several arrows into the same node end at different points on the icon", async () => {
    const r = validateSpec({
      look: "official",
      nodes: [
        { id: "a", label: "A", icon: "lu-user" },
        { id: "b", label: "B", icon: "lu-user" },
        { id: "c", label: "C", icon: "lu-user" },
        { id: "d", label: "D", icon: "lu-database" },
      ],
      edges: [{ from: "a", to: "d" }, { from: "b", to: "d" }, { from: "c", to: "d" }],
    });
    const svg = await renderSvg(r.spec!, { static: true });
    const ends = [...svg.matchAll(/<path class="line" d="[^"]*?([\d.]+) ([\d.]+)" marker-end/g)].map((m) => `${m[1]},${m[2]}`);
    expect(ends).toHaveLength(3);
    expect(new Set(ends).size).toBe(3);
  });
});
