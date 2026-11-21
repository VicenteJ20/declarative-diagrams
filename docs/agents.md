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

### OpenCode Desktop (v2) vs the terminal CLI (v1) — and "I don't see the agent"

The **desktop app bundles its own CLI** (`%APPDATA%i.opencode.desktop\cli\<version>\opencode-cli.exe`, v2.x) and runs a **background
service** that loads the configuration once. The terminal `opencode` you installed with npm can be a different major version
(1.x). This project works with both: the V1-style `opencode.json`, agent and command files are normalised to V2 in memory
(checked: V2 shows `dgm` under `mcp.servers`, `skills` as a list, and the agent with its permissions translated).

If the agent (or the `dgm` tools) does not show up in the desktop app:

1. **Reload the service** — it keeps the old config until told otherwise:

   ```powershell
   & (Get-ChildItem "$env:APPDATAi.opencode.desktop\cli\*\opencode-cli.exe" | Sort-Object LastWriteTime | Select-Object -Last 1).FullName reload
   ```

   (`... service restart` if reload is not enough.) Then reopen the project in the app.
2. **Open the right folder.** Project agents live in `.opencode/agents/` of the project; the picker only lists them for sessions
   opened in `diagrams-maker/` (or a folder where you ran `dgm agent install`). Use `--global` to have it everywhere.
3. **Check what the app's CLI sees** from the project folder (same commands as the terminal, with the bundled binary):
   `opencode-cli.exe debug agents` (lists agent ids) and `opencode-cli.exe mcp list` (→ `✓ dgm connected`).

Note that V2 ignores a few V1 fields (e.g. `temperature` in the agent file); they are harmless.

#### Why the agent/skill may not show up: the *location* (project folder)

OpenCode resolves agents, skills, commands and MCP servers **per location** (the folder a session is opened in). A session
opened without a project is at your user folder, where only **global** definitions exist (`~/.config/opencode/{skills,agents}`).
The project's `.opencode/agents/` and `skills/` are only visible in sessions opened in `diagrams-maker/`. You can check what a
location sees with the desktop CLI:

```powershell
$cli = (Get-ChildItem "$env:APPDATAi.opencode.desktop\cli\*\opencode-cli.exe" | Sort-Object LastWriteTime | Select-Object -Last 1).FullName
& $cli api skill.list -H "x-opencode-directory:C:\path	o\project"     # ids of the skills that location sees
& $cli api agent.list -H "x-opencode-directory:C:\path	o\project"
```

(the first query for a location may return empty while it loads; ask again after a couple of seconds.)

#### Make it available in every project (global install)

```powershell
node packages/cli/dist/index.js skill install --target opencode --global   # ~/.config/opencode/skills/diagram-author
node packages/cli/dist/index.js agent install --global                     # ~/.config/opencode/agents/diagram-specialist.md
```

and add the server to `~/.config/opencode/opencode.jsonc` (no `--root`: it works in the folder OpenCode opens; `DGM_ICONS_DIR`
points at the icon store so the official Azure/AWS icons are found from any project):

```jsonc
"mcp": {
  "dgm": {
    "type": "local",
    "command": ["node", "C:\path\to\diagrams-maker\packages\mcp\dist\index.js"],
    "environment": { "DGM_ICONS_DIR": "C:\path\to\diagrams-maker\.dgm\icons" },
    "enabled": true
  }
}
```

A project's own `opencode.json` entry with the same name (like this repo's) takes precedence over the global one. The absolute paths
break if you move the repo. Then run the reload command above (or restart the app).

### The agent: `diagram-specialist`

[`.opencode/agents/diagram-specialist.md`](../.opencode/agents/diagram-specialist.md) is a **primary agent** you talk to directly
(press **Tab** to switch to it, or run `/diagram` / `/diagram-theme`, which use it). It knows how to run the whole job with the
Skill and the `dgm_*` tools:

- **Inputs**: a text description, requirements lists, project files (existing `*.diagram.yaml`, Bicep/Terraform/CloudFormation/
  Kubernetes/docker-compose to derive an architecture) and **images** — previous diagrams, sketches, portal screenshots — pasted into
  the chat or attached with `@file` (needs a model with vision; the agent says so if it receives no image).
- **Intake**: it infers what it can and asks at most four short questions, each with its default (type, Azure/AWS and levels,
  output formats, where to save, theme/mode/font/aspect/narrow variant, icons).
- **Reference-image protocol**: inventory (containers, nodes, edges, labels, styles) → confirm only the doubtful parts → map to kinds,
  official icons (`dgm_search_icons`), tones, notes, steps → optional theme from the picture's colours → build → compare against the
  reference and report differences.
- **Queries it runs on its own**: `dgm_list_icon_packs` (icon prefixes installed), `dgm_search_icons` for every resource,
  `dgm_list_kinds`, `dgm_get_spec_schema`, `dgm_get_example`, `dgm_list_themes`, then `dgm_validate_diagram` and `dgm_render_diagram`.
- **Outputs**: spec file, PNG, interactive or static SVG, MDX snippet, themes — with aspect ratio, mode, font and narrow variant.
- **Permissions**: all `dgm_*` tools allowed except `dgm_update_icons` (asks); file edits and shell commands ask, except `dgm` CLI calls.

Install it in another project (it also needs the MCP server and the Skill):

```powershell
node packages/cli/dist/index.js agent install                    # .opencode/agents/  (--global: ~/.config/opencode/agents)
node packages/cli/dist/index.js skill install --target opencode
node packages/cli/dist/index.js mcp config --client opencode     # add the block to opencode.json
```

Example prompts: *"Dibuja la arquitectura de este repo (mira infra/main.bicep), tema olive, y exporta PNG y SVG"* · *"Rehaz este diagrama
@docs/old-arch.png con los iconos oficiales de AWS y una variante para móvil"* · *"Crea un tema con los colores de mi marca (#5f6f1f y
#c98a1b) y aplícalo al diagrama anterior"*.

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
