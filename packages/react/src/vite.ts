import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import YAML from "yaml";
import { parseSpecText, validateSpec, applyVariant, renderSvg, loadConfig, parseThemeDef, type Mode, type FontMode, type ThemeDef, type Palette } from "@dgm/core";

export interface DgmPluginOptions {
  /** Default theme baked into every diagram (name or definition). A spec's own `theme:` is overridden by this. */
  theme?: string | ThemeDef;
  /** Default mode baked in (`auto` follows the page). */
  mode?: Mode;
  /** Typeface style baked into every diagram: `mixed` (default), `sans` or `serif`. */
  font?: FontMode;
  /** Token overrides baked into every diagram. */
  palette?: Palette;
  /**
   * Icons that cannot be resolved (typically: official Azure/AWS packs are not synced on the CI machine).
   * `error` (default) fails the build; `glyph` falls back to the node kind's built-in glyph with a warning.
   */
  missingIcons?: "error" | "glyph";
}

/**
 * Vite plugin.
 *  - `import svg from "./arch.diagram.yaml"` → interactive SVG string, laid out at build time (no ELK in the browser).
 *    Append `?static` for the non-interactive variant.
 *  - `import olive from "./olive.theme.yaml"` → theme object, to pass to `<Diagram theme={olive}>`.
 * Project themes listed in `dgm.config.json` are registered, so specs can reference them by name.
 */
export default function dgm(options: DgmPluginOptions = {}) {
  const DIAGRAM = /\.diagram\.(ya?ml|json)(\?static)?$/;
  const THEME = /\.theme\.(ya?ml|json)$/;
  let root = process.cwd();
  return {
    name: "dgm",
    enforce: "pre" as const,
    configResolved(c: { root: string }) {
      root = c.root;
    },
    async load(id: string) {
      const file = id.replace(/\?.*$/, "");
      const t = THEME.test(id);
      const d = DIAGRAM.exec(id);
      if (!t && !d) return null;
      loadConfig(dirname(file) || root);
      (this as any).addWatchFile?.(file);
      if (t) return `export default ${JSON.stringify(parseThemeDef(YAML.parse(readFileSync(file, "utf8")), file))};`;
      const res = validateSpec(parseSpecText(readFileSync(file, "utf8")), { missingIcons: options.missingIcons === "glyph" ? "warn" : "error" });
      for (const w of res.warnings) console.warn(`[dgm] ${file}: ${w}`);
      if (!res.ok) throw new Error(`[dgm] ${file}\n  ${res.errors.join("\n  ")}`);
      const ro = {
        embedRuntime: false,
        static: !!d![2],
        theme: options.theme,
        mode: options.mode,
        palette: options.palette,
        font: options.font,
      };
      const svg = await renderSvg(res.spec!, ro);
      // Author-defined `variants.narrow` (never applied automatically): `import svg, { narrow } from "./x.diagram.yaml"`
      const nv = applyVariant(res.spec!, "narrow");
      const narrow = nv ? await renderSvg(nv, ro) : null;
      return `export default ${JSON.stringify(svg)};\nexport const narrow = ${JSON.stringify(narrow)};`;
    },
  };
}
