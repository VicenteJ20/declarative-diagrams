# Changelog

## 0.1.0 — unreleased

First public release.

- Declarative YAML → interactive SVG / static PNG / MDX `<Diagram />`; architecture, flow and ER diagrams; Azure and AWS node kinds.
- Themes (seed colours, light/dark, contrast check), phone variants, steps/reveal order.
- Icons: bundled Lucide, official Azure/AWS packs imported locally, custom packs.
- CLI, MCP server, `diagram-author` Skill and OpenCode `diagram-specialist` agent.
- Security hardening: validated theme values, escaped step data, allowlist icon sanitiser, confined and non-overwriting MCP writes,
  zip size limits.
