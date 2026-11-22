import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import dgm from "@dgm/react/vite";

export default defineConfig({
  // GitHub Pages: https://<user>.github.io/diagrams-maker/
  site: "https://VicenteJ20.github.io",
  base: "/diagrams-maker",
  integrations: [mdx(), react()],
  vite: { plugins: [dgm()] },
});
