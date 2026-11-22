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

import { checkConnections } from "./diagnostics.js";
import { layoutSpec } from "./layout.js";

describe("house style warnings", () => {
  it("asks for look: official on AWS diagrams and look: azure on Azure diagrams", () => {
    const aws = validateSpec({ nodes: [{ id: "a", label: "A", icon: "aws-lambda" }] }, { missingIcons: "warn" });
    expect(aws.warnings.join()).toMatch(/look: official/);
    const az = validateSpec({ nodes: [{ id: "a", label: "A", kind: "azure.subscription", children: [{ id: "b", label: "B" }] }] });
    expect(az.warnings.join()).toMatch(/look: azure/);
    const ok = validateSpec({ look: "official", nodes: [{ id: "a", label: "A", icon: "aws-lambda" }] }, { missingIcons: "warn" });
    expect(ok.warnings.join()).not.toMatch(/look: official/);
  });
});

describe("azure look", () => {
  const spec = {
    look: "azure",
    nodes: [
      { id: "u", label: "User", icon: "lu-user" },
      {
        id: "sub", label: "Subscription", kind: "azure.subscription",
        children: [{ id: "vnet", label: "Virtual network", kind: "azure.vnet", children: [{ id: "sn", label: "Subnet", kind: "azure.subnet", children: [{ id: "a", label: "App", icon: "lu-server", badge: 2 }] }] }],
      },
    ],
    edges: [{ from: "u", to: "a" }],
  };
  it("draws grey filled subnets, dotted vnets and green round badges", async () => {
    const r = validateSpec(spec);
    expect(r.ok).toBe(true);
    const svg = await renderSvg(r.spec!, { static: true });
    expect(svg).toContain("look-azure");
    expect(svg).toContain("stroke-dasharray:2 3"); // dotted vnet
    expect(svg).toContain("fill:#767676;fill-opacity:.12;stroke:none"); // filled subnet
    expect(svg).toMatch(/<circle r="11"\/><text y="3.8">2/); // round badge
    expect(svg).not.toMatch(/rx="3"\/><text y="3.8">2/);
  });
});

describe("connection check", () => {
  const ok = (nodes: any[], edges: any[], look = "official") => validateSpec({ look, nodes, edges }, { missingIcons: "warn" }).spec!;
  it("a fan-out/fan-in diagram has no connector through a node and no overlapping arrowheads", async () => {
    const nodes = ["a", "b", "c", "d", "e", "f"].map((id) => ({ id, label: id.toUpperCase(), icon: "lu-server" }));
    const spec = ok(nodes, [
      { from: "a", to: "b" }, { from: "a", to: "c" }, { from: "a", to: "d" },
      { from: "b", to: "e" }, { from: "c", to: "e" }, { from: "d", to: "e" }, { from: "e", to: "f" }, { from: "a", to: "f" },
    ]);
    expect(checkConnections(await layoutSpec(spec))).toEqual([]);
  });
  it("reports a connector that crosses a node and two arrowheads on one point", () => {
    const n = (id: string, x: number, y: number, extra: object = {}) => ({ id, spec: { id, label: id }, x, y, w: 60, h: 60, depth: 0, container: false, ...extra });
    const layout = {
      width: 400, height: 200,
      nodes: [n("a", 0, 0), n("b", 200, 0), n("mid", 100, 0)],
      edges: [
        { id: "a->b", from: "a", to: "b", points: [{ x: 60, y: 30 }, { x: 200, y: 30 }] },
        { id: "x->b", from: "a", to: "b", points: [{ x: 60, y: 100 }, { x: 200, y: 30 }] },
      ],
    };
    const issues = checkConnections(layout as any);
    expect(issues.join("\n")).toMatch(/a->b runs through node "mid"/);
    expect(issues.join("\n")).toMatch(/end on the same point/);
  });
});

describe("compact layout (vendor looks)", () => {
  const icon = (id: string, extra: object = {}) => ({ id, label: id.toUpperCase(), icon: "lu-server", ...extra });
  const chain = (labels: boolean) =>
    validateSpec({
      look: "azure",
      nodes: [icon("a"), icon("b"), icon("c"), icon("d")],
      edges: [["a", "b"], ["b", "c"], ["c", "d"]].map(([from, to]) => ({ from, to, ...(labels ? { label: "connector label" } : {}) })),
    }).spec!;

  it("edge labels never overlap an icon or each other, and cost at most one capped gap per column", async () => {
    const without = await layoutSpec(chain(false));
    const withLabels = await layoutSpec(chain(true));
    expect(withLabels.width).toBeLessThanOrEqual(without.width + 3 * 60); // 4 nodes = 3 gaps, each widened by at most 100 - 44
    expect(checkConnections(withLabels, { labels: true })).toEqual([]);
  });

  it("placement left / right pins nodes to the first / last column", async () => {
    const spec = validateSpec({
      look: "official",
      nodes: [
        icon("user", { placement: "left" }),
        icon("docs", { placement: "left" }),
        { id: "cloud", label: "Cloud", kind: "cloud", children: [icon("front"), icon("app"), icon("db")] },
        icon("idp", { placement: "right" }),
      ],
      edges: [{ from: "user", to: "front" }, { from: "docs", to: "db" }, { from: "front", to: "app" }, { from: "app", to: "db" }, { from: "app", to: "idp", style: "dashed" }],
    }).spec!;
    const l = await layoutSpec(spec);
    const x = (id: string) => l.nodes.find((n) => n.id === id)!;
    const cloud = x("cloud");
    expect(x("user").x + x("user").w).toBeLessThanOrEqual(cloud.x + 1);
    expect(x("docs").x + x("docs").w).toBeLessThanOrEqual(cloud.x + 1);
    expect(x("idp").x).toBeGreaterThanOrEqual(cloud.x + cloud.w - 1);
    expect(checkConnections(l, { labels: true })).toEqual([]);
  });

  it("space budget: icons plus the left rail leave little empty canvas on a typical landing zone", async () => {
    const spec = validateSpec({
      look: "azure",
      nodes: [
        icon("users", { placement: "left" }),
        icon("front"),
        { id: "tenant", label: "tenant", kind: "azure.tenant", children: [
          { id: "sub", label: "sub", kind: "azure.subscription", children: [
            { id: "vnet", label: "vnet", kind: "azure.vnet", children: [{ id: "sn", label: "snet", kind: "azure.subnet", children: [icon("apim"), icon("app", { stackWith: undefined })] }] },
            icon("db"),
          ] },
        ] },
      ],
      edges: [
        { from: "users", to: "front", label: "HTTPS" }, { from: "front", to: "apim", label: "Private Link" },
        { from: "apim", to: "app" }, { from: "app", to: "db", label: "SQL" },
      ],
    }).spec!;
    const l = await layoutSpec(spec);
    const tenant = l.nodes.find((n) => n.id === "tenant")!;
    const u = l.nodes.find((n) => n.id === "users")!;
    const fr = l.nodes.find((n) => n.id === "front")!;
    // only the two actor columns (plus one layer gap each) stand before the first container: no empty band
    expect(tenant.x).toBeLessThanOrEqual(u.x + u.w + fr.w + 2 * 100 + 40);
    expect(checkConnections(l, { labels: true })).toEqual([]);
  });
});
