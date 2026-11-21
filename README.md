# diagrams-maker

Declarative, **interactive** diagrams in the style of [Distill.pub](https://distill.pub): cloud architecture (Azure / AWS with
tenants, subscriptions, accounts, resource groups, VNets/VPCs, subnets, resources and their interactions), flowcharts and ER
models. Write YAML → export an **interactive SVG** (hover/click highlighting, animated flow, steps, tooltips) or a **static PNG**,
or drop it into **MDX** with `<Diagram />`. An **MCP server + Skill** let an AI agent write, check and look at diagrams.

```yaml
type: architecture
nodes:
  - { id: users, label: Users, icon: lu-users }
  - id: sub
    label: prod
    kind: azure.subscription
    icon: az-subscription
    children:
      - { id: web, label: App Service, icon: az-webapp }
      - { id: sql, label: SQL Database, icon: az-sql }
edges:
  - { from: users, to: web, label: HTTPS, flow: true }
  - { from: web, to: sql, label: private endpoint }
```

```powershell
npm install; npm run build
node packages/cli/dist/index.js render examples/azure-landing-zone.diagram.yaml -o out.svg   # interactive SVG
node packages/cli/dist/index.js render examples/azure-landing-zone.diagram.yaml -o out.png   # static PNG
npm run demo:dev                                                                              # Astro + MDX demo
```

| Package | What |
|---|---|
| `@dgm/core` | spec, ELK layout, SVG renderer, themes, icons, PNG export |
| `@dgm/cli` | `dgm render / validate / theme / icons / skill / mcp` |
| `@dgm/react` | `<Diagram />` for MDX + Vite plugin |
| `@dgm/mcp` | MCP server for AI agents |
| `skills/diagram-author` | Skill: workflow, patterns, style guide |

Docs: [themes & mode](docs/themes.md) · [aspect ratio & responsive](docs/layout.md) · [icons (Azure/AWS/Lucide/custom)](docs/icons.md) ·
[AI agents — Claude Code and OpenCode (MCP + Skill)](docs/agents.md).

Official Azure/AWS icons are **not** included: download the zips yourself, drop them in `icons-inbox/<pack>/` and run
`dgm icons update` (see [docs/icons.md](docs/icons.md)).
