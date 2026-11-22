# Changelog

## 0.1.0 — unreleased

First public release.

- Project name: **declarative-diagrams** (packages `@declarative-diagrams/*`; the CLI is `dgm`, also available as `declarative-diagrams`).

- Declarative YAML → interactive SVG / static PNG / MDX `<Diagram />`; architecture, flow and ER diagrams; Azure and AWS node kinds.
- Themes (seed colours, light/dark, contrast check), phone variants, steps/reveal order.
- Icons: bundled Lucide, official Azure/AWS packs imported locally, custom packs.
- Online playground (GitHub Pages): live YAML editor, examples for architectures, flows, data models, AWS and Azure, theme / look / mode switches, phone preview, SVG and PNG export, share links. `@declarative-diagrams/core/browser` renders in the page.
- CLI, MCP server, `diagram-author` Skill and OpenCode `diagram-specialist` agent.
- Toolchain upgraded to clear all Dependabot alerts: zod 4, Astro 7, vitest 4, tsup 9, Vite 7 (`npm audit`: 0 vulnerabilities).
- Security hardening: validated theme values, escaped step data, allowlist icon sanitiser, confined and non-overwriting MCP writes,
  zip size limits.
