#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, extname, resolve, basename } from "node:path";
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
  parseThemeDef,
  type Mode,
  type ThemeDef,
  type DiagramSpec,
} from "@dgm/core";

const HELP = `dgm — Distill-style interactive diagrams

Usage:
  dgm render <spec> -o <out.svg|out.png> [--static] [--mode auto|light|dark] [--theme <name|file>] [--scale 2]
  dgm validate <spec>               Print errors/warnings (exit 1 on errors)
  dgm schema                        Print the JSON Schema of the spec
  dgm kinds                         List known node kinds

  dgm theme list                    Built-in and project themes
  dgm theme show <name|file>        Resolved tokens (light + dark) as YAML
  dgm theme new <name> --accent "#6b7a2f" [--flow "#c98a1b"] [--neutral "#f1f0e4"] [--extends distill]
                        [--out themes/<name>.theme.yaml] [--expand]
  dgm theme check <name|file>       Validate + WCAG contrast report (exit 1 on issues)
  dgm theme preview <name|file> [-o out-dir]   Render a sample diagram, light and dark, to PNG

<spec> is a .yaml/.yml/.json file. SVG output is interactive unless --static; PNG is always static.
Themes: built-ins (distill, olive, azure, aws, orange, slate, mono) plus the ones listed under
"themes" in dgm.config.json. --theme dark|light|auto is still accepted and means --mode.`;

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

/** `--theme` is a name, a theme file path, or (legacy) a mode keyword. */
function themeArg(v: string | undefined): string | ThemeDef | undefined {
  if (!v) return undefined;
  if (!isMode(v) && /\.(ya?ml|json)$/i.test(v)) return loadThemeFile(resolve(v));
  return v;
}

function load(path: string): DiagramSpec {
  loadConfig(dirname(resolve(path)));
  const res = validateSpec(parseSpecText(readFileSync(path, "utf8")));
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
      load(args[0]);
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
    case "render": {
      const spec = load(args[0]);
      const out = flag(args, "-o") ?? flag(args, "--out");
      if (!out) throw new Error("missing -o <output>");
      let theme = themeArg(flag(args, "--theme"));
      let mode = flag(args, "--mode") as Mode | undefined;
      if (typeof theme === "string" && isMode(theme)) {
        mode ??= theme;
        theme = undefined;
      }
      if (mode && !isMode(mode)) throw new Error(`--mode must be auto|light|dark, got "${mode}"`);
      mkdirSync(dirname(out), { recursive: true });
      if (extname(out).toLowerCase() === ".png") {
        const scale = Number(flag(args, "--scale") ?? 2);
        writeFileSync(out, await renderPng(spec, { theme, mode, scale }));
      } else {
        writeFileSync(out, await renderSvg(spec, { theme, mode, static: args.includes("--static") }));
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
