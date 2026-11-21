import ELK from "elkjs/lib/elk.bundled.js";
import { DiagramSpec, NodeSpec, edgeIds } from "./spec.js";
import { kindOf } from "./kinds.js";
import { nodeIcon, STACK_ICON, HEAD_ICON } from "./icons/index.js";

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
function leafBox(n: NodeSpec): { width: number; height: number } {
  const ic = nodeIcon(n);
  if (ic?.variant === "stacked") {
    const wl = Math.max(textW(n.label, 12, true), n.sublabel ? textW(n.sublabel, 10.5) : 0) + 20;
    return { width: Math.ceil(Math.max(84, wl)), height: STACK_ICON + 34 + (n.sublabel ? 14 : 0) };
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
const lineY = (n: NodeSpec, h: number) => (nodeIcon(n)?.variant === "stacked" ? 8 + STACK_ICON / 2 : h / 2);

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

export async function layoutSpec(spec: DiagramSpec): Promise<Layout> {
  const ids = edgeIds(spec);
  const flowRight = spec.direction === "RIGHT";
  const meta = new Map<string, { spec: NodeSpec; depth: number; parent?: string }>();
  const owner = new Map<string, string>(); // stacked member id -> stack id
  const ported = new Set<string>(); // standalone stacked leaves that got fixed ports
  const stacks = new Map<string, { members: NodeSpec[]; offsets: Rect[]; w: number; h: number }>();

  const toElk = (item: NodeSpec | Stack, depth: number, parent?: string): any => {
    if (isStack(item)) {
      const boxes = item.members.map(leafBox);
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
      return {
        id: n.id,
        width: Math.max(header, 140),
        height: 80,
        layoutOptions: {
          "elk.padding": `[top=${HEADER_PAD},left=16,bottom=16,right=16]`,
          "elk.nodeSize.constraints": "MINIMUM_SIZE",
          "elk.nodeSize.minimum": `(${Math.max(header, 140)}, 80)`,
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
      "elk.layered.spacing.nodeNodeBetweenLayers": stacked ? "76" : "64",
      "elk.spacing.nodeNode": stacked ? "40" : "28",
      "elk.spacing.edgeNode": "22",
      "elk.spacing.edgeEdge": "14",
      "elk.spacing.edgeLabel": "4",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
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

  return { width: Math.ceil(out.width), height: Math.ceil(out.height), nodes, edges };
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
