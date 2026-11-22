# Aspect ratio and responsive behaviour

A diagram is never re-oriented automatically (a horizontal architecture does not turn vertical by itself). The author decides.

## `<Diagram>` props

| Prop | Meaning |
|---|---|
| `fit` | `auto` (default): fill the width but not narrower than `minWidth`, then scroll sideways · `width`: always scale to the width · `scroll`: natural size |
| `minWidth` | px under which `fit="auto"` scrolls instead of shrinking text (default 640) |
| `aspectRatio` | `16/9`, `"4/3"`, `1.5`… fixed box; the diagram is centred inside, never distorted |
| `maxWidth`, `maxHeight` | caps; the diagram scales down to fit |
| `align` | `left` (default) · `center` · `right` |
| `expand` | `auto` (default): ⤢ button + full-screen dialog with zoom, shown only when the diagram is drawn < 80 % of its natural size · `true` / `false` |
| `narrowSvg`, `narrowBelow` | opt-in author-defined layout used under `narrowBelow` px of container width (default 560) |

## Author-defined narrow layout

```yaml
variants:
  narrow: {}                 # defaults: direction DOWN, notesPosition below
  # narrow:
  #   direction: DOWN
  #   notesPosition: below
  #   hide: [debug-node]                       # dropped on phones (edges, notes, step entries that touch it go too)
  #   nodes:
  #     mai: { stackWith: null }               # un-stack: own row (the usual fix for a too-wide phone canvas)
  #     storage: { label: SQLite, sublabel: local }   # shorter text on phones
notesPosition: side          # or below
```

Design the phone version for **≤ 520 px of canvas width** (on a 360 px screen a 1400 px canvas shows 12 px labels at 3 px).
`dgm render … --variant narrow` (or `dgm_render_diagram variant=narrow`) reports `phone view` and warns when it is too wide.
Sites that inline SVGs export it next to the wide one (`<name>.<lang>.narrow.svg`) and swap them with a media query; a site component (e.g. an Astro `Diagram.astro`) can do this automatically.

```mdx
import arch, { narrow } from "./arch.diagram.yaml";
<Diagram svg={arch} narrowSvg={narrow} />
```

Without `variants` nothing changes. When the narrow layout is active, `minWidth` is ignored (it was meant for the wide one).

## Static exports

`dgm render in.yaml -o out.png --aspect 16/9 --padding 24` letterboxes the canvas (e.g. social cards). Every export has a 16-unit margin by
default (`--padding 0` removes it);
`--variant narrow` renders the narrow layout.

## Arrows and icons

Nodes drawn *stacked* (official Azure/AWS icons: big icon, label under it) are wider than their icon, so arrows start and end at
the **icon's edge** (5 px gap) instead of the invisible box, and layers get more spacing (92 vs 64). Card nodes are unchanged.

## Compact layouts: `stackWith`, `badge`, `legend`

A pipeline of N steps is N columns wide. Branches that go *sideways* in your head (an offline model under the "insights" step, a
provider under a gateway) should not become extra columns:

```yaml
- { id: insights, label: Insights, icon: lu-sparkles, variant: stacked, badge: 4 }
- { id: local-ai, label: Local AI, icon: lu-cpu, variant: stacked, badge: 5, stackWith: insights }   # below insights
```

- `stackWith: <sibling id>` — same step, stacked across the flow: **below** when `direction: RIGHT`, **beside** when `DOWN`.
  Stacks can have 3+ members; the stack takes the anchor's place. Edges from outside attach to the member they name (the main row
  stays aligned on the icon line); edges between members are short straight arrows (a bracket on the outside if not adjacent).
- `badge: 1` — a small numbered circle on the node (reading order).
- `legend: [{ style: solid, label: … }, { style: dashed, label: … }]` — a one-line key under the diagram.
- `dgm render` and the MCP `render_diagram` print the canvas size and warn when it is far from ≈ 1.5–3.5 : 1.
