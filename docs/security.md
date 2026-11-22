# Security model

diagrams-maker turns text (YAML/JSON specs, theme files, SVG icons) into SVG/PNG, and exposes file-writing tools to AI agents.
Treat specs coming from an AI or a stranger as **untrusted input**.

## What is guarded

- **Exported SVG.** Colours, fonts and palette values are validated (no `<>{};&\`, comments, `url()`, `@import`) before they enter the
  embedded `<style>`; step titles/text are HTML-escaped; icon SVGs go through an allowlist sanitiser (no scripts, event handlers,
  `foreignObject`, animation or external links; `href` only to in-document `#ids`). Tests: `packages/core/src/security.test.ts`.
- **MCP server writes.** Confined to `--root` (`..`, absolute paths and symlinks/junctions leaving the root are refused); generated
  files need the right extension and never replace an existing file unless `overwrite=true`.
- **Icon import.** Zips are read in memory, only `*.svg` entries are used and file names come from a slug of the icon name (no path
  extraction, so no zip-slip). Entry count and sizes are capped. `dgm icons sync --from <url>` is CLI-only and has a download cap.
- **No network use by the MCP server.**

## What is trusted

- `dgm.config.json` (theme/icon globs and folders) — it is read from the project root you give the server; keep it under your control.
- Files you put in `icons-inbox/` and custom icon packs.
- The interactive SVG embeds a small script. Serve diagrams from your own origin or inline them from a build you control; if you need
  a script-free file use `--static` / `static: true`.
- Dependencies: run `npm audit`; some advisories only affect the private `site-demo` workspace, and `zod` 3.x has an advisory about
  oversized collections whose fix requires zod 4 (the MCP SDK pins 3.x). Do not feed the tools unbounded input.

Report vulnerabilities as described in [SECURITY.md](../SECURITY.md).
