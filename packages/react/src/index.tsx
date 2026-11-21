import { useEffect, useMemo, useRef, useState } from "react";
import { attach } from "@dgm/core/runtime";
import { applyPalette, fontToCssVars, isMode, resolveTheme, themeToCssVars } from "@dgm/core/themes";
import type { FontMode, Mode, Palette, ThemeDef, ResolvedTheme } from "@dgm/core/themes";

export interface DiagramProps {
  /** SVG string produced by the Vite plugin (`import svg from "./x.diagram.yaml"`) or `renderSvg()`. */
  svg: string;
  /** Optional author-defined narrow layout (`import svg, { narrow } from …`). Only used if you pass it. */
  narrowSvg?: string | null;
  /** Container width (px) under which `narrowSvg` replaces `svg`. Default 560. */
  narrowBelow?: number;
  caption?: string;
  /** `auto` (default) follows the site (`<html data-theme>` / `.dark`) then the OS; or force `light` / `dark`. */
  mode?: Mode;
  /**
   * Colour theme: a built-in name ("olive", "azure", "aws"…) or an imported `*.theme.yaml` object, applied at runtime
   * through CSS variables. Legacy: "light" | "dark" | "auto" are treated as `mode`.
   */
  theme?: string | ThemeDef | ResolvedTheme;
  /** Typeface style: `mixed` (Distill: sans labels, serif title/notes), `sans` or `serif` everywhere. Default: what the SVG was built with. */
  font?: FontMode;
  /** Token overrides: `{ accent: "#6b7a2f", dark: { accent: "#a9bb62" }, tones: { data: "#c8d8c4" } }`. */
  palette?: Palette;
  /**
   * How the diagram fits its box.
   * `auto` (default): fill the width, but never narrower than `minWidth` (then scroll sideways);
   * `width`: always scale to the width; `scroll`: natural size, scroll if it does not fit.
   */
  fit?: "auto" | "width" | "scroll";
  /** Under this width the figure scrolls horizontally instead of shrinking the text (fit="auto"). Default 640. */
  minWidth?: number;
  /** Fixed box ratio, e.g. `16/9`, `"4/3"` or `1.5`. The diagram is centred inside it and never distorted. */
  aspectRatio?: number | string;
  maxWidth?: number | string;
  /** Cap the height; the diagram scales down to fit. */
  maxHeight?: number | string;
  align?: "left" | "center" | "right";
  /**
   * "Open full screen" button with zoom. `auto` (default): shown only when the diagram is drawn
   * noticeably smaller than its natural size (typical on phones).
   */
  expand?: boolean | "auto";
  className?: string;
}

const STYLE = `
.dgm-fig{position:relative;margin:2rem 0;--dgm-min:640px}
.dgm-fig[data-align=center]{margin-left:auto;margin-right:auto}
.dgm-fig[data-align=right]{margin-left:auto}
.dgm-fig .dgm-scroll{overflow-x:auto}
.dgm-fig svg.dgm{display:block;width:100%;height:auto;min-width:var(--dgm-min)}
.dgm-fig[data-fit=width] svg.dgm{min-width:0}
.dgm-fig[data-fit=scroll] svg.dgm{width:auto;max-width:none;min-width:0}
.dgm-fig[data-aspect] .dgm-scroll{aspect-ratio:var(--dgm-aspect)}
.dgm-fig[data-aspect] svg.dgm{height:100%}
.dgm-fig[data-maxh] svg.dgm{width:auto;max-width:100%;min-width:0;max-height:var(--dgm-maxh);margin:0 auto}
.dgm-fig figcaption{font-family:Georgia,serif;font-size:.85rem;color:#777;margin-top:.5rem}
.dgm-fig .dgm-expand{position:absolute;top:4px;right:4px;z-index:2;font:14px/1 system-ui,sans-serif;width:30px;height:30px;border-radius:6px;border:1px solid #8885;background:#fffc;color:#444;cursor:pointer}
@media (prefers-color-scheme:dark){.dgm-fig .dgm-expand{background:#222c;color:#ddd}}
.dgm-dialog{width:min(96vw,1500px);max-height:92vh;padding:0;border:1px solid #8886;border-radius:10px;background:Canvas;color:CanvasText}
.dgm-dialog::backdrop{background:#0008}
.dgm-dialog .bar{position:sticky;top:0;z-index:2;display:flex;gap:6px;justify-content:flex-end;padding:8px;background:Canvas}
.dgm-dialog .bar button{font:14px system-ui,sans-serif;min-width:34px;height:30px;border-radius:6px;border:1px solid #8886;background:transparent;color:inherit;cursor:pointer}
.dgm-dialog .body{overflow:auto;max-height:calc(92vh - 50px);padding:0 12px 12px}
.dgm-dialog svg.dgm{display:block;max-width:none;min-width:0;height:auto}
`;

function siteMode(): "light" | "dark" | undefined {
  const el = document.documentElement;
  const t = el.getAttribute("data-theme") ?? el.getAttribute("data-mode");
  if (t === "dark" || t === "light") return t;
  if (el.classList.contains("dark")) return "dark";
  if (el.classList.contains("light")) return "light";
  return undefined;
}

const css = (v: number | string | undefined) => (typeof v === "number" ? `${v}px` : v);

function parseRatio(v: number | string | undefined): number | undefined {
  if (v == null || v === "auto") return undefined;
  if (typeof v === "number") return v > 0 ? v : undefined;
  const m = /^(\d+(?:\.\d+)?)\s*[/:]\s*(\d+(?:\.\d+)?)$/.exec(v.trim());
  const r = m ? Number(m[1]) / Number(m[2]) : Number(v);
  return r > 0 ? r : undefined;
}

export function Diagram({
  svg,
  narrowSvg,
  narrowBelow = 560,
  caption,
  mode,
  theme,
  palette,
  font,
  fit = "auto",
  minWidth = 640,
  aspectRatio,
  maxWidth,
  maxHeight,
  align = "left",
  expand = "auto",
  className,
}: DiagramProps) {
  const fig = useRef<HTMLElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const dlg = useRef<HTMLDialogElement>(null);
  const [narrow, setNarrow] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1);

  const active = narrow && narrowSvg ? narrowSvg : svg;
  const ratio = parseRatio(aspectRatio);

  // legacy: theme="dark" means mode
  let effMode: Mode = mode ?? "auto";
  let effTheme = theme;
  if (typeof theme === "string" && isMode(theme)) {
    if (!mode) effMode = theme;
    effTheme = undefined;
  }

  const vars = useMemo(() => {
    if (!effTheme && !palette && !font) return undefined;
    const base: ResolvedTheme = effTheme
      ? resolveTheme(effTheme)
      : { resolved: true, name: "", light: {}, dark: {}, fonts: {} };
    const v = themeToCssVars(applyPalette(base, palette));
    return font ? { ...v, ...fontToCssVars(font, base.fonts) } : v;
  }, [effTheme, palette, font]);

  // attach interactivity to the (re)rendered inline SVG + keep data-mode in sync with the site
  useEffect(() => {
    const root = fig.current;
    if (!root) return;
    const svgs = () => Array.from(root.querySelectorAll<SVGSVGElement>("svg.dgm"));
    svgs().forEach((s) => attach(s));
    const sync = () => {
      const m = effMode === "auto" ? siteMode() : effMode;
      svgs().forEach((s) => (m ? s.setAttribute("data-mode", m) : s.removeAttribute("data-mode")));
    };
    sync();
    if (effMode !== "auto") return;
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "data-mode"] });
    return () => mo.disconnect();
  }, [active, effMode, open]);

  // responsive: pick the narrow variant (if the author provided one) and decide whether "expand" is useful
  useEffect(() => {
    const root = fig.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const w = root.getBoundingClientRect().width;
      setNarrow(!!narrowSvg && w < narrowBelow);
      const s = host.current?.querySelector<SVGSVGElement>("svg.dgm");
      if (s) {
        const natural = s.viewBox.baseVal.width || s.getBoundingClientRect().width;
        setCanExpand(natural > 0 && s.getBoundingClientRect().width / natural < 0.8);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [narrowSvg, narrowBelow, active]);

  useEffect(() => {
    const d = dlg.current;
    if (open && d && !d.open) d.showModal();
  }, [open]);

  const showExpand = expand === true || (expand === "auto" && canExpand);

  const figStyle: Record<string, string | undefined> = {
    // the author-defined narrow layout is meant to fit the width, so `minWidth` (made for the wide one) is ignored
    "--dgm-min": `${narrow && narrowSvg ? 0 : minWidth}px`,
    maxWidth: css(maxWidth),
    ...(ratio ? { "--dgm-aspect": String(ratio) } : {}),
    ...(maxHeight != null ? { "--dgm-maxh": css(maxHeight) } : {}),
    ...(vars ?? {}),
  };

  const naturalW = (() => {
    const m = /viewBox="0 0 ([\d.]+) /.exec(active);
    return m ? Number(m[1]) : undefined;
  })();

  return (
    <figure
      ref={fig}
      className={`dgm-fig ${className ?? ""}`}
      data-fit={fit}
      data-align={align}
      data-aspect={ratio ? "" : undefined}
      data-maxh={maxHeight != null ? "" : undefined}
      style={figStyle as any}
    >
      <style dangerouslySetInnerHTML={{ __html: STYLE }} />
      {/* SVG is generated by our own renderer from a validated spec; labels are escaped. */}
      <div className="dgm-scroll" ref={host} dangerouslySetInnerHTML={{ __html: active }} />
      {showExpand && (
        <button className="dgm-expand" type="button" aria-label="Open diagram full screen" title="Full screen" onClick={() => { setZoom(1); setOpen(true); }}>
          ⤢
        </button>
      )}
      {caption && <figcaption>{caption}</figcaption>}
      {open && (
        <dialog
          ref={dlg}
          className="dgm-dialog"
          onClose={() => setOpen(false)}
          onClick={(e) => e.target === dlg.current && dlg.current?.close()}
        >
          <div className="bar">
            <button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.4, z - 0.25))}>−</button>
            <button type="button" aria-label="Reset zoom" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
            <button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(4, z + 0.25))}>+</button>
            <button type="button" aria-label="Close" onClick={() => dlg.current?.close()}>✕</button>
          </div>
          <div className="body">
            <div style={{ width: naturalW ? naturalW * zoom : undefined }} dangerouslySetInnerHTML={{ __html: active.replace(/ width="[\d.]+" height="[\d.]+"/, ' width="100%"') }} />
          </div>
        </dialog>
      )}
    </figure>
  );
}

export default Diagram;
