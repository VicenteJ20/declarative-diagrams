import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import dgm from "@declarative-diagrams/react/vite";

export default defineConfig({
  // GitHub Pages: https://<user>.github.io/declarative-diagrams/
  site: "https://VicenteJ20.github.io",
  base: "/declarative-diagrams",
  integrations: [mdx(), react()],
  vite: { plugins: [dgm()] },
});
