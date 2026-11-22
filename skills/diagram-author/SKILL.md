---
name: diagram-author
description: Create interactive, Distill.pub-style diagrams from an idea — cloud architecture (Azure/AWS with tenants, subscriptions, accounts, resource groups, VNets/VPCs, subnets, resources and the interactions between them), flowcharts and entity-relationship models. Validates, previews as PNG, saves a .diagram.yaml and exports interactive SVG / static PNG for MDX sites. Also creates and previews colour themes. Use whenever the user asks for a diagram, architecture drawing, flow, ER model, or a new diagram theme/palette.
---

# Diagram author

You turn an idea into a **declarative spec** (YAML), check it, **look at the render**, refine it, and save it. The same spec
exports to an interactive SVG (hover/click highlighting, animated flow, steps, tooltips) and a static PNG, and drops into MDX
with `<Diagram />`.

## Tools (MCP server `dgm`; CLI fallback in brackets)

| Need | Tool [CLI] |
|---|---|
| Format, patterns, style | `get_authoring_guide` (topics: spec, azure, aws, style, icons, themes) · `get_spec_schema` · `list_kinds` · `get_example` |
| Icons | `list_icon_packs` · `search_icons` · `update_icons` [`dgm icons packs/search/update`] |
| Check | `validate_diagram` [`dgm validate f`] |
| See it | `render_diagram` (PNG comes back as an image) [`dgm render f -o out.png`] |
| Save / export | `write_diagram` · `render_diagram` with `save_to` [`dgm render f -o x.svg`] |
| Themes | `list_themes` · `get_theme` · `create_theme` · `preview_theme` [`dgm theme …`] |

*Tool names: Claude Code shows them as `mcp__dgm__<tool>`, OpenCode as `dgm_<tool>`; the tool is the same.*

## Workflow

1. **Understand the point.** One diagram = one idea. Ask only if something blocks you (which cloud? what must the reader
   understand?). Otherwise decide and say what you assumed.
2. **Scope.** Aim for 6–15 nodes. More than that → split into overview + detail diagrams. Decide the *level*: network
   boundaries, resources, or data flow — don't mix all three.
3. **Pick the type** (`architecture`, `flow`, `er`) and read the matching guide once (`get_authoring_guide topic=azure|aws|spec`).
   Start from `get_example` when one is close.
4. **Icons.** For cloud resources use the official packs (`az-…`, `aws-…`); for generic things (users, clients) Lucide (`lu-…`).
   Call `list_icon_packs` first. If a pack is not installed, tell the user how (download zip → `icons-inbox/<pack>/` →
   `update_icons`) and meanwhile use `allow_missing_icons` or `lu-` icons. **Find names with `search_icons`; never guess them.**
5. **Write the spec** following the rules below.
6. **`validate_diagram`** and fix every error (messages name the field and usually the fix).
7. **`render_diagram` (PNG) and LOOK at it.** Check the review list in `references/style.md`. Iterate up to ~4 times, changing
   one thing at a time (direction, nesting, which edges exist, labels).
8. **Save and export.** `write_diagram` to `src/diagrams/<name>.diagram.yaml`; export with `render_diagram save_to=…`
   (`.svg` interactive, `.png` static; pass `overwrite=true` when re-exporting an existing file). Give the user the MDX snippet (below).

## House style: vendor looks (mandatory)

- **AWS diagrams → `look: official`. Azure diagrams → `look: azure`.** Always, no exceptions; follow the recipe in `references/aws.md` / `references/azure.md`
  (`get_authoring_guide topic=aws|azure`). Other diagrams keep the default look.
- After every `render_diagram`, read the report: any `CONNECTION CHECK` line (connector through a node, overlapping arrowheads) means the diagram is not
  done — fix the spec and render again. `validate_diagram` also warns when an AWS/Azure diagram has no `look`.

## Spec essentials

```yaml
type: architecture            # architecture | flow | er
title: Short title            # optional, serif italic
direction: RIGHT              # RIGHT (pipelines, hub-spoke) | DOWN (layers, flows)
nodes:
  - { id: users, label: Users, icon: lu-users }
  - id: sub                   # a node with `children` is a container (nesting = real containment)
    label: prod
    kind: azure.subscription
    icon: az-subscription
    children:
      - { id: web, label: App Service, sublabel: P1v3, icon: az-webapp, description: Shown in the tooltip. }
      - { id: db, label: SQL Database, icon: az-sql }
      - { id: cache, label: Cache, icon: lu-zap, stackWith: web, badge: 2 }   # same step as `web`, stacked below it
edges:
  - { from: users, to: web, label: HTTPS, flow: true }      # flow: animated packets (main path only)
  - { from: web, to: db, label: private endpoint }
  - { from: web, to: users, style: dashed }                 # dashed = async / optional / control plane
  - { from: web, to: cache, label: reads }                  # between stacked nodes: a short vertical arrow
notes:
  - { target: db, text: One or two sentences. }              # numbered margin note; target = node id or edge id "a->b"
steps:
  - { title: A request arrives, show: [users, web] }         # click-through narration; edges between shown nodes light up
legend:
  - { style: solid, label: Stays inside the subscription }   # compact key for edge styles, drawn under the diagram
  - { style: dashed, label: Optional }
```

Full reference: `get_authoring_guide topic=spec`.

## Rules that make diagrams good

- **Containment = ownership; edges = interaction.** Put a resource inside its subnet/VNet/subscription instead of drawing a line.
- **Edges connect nodes** (leaf or container) but **never a container to its own descendant**. Few edges cross container
  boundaries — each one makes a long route. Connect to the node that sits next to the boundary.
- **Animate only the main path** (`flow: true` on 2–3 edges); `style: dashed` for async/optional/management traffic.
- **Short labels** on edges (protocol, port, verb). Node `label` ≤ 20 characters; details go in `sublabel`/`description`.
- **Notes ≤ 5**, steps 3–5. They are for what the picture cannot say (why, limits, trust boundaries).
- **Semantic colour with `tone`** (`warn`, `danger`, `ok`, `accent`, `data`, `network`) — sparingly, one meaning each.
- **Ids**: short, unique, kebab-case; no `->` or `#`.
- **Keep it compact** (target ≈ 1.5–3.5 : 1, wide:tall). A single long chain is the usual cause of a stretched diagram.
  Fold side branches with **`stackWith: <id>`** — same step as the anchor, stacked *below* it (flow `RIGHT`) or *beside* it (flow
  `DOWN`) — instead of letting every node take its own column. Use `badge: 1…n` for the reading order and `legend` for solid vs
  dashed edges instead of long notes. `render_diagram` reports the size and a `LAYOUT NOTE` when the proportions are poor: act on it.
- **Flow animation (reveal order).** A `steps[]` scenario can be played "box by box" by the host page (`svg.dgm.show(k, { stagger: 1.5 })`,
  `Diagram.astro`'s `stagger` prop; 0 = off, the default). The order is **automatic** (inputs first, following the arrows; each edge lights with the node it
  arrives at). Only declare `sequence` when the arrows are not enough: groups lit in order, a list = lit together, e.g.
  `sequence: [capture, whisper, [sqlite, embeddings], insights]`. Give every scenario a coherent `show` list; the order is derived from the shown subgraph.
- **Layout**: `RIGHT` for left-to-right pipelines, `DOWN` for layered/flow diagrams.
- **Phone version (`variants.narrow`) — add it to every wide diagram that goes on a web page.** Phones are ~360 px wide, so a 1400 px
  canvas shows 12 px labels at ~3 px. The narrow variant is a second, VERTICAL render of the same spec (same ids, so steps, hover and
  tooltips behave identically):
  ```yaml
  variants:
    narrow:
      direction: DOWN            # default
      nodes:                     # per-node overrides, only on the phone version
        mai: { stackWith: null } # un-stack: its own row instead of sitting beside others
        storage: { label: SQLite, sublabel: local data }   # shorter text
      hide: [legend-only-node]   # drop secondary nodes (their edges/notes/step entries go too)
  ```
  Nested containers make ugly phone layouts (edges loop around siblings, one tall column). Collapse them for the phone: `hide` the children and give the
  container the merged text (`data: { label: Data, sublabel: SQLite · FTS5 }`) so it becomes one box; then `stackWith` such boxes side by side to avoid skip-edges.
  (`stackWith` members must be leaf boxes: a container with visible children cannot be stacked.)
  Goal: **canvas ≤ 520 px wide** (one or two nodes per row; stacks `stackWith` are the usual reason for 3+). Render it with
  `dgm_render_diagram variant=narrow` and LOOK at it: the report says `phone view` and warns when the width is too big. Export both:
  wide → `<name>.<lang>.svg`, phone → `<name>.<lang>.narrow.svg` (`variant=narrow`, `format=svg`, `save_to`). Keep the same node ids
  and step order in every language.

## Themes and mode

`mode` (auto|light|dark) and `theme` (named palette) are independent. To create a theme from the user's colours:
`create_theme` (accent [+ flow, neutral]) → fix any contrast issue → `preview_theme` → `save=true`. See
`get_authoring_guide topic=themes`.

## Using the result in MDX

```mdx
import { Diagram } from "@dgm/react";
import arch, { narrow } from "../diagrams/architecture.diagram.yaml";

<Diagram client:visible svg={arch} narrowSvg={narrow} theme="olive" mode="auto" caption="Figure 1" />
```

(`@dgm/react/vite` plugin turns the YAML into the SVG at build time.) A plain exported `.svg` keeps its interactivity only
when inlined or loaded with `<object>`; with `<img>` it is a still image.

## When something fails

- `unknown node …` → typo in an id; ids are case-sensitive.
- `edge between a container and its own descendant` → connect to a child instead.
- `unknown … icon … did you mean …` → use the suggestion or `search_icons`. `icons are not installed` → pack not imported.
- Unreadable/overlapping render → fewer edges across containers, switch `direction`, split the diagram.
- Never invent icon names, kinds or fields: check `list_kinds` / `get_spec_schema`.
