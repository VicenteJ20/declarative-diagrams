# Spec reference

A diagram is a YAML (or JSON) document. `get_spec_schema` returns the exact JSON Schema; this is the readable version.

## Top level

| Field | Meaning |
|---|---|
| `type` | `architecture` (default) · `flow` · `er` · `network` (same engine; the type is documentation/intent) |
| `title`, `description` | title drawn on top (serif italic); description is the accessible text (`<desc>`) |
| `direction` | `RIGHT` (default) or `DOWN` |
| `theme` | theme name or inline theme (see themes.md). Render options override it |
| `font` | `mixed` (default) · `sans` · `serif` — typeface style of the whole diagram |
| `palette` | token overrides: `{ accent: "#…", dark: { accent: "#…" }, tones: { data: "#…" } }` |
| `legend` | compact key under the diagram: `[{ style: solid, label: Inside }, { style: dashed, label: Optional }]` |
| `notesPosition` | `side` (margin gutter, default) or `below` (numbered list under the diagram, in the order you write the notes) |
| `steps[].sequence` | optional reveal order for staggered playback: ids or lists of ids lit together, e.g. `[capture, whisper, [db, index], ask]`; default = follows the arrows |
| `variants.narrow` | phone version (rendered separately with `variant=narrow`): `{ direction?: DOWN, notesPosition?: below, hide?: [ids], nodes?: { <id>: { label?, sublabel?, stackWith?: <id> \| null } } }`; `{}` = vertical + notes below. `stackWith: null` un-stacks a node; `hide` drops nodes and the edges/notes/step entries that touch them. Aim for ≤ 520 px wide. |
| `nodes` | list of nodes (required) |
| `edges`, `notes`, `steps` | optional lists |

## Node

| Field | Meaning |
|---|---|
| `id` | unique, no `->` or `#` |
| `label` | text; `sublabel` second line; `description` tooltip |
| `kind` | style/semantics: see `list_kinds` |
| `icon` | `az-…`, `aws-…`, `lu-…`, or a project pack prefix (icons.md) |
| `stackWith` | id of a **sibling leaf**: put this node in the same step, stacked across the flow — below it when `direction: RIGHT`, to its right when `DOWN`. Chains (`c` with `stackWith: b`, `b` with `stackWith: a`) form one column. Edges between stacked nodes are short straight arrows |
| `badge` | small circle on the node with a sequence marker (`1`, `2`, `A`…) |
| `variant` | `card` or `stacked` (defaults: `lu-` → card; official/custom → stacked) |
| `placement` | `below` (top-level node, flow `RIGHT`): drawn in a row **under** the diagram, centred under the node it connects to, instead of a new column to the right. Use it for the optional cloud / external box — keeps the canvas ≤ 3:1 and avoids horizontal scroll. In flow `DOWN` it ends up under the main block, the link running down the right margin |
| `tone` | `compute data network neutral accent ok warn danger info` — semantic colour from the theme |
| `children` | makes it a **container**; children are laid out inside it, recursively |
| `fields` | for `kind: entity`: `[{ name, type, key: pk|fk }]` |

### Kinds (use `list_kinds` for the live list)

- Leaves: `service compute function container database storage cache queue gateway firewall load-balancer dns identity secret monitor user external`.
- Flow: `start end process decision io` (decision = diamond, start/end = pill).
- ER: `entity` (needs `fields`).
- Containers (draw a titled panel with a small tag): `cloud onprem network subnet`, Azure `azure.tenant azure.management-group azure.subscription azure.resource-group azure.vnet azure.subnet`, AWS `aws.org aws.account aws.region aws.vpc aws.az aws.subnet`.
- Unknown kinds are accepted with a warning (generic style).

## Edge

`from`, `to` (node ids) · `label` · `fromLabel` / `toLabel` (small labels at the ends, e.g. ER cardinality `"1"`, `"N"`) ·
`style: solid|dashed` · `flow: true` (animated packets) · `both: true` (arrowheads at both ends) · `id` (optional; default
`from->to`, repeated pairs get `#2`, `#3`).

## Notes and steps

- `notes: [{ target, text }]` — `target` is a node id or an edge id. Rendered as numbered markers on the target and the text in the margin.
- `steps: [{ title, text?, show: [ids…] }]` — the SVG gets ‹ › buttons and arrow-key navigation; everything not in `show` dims. Edges whose both ends are shown are included automatically.

## Minimal examples

```yaml
type: flow
direction: DOWN
nodes:
  - { id: start, label: Request, kind: start }
  - { id: ok, label: Authorised?, kind: decision }
  - { id: serve, label: Serve, kind: process }
  - { id: deny, label: Reject, kind: end, tone: danger }
edges:
  - { from: start, to: ok }
  - { from: ok, to: serve, label: yes, flow: true }
  - { from: ok, to: deny, label: no, style: dashed }
```

```yaml
type: er
nodes:
  - id: customer
    label: customer
    kind: entity
    fields:
      - { name: id, type: uuid, key: pk }
      - { name: email, type: text }
  - id: order
    label: order
    kind: entity
    fields:
      - { name: id, type: uuid, key: pk }
      - { name: customer_id, type: uuid, key: fk }
edges:
  - { from: customer, to: order, fromLabel: "1", toLabel: "N", label: places }
```

## Compact layouts

A chain of N steps is N columns wide. To keep the diagram near 1.5–3.5 : 1:

```yaml
type: architecture
title: Pipeline with a local branch
nodes:
  - { id: src, label: Source, icon: lu-mic, variant: stacked }
  - id: box
    label: Your computer
    kind: onprem
    children:
      - { id: ingest, label: Ingest, icon: lu-audio-waveform, variant: stacked, badge: 1 }
      - { id: store, label: Store, icon: lu-database, variant: stacked, badge: 2 }
      - { id: ask, label: Ask, icon: lu-sparkles, variant: stacked, badge: 3 }
      - { id: local, label: Local model, icon: lu-cpu, variant: stacked, badge: 4, stackWith: ask }
edges:
  - { from: src, to: ingest, flow: true }
  - { from: ingest, to: store }
  - { from: store, to: ask }
  - { from: ask, to: local, label: offline }
legend:
  - { style: solid, label: Stays on this machine }
```

Rules: `stackWith` targets a sibling (same parent) that is a leaf (no children); no cycles. In a stack, edges from the outside attach to
the member they name, so the main row stays on one line. Prefer stacking the *optional/offline/alternative* branch, not the main path.

## Limits worth knowing

- Edges from a container to its own descendant are rejected.
- A self-loop is rejected.
- Edges crossing several container levels are routed around headers; keep them few.
- Text width is estimated: very long labels overflow their node — shorten or use `sublabel`.


## Architecture with zones — the compact recipe

```yaml
type: architecture
direction: RIGHT
nodes:
  - id: pc
    kind: onprem
    label: Your computer
    children:            # zones (containers) hold the nodes; `variant: stacked` = icon tile on top, label below
      - id: ui
        kind: group
        label: WebView
        children:
          - { id: web, label: UI, sublabel: Next.js, icon: lu-monitor, variant: stacked, badge: 1 }
      - id: core
        kind: group
        label: Core
        children:
          - { id: audio, label: Audio, icon: lu-mic, variant: stacked, badge: 2 }
          - { id: store, label: Data, icon: lu-database, variant: stacked, badge: 3 }
  - id: cloud
    kind: cloud
    label: Optional cloud
    placement: below     # under the computer, not a fourth column
    children:
      - { id: gw, label: Gateway, icon: lu-cloud, variant: stacked }
edges:
  - { from: web, to: audio, label: invoke, flow: true }
  - { from: audio, to: store, label: segments }
  - { from: core, to: cloud, label: audio · text, style: dashed }
variants:
  narrow:                # phone: bands, one zone per row, same width (`zoneWidth: equal` is implied when there are zones)
    nodes:
      web: { variant: card }
      audio: { variant: card }
      store: { variant: card }
      gw: { variant: card }
```

- Use `zoneWidth: equal` (automatic in `variants.narrow` when the diagram has zones) for tidy bands: zones of one depth share a width,
  nodes are centred per row, edges are straight verticals where boxes overlap sideways, one elbow otherwise. Plain flows (no zones) keep the
  automatic layout.
- Wide target ≈ 2–3 : 1. Zone padding and gaps already come from the layout; remove columns before shrinking text.
- Phone: **cards** (`variant: card` in `variants.narrow.nodes`) for every node, shorter sublabels, ≤ 520 px.
