import { describe, it, expect } from "vitest";
import { validateSpec, renderSvg, layoutSpec, registerTheme, resolveTheme } from "./index.js";

const two = (extra: Record<string, unknown> = {}) =>
  validateSpec({
    direction: "RIGHT",
    nodes: [
      { id: "a", label: "Alpha service", icon: "lu-database", variant: "stacked" },
      { id: "b", label: "Beta", icon: "lu-server", variant: "stacked" },
    ],
    edges: [{ from: "a", to: "b", label: "calls" }],
    ...extra,
  }).spec!;

const lineEnds = (svg: string) => {
  const d = /<path class="line" d="([^"]+)"/.exec(svg)![1];
  const nums = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  return { x0: nums[0], y0: nums[1], x1: nums[nums.length - 2], y1: nums[nums.length - 1] };
};

describe("arrows meet the icon of stacked nodes", () => {
  it("start/end at the icon edge (5px gap), not at the wider node box", async () => {
    const spec = two();
    const lay = await layoutSpec(spec);
    const a = lay.nodes.find((n) => n.id === "a")!;
    const b = lay.nodes.find((n) => n.id === "b")!;
    const svg = await renderSvg(spec, { padding: 0 });
    const { x0, x1 } = lineEnds(svg);
    expect(a.w).toBeGreaterThan(60); // the box is wider than the 40px icon…
    expect(x0).toBeCloseTo(a.x + a.w / 2 + 20 + 5, 0); // …but the arrow leaves from the icon's right edge
    expect(x1).toBeCloseTo(b.x + b.w / 2 - 20 - 5, 0); // and arrives at the icon's left edge
    expect(x1 - x0).toBeGreaterThan(40); // visibly long
  });

  it("card nodes keep the box edge", async () => {
    const spec = two({ nodes: [{ id: "a", label: "A", icon: "lu-database" }, { id: "b", label: "B", icon: "lu-server" }] });
    const lay = await layoutSpec(spec);
    const a = lay.nodes.find((n) => n.id === "a")!;
    const { x0 } = lineEnds(await renderSvg(spec, { padding: 0 }));
    expect(x0).toBeCloseTo(a.x + a.w, 0);
  });

  it("stacked diagrams get more room between layers", async () => {
    const stacked = await layoutSpec(two());
    const card = await layoutSpec(two({ nodes: [{ id: "a", label: "Alpha service", icon: "lu-database" }, { id: "b", label: "Beta", icon: "lu-server" }] }));
    const gap = (l: typeof stacked) => l.nodes.find((n) => n.id === "b")!.x - (l.nodes.find((n) => n.id === "a")!.x + l.nodes.find((n) => n.id === "a")!.w);
    expect(gap(stacked)).toBeGreaterThanOrEqual(gap(card));
  });
});

describe("margins", () => {
  it("title and content are inset from the canvas edge by default", async () => {
    const svg = await renderSvg(two({ title: "T" }));
    expect(svg).toMatch(/<g transform="translate\(16 16\)">/);
  });
});

describe("font", () => {
  const css = async (font?: "mixed" | "sans" | "serif", o: Record<string, unknown> = {}) => renderSvg(two(o), { font });

  it("mixed (default): sans labels, serif notes; sans/serif switch the whole diagram", async () => {
    const mixed = await css();
    expect(mixed).toContain("var(--dgm-sans,'Segoe UI'");
    expect(mixed).toContain("var(--dgm-serif,Georgia");
    const sans = await css("sans");
    expect(sans).toContain("var(--dgm-serif,'Segoe UI'"); // notes/title now use the sans face
    const serif = await css("serif");
    expect(serif).toContain("var(--dgm-sans,Georgia"); // labels now use the serif face
  });

  it("precedence: option > spec > theme", async () => {
    registerTheme({ name: "font-test", extends: "distill", font: "serif" });
    expect(resolveTheme("font-test").font).toBe("serif");
    expect(await renderSvg(two(), { theme: "font-test" })).toContain("var(--dgm-sans,Georgia");
    expect(await renderSvg(two({ font: "sans" }), { theme: "font-test" })).toContain("var(--dgm-serif,'Segoe UI'");
    expect(await renderSvg(two({ font: "sans" }), { theme: "font-test", font: "serif" })).toContain("var(--dgm-sans,Georgia");
  });

  it("static output uses literal font families", async () => {
    const svg = await renderSvg(two(), { static: true, font: "serif" });
    expect(svg).not.toContain("var(--");
    expect(svg).toContain("font-family:Georgia");
  });

  it("validates the value", () => {
    expect(validateSpec({ font: "comic", nodes: [{ id: "a", label: "A" }] }).ok).toBe(false);
  });
});
