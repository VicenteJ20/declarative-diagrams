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

describe("stackWith (same step, across the flow)", () => {
  const base = (dir: "RIGHT" | "DOWN", extra: Record<string, unknown> = {}) =>
    validateSpec({
      direction: dir,
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
        { id: "c", label: "C" },
        { id: "d", label: "D", stackWith: "b" },
      ],
      edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "b", to: "d", label: "x" }],
      ...extra,
    }).spec!;
  const get = (l: Awaited<ReturnType<typeof layoutSpec>>, id: string) => l.nodes.find((n) => n.id === id)!;

  it("RIGHT flow: the node sits below its anchor, centred, and the row stays aligned", async () => {
    const l = await layoutSpec(base("RIGHT"));
    const b = get(l, "b");
    const d = get(l, "d");
    expect(d.y).toBeGreaterThan(b.y + b.h);
    expect(Math.abs(d.x + d.w / 2 - (b.x + b.w / 2))).toBeLessThan(1);
    expect(get(l, "c").x).toBeGreaterThan(b.x + b.w); // the flow continues to the right
    // a -> b ends and b -> c starts on b's centre line (no steps in the main row)
    const e1 = l.edges.find((e) => e.id === "a->b")!;
    const e2 = l.edges.find((e) => e.id === "b->c")!;
    expect(e1.points[e1.points.length - 1].y).toBeCloseTo(b.y + b.h / 2, 0);
    expect(e2.points[0].y).toBeCloseTo(b.y + b.h / 2, 0);
  });

  it("the internal edge is a straight vertical arrow between the two with its label", async () => {
    const l = await layoutSpec(base("RIGHT"));
    const e = l.edges.find((x) => x.id === "b->d")!;
    expect(e.points).toHaveLength(2);
    expect(e.points[0].x).toBeCloseTo(e.points[1].x, 0);
    expect(e.points[1].y).toBeGreaterThan(e.points[0].y + 30);
    expect(e.label?.text).toBe("x");
  });

  it("is narrower than the same graph without the stack", async () => {
    const plain = validateSpec({
      nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }, { id: "d", label: "D" }],
      edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "b", to: "d" }],
    }).spec!;
    // chain a -> b -> c -> d is 4 layers wide when d is a sibling target of b? (b->d puts d in the layer after b)
    const wide = await layoutSpec({ ...plain, edges: [{ from: "a", to: "b", style: "solid", flow: false, both: false }, { from: "b", to: "c", style: "solid", flow: false, both: false }, { from: "c", to: "d", style: "solid", flow: false, both: false }] });
    const stacked = await layoutSpec(base("RIGHT"));
    expect(stacked.width).toBeLessThan(wide.width);
  });

  it("DOWN flow: stacks beside the anchor instead", async () => {
    const l = await layoutSpec(base("DOWN"));
    const b = get(l, "b");
    const d = get(l, "d");
    expect(d.x).toBeGreaterThan(b.x + b.w);
    expect(Math.abs(d.y + d.h / 2 - (b.y + b.h / 2))).toBeLessThan(1);
  });

  it("stacks of three keep order, and an edge to a lower member enters that member", async () => {
    const s = validateSpec({
      nodes: [{ id: "x", label: "X" }, { id: "p", label: "P" }, { id: "q", label: "Q", stackWith: "p" }, { id: "r", label: "R", stackWith: "q" }],
      edges: [{ from: "x", to: "r" }, { from: "p", to: "r", label: "skip" }],
    }).spec!;
    const l = await layoutSpec(s);
    const [p, q, r] = ["p", "q", "r"].map((id) => get(l, id));
    expect(p.y).toBeLessThan(q.y);
    expect(q.y).toBeLessThan(r.y);
    const into = l.edges.find((e) => e.id === "x->r")!;
    const last = into.points[into.points.length - 1];
    expect(last.y).toBeCloseTo(r.y + r.h / 2, 0);
    expect(last.x).toBeCloseTo(r.x, 0);
    expect(l.edges.find((e) => e.id === "p->r")!.points.length).toBe(4); // non-adjacent: a bracket on the outside
  });

  it("validation: unknown / self / cross-parent / container / cycle", () => {
    const v = (nodes: unknown[]) => validateSpec({ nodes }).errors.join("\n");
    expect(v([{ id: "a", label: "A", stackWith: "zzz" }])).toMatch(/must be a sibling/);
    expect(v([{ id: "a", label: "A", stackWith: "a" }])).toMatch(/itself/);
    expect(v([{ id: "g", label: "G", children: [{ id: "a", label: "A" }] }, { id: "b", label: "B", stackWith: "a" }])).toMatch(/sibling/);
    expect(v([{ id: "g", label: "G", children: [{ id: "a", label: "A" }] }, { id: "b", label: "B", stackWith: "g" }])).toMatch(/only leaf/);
    expect(v([{ id: "a", label: "A", stackWith: "b" }, { id: "b", label: "B", stackWith: "a" }])).toMatch(/cycle/);
  });

  it("works inside containers", async () => {
    const s = validateSpec({
      nodes: [{ id: "g", label: "G", children: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C", stackWith: "b" }] }],
      edges: [{ from: "a", to: "b" }],
    }).spec!;
    const l = await layoutSpec(s);
    const g = get(l, "g");
    const c = get(l, "c");
    expect(c.x).toBeGreaterThanOrEqual(g.x);
    expect(c.y + c.h).toBeLessThanOrEqual(g.y + g.h);
    expect(c.parent).toBe("g");
  });
});

describe("badges and legend", () => {
  it("badge draws a marker inside the node group (also for stacked icons)", async () => {
    const s = validateSpec({ nodes: [{ id: "a", label: "A", badge: 3 }, { id: "b", label: "B", icon: "lu-database", variant: "stacked", badge: "x" }] }).spec!;
    const svg = await renderSvg(s);
    expect(svg).toMatch(/<g class="el node"[^>]*>.*?class="mark bdg".*?<text[^>]*>3<\/text>/s);
    expect(svg).toMatch(/class="el node stacked"[^>]*>.*?class="mark bdg".*?<text[^>]*>x<\/text>/s);
  });

  it("legend adds a compact key under the diagram", async () => {
    const plain = validateSpec({ nodes: [{ id: "a", label: "A" }] }).spec!;
    const withLegend = validateSpec({ nodes: [{ id: "a", label: "A" }], legend: [{ style: "solid", label: "Inside" }, { style: "dashed", label: "Optional" }] }).spec!;
    const a = await renderSvg(plain);
    const b = await renderSvg(withLegend);
    expect(b).toContain('class="legend"');
    expect(b).toContain(">Optional<");
    expect(b).toMatch(/legend-item dashed/);
    const h = (svg: string) => Number(/viewBox="0 0 [\d.]+ ([\d.]+)"/.exec(svg)![1]);
    expect(h(b)).toBe(h(a) + 36);
  });
});

describe("default theme from dgm.config.json", () => {
  it("applies when nothing else names a theme, and resets for a project without it", async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { loadConfig, resolveTheme } = await import("./index.js");
    const proj = mkdtempSync(join(tmpdir(), "dgm-cfg-"));
    const other = mkdtempSync(join(tmpdir(), "dgm-cfg-none-"));
    mkdirSync(join(proj, "themes"));
    writeFileSync(join(proj, "themes", "brand.theme.yaml"), "name: brand-cfg\nextends: distill\nlight:\n  accent: '#123456'\n");
    writeFileSync(join(proj, "dgm.config.json"), JSON.stringify({ themes: ["themes/*.theme.yaml"], theme: "brand-cfg" }));
    const spec = validateSpec({ nodes: [{ id: "a", label: "A" }] }).spec!;

    loadConfig(proj);
    expect(await renderSvg(spec, { static: true })).toContain("#123456");
    // explicit theme (option or spec) still wins
    expect(await renderSvg(spec, { static: true, theme: "olive" })).not.toContain("#123456");
    expect(await renderSvg({ ...spec, theme: "olive" }, { static: true })).not.toContain("#123456");

    loadConfig(other); // another project without a config: back to distill
    expect(await renderSvg(spec, { static: true })).not.toContain("#123456");
    expect(resolveTheme("brand-cfg").light.accent).toBe("#123456"); // still registered, just not the default
    rmSync(proj, { recursive: true, force: true });
    rmSync(other, { recursive: true, force: true });
  });
});
