# Contributing

Thanks for helping! Issues and pull requests are welcome.

## Setup

```bash
git clone https://github.com/VicenteJ20/declarative-diagrams && cd declarative-diagrams
npm install && npm run build      # Node >= 22; the CLI, MCP server and Vite plugin run from dist/
npm test                          # vitest; also validates every YAML block in docs and in skills/diagram-author
npm run demo:dev                  # Astro + MDX demo
```

Rebuild (`npm run build`) after changing `packages/*/src`.

## Layout

`packages/core` (spec, layout, render, themes, icons) · `cli` · `react` · `mcp` · `site-demo` · `skills/diagram-author`
(edit this one; `.claude/skills/diagram-author` is a generated copy) · `examples/` · `docs/`.
Agent notes for AI assistants working on the repo are in [AGENTS.md](AGENTS.md).

## Rules

- **No official icon packs in git.** Azure/AWS icons are imported locally (`icons-inbox/`, `dgm icons update`) and never committed;
  see [ICONS-DISCLAIMER.md](ICONS-DISCLAIMER.md). Rendered example images in `docs/img/` are fine.
- Anything that ends up inside an exported SVG (theme values, text, icons) must stay validated/escaped; add a test in
  `packages/core/src/security.test.ts`.
- MCP writes stay inside the project root and never overwrite silently.
- Add tests for behaviour changes; update docs and the Skill when the spec changes.
- Docs and examples are in English.

By contributing you agree your work is released under the [MIT license](LICENSE).
