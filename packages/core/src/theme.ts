import { ResolvedTheme, TOKEN_KEYS, TONES, TokenMap } from "./themes/index.js";

export const SERIF = `Georgia,'Source Serif 4','Times New Roman',serif`;
export const SANS = `'Segoe UI',-apple-system,'Helvetica Neue',Helvetica,Arial,sans-serif`;

export interface CssOptions {
  /** Literal values, no custom properties/media queries/animation (for resvg → PNG). */
  literal?: boolean;
  /** Mode used for literal output. */
  mode?: "light" | "dark";
}

/**
 * Stylesheet embedded in the SVG.
 * Interactive output reads `--dgm-<token>` (light) / `--dgm-dark-<token>` (dark) from the host page when set,
 * falling back to the values baked from the theme — so a site can re-theme with plain CSS.
 */
export function css(theme: ResolvedTheme, o: CssOptions = {}): string {
  const lit = !!o.literal;
  const lm: TokenMap = (o.mode === "dark" ? theme.dark : theme.light) ?? {};
  const v = (k: string) => (lit ? (lm[k] ?? "#000") : `var(--${k})`);
  const serif = theme.fonts.serif ?? SERIF;
  const sans = theme.fonts.sans ?? SANS;
  const fSerif = lit ? serif : `var(--dgm-serif,${serif})`;
  const fSans = lit ? sans : `var(--dgm-sans,${sans})`;

  const decls = (t: TokenMap, prefix: string) =>
    TOKEN_KEYS.filter((k) => t[k]).map((k) => `--${k}:var(${prefix}${k},${t[k]})`).join(";");

  const toneRules = TONES.map(
    (t) =>
      `.dgm .t-${t} circle{fill:${v("tone-" + t)}}` +
      `.dgm .tn-${t}.cont rect,.dgm .tn-${t}.node rect,.dgm .tn-${t}.node polygon{fill:${v("tone-" + t)}}`,
  ).join("");

  const vars = lit
    ? ""
    : `.dgm{${decls(theme.light, "--dgm-")}}` +
      `@media (prefers-color-scheme:dark){.dgm:not([data-mode=light]){${decls(theme.dark, "--dgm-dark-")}}}` +
      `.dgm[data-mode=dark]{${decls(theme.dark, "--dgm-dark-")}}`;

  const interactive = lit
    ? ""
    : `
.dgm .edge .pkt{fill:none;stroke:${v("flow")};stroke-width:3;stroke-linecap:round;stroke-dasharray:0.1 14;animation:dgm-flow 1.1s linear infinite}
@keyframes dgm-flow{to{stroke-dashoffset:-14.1}}
.dgm .el{transition:opacity .15s}
.dgm .node,.dgm .cont,.dgm .edge{cursor:pointer}
.dgm.dim .el:not(.hl):not(.ctx){opacity:.16}
.dgm.dim .note-g,.dgm.dim .leader{opacity:.5}
.dgm .node.hl rect,.dgm .node.hl polygon{stroke:${v("accent")};stroke-width:1.8}
.dgm .cont.hl rect{stroke:${v("accent")}}
.dgm .edge.hl .line{stroke:${v("accent")};stroke-width:1.8}
.dgm .edge.hl marker path{fill:${v("accent")}}
.dgm .el:focus{outline:none}.dgm .el:focus-visible rect{stroke:${v("accent")};stroke-width:2}
.dgm .btn rect{fill:${v("node-bg")};stroke:${v("stroke")};cursor:pointer}
.dgm .btn:hover rect{stroke:${v("accent")}}
.dgm .btn text{text-anchor:middle;font-size:13px}
.dgm .btn.off{opacity:.35;pointer-events:none}
.dgm .step-label{font-family:${fSerif};font-size:12.5px}
.dgm .tip rect{fill:${v("text")};opacity:.94}.dgm .tip text{fill:${v("panel-b")};font-size:11px}
@media (prefers-reduced-motion:reduce){.dgm .edge .pkt{animation:none}.dgm .el{transition:none}}`;

  return `
${vars}
.dgm{font-family:${fSans};color:${v("text")}}
.dgm text{fill:${v("text")};font-size:12.5px}
.dgm .tag{font-size:9px;letter-spacing:.08em;fill:${v("muted")}}
.dgm .head{font-weight:600}
.dgm .sub{font-size:10.5px;fill:${v("muted")}}
.dgm .note{font-family:${fSerif};font-size:12px;fill:${v("muted")}}
.dgm .title{font-family:${fSerif};font-size:15px;font-style:italic}
.dgm .cont rect{stroke-width:1}
.dgm .cont.even rect{fill:${v("panel-a")};stroke:${v("panel-stroke")}}
.dgm .cont.odd rect{fill:${v("panel-b")};stroke:${v("stroke")};stroke-dasharray:4 3}
.dgm .node rect,.dgm .node polygon{fill:${v("node-bg")};stroke:${v("stroke")};stroke-width:1}
.dgm .node .rowline{stroke:${v("panel-stroke")};stroke-width:1}
.dgm .node .field{font-size:11.5px}
.dgm .node .ftype{font-size:10.5px;fill:${v("muted")}}
.dgm .node .key{font-size:8.5px;font-weight:700;fill:${v("accent")}}
.dgm .endl{font-size:10.5px;fill:${v("muted")};font-family:${fSerif};font-style:italic}
.dgm .badge circle{stroke:none}
.dgm .badge path{fill:none;stroke:${v("icon-ink")};stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round}
.dgm .badge text{fill:${v("icon-ink")};font-size:13px;text-anchor:middle;font-family:${fSerif};font-style:italic}
${toneRules}
.dgm .edge .line{fill:none;stroke:${v("edge")};stroke-width:1.2}
.dgm .edge.dashed .line{stroke-dasharray:5 4}
.dgm .edge .hit{fill:none;stroke:transparent;stroke-width:12}
.dgm marker path{fill:${v("edge")}}
.dgm .elabel rect{fill:${v("label-bg")};opacity:.92}
.dgm .elabel text{font-size:10.5px;fill:${v("muted")}}
.dgm .mark circle{fill:${v("accent")}}
.dgm .mark text{fill:${v("panel-b")};font-size:9.5px;font-weight:600;text-anchor:middle;font-family:${fSans}}
.dgm .leader{fill:none;stroke:${v("muted")};stroke-width:.8;stroke-dasharray:1.5 2.5}
${interactive}
`;
}
