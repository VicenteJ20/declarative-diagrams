import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import dgm from "@dgm/react/vite";

export default defineConfig({
  integrations: [mdx(), react()],
  vite: { plugins: [dgm()] },
});
