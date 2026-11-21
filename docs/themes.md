# Themes, mode and palette

Two independent axes:

| Axis | Values | Where |
|---|---|---|
| **mode** | `auto` (default) · `light` · `dark` | `<Diagram mode>`, `renderSvg({mode})`, `dgm render --mode` |
| **theme** | `distill` (default) · `olive` · `azure` · `aws` · `orange` · `slate` · `mono` · your own | `<Diagram theme>`, spec `theme:`, plugin `dgm({theme})`, `dgm render --theme` |

`auto` follows the site (`<html data-theme="dark">` or `.dark`) and falls back to the OS setting.
`theme="dark"` (legacy) is still read as a mode. Precedence: component prop > plugin option > spec `theme:` > `distill`.

## Define a theme

```yaml
name: olive-paper
extends: olive              # inherit what you do not redefine (default: distill)
seed: { accent: "#5f6f1f", flow: "#c98a1b", neutral: "#f1f0e4" }   # optional: generates the full palette
light: { panel-a: "#eceed9", tones: { data: "#cfdcc6" } }
dark:  { accent: "#a9bb62" }
fonts: { serif: "Georgia, serif" }
```

Tokens: `panel-a panel-b panel-stroke node-bg stroke text muted edge accent flow label-bg icon-ink`
and `tones.{compute,data,network,neutral,accent,ok,warn,danger,info}`. Nodes pick a tone with `tone: warn`.

Create one from seeds, check contrast, preview it:

```
dgm theme new olive-paper --accent "#5f6f1f" --flow "#c98a1b" --neutral "#f1f0e4"
dgm theme check olive-paper
dgm theme preview olive-paper -o previews/
```

Register project themes in `dgm.config.json`: `{ "themes": ["themes/*.theme.yaml"] }`.

## Palette overrides

`palette:` (spec), `renderSvg({palette})`, `dgm({palette})` or `<Diagram palette>`:
`{ accent: "#6b7a2f", dark: { accent: "#a9bb62" }, tones: { data: "#c8d8c4" } }`.

## Re-theme from plain CSS

The SVG reads `--dgm-<token>` (light) and `--dgm-dark-<token>` (dark), falling back to the baked theme:

```css
.post { --dgm-accent: #6b7a2f; --dgm-dark-accent: #a9bb62; --dgm-panel-a: #eceed9; }
```

Import a theme file in MDX to pass it to the component: `import olive from "./olive.theme.yaml"`.
