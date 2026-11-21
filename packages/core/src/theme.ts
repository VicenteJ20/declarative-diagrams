export type ThemeName = "light" | "dark";

export const TOKENS: Record<ThemeName, Record<string, string>> = {
  light: {
    "panel-a": "#f0eef6",
    "panel-b": "#ffffff",
    "panel-stroke": "#d9d5e6",
    "node-bg": "#ffffff",
    stroke: "#8c8899",
    text: "#2c2b36",
    muted: "#7b7788",
    edge: "#6d6a7a",
    accent: "#8a63d2",
    flow: "#f2a33a",
    "label-bg": "#ffffff",
    "tone-compute": "#d8cdf3",
    "tone-data": "#c9d3f7",
    "tone-network": "#f6cbe4",
    "tone-neutral": "#e4e2ea",
    ink: "#4a3f6b",
  },
  dark: {
    "panel-a": "#26242f",
    "panel-b": "#1d1c24",
    "panel-stroke": "#3b3848",
    "node-bg": "#32303e",
    stroke: "#8f8ba3",
    text: "#ecebf3",
    muted: "#a09cb2",
    edge: "#9c98ad",
    accent: "#b99cf5",
    flow: "#ffb94d",
    "label-bg": "#1d1c24",
    "tone-compute": "#5b4a8a",
    "tone-data": "#41528f",
    "tone-network": "#8a4a75",
    "tone-neutral": "#4a4858",
    ink: "#f1ecff",
  },
};

const vars = (t: ThemeName) =>
  Object.entries(TOKENS[t])
    .map(([k, v]) => `--${k}:${v}`)
    .join(";");

export const SERIF = `Georgia,'Source Serif 4','Times New Roman',serif`;
export const SANS = `'Segoe UI',-apple-system,'Helvetica Neue',Helvetica,Arial,sans-serif`;

export function css(): string {
  return `
.dgm{${vars("light")};font-family:${SANS};color:var(--text)}
@media (prefers-color-scheme:dark){.dgm:not([data-theme=light]){${vars("dark")}}}
.dgm[data-theme=dark]{${vars("dark")}}
.dgm text{fill:var(--text);font-size:12.5px}
.dgm .tag{font-size:9px;letter-spacing:.08em;fill:var(--muted);text-transform:uppercase}
.dgm .head{font-weight:600}
.dgm .sub{font-size:10.5px;fill:var(--muted)}
.dgm .note{font-family:${SERIF};font-size:12px;fill:var(--muted)}
.dgm .title{font-family:${SERIF};font-size:15px;font-style:italic}
.dgm .cont rect{stroke-width:1}
.dgm .cont.even rect{fill:var(--panel-a);stroke:var(--panel-stroke)}
.dgm .cont.odd rect{fill:var(--panel-b);stroke:var(--stroke);stroke-dasharray:4 3}
.dgm .node rect{fill:var(--node-bg);stroke:var(--stroke);stroke-width:1}
.dgm .node polygon{fill:var(--node-bg);stroke:var(--stroke);stroke-width:1}
.dgm .node .rowline{stroke:var(--panel-stroke);stroke-width:1}
.dgm .node .field{font-size:11.5px}
.dgm .node .ftype{font-size:10.5px;fill:var(--muted)}
.dgm .node .key{font-size:8.5px;font-weight:700;fill:var(--accent)}
.dgm .endl{font-size:10.5px;fill:var(--muted);font-family:${SERIF};font-style:italic}
.dgm .node.hl polygon{stroke:var(--accent);stroke-width:1.8}
.dgm .badge circle{stroke:none}
.dgm .badge path{fill:none;stroke:var(--ink);stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round}
.dgm .badge text{fill:var(--ink);font-size:13px;text-anchor:middle;font-family:${SERIF};font-style:italic}
.dgm .t-compute circle{fill:var(--tone-compute)}.dgm .t-data circle{fill:var(--tone-data)}
.dgm .t-network circle{fill:var(--tone-network)}.dgm .t-neutral circle{fill:var(--tone-neutral)}
.dgm .edge .line{fill:none;stroke:var(--edge);stroke-width:1.2}
.dgm .edge.dashed .line{stroke-dasharray:5 4}
.dgm .edge .hit{fill:none;stroke:transparent;stroke-width:12}
.dgm .edge .pkt{fill:none;stroke:var(--flow);stroke-width:3;stroke-linecap:round;stroke-dasharray:0.1 14;animation:dgm-flow 1.1s linear infinite}
@keyframes dgm-flow{to{stroke-dashoffset:-14.1}}
.dgm marker path{fill:var(--edge)}
.dgm .elabel rect{fill:var(--label-bg);opacity:.92}
.dgm .elabel text{font-size:10.5px;fill:var(--muted)}
.dgm .mark circle{fill:var(--accent)}
.dgm .mark text{fill:#fff;font-size:9.5px;font-weight:600;text-anchor:middle;font-family:${SANS}}
.dgm .leader{fill:none;stroke:var(--muted);stroke-width:.8;stroke-dasharray:1.5 2.5}
.dgm .el{transition:opacity .15s}
.dgm .node,.dgm .cont,.dgm .edge{cursor:pointer}
.dgm.dim .el:not(.hl):not(.ctx){opacity:.16}
.dgm.dim .note-g,.dgm.dim .leader{opacity:.5}
.dgm .node.hl rect{stroke:var(--accent);stroke-width:1.8}
.dgm .cont.hl rect{stroke:var(--accent)}
.dgm .edge.hl .line{stroke:var(--accent);stroke-width:1.8}
.dgm .edge.hl marker path{fill:var(--accent)}
.dgm .el:focus{outline:none}.dgm .el:focus-visible rect{stroke:var(--accent);stroke-width:2}
.dgm .btn rect{fill:var(--node-bg);stroke:var(--stroke);cursor:pointer}
.dgm .btn:hover rect{stroke:var(--accent)}
.dgm .btn text{text-anchor:middle;font-size:13px}
.dgm .btn.off{opacity:.35;pointer-events:none}
.dgm .step-label{font-family:${SERIF};font-size:12.5px}
.dgm .tip rect{fill:var(--text);opacity:.94}.dgm .tip text{fill:var(--panel-b);font-size:11px}
@media (prefers-reduced-motion:reduce){.dgm .edge .pkt{animation:none}.dgm .el{transition:none}}
`;
}

/** Replace var(--x) with literal values (needed by renderers without CSS variables, e.g. resvg). */
export function resolveVars(svg: string, theme: ThemeName): string {
  const t = TOKENS[theme];
  return svg
    .replace(/<style>[\s\S]*?<\/style>/g, (style) =>
      style
        .replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "") // drop @media blocks
        .replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "")
        .replace(/animation:[^;}]*;?/g, ""),
    )
    .replace(/var\(--([\w-]+)\)/g, (_, k) => t[k] ?? "#000")
    .replace(/(--[\w-]+:[^;}]+;?)/g, "");
}
