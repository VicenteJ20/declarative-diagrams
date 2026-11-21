import { DiagramSpec, edgeIds } from "./spec.js";
import { Layout, LEdge, Pt, layoutSpec, ENTITY_HEAD, ENTITY_ROW } from "./layout.js";
import { kindOf } from "./kinds.js";
import { nodeIcon, IconEmitter, diagramNs, STACK_ICON, CARD_ICON, HEAD_ICON } from "./icons/index.js";
import { css } from "./theme.js";
import { Mode, isMode, resolveTheme, applyPalette, ThemeDef, Palette, ResolvedTheme } from "./themes/index.js";
import { RUNTIME_SOURCE } from "./runtime.js";

export interface RenderOptions {
  /** Static output: no script, no animation, theme variables resolved (PNG-safe). */
  static?: boolean;
  /** `auto` (default: follows the page / OS), `light` or `dark`. Static output treats `auto` as light. */
  mode?: Mode;
  /** Theme name or definition. Overrides `spec.theme`. Legacy: "auto" | "light" | "dark" is treated as `mode`. */
  theme?: string | ThemeDef | ResolvedTheme;
  /** Letterbox the canvas to this width/height ratio (content centred, never distorted). E.g. 16/9. */
  aspect?: number;
  /** Extra margin around the content, in SVG units. */
  padding?: number;
  /** Token overrides applied on top of the theme (merged over `spec.palette`). */
  palette?: Palette;
  /** Embed the runtime <script> in the SVG (standalone use). React sets this to false and attaches itself. */
  embedRuntime?: boolean;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (v: number) => Math.round(v * 10) / 10;

function wrap(text: string, max: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/)) {
    if (cur && (cur + " " + w).length > max) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? cur + " " + w : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

function roundedPath(pts: Pt[], r = 8): string {
  if (pts.length < 2) return "";
  let d = `M${n(pts[0].x)} ${n(pts[0].y)}`;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1];
    const c = pts[i];
    const q = pts[i + 1];
    if (!q) {
      d += `L${n(c.x)} ${n(c.y)}`;
      break;
    }
    const d1 = Math.hypot(c.x - p.x, c.y - p.y);
    const d2 = Math.hypot(q.x - c.x, q.y - c.y);
    const rr = Math.min(r, d1 / 2, d2 / 2);
    if (rr < 0.5) {
      d += `L${n(c.x)} ${n(c.y)}`;
      continue;
    }
    const a = { x: c.x - ((c.x - p.x) / d1) * rr, y: c.y - ((c.y - p.y) / d1) * rr };
    const b = { x: c.x + ((q.x - c.x) / d2) * rr, y: c.y + ((q.y - c.y) / d2) * rr };
    d += `L${n(a.x)} ${n(a.y)}Q${n(c.x)} ${n(c.y)} ${n(b.x)} ${n(b.y)}`;
  }
  return d;
}

function glyphSvg(kind?: string): string {
  const k = kindOf(kind);
  const inner = k.glyph.text ? `<text y="4.5">${esc(k.glyph.text)}</text>` : `<path d="${k.glyph.path}"/>`;
  return inner;
}

export async function renderSvg(spec: DiagramSpec, opts: RenderOptions = {}): Promise<string> {
  const layout = await layoutSpec(spec);
  return renderLayout(spec, layout, opts);
}

/** Precedence: render option > spec > default. `theme: "dark"` (legacy) is read as a mode. */
export function resolveRenderTheme(spec: DiagramSpec, opts: RenderOptions): { theme: ResolvedTheme; mode: Mode } {
  let mode: Mode = opts.mode ?? "auto";
  let themeInput: RenderOptions["theme"] = opts.theme ?? spec.theme ?? "distill";
  if (typeof themeInput === "string" && isMode(themeInput)) {
    if (!opts.mode) mode = themeInput;
    themeInput = spec.theme ?? "distill";
  }
  const theme = applyPalette(resolveTheme(themeInput), { ...(spec.palette ?? {}), ...(opts.palette ?? {}) });
  return { theme, mode };
}

export function renderLayout(spec: DiagramSpec, layout: Layout, opts: RenderOptions = {}): string {
  const isStatic = !!opts.static;
  const { theme, mode } = resolveRenderTheme(spec, opts);
  const ids = edgeIds(spec);
  const icons = new IconEmitter(diagramNs(JSON.stringify(layout.nodes.map((q) => [q.id, q.spec.icon, q.spec.label]))));
  const nodeById = new Map(layout.nodes.map((nd) => [nd.id, nd]));
  const edgeById = new Map(layout.edges.map((e) => [e.id, e]));

  // ---- steps -> per-element step membership ----
  const stepsOf = new Map<string, number[]>();
  const addStep = (id: string, k: number) => stepsOf.set(id, [...(stepsOf.get(id) ?? []), k]);
  spec.steps.forEach((s, k) => {
    const shown = new Set(s.show);
    s.show.forEach((id) => addStep(id, k));
    // edges whose both endpoints are shown are shown too
    layout.edges.forEach((e) => {
      if (!shown.has(e.id) && shown.has(e.from) && shown.has(e.to)) addStep(e.id, k);
    });
  });
  const stepAttr = (id: string) => (stepsOf.has(id) ? ` data-steps="${stepsOf.get(id)!.join(",")}"` : "");

  // ---- notes: side gutter (Distill-style margin annotations) or a numbered list below the diagram ----
  const NOTE_W = 190;
  const below = spec.notesPosition === "below";
  const GUTTER = spec.notes.length && !below ? NOTE_W + 40 : 0;
  const titleH = spec.title ? 34 : 0;
  const stepperH = spec.steps.length ? 40 : 0;
  const ox = 0;
  const oy = titleH;

  const anchorOf = (target: string): Pt | null => {
    const nd = nodeById.get(target);
    if (nd) return { x: nd.x + nd.w, y: nd.y + Math.min(nd.h / 2, 24) };
    const e = edgeById.get(target);
    if (e && e.points.length) {
      const m = e.points[Math.floor(e.points.length / 2)];
      return { x: m.x, y: m.y };
    }
    return null;
  };

  let notesSvg = "";
  let notesH = 0;
  const maxChars = below ? Math.max(28, Math.floor((layout.width - 28) / 6.4)) : 30;
  const placed = spec.notes
    .map((nt) => ({ nt, a: anchorOf(nt.target), lines: wrap(nt.text, maxChars) }))
    .filter((p) => p.a)
    .sort((p, q) => p.a!.y - q.a!.y);
  let cursor = -Infinity;
  const marker = (x: number, y: number, num: number) =>
    `<g class="mark" transform="translate(${n(x)} ${n(y)})"><circle r="7.5"/><text y="3.5">${num}</text></g>`;
  const noteText = (x: number, y: number, lines: string[]) =>
    `<g class="note-g"><text class="note" x="${n(x)}" y="${n(y)}">` +
    lines.map((l, i) => `<tspan x="${n(x)}" dy="${i === 0 ? 0 : 15}">${esc(l)}</tspan>`).join("") +
    `</text></g>`;
  // Numbered markers instead of long leader lines: a marker sits on the target, the same number prefixes the note.
  let listY = layout.height + 22;
  placed.forEach((p, idx) => {
    const num = idx + 1;
    const h = p.lines.length * 15;
    notesSvg += marker(p.a!.x, p.a!.y, num);
    if (below) {
      notesSvg += marker(8, listY + 4, num) + noteText(22, listY + 8, p.lines);
      listY += h + 8;
      notesH = listY - layout.height;
    } else {
      const y = Math.max(p.a!.y - 6, cursor + 12);
      cursor = y + h;
      const nx = layout.width + 36;
      notesSvg += marker(nx - 2, y + 4, num) + noteText(nx + 12, y + 8, p.lines);
    }
  });

  // ---- canvas: content size, optional padding, optional target aspect ratio (letterboxed, content centred) ----
  const pad = opts.padding ?? 0;
  let W = layout.width + GUTTER + 2 * pad;
  let H = layout.height + titleH + stepperH + notesH + 2 * pad;
  let dx = pad;
  let dy = pad;
  if (opts.aspect && opts.aspect > 0) {
    if (W / H < opts.aspect) {
      const w2 = Math.ceil(H * opts.aspect);
      dx += (w2 - W) / 2;
      W = w2;
    } else {
      const h2 = Math.ceil(W / opts.aspect);
      dy += (h2 - H) / 2;
      H = h2;
    }
  }

  // ---- containers ----
  let contSvg = "";
  let nodeSvg = "";
  for (const nd of layout.nodes) {
    const k = kindOf(nd.spec.kind);
    const common =
      `data-id="${esc(nd.id)}"` +
      (nd.parent ? ` data-parent="${esc(nd.parent)}"` : "") +
      (nd.spec.description ? ` data-desc="${esc(nd.spec.description)}"` : "") +
      stepAttr(nd.id);
    if (nd.container) {
      const parity = nd.depth % 2 === 0 ? "even" : "odd";
      const hic = nodeIcon(nd.spec);
      const off = hic ? HEAD_ICON + 8 : 0;
      const hicon = hic ? icons.use(hic.res, nd.x + 10, nd.y + 9, HEAD_ICON) : "";
      const tag = k.tag ? `<text class="tag" x="${n(nd.x + 12 + off)}" y="${n(nd.y + 17)}">${esc(k.tag.toUpperCase())}</text>` : "";
      const ty = k.tag ? nd.y + 34 : nd.y + 25;
      contSvg +=
        `<g class="el cont ${parity}${nd.spec.tone ? ` tn-${nd.spec.tone}` : ""}" ${common}>` +
        `<rect x="${n(nd.x)}" y="${n(nd.y)}" width="${n(nd.w)}" height="${n(nd.h)}" rx="8"/>` +
        hicon +
        tag +
        `<text class="head" x="${n(nd.x + 12 + off)}" y="${n(ty)}">${esc(nd.spec.label)}</text>` +
        `</g>`;
    } else {
      const cy = nd.y + nd.h / 2;
      const cx = nd.x + nd.w / 2;
      // tone: card nodes tint their badge; flat shapes (pill/diamond/plain/entity) tint the whole shape
      const tn = nd.spec.tone && k.shape ? ` tn-${nd.spec.tone}` : "";
      const open = `<g class="el node${tn}" tabindex="0" ${common}>`;
      const box = (rx: number) =>
        `<rect x="${n(nd.x)}" y="${n(nd.y)}" width="${n(nd.w)}" height="${n(nd.h)}" rx="${rx}"/>`;
      const centered = () =>
        `<text class="head" text-anchor="middle" x="${n(cx)}" y="${n(nd.spec.sublabel ? cy - 3 : cy + 4.5)}">${esc(nd.spec.label)}</text>` +
        (nd.spec.sublabel ? `<text class="sub" text-anchor="middle" x="${n(cx)}" y="${n(cy + 12)}">${esc(nd.spec.sublabel)}</text>` : "");
      const ic = nodeIcon(nd.spec);
      if (ic && ic.variant === "stacked") {
        const iy = nd.y + 8;
        nodeSvg +=
          `<g class="el node stacked${tn}" tabindex="0" ${common}>` +
          box(8) +
          icons.use(ic.res, cx - STACK_ICON / 2, iy, STACK_ICON) +
          `<text class="head" text-anchor="middle" x="${n(cx)}" y="${n(iy + STACK_ICON + 16)}">${esc(nd.spec.label)}</text>` +
          (nd.spec.sublabel ? `<text class="sub" text-anchor="middle" x="${n(cx)}" y="${n(iy + STACK_ICON + 30)}">${esc(nd.spec.sublabel)}</text>` : "") +
          `</g>`;
      } else if (k.shape === "diamond") {
        nodeSvg +=
          open +
          `<polygon points="${n(cx)},${n(nd.y)} ${n(nd.x + nd.w)},${n(cy)} ${n(cx)},${n(nd.y + nd.h)} ${n(nd.x)},${n(cy)}"/>` +
          centered() +
          `</g>`;
      } else if (k.shape === "pill") {
        nodeSvg += open + box(nd.h / 2) + centered() + `</g>`;
      } else if (k.shape === "plain") {
        nodeSvg += open + box(6) + centered() + `</g>`;
      } else if (k.shape === "entity" && nd.spec.fields?.length) {
        let rows = "";
        nd.spec.fields.forEach((f, i) => {
          const ry = nd.y + ENTITY_HEAD + i * ENTITY_ROW;
          rows +=
            `<line class="rowline" x1="${n(nd.x)}" x2="${n(nd.x + nd.w)}" y1="${n(ry)}" y2="${n(ry)}"/>` +
            (f.key ? `<text class="key" x="${n(nd.x + 8)}" y="${n(ry + 14)}">${f.key.toUpperCase()}</text>` : "") +
            `<text class="field" x="${n(nd.x + 30)}" y="${n(ry + 14)}">${esc(f.name)}</text>` +
            (f.type ? `<text class="ftype" text-anchor="end" x="${n(nd.x + nd.w - 8)}" y="${n(ry + 14)}">${esc(f.type)}</text>` : "");
        });
        nodeSvg +=
          open +
          box(6) +
          `<text class="head" x="${n(nd.x + 10)}" y="${n(nd.y + 20)}">${esc(nd.spec.label)}</text>` +
          rows +
          `</g>`;
      } else {
        nodeSvg +=
          open +
          box(6) +
          (ic?.res.data.mono
            ? `<g class="badge t-${nd.spec.tone ?? k.tone}" transform="translate(${n(nd.x + 20)} ${n(cy)})"><circle r="11"/>${icons.use(ic.res, -7, -7, 14)}</g>`
            : ic
              ? icons.use(ic.res, nd.x + 9, cy - CARD_ICON / 2, CARD_ICON)
              : `<g class="badge t-${nd.spec.tone ?? k.tone}" transform="translate(${n(nd.x + 20)} ${n(cy)})"><circle r="11"/>${glyphSvg(nd.spec.kind)}</g>`) +
          `<text class="head" x="${n(nd.x + 38)}" y="${n(nd.spec.sublabel ? cy - 3 : cy + 4.5)}">${esc(nd.spec.label)}</text>` +
          (nd.spec.sublabel ? `<text class="sub" x="${n(nd.x + 38)}" y="${n(cy + 12)}">${esc(nd.spec.sublabel)}</text>` : "") +
          `</g>`;
      }
    }
  }

  // ---- edges ----
  let edgeSvg = "";
  spec.edges.forEach((es, i) => {
    const le: LEdge | undefined = edgeById.get(ids[i]);
    if (!le || le.points.length < 2) return;
    const d = roundedPath(le.points);
    const cls = `el edge${es.style === "dashed" ? " dashed" : ""}`;
    const lab = le.label;
    const lx = lab ? lab.x : 0;
    // end labels (e.g. cardinality), nudged off the line near each endpoint
    const endLabel = (text: string | undefined, a: Pt, b: Pt) => {
      if (!text) return "";
      const dx = Math.sign(b.x - a.x);
      const dy = Math.sign(b.y - a.y);
      const x = a.x + (dx !== 0 ? dx * 10 : 8);
      const y = a.y + (dy !== 0 && dx === 0 ? dy * 12 : -6);
      return `<text class="endl" x="${n(x)}" y="${n(y)}" text-anchor="${dx !== 0 ? "middle" : "start"}">${esc(text)}</text>`;
    };
    const pts = le.points;
    const ends =
      endLabel(es.fromLabel, pts[0], pts[1]) + endLabel(es.toLabel, pts[pts.length - 1], pts[pts.length - 2]);
    edgeSvg +=
      `<g class="${cls}" data-id="${esc(le.id)}" data-from="${esc(le.from)}" data-to="${esc(le.to)}"${stepAttr(le.id)}>` +
      `<path class="hit" d="${d}"/>` +
      `<path class="line" d="${d}" marker-end="url(#dgm-arrow)"${es.both ? ' marker-start="url(#dgm-arrow-r)"' : ""}/>` +
      (es.flow && !isStatic ? `<path class="pkt" d="${d}"/>` : "") +
      ends +
      (lab
        ? `<g class="elabel"><rect x="${n(lx)}" y="${n(lab.y)}" width="${n(lab.w)}" height="${n(lab.h)}" rx="3"/>` +
          `<text x="${n(lx + lab.w / 2)}" y="${n(lab.y + lab.h / 2 + 3.5)}" text-anchor="middle">${esc(lab.text)}</text></g>`
        : "") +
      `</g>`;
  });

  // ---- stepper ----
  let stepper = "";
  if (spec.steps.length && !isStatic) {
    const sy = layout.height + titleH + notesH + 8;
    stepper =
      `<g class="stepper" transform="translate(0 ${sy})">` +
      `<g class="btn" data-act="prev" tabindex="0"><rect x="0" y="0" width="26" height="24" rx="5"/><text x="13" y="16.5">‹</text></g>` +
      `<g class="btn" data-act="next" tabindex="0"><rect x="32" y="0" width="26" height="24" rx="5"/><text x="45" y="16.5">›</text></g>` +
      `<text class="step-label" x="70" y="16"></text></g>`;
  }

  const title = spec.title ? `<text class="title" x="2" y="20">${esc(spec.title)}</text>` : "";
  const dataSteps = spec.steps.length
    ? ` data-steps='${JSON.stringify(spec.steps.map((s) => ({ title: s.title, text: s.text }))).replace(/'/g, "&#39;")}'`
    : "";
  const themeAttr = !isStatic && mode !== "auto" ? ` data-mode="${mode}"` : "";
  const script =
    !isStatic && opts.embedRuntime !== false ? `<script><![CDATA[${RUNTIME_SOURCE}]]></script>` : "";

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" class="dgm" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img"${themeAttr}${dataSteps}>` +
    `<title>${esc(spec.title ?? "Diagram")}</title>` +
    (spec.description ? `<desc>${esc(spec.description)}</desc>` : "") +
    `<defs>` +
    icons.markup() +
    `<marker id="dgm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 1.5L9 5L0 8.5z"/></marker>` +
    `<marker id="dgm-arrow-r" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M10 1.5L1 5L10 8.5z"/></marker>` +
    `</defs>` +
    `<style>${css(theme, { literal: isStatic, mode: mode === "dark" ? "dark" : "light" })}</style>` +
    `<g transform="translate(${n(dx)} ${n(dy)})">` +
    title +
    `<g transform="translate(${ox} ${oy})">${contSvg}${edgeSvg}${nodeSvg}${notesSvg}</g>` +
    stepper +
    `</g>` +
    script +
    `</svg>`;

  return svg;
}
