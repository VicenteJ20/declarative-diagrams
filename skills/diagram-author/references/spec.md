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
| `notesPosition` | `side` (margin gutter, default) or `below` (numbered list under the diagram) |
| `variants.narrow` | optional vertical layout for narrow screens: `{ direction?: DOWN, notesPosition?: below }`; `{}` = both defaults |
| `nodes` | list of nodes (required) |
| `edges`, `notes`, `steps` | optional lists |

## Node

| Field | Meaning |
|---|---|
| `id` | unique, no `->` or `#` |
| `label` | text; `sublabel` second line; `description` tooltip |
| `kind` | style/semantics: see `list_kinds` |
| `icon` | `az-…`, `aws-…`, `lu-…`, or a project pack prefix (icons.md) |
| `variant` | `card` or `stacked` (defaults: `lu-` → card; official/custom → stacked) |
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

## Limits worth knowing

- Edges from a container to its own descendant are rejected.
- A self-loop is rejected.
- Edges crossing several container levels are routed around headers; keep them few.
- Text width is estimated: very long labels overflow their node — shorten or use `sublabel`.
