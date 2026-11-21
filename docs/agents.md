# Using diagrams-maker with an AI agent (MCP + Skill)

Two pieces work together:

- **MCP server `dgm`** (`packages/mcp`) — the tools: read the guide, search icons, validate, **render a PNG the agent can look at**,
  save specs, create/preview themes.
- **Skill `diagram-author`** (`skills/diagram-author`) — the know-how: workflow, spec rules, Azure/AWS patterns, style checklist.
  The same text is served by the tool `get_authoring_guide`, so the server alone is enough for any MCP client.

## Setup (Claude Code)

```powershell
npm install
npm run build
node packages/cli/dist/index.js skill install      # copies the Skill to .claude/skills/  (add --global for ~/.claude/skills)
node packages/cli/dist/index.js mcp config         # prints the config + the `claude mcp add` command
```

This repo already ships a project-scoped [`.mcp.json`](../.mcp.json); Claude Code asks you to approve it the first time. In another project:

```powershell
claude mcp add dgm -- node C:\path\to\diagrams-maker\packages\mcp\dist\index.js --root C:\path\to\your\project
```

`--root` is the project the agent works in: `dgm.config.json`, `themes/`, your `*.diagram.yaml`, and `.dgm/icons` are read from
there, and **every write stays inside it**. Claude Desktop: paste the JSON from `dgm mcp config` into its MCP settings.

## Setup (OpenCode)

This repo already contains everything OpenCode needs, so opening it with `opencode` is enough (after `npm run build`):

| File | What it does |
|---|---|
| [`opencode.json`](../opencode.json) | registers the MCP server `dgm` (`mcp.dgm`, local) and adds `skills/` as a skills path |
| [`AGENTS.md`](../AGENTS.md) | project notes + the diagram workflow, read automatically by OpenCode |
| [`.opencode/commands/`](../.opencode/commands) | `/diagram <idea>` and `/diagram-theme <brand colours>` |

Verified with OpenCode 1.17.9: `opencode mcp list` → `✓ dgm connected`; `opencode debug skill` lists `diagram-author`
(from `skills/`, no copy). Tools appear to the model as `dgm_<tool>` (e.g. `dgm_render_diagram`). Restart OpenCode after
changing config or the Skill — it is loaded once at startup.

For **another project**:

```powershell
node packages/cli/dist/index.js mcp config --client opencode      # prints the opencode.json block (absolute paths)
node packages/cli/dist/index.js skill install --target opencode   # .opencode/skills/diagram-author  (--global: ~/.config/opencode/skills)
```

Config schema note: OpenCode 1.x (what is installed here) wants servers directly under `mcp` with `"enabled"`; the newer
V2 docs use `mcp.servers` and `disabled`. If `opencode mcp list` reports "Configuration is invalid", run `opencode --version`
and use the shape that its error message asks for. OpenCode also reads `.claude/skills/`, so a Claude Code install works there too.
If you have another diagram skill globally (e.g. `diagram-design`), the model may choose either; name `diagram-author` in the prompt
or use `/diagram`.

## Tools

| Tool | Purpose |
|---|---|
| `get_authoring_guide` | The guide (topics: overview, spec, azure, aws, style, icons, themes) |
| `get_spec_schema`, `list_kinds`, `get_example` | Exact schema, node kinds/tones, example specs |
| `list_icon_packs`, `search_icons`, `update_icons` | Icons: what is installed, find names, import the zips from `icons-inbox/<pack>/` |
| `list_themes`, `get_theme`, `create_theme`, `preview_theme` | Themes: inspect, create from seed colours (+ contrast check), look at them |
| `validate_diagram` | Errors/warnings with fixes (`did you mean …`) |
| `render_diagram` | PNG (returned as an image) or SVG; `theme`, `mode`, `aspect`, `variant=narrow`, `save_to` |
| `write_diagram` | Validate and save `*.diagram.yaml` (no overwrite unless asked) |

## Behaviour you can rely on

- Paths are confined to `--root`; `..` and absolute paths outside are refused.
- Nothing is downloaded. `update_icons` only reads zips you put in `icons-inbox/` and **keeps them** unless `keep=false`.
- Invalid specs are never written; render errors say what to change.
- Official Azure/AWS icons stay local (`.dgm/icons`, git-ignored).

## Prompts that work well

- "Draw the architecture of this repo's Azure deployment (read the Bicep in `infra/`): subscription, resource groups, VNet, App
  Service, SQL with private endpoint, Key Vault. Save it as `src/diagrams/arch.diagram.yaml` and export a PNG."
- "Make a flow of the login process with optional MFA and a vertical variant for mobile."
- "Create a theme from these brand colours (olive #5f6f1f, amber #c98a1b), preview it in dark mode and save it."
- "Add the AWS NAT gateway and an S3 bucket to `arch.diagram.yaml` and re-render."
