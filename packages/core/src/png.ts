import { Resvg } from "@resvg/resvg-js";
import { DiagramSpec } from "./spec.js";
import { renderSvg, resolveRenderTheme, RenderOptions } from "./render.js";

export interface PngOptions extends Omit<RenderOptions, "static"> {
  scale?: number;
  /** Page background; default is the theme's panel colour for the chosen mode. "transparent" for none. */
  background?: string;
}

/**
 * PNG text is drawn with system fonts (resvg), so pick sensible defaults per OS. Output therefore differs slightly
 * between machines; the interactive SVG uses the browser's fonts instead.
 */
function systemFonts() {
  if (process.platform === "win32") return { defaultFontFamily: "Segoe UI", serifFamily: "Georgia", sansSerifFamily: "Segoe UI" };
  if (process.platform === "darwin") return { defaultFontFamily: "Helvetica Neue", serifFamily: "Georgia", sansSerifFamily: "Helvetica Neue" };
  return { defaultFontFamily: "DejaVu Sans", serifFamily: "DejaVu Serif", sansSerifFamily: "DejaVu Sans" };
}

export async function renderPng(spec: DiagramSpec, opts: PngOptions = {}): Promise<Buffer> {
  const { theme, mode } = resolveRenderTheme(spec, opts);
  const dark = mode === "dark";
  const svg = await renderSvg(spec, { ...opts, mode: dark ? "dark" : "light", static: true });
  const bg = opts.background ?? (dark ? theme.dark["panel-b"] : theme.light["panel-b"]) ?? "#ffffff";
  const resvg = new Resvg(svg, {
    background: bg === "transparent" ? undefined : bg,
    fitTo: { mode: "zoom", value: opts.scale ?? 2 },
    font: { loadSystemFonts: true, ...systemFonts() },
  });
  return resvg.render().asPng();
}
