import { inkOf } from "./layout.js";
import type { Layout, LNode, Pt } from "./layout.js";

/** Size/proportion report for an exported diagram, with advice when it is badly proportioned for a page. */
export interface CanvasAdvice {
  width: number;
  height: number;
  aspect: number;
  /** One line, e.g. "Canvas 2876×882 px (3.3:1)". */
  text: string;
  /** Present when the proportions are poor; says how to fix them. */
  hint?: string;
}

export const WIDE_LIMIT = 3.5;
export const TALL_LIMIT = 0.45;

/** Widest phone canvas that still keeps 12 px labels readable (≈ 0.75× on a 390 px screen → ~9 px). */
export const PHONE_MAX_WIDTH = 520;

/** `phone`: the canvas is the `variants.narrow` version — judge it by width (readability on a phone), not by ratio. A number = the PNG pixel scale to divide out. */
export function canvasAdvice(width: number, height: number, phone: boolean | number = false): CanvasAdvice {
  const aspect = width / height;
  const text = `Canvas ${Math.round(width)}×${Math.round(height)} px (${aspect.toFixed(1)}:1)`;
  let hint: string | undefined;
  if (phone) {
    const nat = width / (typeof phone === "number" ? phone : 1);
    const scale = Math.min(1, 360 / nat);
    if (nat > PHONE_MAX_WIDTH)
      hint =
        `Too wide for a phone: on a 360 px screen it shows at ${Math.round(scale * 100)}% (12 px labels → ${(12 * scale).toFixed(1)} px). Aim for ≤ ${PHONE_MAX_WIDTH} px wide: ` +
        "in `variants.narrow.nodes` set `stackWith: null` on nodes that sit beside others (one per row where possible), shorten `label`/`sublabel`, " +
        "or `hide` secondary nodes.";
    return { width, height, aspect, text: `${text} — phone view`, hint };
  }
  if (aspect > WIDE_LIMIT)
    hint =
      "Very wide for a page column (comfortable range ≈ 1.5–3.5:1). Fold branches that leave the main flow with `stackWith: <id>` " +
      "(same step, stacked below the anchor), use `direction: DOWN` for layered diagrams, keep notes in the side gutter and short " +
      "(`notesPosition: side`), put long explanations in `steps`/`description`, drop rarely-needed nodes, or split into overview + detail diagrams.";
  else if (aspect < TALL_LIMIT)
    hint =
      "Very tall (comfortable range ≈ 1.5–3.5:1 wide). Use `direction: RIGHT`, stack siblings side by side with `stackWith`, or split the diagram.";
  return { width, height, aspect, text, hint };
}

/** Pixel size of a PNG buffer (IHDR). */
export function pngSize(buf: Uint8Array): { width: number; height: number } {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return { width: dv.getUint32(16), height: dv.getUint32(20) };
}

/** `viewBox` size of an SVG string. */
export function svgSize(svg: string): { width: number; height: number } | null {
  const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}

/** Does the axis-aligned segment a→b pass through the rectangle (shrunk by `m`)? Connectors are orthogonal, so this is exact for them. */
function segmentHitsRect(a: Pt, b: Pt, r: { x: number; y: number; w: number; h: number }, m: number): boolean {
  const x0 = r.x + m;
  const x1 = r.x + r.w - m;
  const y0 = r.y + m;
  const y1 = r.y + r.h - m;
  if (x1 <= x0 || y1 <= y0) return false;
  const sx0 = Math.min(a.x, b.x);
  const sx1 = Math.max(a.x, b.x);
  const sy0 = Math.min(a.y, b.y);
  const sy1 = Math.max(a.y, b.y);
  return sx1 > x0 && sx0 < x1 && sy1 > y0 && sy0 < y1;
}

/**
 * Connection check on a computed layout. Returns one line per problem (empty = clean):
 *  - a connector runs *through* a node that is not one of its ends (or a container holding one of its ends),
 *  - two connectors end on exactly the same point (their arrowheads would overlap).
 * `labels`: also report edge labels that sit on a node or on another label (vendor looks place labels themselves). The renderer runs it on every render (`RenderOptions.report`); the CLI and the MCP server print the result so an author
 * (human or AI) fixes the spec instead of shipping a misleading arrow.
 */
export function checkConnections(layout: Layout, opts: { labels?: boolean } = {}): string[] {
  const issues: string[] = [];
  const byId = new Map<string, LNode>(layout.nodes.map((n) => [n.id, n]));
  const within = (id: string, anc: string): boolean => {
    for (let cur = byId.get(id); cur; cur = cur.parent ? byId.get(cur.parent) : undefined) if (cur.id === anc) return true;
    return false;
  };
  const leaves = layout.nodes.filter((n) => !n.container);
  const ends = new Map<string, string[]>();
  for (const e of layout.edges) {
    const pts = e.points;
    if (pts.length < 2) continue;
    for (const n of leaves) {
      if (within(n.id, e.from) || within(n.id, e.to) || n.id === e.from || n.id === e.to) continue;
      for (let i = 1; i < pts.length; i++) {
        if (segmentHitsRect(pts[i - 1], pts[i], n, 3)) {
          issues.push(`connector ${e.id} runs through node "${n.id}" — route it elsewhere (reorder nodes, \`stackWith\`, or connect through the node it should pass).`);
          break;
        }
      }
    }
    const last = pts[pts.length - 1];
    const key = `${Math.round(last.x)},${Math.round(last.y)}`;
    ends.set(key, [...(ends.get(key) ?? []), e.id]);
  }
  for (const ids of ends.values())
    if (ids.length > 1) issues.push(`connectors ${ids.join(", ")} end on the same point — their arrowheads overlap.`);
  if (opts.labels) {
    const labelled = layout.edges.filter((e) => e.label);
    const hit = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w - 1 && a.x + a.w > b.x + 1 && a.y < b.y + b.h - 1 && a.y + a.h > b.y + 1;
    for (const e of labelled) {
      const lb = e.label!;
      const n = leaves.find((q) => inkOf(q, layout.iconSize ?? 32).some((r) => hit(lb, r)));
      if (n) issues.push(`label "${lb.text}" of ${e.id} overlaps node "${n.id}" — shorten it or drop it.`);
    }
    for (let i = 0; i < labelled.length; i++)
      for (let j = i + 1; j < labelled.length; j++)
        if (hit(labelled[i].label!, labelled[j].label!)) issues.push(`labels "${labelled[i].label!.text}" and "${labelled[j].label!.text}" overlap.`);
  }
  return issues;
}
