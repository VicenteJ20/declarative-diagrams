// Pre-renders the cloud examples that use the OFFICIAL Azure / AWS icons into site-demo/public/gallery/.
// The icon packs are not in the repository (see ICONS-DISCLAIMER.md), so this runs on a machine where you imported them
// (`dgm icons update`); the resulting SVGs (diagrams that use the icons, not the icon packs) are committed so the demo site
// can show them. Run after changing any of these examples:   npm run gallery
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyVariant, parseSpecText, renderSvg, validateSpec } from "@declarative-diagrams/core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "site-demo", "public", "gallery");
mkdirSync(out, { recursive: true });

const ENTRIES = ["aws-genai-chatbot", "azure-rag-landing-zone", "aws-icons", "azure-icons"];

for (const id of ENTRIES) {
  const file = join(root, "examples", `${id}.diagram.yaml`);
  const res = validateSpec(parseSpecText(readFileSync(file, "utf8")), { missingIcons: "error" });
  if (!res.ok) {
    console.error(`${id}: ${res.errors.join("; ")}\nImport the official icon packs first: dgm icons update (see docs/icons.md)`);
    process.exit(1);
  }
  const spec = res.spec;
  const theme = id.startsWith("aws") ? "aws" : "azure";
  // interactive markup without the embedded script: the page attaches the runtime itself (and re-themes through CSS variables)
  writeFileSync(join(out, `${id}.svg`), await renderSvg(spec, { embedRuntime: false, theme }));
  const narrow = applyVariant(spec, "narrow");
  if (narrow) writeFileSync(join(out, `${id}.narrow.svg`), await renderSvg(narrow, { embedRuntime: false, theme }));
  // static, light, no script: what the "Download" buttons hand out
  writeFileSync(join(out, `${id}.static.svg`), await renderSvg(spec, { static: true, mode: "light", theme }));
  // same, dark: carries its own dark background so it is legible anywhere
  writeFileSync(join(out, `${id}.static.dark.svg`), await renderSvg(spec, { static: true, mode: "dark", theme }));
  console.log(`gallery: ${id}${narrow ? " (+ phone)" : ""}`);
}
