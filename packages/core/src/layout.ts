import ELK from "elkjs/lib/elk.bundled.js";
import { DiagramSpec, NodeSpec, edgeIds } from "./spec.js";
import { kindOf } from "./kinds.js";
import { nodeIcon, stackIconSize, STACK_ICON as STACK_ICON_SMALL, STACK_PAD, HEAD_ICON } from "./icons/index.js";

export interface Pt {
  x: number;
  y: number;
}
export interface LNode {
  id: string;
  spec: NodeSpec;
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  parent?: string;
  container: boolean;
}
export interface LEdge {
  id: string;
  from: string;
  to: string;
  points: Pt[];
  label?: { text: string; x: number; y: number; w: number; h: number };
}
export interface Layout {
  width: number;
  height: number;
  nodes: LNode[]; // parents before children
  edges: LEdge[];
}

export const textW = (s: string, size: number, bold = false) => s.length * size * (bold ? 0.6 : 0.56);

export const HEADER_PAD = 46;
export const ENTITY_HEAD = 30;
export const ENTITY_ROW = 20;
/** Distance between nodes stacked in the same step (room for an arrow and its label). */
const STACK_GAP_V = 56;
const STACK_GAP_H = 64;
const elk = new ELK();

interface Stack {
  id: string;
  members: NodeSpec[];
}
const isStack = (x: NodeSpec | Stack): x is Stack => "members" in x;

/**
 * Siblings that declare `stackWith` are merged with their anchor into one stack (a column across the flow).
 * Order inside a stack follows the spec order; the stack takes the anchor's place among its siblings.
 */
function groupSiblings(list: NodeSpec[]): (NodeSpec | Stack)[] {
  const byId = new Map(list.map((n) => [n.id, n]));
  const kids = new Map<string, NodeSpec[]>();
  for (const n of list) if (n.stackWith && byId.has(n.stackWith)) kids.set(n.stackWith, [...(kids.get(n.stackWith) ?? []), n]);
  const out: (NodeSpec | Stack)[] = [];
  for (const n of list) {
    if (n.stackWith && byId.has(n.stackWith)) continue;
    const members = [n];
    const dfs = (x: NodeSpec) => {
      for (const k of kids.get(x.id) ?? []) {
        members.push(k);
        dfs(k);
      }
    };
    dfs(n);
    out.push(members.length > 1 ? { id: `__stack_${n.id}`, members } : n);
  }
  return out;
}

/** Size of a leaf node (what ELK reserves for it). */
function leafBoxI(n: NodeSpec, ico: number): { width: number; height: number } {
  const ic = nodeIcon(n);
  if (ic?.variant === "stacked") {
    const official = ico > STACK_ICON_SMALL; // vendor look: tight boxes so arrows touch the icons
    const wl = Math.max(textW(n.label, 12.5, true), n.sublabel ? textW(n.sublabel, 10.5) : 0) + (official ? 14 : 32);
    return { width: Math.ceil(Math.max(official ? ico + 20 : 104, wl)), height: STACK_PAD + ico + (n.sublabel ? 34 : 20) + STACK_PAD };
  }
  const shape = kindOf(n.kind).shape;
  if (shape === "entity" && n.fields?.length) {
    const rows = Math.max(...n.fields.map((f) => textW(f.name, 11.5) + textW(f.type ?? "", 10.5) + 20));
    const w = Math.max(160, textW(n.label, 12.5, true) + 28, rows + 56);
    return { width: Math.ceil(w), height: ENTITY_HEAD + n.fields.length * ENTITY_ROW + 6 };
  }
  if (shape === "diamond") return { width: Math.ceil(Math.max(130, textW(n.label, 12.5, true) + 76)), height: 64 };
  if (shape === "pill") return { width: Math.ceil(Math.max(96, textW(n.label, 12.5, true) + 44)), height: 36 };
  if (shape === "plain") return { width: Math.ceil(Math.max(116, textW(n.label, 12.5, true) + 36)), height: n.sublabel ? 50 : 42 };
  const w = Math.max(116, Math.max(textW(n.label, 12.5, true), n.sublabel ? textW(n.sublabel, 10.5) : 0) + 52);
  return { width: Math.ceil(w), height: n.sublabel ? 50 : 42 };
}

/** Y of the line edges should use: the icon's centre for stacked (icon + label) nodes, else the box centre. */
const lineYI = (n: NodeSpec, h: number, ico: number) => (nodeIcon(n)?.variant === "stacked" ? STACK_PAD + ico / 2 : h / 2);

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * An edge that touches a stacked member was routed by ELK to the stack's outer box. Re-aim its end at the member itself:
 * keep the original run until just outside the stack, then step across and enter the member.
 */
function retarget(points: Pt[], atStart: boolean, comp: Rect, m: Rect, flowRight: boolean, lineCy: number): Pt[] {
  const p = points.map((q) => ({ ...q }));
  if (p.length < 2) return p;
  const e = atStart ? p[0] : p[p.length - 1];
  const nb = atStart ? p[1] : p[p.length - 2];
  let detour: Pt[];
  if (flowRight) {
    const onL = Math.abs(e.x - comp.x) < 2;
    const onR = Math.abs(e.x - (comp.x + comp.w)) < 2;
    if (!onL && !onR) return p;
    const mx = onL ? m.x : m.x + m.w;
    const my = lineCy;
    if (Math.abs(e.y - my) < 1) {
      e.x = mx;
      return p;
    }
    const xb = onL ? Math.max(nb.x + 4, comp.x - 18) : Math.min(nb.x - 4, comp.x + comp.w + 18);
    detour = [{ x: xb, y: e.y }, { x: xb, y: my }, { x: mx, y: my }];
  } else {
    const onT = Math.abs(e.y - comp.y) < 2;
    const onB = Math.abs(e.y - (comp.y + comp.h)) < 2;
    if (!onT && !onB) return p;
    const mx = m.x + m.w / 2;
    const my = onT ? m.y : m.y + m.h;
    if (Math.abs(e.x - mx) < 1) {
      e.y = my;
      return p;
    }
    const yb = onT ? Math.max(nb.y + 4, comp.y - 18) : Math.min(nb.y - 4, comp.y + comp.h + 18);
    detour = [{ x: e.x, y: yb }, { x: mx, y: yb }, { x: mx, y: my }];
  }
  // `detour` is ordered from the outside in; for a start point it must run from the member outwards
  return atStart ? [...detour.reverse(), ...p.slice(1)] : [...p.slice(0, -1), ...detour];
}

/** Layout, then (when `zoneWidth: equal`) once more with every container of the same depth as wide as the widest one: tidy bands. */
async function layoutCore(spec: DiagramSpec, mins: Map<number, number> = new Map()): Promise<Layout> {
  const first = await layoutOnce(spec, mins);
  if (spec.zoneWidth !== "equal") return first;
  const widest = new Map(mins);
  for (const n of first.nodes) if (n.container) widest.set(n.depth, Math.max(widest.get(n.depth) ?? 0, n.w));
  return layoutOnce(spec, widest);
}

async function layoutOnce(spec: DiagramSpec, mins: Map<number, number>): Promise<Layout> {
  const ico = stackIconSize(spec.look);
  const leafBox = (n: NodeSpec) => leafBoxI(n, ico);
  const lineY = (n: NodeSpec, h: number) => lineYI(n, h, ico);
  const ids = edgeIds(spec);
  const flowRight = spec.direction === "RIGHT";
  const meta = new Map<string, { spec: NodeSpec; depth: number; parent?: string }>();
  const owner = new Map<string, string>(); // stacked member id -> stack id
  const ported = new Set<string>(); // standalone stacked leaves that got fixed ports
  const stacks = new Map<string, { members: NodeSpec[]; offsets: Rect[]; w: number; h: number }>();

  const toElk = (item: NodeSpec | Stack, depth: number, parent?: string): any => {
    if (isStack(item)) {
      let boxes = item.members.map(leafBox);
      // members of one stack share the cross-axis size: a tidy column/row of equally wide (or tall) boxes
      const crossW = Math.max(...boxes.map((b) => b.width));
      const crossH = Math.max(...boxes.map((b) => b.height));
      boxes = boxes.map((b) => (flowRight ? { ...b, width: crossW } : { ...b, height: crossH }));
      const offsets: Rect[] = [];
      let w: number;
      let h: number;
      if (flowRight) {
        w = Math.max(...boxes.map((b) => b.width));
        h = boxes.reduce((a, b) => a + b.height, 0) + STACK_GAP_V * (boxes.length - 1);
        let y = 0;
        boxes.forEach((b) => {
          offsets.push({ x: (w - b.width) / 2, y, w: b.width, h: b.height });
          y += b.height + STACK_GAP_V;
        });
      } else {
        h = Math.max(...boxes.map((b) => b.height));
        w = boxes.reduce((a, b) => a + b.width, 0) + STACK_GAP_H * (boxes.length - 1);
        let x = 0;
        boxes.forEach((b) => {
          offsets.push({ x, y: (h - b.height) / 2, w: b.width, h: b.height });
          x += b.width + STACK_GAP_H;
        });
      }
      item.members.forEach((m) => {
        meta.set(m.id, { spec: m, depth, parent });
        owner.set(m.id, item.id);
      });
      stacks.set(item.id, { members: item.members, offsets, w: Math.ceil(w), h: Math.ceil(h) });
      // Fixed ports at each member's centre line: ELK aligns the neighbours with the member an edge actually
      // touches (so the main row stays on one line) instead of centring the whole column.
      const W = Math.ceil(w);
      const H = Math.ceil(h);
      const ports = item.members.flatMap((m, i) => {
        const o = offsets[i];
        const cy = o.y + lineY(m, o.h);
        const cx = o.x + o.w / 2;
        const mk = (suffix: string, x: number, y: number, side: string) => ({ id: `${item.id}|${m.id}|${suffix}`, x, y, width: 0, height: 0, layoutOptions: { "elk.port.side": side } });
        return flowRight ? [mk("W", 0, cy, "WEST"), mk("E", W, cy, "EAST")] : [mk("N", cx, 0, "NORTH"), mk("S", cx, H, "SOUTH")];
      });
      return { id: item.id, width: W, height: H, ports, layoutOptions: { "elk.portConstraints": "FIXED_POS" } };
    }
    const n = item;
    meta.set(n.id, { spec: n, depth, parent });
    if (n.children?.length) {
      const tag = kindOf(n.kind).tag ?? "";
      const header = Math.max(textW(n.label, 12.5, true), textW(tag.toUpperCase(), 9) + 4) + 36 + (nodeIcon(n) ? HEAD_ICON + 8 : 0);
      const minW = Math.max(header, 140, mins.get(depth) ?? 0);
      return {
        id: n.id,
        width: minW,
        height: 80,
        layoutOptions: {
          "elk.padding": `[top=${HEADER_PAD},left=16,bottom=16,right=16]`,
          "elk.nodeSize.constraints": "MINIMUM_SIZE",
          // ELK reads this rotated when the flow is DOWN
          "elk.nodeSize.minimum": spec.direction === "DOWN" ? `(80, ${minW})` : `(${minW}, 80)`,
        },
        children: groupSiblings(n.children).map((c) => toElk(c, depth + 1, n.id)),
      };
    }
    const box = leafBox(n);
    if (nodeIcon(n)?.variant === "stacked") {
      // Fixed ports on the icon's centre line: every edge meets the icon (not the label rows) and rows stay aligned.
      ported.add(n.id);
      const cy = lineY(n, box.height);
      const mk = (suffix: string, x: number, y: number, side: string) => ({ id: `${n.id}|${suffix}`, x, y, width: 0, height: 0, layoutOptions: { "elk.port.side": side } });
      const ports = flowRight
        ? [mk("W", 0, cy, "WEST"), mk("E", box.width, cy, "EAST")]
        : [mk("N", box.width / 2, 0, "NORTH"), mk("S", box.width / 2, box.height, "SOUTH")];
      return { id: n.id, ...box, ports, layoutOptions: { "elk.portConstraints": "FIXED_POS" } };
    }
    return { id: n.id, ...box };
  };

  const hasStacked = (ns: NodeSpec[]): boolean => ns.some((n) => (n.children?.length ? hasStacked(n.children) : nodeIcon(n)?.variant === "stacked"));
  const stacked = hasStacked(spec.nodes); // icon + label nodes need longer arrows and more air between them
  const elkChildren = groupSiblings(spec.nodes).map((n) => toElk(n, 0));
  // Edge endpoint for ELK: the member's port inside a stack (leaving side for sources, entering side for targets), else the node.
  const endpoint = (id: string, role: "src" | "tgt") => {
    const suffix = flowRight ? (role === "src" ? "E" : "W") : role === "src" ? "S" : "N";
    const st = owner.get(id);
    if (st) return `${st}|${id}|${suffix}`;
    return ported.has(id) ? `${id}|${suffix}` : id;
  };
  const internal = (e: { from: string; to: string }) => owner.has(e.from) && owner.get(e.from) === owner.get(e.to);

  const root = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": spec.direction,
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.spacing.nodeNodeBetweenLayers": spec.direction === "DOWN" ? "46" : stacked ? "60" : "56",
      "elk.spacing.nodeNode": stacked ? "40" : "28",
      "elk.spacing.edgeNode": "22",
      "elk.spacing.edgeEdge": "14",
      "elk.spacing.edgeLabel": "4",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      ...(spec.zoneWidth === "equal" ? { "elk.layered.nodePlacement.strategy": "SIMPLE", "elk.alignment": "LEFT" } : {}),
      "elk.padding": "[top=12,left=12,bottom=12,right=12]",
      "org.eclipse.elk.json.edgeCoords": "ROOT",
    },
    children: elkChildren,
    edges: spec.edges
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => !internal(e))
      .map(({ e, i }) => ({
        id: ids[i],
        sources: [endpoint(e.from, "src")],
        targets: [endpoint(e.to, "tgt")],
        labels: e.label ? [{ text: e.label, width: Math.ceil(textW(e.label, 10.5)) + 12, height: 16 }] : undefined,
      })),
  };

  const out: any = await elk.layout(root as any);

  const nodes: LNode[] = [];
  const stackRects = new Map<string, Rect>();
  const walk = (n: any, ox: number, oy: number) => {
    const x = ox + n.x;
    const y = oy + n.y;
    const st = stacks.get(n.id);
    if (st) {
      stackRects.set(n.id, { x, y, w: n.width, h: n.height });
      st.members.forEach((m, i) => {
        const mm = meta.get(m.id)!;
        const o = st.offsets[i];
        nodes.push({ id: m.id, spec: m, x: x + o.x, y: y + o.y, w: o.w, h: o.h, depth: mm.depth, parent: mm.parent, container: false });
      });
      return;
    }
    const m = meta.get(n.id)!;
    nodes.push({ id: n.id, spec: m.spec, x, y, w: n.width, h: n.height, depth: m.depth, parent: m.parent, container: !!m.spec.children?.length });
    for (const c of n.children ?? []) walk(c, x, y);
  };
  for (const c of out.children) walk(c, 0, 0);

  const nodeById = new Map(nodes.map((nd) => [nd.id, nd]));
  const elkEdges = new Map<string, any>((out.edges ?? []).map((e: any) => [e.id, e]));

  const edges: LEdge[] = spec.edges.map((es, i) => {
    const id = ids[i];
    if (internal(es)) return internalEdge(id, es.from, es.to, es.label, nodeById, stackRects.get(owner.get(es.from)!)!, flowRight, stacks.get(owner.get(es.from)!)!.members);

    const e = elkEdges.get(id);
    const s = e?.sections?.[0];
    // ELK reports edge coordinates relative to `e.container` (lowest common ancestor), not the root.
    const c = e?.container && e.container !== "root" ? nodeById.get(e.container) ?? stackRects.get(e.container) : undefined;
    const ox = (c as Rect | undefined)?.x ?? 0;
    const oy = (c as Rect | undefined)?.y ?? 0;
    const shift = (p: Pt): Pt => ({ x: p.x + ox, y: p.y + oy });
    let points: Pt[] = s ? [s.startPoint, ...(s.bendPoints ?? []), s.endPoint].map(shift) : [];
    if (points.length >= 2) {
      const fs = owner.get(es.from);
      const ts = owner.get(es.to);
      const cyOf = (id: string) => {
        const nd = nodeById.get(id)!;
        return nd.y + lineY(nd.spec, nd.h);
      };
      if (fs) points = retarget(points, true, stackRects.get(fs)!, nodeById.get(es.from)!, flowRight, cyOf(es.from));
      if (ts) points = retarget(points, false, stackRects.get(ts)!, nodeById.get(es.to)!, flowRight, cyOf(es.to));
    }
    const l = e?.labels?.[0];
    return {
      id,
      from: es.from,
      to: es.to,
      points,
      label: l ? { text: l.text, x: l.x + ox, y: l.y + oy, w: l.width, h: l.height } : undefined,
    };
  });

  if (spec.direction === "DOWN" && spec.zoneWidth === "equal") return tidyBands(spec, ids, nodes, mins);
  return { width: Math.ceil(out.width), height: Math.ceil(out.height), nodes, edges };
}

/**
 * `zoneWidth: equal` + flow DOWN (the phone layout): ELK keeps edges straight by staggering zones sideways. Here every zone of a
 * depth gets the same width, rows of nodes are centred inside their zone, and edges are re-routed between the final boxes
 * (vertical when aligned, one elbow otherwise): clean horizontal bands that read top to bottom.
 */
function tidyBands(spec: DiagramSpec, ids: string[], nodes: LNode[], mins: Map<number, number>): Layout {
  const GAP = 48;
  const PADX = 16;
  const ROOT = 12;
  const byParent = new Map<string | undefined, LNode[]>();
  for (const n of nodes) byParent.set(n.parent, [...(byParent.get(n.parent) ?? []), n]);
  // rows: nodes whose vertical extents overlap sit side by side
  const rowsOf = (list: LNode[]): LNode[][] => {
    const out: LNode[][] = [];
    let bottom = -Infinity;
    for (const n of [...list].sort((a, b) => a.y - b.y || a.x - b.x)) {
      if (out.length && n.y < bottom - 2) {
        out[out.length - 1].push(n);
        bottom = Math.max(bottom, n.y + n.h);
      } else {
        out.push([n]);
        bottom = n.y + n.h;
      }
    }
    return out.map((r) => r.sort((a, b) => a.x - b.x));
  };
  const maxDepth = Math.max(...nodes.map((n) => n.depth));
  const W = new Map<number, number>(); // container width per depth
  const widthOf = (n: LNode) => (n.container ? W.get(n.depth)! : n.w);
  const rowW = (r: LNode[]) => r.reduce((a, n) => a + widthOf(n), 0) + GAP * (r.length - 1);
  for (let d = maxDepth; d >= 0; d--) {
    let w = mins.get(d) ?? 0;
    for (const c of nodes.filter((n) => n.container && n.depth === d)) {
      const rows = rowsOf(byParent.get(c.id) ?? []).map(rowW);
      const tag = kindOf(c.spec.kind).tag ?? "";
      const header = Math.max(textW(c.spec.label, 12.5, true), textW(tag.toUpperCase(), 9) + 4) + 36 + (nodeIcon(c.spec) ? HEAD_ICON + 8 : 0);
      w = Math.max(w, 140, header, (rows.length ? Math.max(...rows) : 0) + 2 * PADX);
    }
    W.set(d, Math.ceil(w));
  }
  const place = (list: LNode[], left: number, width: number) => {
    for (const row of rowsOf(list)) {
      let x = left + (width - rowW(row)) / 2;
      for (const n of row) {
        n.x = Math.round(x);
        if (n.container) n.w = W.get(n.depth)!;
        x += n.w + GAP;
        if (n.container) place(byParent.get(n.id) ?? [], n.x, n.w);
      }
    }
  };
  const top = byParent.get(undefined) ?? [];
  place(top, ROOT, Math.max(...rowsOf(top).map(rowW)));

  const byId = new Map(nodes.map((n) => [n.id, n]));
  // ---- edges: ports spread along the facing sides, then straight / one-elbow routes ----
  type Port = { e: number; other: number };
  const ports = new Map<string, Port[]>();
  const side = (e: number, from: LNode, to: LNode): { a: string; b: string; kind: "down" | "up" | "row" } => {
    const overlap = from.y < to.y + to.h && to.y < from.y + from.h;
    if (overlap) return { a: "", b: "", kind: "row" };
    return from.y + from.h <= to.y ? { a: `${from.id}|B`, b: `${to.id}|T`, kind: "down" } : { a: `${from.id}|T`, b: `${to.id}|B`, kind: "up" };
  };
  const sides = spec.edges.map((es, i) => {
    const from = byId.get(es.from)!;
    const to = byId.get(es.to)!;
    const sd = side(i, from, to);
    if (sd.kind !== "row") {
      ports.set(sd.a, [...(ports.get(sd.a) ?? []), { e: i, other: to.x + to.w / 2 }]);
      ports.set(sd.b, [...(ports.get(sd.b) ?? []), { e: i, other: from.x + from.w / 2 }]);
    }
    return sd;
  });
  const portX = (key: string, e: number): number => {
    const list = [...(ports.get(key) ?? [])].sort((p, q) => p.other - q.other || p.e - q.e);
    const nd = byId.get(key.split("|")[0])!;
    const i = list.findIndex((p) => p.e === e);
    return nd.x + (nd.w * (i + 1)) / (list.length + 1);
  };
  // a label on a vertical run must not sit on a node or a container title: slide it along the run to the nearest free spot
  const hits = (x: number, y: number, w: number): boolean =>
    nodes.some((n) => {
      const box = n.container
        ? { x: n.x + 6, y: n.y + 2, w: Math.max(textW(n.spec.label, 12.5, true), 60) + 24, h: HEADER_PAD - 6 }
        : { x: n.x, y: n.y, w: n.w, h: n.h };
      return x < box.x + box.w && x + w > box.x && y < box.y + box.h && y + 16 > box.y;
    });
  const freeY = (x: number, w: number, y0: number, y1: number): number => {
    const lo = Math.min(y0, y1);
    const hi = Math.max(y0, y1);
    const mid = (lo + hi) / 2 - 8;
    for (let d = 0; d <= (hi - lo) / 2; d += 4) {
      for (const y of [mid + d, mid - d]) if (y >= lo + 2 && y + 16 <= hi - 2 && !hits(x, y, w)) return y;
    }
    return mid;
  };
  const edges: LEdge[] = spec.edges.map((es, i) => {
    const from = byId.get(es.from)!;
    const to = byId.get(es.to)!;
    const sd = sides[i];
    const lw = es.label ? Math.ceil(textW(es.label, 10.5)) + 12 : 0;
    let points: Pt[];
    let label: LEdge["label"];
    if (sd.kind === "row") {
      const lo = Math.max(from.y, to.y);
      const hi = Math.min(from.y + from.h, to.y + to.h);
      const cy = (lo + hi) / 2;
      const [l, r] = from.x < to.x ? [from, to] : [to, from];
      const x0 = l.x + l.w;
      const x1 = r.x;
      points = from.x < to.x ? [{ x: x0, y: cy }, { x: x1, y: cy }] : [{ x: x1, y: cy }, { x: x0, y: cy }];
      label = es.label ? { text: es.label, x: (x0 + x1) / 2 - lw / 2, y: cy - 26, w: lw, h: 16 } : undefined;
    } else {
      let xa = portX(sd.a, i);
      let xb = portX(sd.b, i);
      const y0 = sd.kind === "down" ? from.y + from.h : from.y;
      const y1 = sd.kind === "down" ? to.y : to.y + to.h;
      // boxes that overlap sideways connect with a straight vertical line (no needless jog)
      const lo = Math.max(from.x, to.x) + 14;
      const hi = Math.min(from.x + from.w, to.x + to.w) - 14;
      if (lo <= hi) xa = xb = Math.min(hi, Math.max(lo, (xa + xb) / 2));
      if (Math.abs(xa - xb) < 2) {
        points = [{ x: xa, y: y0 }, { x: xa, y: y1 }];
        label = es.label ? { text: es.label, x: xa + 8, y: freeY(xa + 8, lw, y0, y1), w: lw, h: 16 } : undefined;
      } else {
        const ym = (y0 + y1) / 2;
        points = [{ x: xa, y: y0 }, { x: xa, y: ym }, { x: xb, y: ym }, { x: xb, y: y1 }];
        const short = Math.abs(xa - xb) < lw + 24;
        label = es.label
          ? short
            ? { text: es.label, x: xb > xa ? xb + 8 : xb - 8 - lw, y: (ym + y1) / 2 - 8, w: lw, h: 16 }
            : { text: es.label, x: (xa + xb) / 2 - lw / 2, y: ym - 8, w: lw, h: 16 }
          : undefined;
      }
    }
    return { id: ids[i], from: es.from, to: es.to, points, label };
  });
  const width = Math.max(...nodes.map((n) => n.x + n.w)) + ROOT;
  const height = Math.max(...nodes.map((n) => n.y + n.h)) + ROOT;
  return { width: Math.ceil(width), height: Math.ceil(height), nodes, edges };
}

/** Edge between two members of the same stack: straight along the stack axis; a bracket on the outside when not adjacent. */
function internalEdge(
  id: string,
  from: string,
  to: string,
  label: string | undefined,
  nodeById: Map<string, LNode>,
  comp: Rect,
  flowRight: boolean,
  members: NodeSpec[],
): LEdge {
  const a = nodeById.get(from)!;
  const b = nodeById.get(to)!;
  const ia = members.findIndex((m) => m.id === from);
  const ib = members.findIndex((m) => m.id === to);
  const adjacent = Math.abs(ia - ib) === 1;
  const down = ib > ia;
  let points: Pt[];
  let mid: Pt;
  if (flowRight) {
    if (adjacent) {
      const cx = comp.x + comp.w / 2;
      const y0 = down ? a.y + a.h : a.y;
      const y1 = down ? b.y : b.y + b.h;
      points = [{ x: cx, y: y0 }, { x: cx, y: y1 }];
      mid = { x: cx + 8, y: (y0 + y1) / 2 };
    } else {
      const xr = comp.x + comp.w + 14;
      const ya = a.y + a.h / 2;
      const yb = b.y + b.h / 2;
      points = [{ x: a.x + a.w, y: ya }, { x: xr, y: ya }, { x: xr, y: yb }, { x: b.x + b.w, y: yb }];
      mid = { x: xr + 8, y: (ya + yb) / 2 };
    }
  } else if (adjacent) {
    const cy = comp.y + comp.h / 2;
    const fwd = ib > ia;
    const x0 = fwd ? a.x + a.w : a.x;
    const x1 = fwd ? b.x : b.x + b.w;
    points = [{ x: x0, y: cy }, { x: x1, y: cy }];
    mid = { x: (x0 + x1) / 2, y: cy - 22 };
  } else {
    const yr = comp.y + comp.h + 14;
    const xa = a.x + a.w / 2;
    const xb = b.x + b.w / 2;
    points = [{ x: xa, y: a.y + a.h }, { x: xa, y: yr }, { x: xb, y: yr }, { x: xb, y: b.y + b.h }];
    mid = { x: (xa + xb) / 2, y: yr + 8 };
  }
  const w = label ? Math.ceil(textW(label, 10.5)) + 12 : 0;
  return {
    id,
    from,
    to,
    points,
    label: label ? { text: label, x: flowRight ? mid.x : mid.x - w / 2, y: mid.y - 8, w, h: 16 } : undefined,
  };
}

const BELOW_GAP = 44;
const BELOW_SPACE = 24;

const subtreeIds = (n: NodeSpec): string[] => [n.id, ...(n.children ?? []).flatMap(subtreeIds)];

/**
 * Layout with `placement: below` support (flow RIGHT): those top-level nodes are laid out on their own, then placed in a row under
 * the main diagram, each centred under the node it connects to. Edges between the two parts are straight/elbow arrows between
 * the bottom of the main node and the top of the boxed node.
 */
export async function layoutSpec(spec: DiagramSpec): Promise<Layout> {
  const flowRight = spec.direction === "RIGHT";
  const below = spec.nodes.filter((n) => n.placement === "below" && !n.stackWith && !spec.nodes.some((m) => m.stackWith === n.id));
  if (!below.length) return layoutCore(spec);

  const ids = edgeIds(spec);
  const owner = new Map<string, string>(); // node id -> the below-root it belongs to
  for (const b of below) for (const id of subtreeIds(b)) owner.set(id, b.id);
  const tagged = spec.edges.map((e, i) => ({ ...e, id: ids[i] }));
  const cross = tagged.filter((e) => owner.get(e.from) !== owner.get(e.to));
  const mainEdges = tagged.filter((e) => !owner.has(e.from) && !owner.has(e.to));

  const main = await layoutCore({ ...spec, nodes: spec.nodes.filter((n) => !owner.has(n.id)), edges: mainEdges });
  const mainById = new Map(main.nodes.map((n) => [n.id, n]));
  const mainLeft = Math.min(...main.nodes.map((n) => n.x));
  const mainRight = Math.max(...main.nodes.map((n) => n.x + n.w));
  const bandW = Math.ceil(mainRight - mainLeft); // flow DOWN: the boxed row is as wide as the diagram above (same band)

  const nodes = [...main.nodes];
  const edgeById = new Map<string, LEdge>(main.edges.map((e) => [e.id, e]));
  const gap = flowRight ? BELOW_GAP : BELOW_GAP + 14;
  const rowY = main.height + gap;
  let rowH = 0;
  let width = main.width;
  let cursor = 0;

  for (const b of below) {
    const inner = tagged.filter((e) => owner.get(e.from) === b.id && owner.get(e.to) === b.id);
    const sub = await layoutCore({ ...spec, nodes: [{ ...b, placement: undefined }], edges: inner, notes: [], steps: [] }, flowRight ? new Map() : new Map([[0, bandW]]));
    // the main node this box talks to decides where it sits
    const link = cross.find((e) => owner.get(e.from) === b.id || owner.get(e.to) === b.id);
    const otherId = link ? (owner.get(link.from) === b.id ? link.to : link.from) : undefined;
    const other = otherId ? mainById.get(otherId) : undefined;
    const want = other ? other.x + other.w / 2 - sub.width / 2 : cursor;
    const x0 = flowRight ? Math.max(cursor, 0, Math.min(want, main.width - sub.width)) : Math.max(cursor, mainLeft);
    for (const n of sub.nodes) nodes.push({ ...n, x: n.x + x0, y: n.y + rowY });
    for (const e of sub.edges) edgeById.set(e.id, { ...e, points: e.points.map((p) => ({ x: p.x + x0, y: p.y + rowY })), label: e.label && { ...e.label, x: e.label.x + x0, y: e.label.y + rowY } });
    cursor = x0 + sub.width + BELOW_SPACE;
    width = Math.max(width, x0 + sub.width);
    rowH = Math.max(rowH, sub.height);
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const e of cross) {
    const a = byId.get(e.from)!;
    const b = byId.get(e.to)!;
    const fromBelow = owner.has(e.from);
    const top = fromBelow ? b : a; // the main-side node (above)
    const botLeaf = fromBelow ? a : b; // the boxed endpoint…
    const bot = byId.get(owner.get(botLeaf.id)!) ?? botLeaf; // …drawn up to its zone (the below-root)
    const lo = Math.max(top.x, bot.x) + 16;
    const hi = Math.min(top.x + top.w, bot.x + bot.w) - 16;
    const y0 = top.y + top.h;
    const y1 = bot.y;
    let pts: Pt[];
    let xm: number;
    if (!flowRight) {
      // leave the main node by its right side, run down the right margin (outside the zones), then step in above the boxed row
      const sx = top.x + top.w;
      const sy = top.y + top.h / 2;
      const gx = mainRight + 9;
      const ym = y1 - 24; // the channel just above the boxed row (never crosses a node of the main diagram)
      xm = bot.x + bot.w / 2;
      pts = [{ x: sx, y: sy }, { x: gx, y: sy }, { x: gx, y: ym }, { x: xm, y: ym }, { x: xm, y: y1 }];
      width = Math.max(width, gx + 12);
    } else if (lo <= hi) {
      xm = (lo + hi) / 2;
      pts = [{ x: xm, y: y0 }, { x: xm, y: y1 }];
    } else {
      const xa = top.x + top.w / 2;
      const xb = bot.x + bot.w / 2;
      const ym = (y0 + y1) / 2;
      xm = xa;
      pts = [{ x: xa, y: y0 }, { x: xa, y: ym }, { x: xb, y: ym }, { x: xb, y: y1 }];
    }
    if (fromBelow) pts.reverse();
    const lbl = spec.edges[ids.indexOf(e.id)].label;
    const w = lbl ? Math.ceil(textW(lbl, 10.5)) + 12 : 0;
    edgeById.set(e.id, {
      id: e.id,
      from: e.from,
      to: e.to,
      points: pts,
      label: lbl ? (flowRight ? { text: lbl, x: xm + 8, y: (y0 + y1) / 2 - 8, w, h: 16 } : { text: lbl, x: (xm + (mainRight + 9)) / 2 - w / 2, y: y1 - 24 - 8, w, h: 16 }) : undefined,
    });
  }

  const edges = ids.map((id) => edgeById.get(id)).filter((e): e is LEdge => !!e);
  const extra = nodes.reduce((m, n) => Math.max(m, n.x + n.w), 0);
  return { width: Math.ceil(Math.max(width, extra)), height: Math.ceil(rowY + rowH), nodes, edges };
}
