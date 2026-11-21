#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync } from "node:fs";
import { dirname, extname, resolve, basename, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import {
  parseSpecText,
  validateSpec,
  renderSvg,
  renderPng,
  specJsonSchema,
  KINDS,
  loadConfig,
  loadThemeFile,
  listThemes,
  resolveTheme,
  checkTheme,
  isMode,
  isFontMode,
  type FontMode,
  parseThemeDef,
  applyVariant,
  syncPack,
  importInbox,
  listIcons,
  listAliases,
  resolveIcon,
  OFFICIAL_URL,
  syncedPacks,
  type OfficialPack,
  type Mode,
  type ThemeDef,
  type DiagramSpec,
} from "@dgm/core";

const here = dirname(fileURLToPath(import.meta.url));

const HELP = `dgm — Distill-style interactive diagrams

Usage:
  dgm render <spec> -o <out.svg|out.png> [--static] [--mode auto|light|dark] [--theme <name|file>] [--scale 2]
                    [--aspect 16/9|1.5] [--padding 16] [--variant narrow]
                    [--font mixed|sans|serif]
  dgm validate <spec>               Print errors/warnings (exit 1 on errors)
  dgm schema                        Print the JSON Schema of the spec
  dgm kinds                         List known node kinds

  dgm icons update [--keep] [--inbox icons-inbox]
                                    Import the zips in icons-inbox/<pack>/ (azure, aws, gcp… — the folder name is the pack),
                                    extract to .dgm/icons/<pack> and delete each zip
  dgm icons sync <azure|aws> --from <zip|folder|url> [--dest .dgm/icons]
                                    Same, for one explicit file/folder/URL (zip is kept)
  dgm icons search <text> [--pack az|aws|lu|<prefix>]   Find icon names
  dgm icons list [--pack …] | packs | aliases <azure|aws>

  dgm skill install [--global] [--target claude|opencode]
                                    Install the "diagram-author" Skill: .claude/skills/ (default) or .opencode/skills/
                                    (--global: ~/.claude/skills or ~/.config/opencode/skills)
  dgm agent install [--global]      Install the "diagram-specialist" OpenCode agent (.opencode/agents/ or ~/.config/opencode/agents/)
  dgm mcp config [--client claude|opencode]
                                    Print the MCP server config (Claude Code/Desktop .mcp.json, or OpenCode opencode.json)

  dgm theme list                    Built-in and project themes
  dgm theme show <name|file>        Resolved tokens (light + dark) as YAML
  dgm theme new <name> --accent "#6b7a2f" [--flow "#c98a1b"] [--neutral "#f1f0e4"] [--extends distill]
                        [--out themes/<name>.theme.yaml] [--expand]
  dgm theme check <name|file>       Validate + WCAG contrast report (exit 1 on issues)
  dgm theme preview <name|file> [-o out-dir]   Render a sample diagram, light and dark, to PNG

<spec> is a .yaml/.yml/.json file. SVG output is interactive unless --static; PNG is always static.
Icons: set "icon: az-webapp | aws-lambda | lu-database | <prefix>-<name>" on any node. Official Azure/AWS
packs must be synced first (see "dgm icons sync"); --allow-missing-icons renders a fallback glyph instead of failing.
Themes: built-ins (distill, olive, azure, aws, orange, slate, mono) plus the ones listed under
"themes" in dgm.config.json. --theme dark|light|auto is still accepted and means --mode.`;

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

/** `--theme` is a name, a theme file path, or (legacy) a mode keyword. */
/** "16/9", "4:3" or a plain number. */
function parseAspect(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const m = /^(\d+(?:\.\d+)?)\s*[/:]\s*(\d+(?:\.\d+)?)$/.exec(v);
  const r = m ? Number(m[1]) / Number(m[2]) : Number(v);
  if (!(r > 0)) throw new Error(`--aspect must be like 16/9 or 1.5, got "${v}"`);
  return r;
}

function themeArg(v: string | undefined): string | ThemeDef | undefined {
  if (!v) return undefined;
  if (!isMode(v) && /\.(ya?ml|json)$/i.test(v)) return loadThemeFile(resolve(v));
  return v;
}

function load(path: string, allowMissingIcons = false): DiagramSpec {
  loadConfig(dirname(resolve(path)));
  const res = validateSpec(parseSpecText(readFileSync(path, "utf8")), { missingIcons: allowMissingIcons ? "warn" : "error" });
  for (const w of res.warnings) console.error(`warning: ${w}`);
  if (!res.ok) {
    for (const e of res.errors) console.error(`error: ${e}`);
    process.exit(1);
  }
  return res.spec!;
}

function themeByArg(v: string) {
  loadConfig();
  return resolveTheme(themeArg(v) as string | ThemeDef);
}

const SAMPLE: DiagramSpec = {
  type: "architecture",
  title: "Theme preview",
  direction: "RIGHT",
  notesPosition: "side",
  nodes: [
    { id: "u", label: "Users", kind: "user" },
    {
      id: "cloud",
      label: "Production",
      kind: "cloud",
      children: [
        {
          id: "vnet",
          label: "vnet-app",
          kind: "network",
          children: [
            { id: "gw", label: "Gateway", kind: "gateway" },
            { id: "api", label: "API", sublabel: "v2", kind: "service", tone: "accent" },
            { id: "db", label: "Database", kind: "database" },
            { id: "q", label: "Queue", kind: "queue", tone: "warn" },
          ],
        },
      ],
    },
  ],
  edges: [
    { from: "u", to: "gw", label: "HTTPS", style: "solid", flow: true, both: false },
    { from: "gw", to: "api", style: "solid", flow: false, both: false },
    { from: "api", to: "db", style: "solid", flow: true, both: false },
    { from: "api", to: "q", style: "dashed", flow: false, both: false },
  ],
  notes: [{ target: "db", text: "Sample note in the serif face." }],
  steps: [],
};

async function iconsCmd(args: string[]) {
  const [sub, ...rest] = args;
  const cfg = loadConfig();
  const destDefault = resolve(cfg.root, ".dgm/icons");
  switch (sub) {
    case "update": {
      const inbox = resolve(cfg.root, flag(rest, "--inbox") ?? cfg.config.iconsInbox ?? "icons-inbox");
      const results = importInbox(inbox, flag(rest, "--dest") ?? destDefault, { keep: rest.includes("--keep") });
      if (!results.length) {
        console.log(`No zips found in ${inbox}.`);
        console.log(`Drop each zip in a folder named after its pack and run this again:`);
        console.log(`  icons-inbox/azure/   ${OFFICIAL_URL.azure}`);
        console.log(`  icons-inbox/aws/     ${OFFICIAL_URL.aws}`);
        console.log(`  icons-inbox/<other>/ any other pack, e.g. gcp (every svg becomes <other>-<file-name>)`);
        break;
      }
      let failed = 0;
      for (const r of results) {
        if (r.status === "imported") console.log(`✓ ${r.file} → ${r.pack} (${r.count} icons)${r.deleted ? ", zip deleted" : ", zip kept"}`);
        else {
          failed++;
          console.log(`✗ ${r.file}: ${r.message}`);
        }
      }
      console.log(`Icons are in ${destDefault} (git-ignored). Check them with: dgm icons packs`);
      if (failed) process.exit(1);
      break;
    }
    case "sync": {
      const pack = rest[0] as OfficialPack;
      if (!pack || pack.startsWith("-")) throw new Error("usage: dgm icons sync <pack> --from <zip|folder|url>   (pack: azure, aws, gcp…)");
      const from = flag(rest, "--from");
      if (!from)
        throw new Error(`missing --from. Download the official package from ${OFFICIAL_URL[pack]} and pass the .zip (or the extracted folder).`);
      const r = await syncPack(pack, from, flag(rest, "--dest") ?? destDefault);
      console.log(`synced ${r.count} ${pack} icons to ${r.dir} (${r.skipped} non-service files skipped)`);
      console.log("These files stay on this machine (.dgm/ is git-ignored). Use them as az-<name> / aws-<name>.");
      break;
    }
    case "search": {
      const q = rest.find((a) => !a.startsWith("--") && a !== flag(rest, "--pack"))?.toLowerCase();
      if (!q) throw new Error("usage: dgm icons search <text> [--pack az|aws|lu|<prefix>]");
      const hits = listIcons(flag(rest, "--pack")).filter((i) => i.ref.includes(q));
      for (const h of hits.slice(0, 60)) console.log(h.ref);
      if (hits.length > 60) console.log(`… ${hits.length - 60} more`);
      if (!hits.length) {
        console.log(`no icon matches "${q}".`);
        for (const pk of ["azure", "aws"] as OfficialPack[]) {
          const r = resolveIcon(pk === "azure" ? "az-x" : "aws-x");
          if (!r.ok && /not installed/.test(r.error)) console.log(`  (${pk} icons not synced — run: dgm icons sync ${pk} --from <zip|folder>)`);
        }
      }
      break;
    }
    case "list": {
      for (const i of listIcons(flag(rest, "--pack"))) console.log(i.ref);
      break;
    }
    case "packs": {
      const have = new Set(syncedPacks());
      for (const [pre, pk] of [["az", "azure"], ["aws", "aws"]] as const) {
        const n = listIcons(pre).length;
        console.log(`${pre.padEnd(5)} ${pk.padEnd(8)} ${n ? `${n} icons` : `not synced (icons-inbox/${pk}/ + dgm icons update)`}`);
        have.delete(pk);
      }
      for (const pk of have) console.log(`${pk.padEnd(5)} ${pk.padEnd(8)} ${listIcons(pk).length} icons`);
      console.log(`lu    lucide   ${listIcons("lu").length} icons (bundled)`);
      break;
    }
    case "aliases":
      for (const a of listAliases((rest[0] ?? "azure") as OfficialPack)) console.log(a);
      break;
    default:
      console.log(HELP);
      process.exit(1);
  }
}

async function themeCmd(args: string[]) {
  const [sub, ...rest] = args;
  loadConfig();
  switch (sub) {
    case "list":
      for (const t of listThemes()) console.log(`${t.name.padEnd(12)} ${t.description ?? ""}`);
      break;
    case "show": {
      const t = themeByArg(rest[0]);
      console.log(YAML.stringify({ name: t.name, fonts: t.fonts, light: t.light, dark: t.dark }));
      break;
    }
    case "new": {
      const name = rest[0];
      const accent = flag(rest, "--accent");
      if (!name || !accent) throw new Error('usage: dgm theme new <name> --accent "#rrggbb" [--flow …] [--neutral …] [--extends …]');
      const def: ThemeDef = {
        name,
        description: flag(rest, "--description"),
        extends: flag(rest, "--extends") ?? "distill",
        seed: { accent, flow: flag(rest, "--flow"), neutral: flag(rest, "--neutral") },
      };
      parseThemeDef(JSON.parse(JSON.stringify(def)), name); // validate
      let out: unknown = JSON.parse(JSON.stringify(def));
      if (rest.includes("--expand")) {
        const r = resolveTheme(def);
        out = { name, description: def.description, extends: def.extends, light: r.light, dark: r.dark };
      }
      const file = resolve(flag(rest, "--out") ?? `themes/${name}.theme.yaml`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, YAML.stringify(out));
      const issues = checkTheme(resolveTheme(def));
      console.log(`wrote ${file}`);
      for (const i of issues) console.log(`  contrast ${i.mode}: ${i.pair} = ${i.ratio} (< ${i.min})`);
      if (!existsSync(resolve("dgm.config.json"))) console.log('tip: add { "themes": ["themes/*.theme.yaml"] } to dgm.config.json to use it by name.');
      break;
    }
    case "check": {
      const t = themeByArg(rest[0]);
      const issues = checkTheme(t);
      if (!issues.length) console.log(`ok: ${t.name} passes the contrast checks`);
      for (const i of issues) console.log(`${i.mode}: ${i.pair} = ${i.ratio} (needs ≥ ${i.min})`);
      if (issues.length) process.exit(1);
      break;
    }
    case "preview": {
      const t = themeByArg(rest[0]);
      const dir = resolve(flag(rest, "-o") ?? ".");
      mkdirSync(dir, { recursive: true });
      for (const mode of ["light", "dark"] as const) {
        const f = resolve(dir, `${t.name}-${mode}.png`);
        writeFileSync(f, await renderPng(SAMPLE, { theme: t, mode }));
        console.log(`wrote ${f}`);
      }
      break;
    }
    default:
      console.log(HELP);
      process.exit(1);
  }
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case "validate": {
      load(args[0], args.includes("--allow-missing-icons"));
      console.log("ok");
      break;
    }
    case "schema":
      console.log(JSON.stringify(specJsonSchema(), null, 2));
      break;
    case "kinds":
      for (const [k, v] of Object.entries(KINDS)) console.log(`${k}${v.tag ? `  (container: ${v.tag})` : ""}`);
      break;
    case "theme":
      await themeCmd(args);
      break;
    case "icons":
      await iconsCmd(args);
      break;
    case "skill": {
      if (args[0] !== "install") throw new Error("usage: dgm skill install [--global]");
      const src = [process.env.DGM_SKILL_DIR, resolve(here, "../../../skills/diagram-author")].find((d) => d && existsSync(join(d, "SKILL.md")));
      if (!src) throw new Error("Skill files not found (expected skills/diagram-author next to the packages).");
      const root = loadConfig().root;
      const target = flag(args, "--target") ?? "claude";
      if (target !== "claude" && target !== "opencode") throw new Error("--target must be claude or opencode");
      const dest =
        target === "opencode"
          ? args.includes("--global") ? join(homedir(), ".config", "opencode", "skills", "diagram-author") : resolve(root, ".opencode", "skills", "diagram-author")
          : args.includes("--global") ? join(homedir(), ".claude", "skills", "diagram-author") : resolve(root, ".claude", "skills", "diagram-author");
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(src, dest, { recursive: true, force: true });
      console.log(`Installed the diagram-author Skill to ${dest}`);
      console.log(`Restart ${target === "opencode" ? "OpenCode" : "Claude Code"} (or start a new session) to load it. The MCP server gives it the tools: dgm mcp config --client ${target}`);
      break;
    }
    case "agent": {
      if (args[0] !== "install") throw new Error("usage: dgm agent install [--global]");
      const src = [process.env.DGM_AGENT_FILE, resolve(here, "../../../.opencode/agents/diagram-specialist.md")].find((f) => f && existsSync(f));
      if (!src) throw new Error("Agent file not found (expected .opencode/agents/diagram-specialist.md next to the packages).");
      const dest = args.includes("--global")
        ? join(homedir(), ".config", "opencode", "agents", "diagram-specialist.md")
        : resolve(loadConfig().root, ".opencode", "agents", "diagram-specialist.md");
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(src, dest, { force: true });
      console.log(`Installed the diagram-specialist agent to ${dest}`);
      console.log("It needs the MCP server and the Skill too:");
      console.log("  dgm mcp config --client opencode   (add the block to opencode.json)");
      console.log("  dgm skill install --target opencode");
      console.log("Restart OpenCode, then press Tab to switch to the agent (or run /diagram).");
      break;
    }
    case "mcp": {
      if (args[0] !== "config") throw new Error("usage: dgm mcp config");
      const server = resolve(here, "../../mcp/dist/index.js");
      if (!existsSync(server)) throw new Error(`MCP server not built (${server}). Run: npm run build`);
      const projectRoot = loadConfig().root;
      if ((flag(args, "--client") ?? "claude") === "opencode") {
        // OpenCode (config schema of 1.x: servers directly under `mcp`). Put it in opencode.json; skills are found via .opencode/skills
        console.log(JSON.stringify({ $schema: "https://opencode.ai/config.json", mcp: { dgm: { type: "local", command: ["node", server, "--root", projectRoot], enabled: true } } }, null, 2));
        console.log("\n# Skill for OpenCode:  dgm skill install --target opencode   (restart OpenCode afterwards)");
        console.log("# Check:  opencode mcp list   ->  dgm connected");
        break;
      }
      const cfg = { mcpServers: { dgm: { command: "node", args: [server, "--root", projectRoot] } } };
      console.log(JSON.stringify(cfg, null, 2));
      console.log(`\n# Claude Code:  claude mcp add dgm -- node "${server}" --root "${projectRoot}"`);
      break;
    }
    case "render": {
      const spec = load(args[0], args.includes("--allow-missing-icons"));
      const out = flag(args, "-o") ?? flag(args, "--out");
      if (!out) throw new Error("missing -o <output>");
      let theme = themeArg(flag(args, "--theme"));
      let mode = flag(args, "--mode") as Mode | undefined;
      if (typeof theme === "string" && isMode(theme)) {
        mode ??= theme;
        theme = undefined;
      }
      if (mode && !isMode(mode)) throw new Error(`--mode must be auto|light|dark, got "${mode}"`);
      const font = flag(args, "--font") as FontMode | undefined;
      if (font && !isFontMode(font)) throw new Error(`--font must be mixed|sans|serif, got "${font}"`);
      const aspect = parseAspect(flag(args, "--aspect"));
      const padding = flag(args, "--padding") ? Number(flag(args, "--padding")) : undefined;
      let target = spec;
      if (flag(args, "--variant")) {
        const v = applyVariant(spec, flag(args, "--variant") as "narrow");
        if (!v) throw new Error(`spec has no variants.${flag(args, "--variant")}`);
        target = v;
      }
      mkdirSync(dirname(out), { recursive: true });
      if (extname(out).toLowerCase() === ".png") {
        const scale = Number(flag(args, "--scale") ?? 2);
        writeFileSync(out, await renderPng(target, { theme, mode, scale, aspect, padding, font }));
      } else {
        writeFileSync(out, await renderSvg(target, { theme, mode, aspect, padding, font, static: args.includes("--static") }));
      }
      console.log(`wrote ${out}`);
      break;
    }
    default:
      console.log(HELP);
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
void basename;
