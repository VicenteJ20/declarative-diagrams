import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import dgm from "@declarative-diagrams/react/vite";

const shim = (name) => fileURLToPath(new URL(`./src/shims/${name}.js`, import.meta.url));

/** The playground runs the diagram engine in the page: give the browser bundle inert `fs` / `path` (the engine only uses them to find icon packs on disk). Server-side builds keep the real modules. */
const browserShims = () => ({
  name: "browser-shims",
  enforce: "pre",
  resolveId(id, _importer, options) {
    if (options?.ssr) return null;
    const m = /^(?:node:)?(fs|path)$/.exec(id);
    return m ? shim(m[1]) : null;
  },
});

export default defineConfig({
  // GitHub Pages: https://<user>.github.io/declarative-diagrams/
  site: "https://VicenteJ20.github.io",
  base: "/declarative-diagrams",
  integrations: [mdx(), react()],
  vite: { plugins: [dgm(), browserShims()], build: { chunkSizeWarningLimit: 2500 } },
});
