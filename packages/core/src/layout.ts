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
const elk = new ELK();

export async function layoutSpec(spec: DiagramSpec): Promise<Layout> {
  const ids = edgeIds(spec);
  const meta = new Map<string, { spec: NodeSpec; depth: number; parent?: string }>();

  const toElk = (n: NodeSpec, depth: number, parent?: string): any => {
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
        children: n.children.map((c) => toElk(c, depth + 1, n.id)),
      };
    }
    const ic = nodeIcon(n);
    if (ic?.variant === "stacked") {
      const wl = Math.max(textW(n.label, 12, true), n.sublabel ? textW(n.sublabel, 10.5) : 0) + 20;
      return { id: n.id, width: Math.ceil(Math.max(84, wl)), height: STACK_ICON + 34 + (n.sublabel ? 14 : 0) };
    }
    const shape = kindOf(n.kind).shape;
    if (shape === "entity" && n.fields?.length) {
      const rows = Math.max(...n.fields.map((f) => textW(f.name, 11.5) + textW(f.type ?? "", 10.5) + 20));
      const w = Math.max(160, textW(n.label, 12.5, true) + 28, rows + 56);
      return { id: n.id, width: Math.ceil(w), height: ENTITY_HEAD + n.fields.length * ENTITY_ROW + 6 };
    }
    if (shape === "diamond") return { id: n.id, width: Math.ceil(Math.max(130, textW(n.label, 12.5, true) + 76)), height: 64 };
    if (shape === "pill") return { id: n.id, width: Math.ceil(Math.max(96, textW(n.label, 12.5, true) + 44)), height: 36 };
    if (shape === "plain") return { id: n.id, width: Math.ceil(Math.max(116, textW(n.label, 12.5, true) + 36)), height: n.sublabel ? 50 : 42 };
    const w = Math.max(116, Math.max(textW(n.label, 12.5, true), n.sublabel ? textW(n.sublabel, 10.5) : 0) + 52);
    return { id: n.id, width: Math.ceil(w), height: n.sublabel ? 50 : 42 };
  };

  const hasStacked = (ns: NodeSpec[]): boolean => ns.some((n) => (n.children?.length ? hasStacked(n.children) : nodeIcon(n)?.variant === "stacked"));
  const stacked = hasStacked(spec.nodes); // icon + label nodes need longer arrows and more air between them
  const root = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": spec.direction,
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.spacing.nodeNodeBetweenLayers": stacked ? "92" : "64",
      "elk.spacing.nodeNode": stacked ? "40" : "28",
      "elk.spacing.edgeNode": "22",
      "elk.spacing.edgeEdge": "14",
      "elk.spacing.edgeLabel": "4",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.padding": "[top=12,left=12,bottom=12,right=12]",
      "org.eclipse.elk.json.edgeCoords": "ROOT",
    },
    children: spec.nodes.map((n) => toElk(n, 0)),
    edges: spec.edges.map((e, i) => ({
      id: ids[i],
      sources: [e.from],
      targets: [e.to],
      labels: e.label
        ? [{ text: e.label, width: Math.ceil(textW(e.label, 10.5)) + 12, height: 16 }]
        : undefined,
    })),
  };

  const out: any = await elk.layout(root as any);

  const nodes: LNode[] = [];
  const walk = (n: any, ox: number, oy: number) => {
    const m = meta.get(n.id)!;
    const x = ox + n.x;
    const y = oy + n.y;
    nodes.push({
      id: n.id,
      spec: m.spec,
      x,
      y,
      w: n.width,
      h: n.height,
      depth: m.depth,
      parent: m.parent,
      container: !!m.spec.children?.length,
    });
    for (const c of n.children ?? []) walk(c, x, y);
  };
  for (const c of out.children) walk(c, 0, 0);

  const edges: LEdge[] = out.edges.map((e: any, i: number) => {
    const s = e.sections?.[0];
    // ELK reports edge coordinates relative to `e.container` (lowest common ancestor), not the root.
    const c = e.container && e.container !== "root" ? nodes.find((nd) => nd.id === e.container) : undefined;
    const ox = c?.x ?? 0;
    const oy = c?.y ?? 0;
    const shift = (p: Pt): Pt => ({ x: p.x + ox, y: p.y + oy });
    const points: Pt[] = s ? [s.startPoint, ...(s.bendPoints ?? []), s.endPoint].map(shift) : [];
    const l = e.labels?.[0];
    return {
      id: ids[i],
      from: spec.edges[i].from,
      to: spec.edges[i].to,
      points,
      label: l ? { text: l.text, x: l.x + ox, y: l.y + oy, w: l.width, h: l.height } : undefined,
    };
  });

  return { width: Math.ceil(out.width), height: Math.ceil(out.height), nodes, edges };
}
