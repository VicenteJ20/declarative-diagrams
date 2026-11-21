import { Resvg } from "@resvg/resvg-js";
import { DiagramSpec } from "./spec.js";
import { renderSvg, RenderOptions } from "./render.js";
import { SANS, SERIF } from "./theme.js";

export interface PngOptions extends Omit<RenderOptions, "static"> {
  scale?: number;
  /** Page background; default white (light) / near-black (dark). Pass "transparent" for none. */
  background?: string;
}

export async function renderPng(spec: DiagramSpec, opts: PngOptions = {}): Promise<Buffer> {
  const theme = opts.theme ?? "light";
  const svg = await renderSvg(spec, { ...opts, static: true, theme });
  const bg = opts.background ?? (theme === "dark" ? "#16151c" : "#ffffff");
  const resvg = new Resvg(svg, {
    background: bg === "transparent" ? undefined : bg,
    fitTo: { mode: "zoom", value: opts.scale ?? 2 },
    font: { loadSystemFonts: true, defaultFontFamily: "Segoe UI", serifFamily: "Georgia", sansSerifFamily: "Segoe UI" },
  });
  return resvg.render().asPng();
}

export { SANS, SERIF };
