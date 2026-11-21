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
   (`.svg` interactive, `.png` static). Give the user the MDX snippet (below).

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
edges:
  - { from: users, to: web, label: HTTPS, flow: true }      # flow: animated packets (main path only)
  - { from: web, to: db, label: private endpoint }
  - { from: web, to: users, style: dashed }                 # dashed = async / optional / control plane
notes:
  - { target: db, text: One or two sentences. }              # numbered margin note; target = node id or edge id "a->b"
steps:
  - { title: A request arrives, show: [users, web] }         # click-through narration; edges between shown nodes light up
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
- **Layout**: `RIGHT` for left-to-right pipelines, `DOWN` for layered/flow diagrams. For phones, add
  `variants: { narrow: {} }` (vertical, notes below) — only used when the page opts in.

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
