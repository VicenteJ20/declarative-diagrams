# Themes, mode and palette

Two independent axes:

- **mode** — `auto` (default: follows the site's `.dark` / `data-theme`, then the OS) · `light` · `dark`.
- **theme** — a named palette: `distill` (default), `olive`, `azure`, `aws`, `orange`, `slate`, `mono`, or a project theme.
  Every theme has both a light and a dark variant.

Where they are set: spec `theme:` · `render_diagram theme= mode=` · CLI `--theme --mode` · `<Diagram theme mode palette>` ·
Vite plugin `dgm({ theme, mode, palette })`. Precedence: component prop > plugin option > spec `theme:` > `distill`.

## Tokens

`panel-a panel-b panel-stroke node-bg stroke text muted edge accent flow label-bg icon-ink` and
`tones.{compute,data,network,neutral,accent,ok,warn,danger,info}`. Nodes pick a tone with `tone: warn`.

## Creating a theme (assisted)

1. Ask for (or infer) the brand colours: **accent** (required), **flow** (animated packets; should contrast with the accent),
   **neutral** (panel tint, light mode).
2. `create_theme name=olive-paper accent="#5f6f1f" flow="#c98a1b" neutral="#f1f0e4"` — returns the generated YAML and any
   WCAG contrast issues (text ≥ 4.5:1, muted/accent/edge ≥ 3:1).
3. `preview_theme theme=olive-paper` — look at light **and** dark. Check the tones read as different categories.
4. Adjust: nudge the accent, or pass `overrides` (`{ light: { "panel-a": "#eceed9" }, dark: { accent: "#a9bb62" }, tones: {…} }`).
5. `create_theme … save=true` → `themes/olive-paper.theme.yaml`. Register the folder once in `dgm.config.json`:
   `{ "themes": ["themes/*.theme.yaml"] }`.

Theme file:

```yaml
name: olive-paper
extends: olive          # inherit what you do not redefine (default: distill)
seed: { accent: "#5f6f1f", flow: "#c98a1b", neutral: "#f1f0e4" }
light: { panel-a: "#eceed9", tones: { data: "#cfdcc6" } }
dark:  { accent: "#a9bb62" }
```

## Palette overrides without a new theme

`palette:` in the spec, or the `palette` prop: `{ accent: "#6b7a2f", dark: { accent: "#a9bb62" }, tones: { data: "#c8d8c4" } }`.

## Re-theme from the site's CSS

The SVG reads `--dgm-<token>` (light) and `--dgm-dark-<token>` (dark) from the page, falling back to its baked theme:

```css
.post { --dgm-accent: #6b7a2f; --dgm-dark-accent: #a9bb62; }
```

In MDX, import a theme file and pass it: `import olive from "./olive-paper.theme.yaml"` → `<Diagram theme={olive} />`.
