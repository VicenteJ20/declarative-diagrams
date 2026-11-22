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
