# Using declarative-diagrams with an AI agent (Agents + Skill + MCP)

Three pieces work together (you can also use declarative-diagrams [without any AI](../README.md#no-ai-its-declarative--use-it-by-hand)):

- **MCP server `dgm`** (`packages/mcp`) — the tools: read the guide, search icons, validate, **render a PNG the agent can look at**,
  save specs, create/preview themes.
- **Skill `diagram-author`** (`skills/diagram-author`) — the know-how: workflow, spec rules, Azure/AWS patterns, style checklist.
  The same text is served by the tool `get_authoring_guide`, so the server alone is enough for any MCP client.
- **Agent `diagram-specialist`** (OpenCode, `.opencode/agents/`) — a primary agent that runs the whole job with the Skill and the tools.

> Build first: the MCP server runs from `packages/mcp/dist`. `npm install && npm run build` (Node ≥ 22).

## Setup: Claude Code

```bash
node packages/cli/dist/index.js skill install      # copies the Skill to .claude/skills/  (add --global for ~/.claude/skills)
node packages/cli/dist/index.js mcp config         # prints the config + the `claude mcp add` command
```

This repo ships a project-scoped [`.mcp.json`](../.mcp.json); Claude Code asks you to approve it the first time. In another project:

```bash
claude mcp add dgm -- node /path/to/declarative-diagrams/packages/mcp/dist/index.js --root /path/to/your/project
```

`--root` is the project the agent works in: `dgm.config.json`, `themes/`, your `*.diagram.yaml` and `.dgm/icons` are read from
there, and **every write stays inside it**. Claude Desktop: paste the JSON from `dgm mcp config` into its MCP settings.

## Setup: OpenCode

This repo already contains everything OpenCode needs, so opening it with `opencode` is enough (after `npm run build`):

| File | What it does |
|---|---|
| [`opencode.json`](../opencode.json) | registers the MCP server `dgm` (local) and adds `skills/` as a skills path |
| [`AGENTS.md`](../AGENTS.md) | project notes + the diagram workflow, read automatically by OpenCode |
| [`.opencode/agents/diagram-specialist.md`](../.opencode/agents/diagram-specialist.md) | the agent (press **Tab** to switch to it) |
| [`.opencode/commands/`](../.opencode/commands) | `/diagram <idea>` and `/diagram-theme <brand colours>` |

In **another project** (the agent also needs the MCP server and the Skill):

```bash
node packages/cli/dist/index.js agent install                    # .opencode/agents/  (--global: ~/.config/opencode/agents)
node packages/cli/dist/index.js skill install --target opencode  # .opencode/skills/  (--global: ~/.config/opencode/skills)
node packages/cli/dist/index.js mcp config --client opencode     # prints the block to add to opencode.json
```

Use the shape OpenCode asks for: servers directly under `mcp` with `"enabled"` (OpenCode 1.x) or `mcp.servers` (newer docs). OpenCode also
reads `.claude/skills/`, so a Claude Code install works there too. If you have another diagram skill globally, name `diagram-author` in
the prompt or use `/diagram`. Restart OpenCode after changing config or the Skill — it is loaded once at startup.

For a **global** setup, add the server to your user config (no `--root`: it works in the folder OpenCode opens; `DGM_ICONS_DIR` points
at the icon store so the Azure/AWS icons you imported are found from any project):

```jsonc
"mcp": {
  "dgm": {
    "type": "local",
    "command": ["node", "/path/to/declarative-diagrams/packages/mcp/dist/index.js"],
    "environment": { "DGM_ICONS_DIR": "/path/to/declarative-diagrams/.dgm/icons" },
    "enabled": true
  }
}
```

A project's own `opencode.json` entry with the same name takes precedence. Absolute paths break if you move the repo.

## The agent: `diagram-specialist`

- **Inputs**: a text description, requirement lists, project files (existing `*.diagram.yaml`, Bicep/Terraform/CloudFormation/Kubernetes/
  docker-compose to derive an architecture) and **images** — previous diagrams, sketches, portal screenshots — pasted into the chat or
  attached with `@file` (needs a model with vision; the agent says so if it receives no image).
- **Intake**: it infers what it can and asks at most four short questions, each with its default (type, Azure/AWS and levels, output
  formats, where to save, theme/mode/font/aspect/narrow variant, icons).
- **Reference-image protocol**: inventory (containers, nodes, edges, labels, styles) → confirm only the doubtful parts → map to kinds,
  icons (`dgm_search_icons`), tones, notes, steps → optional theme from the picture's colours → build → compare against the reference.
- **Outputs**: spec file, PNG, interactive or static SVG, MDX snippet, themes — with aspect ratio, mode, font and narrow variant.
- **Permissions**: all `dgm_*` tools allowed except `dgm_update_icons` (asks); file edits and shell commands ask, except `dgm` CLI calls.

**Project conventions.** The agent reads the project's own `AGENTS.md` (a *Diagrams* section), `dgm.config.json` and any existing diagram
component *before* choosing paths, names, theme or the embed snippet, and it **asks where to integrate** (file + line, or "after heading X")
before editing a page. `dgm.config.json` can set the project's default theme
(`{ "themes": ["themes/*.theme.yaml"], "theme": "my-brand" }`). For a static site that should not depend on dgm at build time, export the
interactive SVG + PNG into the repo and show the SVG with a small component that inlines it. The runtime exposes `svg.dgm.show(k)`
(-1 = overview) so a host page can drive the steps.

Example prompts:

- "Draw the architecture of this repo's Azure deployment (read the Bicep in `infra/`): subscription, resource groups, VNet, App Service,
  SQL with private endpoint, Key Vault. Save it as `src/diagrams/arch.diagram.yaml`, theme olive, export PNG and SVG."
- "Redo this diagram `@docs/old-arch.png` with the official AWS icons and a variant for mobile."
- "Create a theme from my brand colours (#5f6f1f and #c98a1b), preview it in dark mode and apply it to the previous diagram."
- "Make a flow of the login process with optional MFA."
- "Add the AWS NAT gateway and an S3 bucket to `arch.diagram.yaml` and re-render."

## MCP tools

| Tool | Purpose |
|---|---|
| `get_authoring_guide` | The guide (topics: overview, spec, azure, aws, style, icons, themes) |
| `get_spec_schema`, `list_kinds`, `get_example` | Exact schema, node kinds/tones, example specs |
| `list_icon_packs`, `search_icons`, `update_icons` | Icons: what is installed, find names, import the zips from `icons-inbox/<pack>/` |
| `list_themes`, `get_theme`, `create_theme`, `preview_theme` | Themes: inspect, create from seed colours (+ contrast check), look at them |
| `validate_diagram` | Errors/warnings with fixes (`did you mean …`) |
| `render_diagram` | PNG (returned as an image) or SVG; `theme`, `mode`, `aspect`, `variant=narrow`, `save_to` (`overwrite=true` to replace) |
| `write_diagram` | Validate and save `*.diagram.yaml` (no overwrite unless asked) |

## Behaviour you can rely on

- Paths are confined to `--root`: `..`, absolute paths and symlinks pointing outside are refused.
- Generated files never silently replace existing ones (`overwrite=true` is explicit) and must have the right extension.
- Nothing is downloaded by the MCP server. `update_icons` only reads zips you put in `icons-inbox/`.
- Invalid specs are never written; render errors say what to change.
- Official Azure/AWS icons stay local (`.dgm/icons`, git-ignored) — see [ICONS-DISCLAIMER](../ICONS-DISCLAIMER.md).

See [security notes](security.md) for the trust model.

## Windows notes: OpenCode Desktop

The desktop app bundles its own CLI (`%APPDATA%\ai.opencode.desktop\cli\<version>\opencode-cli.exe`) and runs a **background service**
that loads the configuration once. The terminal `opencode` you installed with npm can be a different major version; this project's
`opencode.json`, agent and command files work with both. If the agent or the `dgm` tools do not show up in the desktop app:

1. **Reload the service** — it keeps the old config until told otherwise:

   ```powershell
   $cli = (Get-ChildItem "$env:APPDATA\ai.opencode.desktop\cli\*\opencode-cli.exe" | Sort-Object LastWriteTime | Select-Object -Last 1).FullName
   & $cli reload      # or: & $cli service restart
   ```

   Then reopen the project in the app.
2. **Open the right folder.** Project agents live in `.opencode/agents/`; they are only listed for sessions opened in that project
   (or after `dgm agent install --global`).
3. **Check what the app's CLI sees** from the project folder: `& $cli debug agents` and `& $cli mcp list` (→ `✓ dgm connected`).
