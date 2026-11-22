# diagrams-maker — agent notes

Declarative, interactive diagrams in the Distill.pub style (YAML → interactive SVG / static PNG / MDX `<Diagram />`).
Monorepo (npm workspaces, TypeScript, ESM): `packages/core` (spec, layout, render, themes, icons), `cli`, `react`, `mcp`,
`site-demo` (Astro + MDX), `skills/diagram-author`.

## Make or change a diagram

Use the **`diagram-author` skill** and the **`dgm` MCP server** (tools are exposed as `dgm_<tool>`: `dgm_get_authoring_guide`,
`dgm_search_icons`, `dgm_validate_diagram`, `dgm_render_diagram`, `dgm_write_diagram`, `dgm_create_theme`, …).
Workflow: guide → find icons with `dgm_search_icons` (never guess names) → write the spec → `dgm_validate_diagram` →
`dgm_render_diagram` (look at the PNG, iterate) → `dgm_write_diagram` / `save_to`.
In OpenCode, switch to the **`diagram-specialist`** agent (Tab) — it owns this workflow, takes text and reference images — or use the shortcuts
`/diagram <idea>` and `/diagram-theme <brand colours>` (both run with that agent).

## Commands

```
npm install && npm run build      # build all packages (the MCP server runs from packages/mcp/dist)
npm test                          # vitest (docs and skill YAML blocks are validated too)
node packages/cli/dist/index.js --help
npm run demo:dev                  # Astro + MDX demo
```

OpenCode loads agents, commands, skills and `opencode.json` at startup: restart it after changing them (Desktop notes in docs/agents.md).

Rebuild (`npm run build`) after changing `packages/*/src` — the CLI, MCP server and Vite plugin run from `dist/`.

## Rules

- **Never commit official icons.** Azure/AWS zips go in `icons-inbox/<pack>/` (git-ignored); `dgm icons update` extracts them to
  `.dgm/icons/`. Don't download them for the user. Never alter the icons' shapes (see ICONS-DISCLAIMER.md);
  `docs/img/` holds rendered example diagrams only.
- **House style:** AWS diagrams use `look: official`, Azure diagrams `look: azure` (recipes in `skills/diagram-author/references/aws.md` / `azure.md`). A render must report no `connection check` lines; `packages/core/src/look.test.ts` guards the geometry.
- Diagram files are `*.diagram.yaml`; themes are `*.theme.yaml` (registered in `dgm.config.json`).
- Writes by the MCP server are confined to the project root and never replace existing files without `overwrite=true`; don't work around that.
- Theme/palette values and icon SVGs end up inside the exported SVG: keep them validated (`packages/core/src/theme.ts`, `icons/sanitize.ts`; tests in `security.test.ts`).
- After editing `skills/diagram-author/**`, run the tests (they validate every YAML block in it).
- The installed copy `.claude/skills/diagram-author/` is generated (`dgm skill install`); edit `skills/diagram-author/`.
