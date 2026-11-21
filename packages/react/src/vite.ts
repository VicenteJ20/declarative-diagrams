import { readFileSync } from "node:fs";
import { parseSpecText, validateSpec, renderSvg } from "@dgm/core";

/**
 * Vite plugin: `import svg from "./arch.diagram.yaml"` (or .diagram.json) -> interactive SVG string,
 * laid out at build time (no ELK in the browser). Works in Astro, Vite+MDX, SvelteKit…
 * Append `?static` to get the non-interactive variant.
 */
export default function dgm() {
  const RE = /\.diagram\.(ya?ml|json)(\?static)?$/;
  return {
    name: "dgm",
    enforce: "pre" as const,
    async load(id: string) {
      const m = RE.exec(id);
      if (!m) return null;
      const file = id.replace(/\?.*$/, "");
      const res = validateSpec(parseSpecText(readFileSync(file, "utf8")));
      if (!res.ok) throw new Error(`[dgm] ${file}\n  ${res.errors.join("\n  ")}`);
      // `addWatchFile` exists on the rollup context
      (this as any).addWatchFile?.(file);
      const svg = await renderSvg(res.spec!, { embedRuntime: false, static: !!m[2] });
      return `export default ${JSON.stringify(svg)};`;
    },
  };
}
