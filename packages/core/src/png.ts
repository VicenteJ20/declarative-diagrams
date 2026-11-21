import { Resvg } from "@resvg/resvg-js";
import { DiagramSpec } from "./spec.js";
import { renderSvg, resolveRenderTheme, RenderOptions } from "./render.js";

export interface PngOptions extends Omit<RenderOptions, "static"> {
  scale?: number;
  /** Page background; default is the theme's panel colour for the chosen mode. "transparent" for none. */
  background?: string;
}

export async function renderPng(spec: DiagramSpec, opts: PngOptions = {}): Promise<Buffer> {
  const { theme, mode } = resolveRenderTheme(spec, opts);
  const dark = mode === "dark";
  const svg = await renderSvg(spec, { ...opts, mode: dark ? "dark" : "light", static: true });
  const bg = opts.background ?? (dark ? theme.dark["panel-b"] : theme.light["panel-b"]) ?? "#ffffff";
  const resvg = new Resvg(svg, {
    background: bg === "transparent" ? undefined : bg,
    fitTo: { mode: "zoom", value: opts.scale ?? 2 },
    font: { loadSystemFonts: true, defaultFontFamily: "Segoe UI", serifFamily: "Georgia", sansSerifFamily: "Segoe UI" },
  });
  return resvg.render().asPng();
}
