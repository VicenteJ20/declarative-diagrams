import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import YAML from "yaml";
import {
  KINDS,
  TONES,
  applyVariant,
  checkTheme,
  importInbox,
  listIcons,
  listThemes,
  loadConfig,
  parseSpecText,
  parseThemeDef,
  renderPng,
  renderSvg,
  resolveTheme,
  resolveIcon,
  specJsonSchema,
  syncedPacks,
  validateSpec,
  OFFICIAL_URL,
  type DiagramSpec,
  type Mode,
  type ThemeDef,
} from "@dgm/core";

const here = dirname(fileURLToPath(import.meta.url));

type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const fail = (t: string) => ({ isError: true, content: [{ type: "text" as const, text: t }] });
const json = (o: unknown) => text(JSON.stringify(o, null, 2));

export interface ServerOptions {
  /** Project root: where `dgm.config.json`, `themes/`, diagrams and `.dgm/icons` live. Writes never leave it. */
  root: string;
}

function parseAspect(v: string | number | undefined): number | undefined {
  if (v == null || v === "") return undefined;
  if (typeof v === "number") return v > 0 ? v : undefined;
  const m = /^(\d+(?:\.\d+)?)\s*[/:]\s*(\d+(?:\.\d+)?)$/.exec(v.trim());
  const r = m ? Number(m[1]) / Number(m[2]) : Number(v);
  if (!(r > 0)) throw new Error(`aspect must look like 16/9 or 1.5, got "${v}"`);
  return r;
}

/** Folder with the Skill's reference docs (single source for `get_authoring_guide`). */
function guideDir(root: string): string | null {
  const c = [process.env.DGM_SKILL_DIR, resolve(here, "../../../skills/diagram-author"), resolve(root, "skills/diagram-author"), resolve(root, ".claude/skills/diagram-author")];
  return c.find((d) => d && existsSync(join(d, "SKILL.md"))) ?? null;
}

function examplesDir(root: string): string | null {
  const c = [resolve(here, "../../../examples"), resolve(root, "examples")];
  return c.find((d) => existsSync(d)) ?? null;
}

export function createServer(opts: ServerOptions): McpServer {
  const root = resolve(opts.root);
  const server = new McpServer({ name: "dgm", version: "0.1.0" });

  const refresh = () => loadConfig(root); // picks up new themes / icon packs on every call

  /** Resolve a user-supplied path inside the project root (refuses to escape it). */
  const inRoot = (p: string): string => {
    const abs = isAbsolute(p) ? resolve(p) : resolve(root, p);
    const rel = relative(root, abs);
    if (rel.startsWith("..") || isAbsolute(rel)) throw new Error(`path "${p}" is outside the project root (${root})`);
    return abs;
  };

  const readSpecText = (a: { spec?: string; path?: string }): { text: string; source: string } => {
    if (a.spec && a.path) throw new Error("pass either `spec` or `path`, not both");
    if (a.spec) return { text: a.spec, source: "(inline)" };
    if (a.path) {
      const f = inRoot(a.path);
      if (!existsSync(f)) throw new Error(`file not found: ${a.path}`);
      return { text: readFileSync(f, "utf8"), source: a.path };
    }
    throw new Error("pass the diagram as `spec` (YAML or JSON text) or as `path` to a .diagram.yaml file");
  };

  const loadSpec = (a: { spec?: string; path?: string; allow_missing_icons?: boolean }) => {
    refresh();
    const { text: src, source } = readSpecText(a);
    let data: unknown;
    try {
      data = parseSpecText(src);
    } catch (e) {
      throw new Error(`${source}: not valid YAML/JSON — ${(e as Error).message}`);
    }
    const res = validateSpec(data, { missingIcons: a.allow_missing_icons ? "warn" : "error" });
    return { res, source };
  };

  const specInput = {
    spec: z.string().optional().describe("The diagram as YAML or JSON text (see get_authoring_guide / get_spec_schema)."),
    path: z.string().optional().describe("Alternatively, path (inside the project) of an existing .diagram.yaml/.json."),
  };

  /* ------------------------------ guidance ------------------------------ */

  server.registerTool(
    "get_authoring_guide",
    {
      title: "Authoring guide",
      description:
        "READ THIS FIRST when asked to make a diagram. Returns the guide for writing diagram specs: format, node kinds, containers (Azure subscriptions/VNets, AWS accounts/VPCs), edges, notes, steps, icons, themes and layout tips. Topics: overview (default), spec, azure, aws, style, icons, themes.",
      inputSchema: { topic: z.enum(["overview", "spec", "azure", "aws", "style", "icons", "themes"]).optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ topic }) => {
      const dir = guideDir(root);
      if (!dir) return fail("The authoring guide files were not found (skills/diagram-author). Use get_spec_schema and get_example instead.");
      const t = topic ?? "overview";
      const f = t === "overview" ? join(dir, "SKILL.md") : join(dir, "references", `${t}.md`);
      if (!existsSync(f)) return fail(`No guide for topic "${t}".`);
      return text(readFileSync(f, "utf8"));
    },
  );

  server.registerTool(
    "get_spec_schema",
    {
      title: "Spec JSON Schema",
      description: "JSON Schema of the diagram spec (all fields, enums, node kinds, tones).",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => json(specJsonSchema()),
  );

  server.registerTool(
    "list_kinds",
    {
      title: "Node kinds",
      description: "All node `kind` values: leaf kinds (service, database, queue, gateway…), flow shapes (start, decision…), `entity` for ER, and container kinds (azure.subscription, azure.vnet, aws.account, aws.vpc, subnet…). Also the semantic `tone` values.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () =>
      json({
        tones: TONES,
        kinds: Object.entries(KINDS).map(([k, v]) => ({ kind: k, container: v.tag ?? null, shape: v.shape ?? "card", tone: v.tone })),
      }),
  );

  server.registerTool(
    "get_example",
    {
      title: "Example specs",
      description: "Without `name`: list the example diagrams. With `name`: return its YAML (architecture on Azure/AWS, flow, ER, icons…). Use them as a starting point.",
      inputSchema: { name: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ name }) => {
      const dir = examplesDir(root);
      if (!dir) return fail("No examples folder found.");
      const files = readdirSync(dir).filter((f) => /\.diagram\.ya?ml$/.test(f));
      if (!name) return json(files.map((f) => f.replace(/\.diagram\.ya?ml$/, "")));
      const f = files.find((x) => x.replace(/\.diagram\.ya?ml$/, "") === name);
      return f ? text(readFileSync(join(dir, f), "utf8")) : fail(`Unknown example "${name}". Available: ${files.map((x) => x.replace(/\.diagram\.ya?ml$/, "")).join(", ")}`);
    },
  );

  /* -------------------------------- icons -------------------------------- */

  server.registerTool(
    "list_icon_packs",
    {
      title: "Icon packs",
      description: "Which icon packs are available: az (Azure, official), aws (AWS, official), lu (Lucide, bundled) and project packs. Official packs must be imported once (drop the zips in icons-inbox/<pack>/ and run update_icons).",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      refresh();
      const have = new Set(syncedPacks());
      const row = (prefix: string, pack: string, note = "") => ({ prefix, pack, icons: listIcons(prefix).length, note });
      return json({
        packs: [
          { ...row("az", "azure"), installed: have.has("azure"), howTo: have.has("azure") ? undefined : `download ${OFFICIAL_URL.azure}, drop the zip in icons-inbox/azure/, call update_icons` },
          { ...row("aws", "aws"), installed: have.has("aws"), howTo: have.has("aws") ? undefined : `download ${OFFICIAL_URL.aws}, drop the zip in icons-inbox/aws/, call update_icons` },
          { ...row("lu", "lucide"), installed: true, note: "bundled" },
          ...[...have].filter((p) => !["azure", "aws"].includes(p)).map((p) => ({ ...row(p, p), installed: true })),
        ],
        usage: "node.icon: az-webapp | aws-lambda | lu-database | <prefix>-<name>",
      });
    },
  );

  server.registerTool(
    "search_icons",
    {
      title: "Search icons",
      description: "Find icon names to put in `icon:`. Searches by substring in the pack names (e.g. 'sql', 'lambda', 'subnet'). Returns refs like `az-sql-database`, `aws-lambda`, `lu-database`. Short aliases such as az-webapp, az-vm, aws-s3, aws-vpc also work.",
      inputSchema: {
        query: z.string().min(1).describe("Text to look for."),
        pack: z.string().optional().describe("Limit to a prefix: az, aws, lu or a custom/synced prefix."),
        limit: z.number().int().min(1).max(100).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ query, pack, limit }) => {
      refresh();
      const q = query.toLowerCase().replace(/\s+/g, "-");
      const hits = listIcons(pack).filter((i) => i.ref.includes(q));
      const exact = resolveIcon(pack ? `${pack}-${q}` : `lu-${q}`);
      return json({ total: hits.length, results: hits.slice(0, limit ?? 30).map((h) => h.ref), exactMatch: exact.ok ? exact.ref : undefined, hint: hits.length ? undefined : "No match. Try a shorter word; official packs need to be imported first (list_icon_packs)." });
    },
  );

  server.registerTool(
    "update_icons",
    {
      title: "Import icon zips",
      description: "Import the official icon zips the user dropped in icons-inbox/<pack>/ (azure, aws, gcp…) into the local icon store. By default the zips are KEPT; pass keep=false to delete each zip after a successful import. Never downloads anything.",
      inputSchema: { keep: z.boolean().optional().describe("Keep the zip files (default true).") },
      annotations: { destructiveHint: false },
    },
    async ({ keep }) => {
      const cfg = refresh();
      const inbox = resolve(cfg.root, cfg.config.iconsInbox ?? "icons-inbox");
      const r = importInbox(inbox, resolve(cfg.root, ".dgm/icons"), { keep: keep ?? true });
      return json(r.length ? r : { message: `No zips found in ${inbox}. Put each zip in icons-inbox/<pack>/ (azure, aws, gcp…).` });
    },
  );

  /* -------------------------------- themes -------------------------------- */

  server.registerTool(
    "list_themes",
    {
      title: "Themes",
      description: "Available colour themes (distill, olive, azure, aws, orange, slate, mono + project themes). A theme is separate from `mode` (auto|light|dark).",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      refresh();
      return json(listThemes().map((t) => ({ name: t.name, description: t.description ?? "", extends: t.extends ?? (t.name === "distill" ? null : "distill") })));
    },
  );

  server.registerTool(
    "get_theme",
    {
      title: "Theme details",
      description: "Resolved tokens (light + dark) of a theme and its WCAG contrast issues.",
      inputSchema: { name: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ name }) => {
      refresh();
      try {
        const t = resolveTheme(name);
        return json({ name: t.name, light: t.light, dark: t.dark, fonts: t.fonts, contrastIssues: checkTheme(t) });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );

  const hex = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "must be a #hex colour");

  server.registerTool(
    "create_theme",
    {
      title: "Create a theme",
      description:
        "Create a colour theme from 1–3 seed colours (accent, optional flow = animated packets, optional neutral = panel tint). Generates the full light+dark palette, checks WCAG contrast and returns the theme YAML. With save=true writes themes/<name>.theme.yaml in the project. Use preview_theme to look at it.",
      inputSchema: {
        name: z.string().regex(/^[a-z0-9][a-z0-9-_]*$/i),
        accent: hex,
        flow: hex.optional(),
        neutral: hex.optional(),
        extends: z.string().optional().describe("Base theme to inherit from (default distill)."),
        description: z.string().optional(),
        overrides: z.record(z.unknown()).optional().describe("Optional explicit token overrides, e.g. { light: { 'panel-a': '#eceed9' }, dark: { accent: '#a9bb62' } }."),
        save: z.boolean().optional(),
      },
    },
    async (a) => {
      refresh();
      try {
        const def = parseThemeDef(
          JSON.parse(JSON.stringify({ name: a.name, description: a.description, extends: a.extends ?? "distill", seed: { accent: a.accent, flow: a.flow, neutral: a.neutral }, ...(a.overrides ?? {}) })),
          a.name,
        );
        const resolved = resolveTheme(def);
        const issues = checkTheme(resolved);
        const yaml = YAML.stringify(def);
        let saved: string | undefined;
        let registered: boolean | undefined;
        if (a.save) {
          const file = inRoot(join("themes", `${a.name}.theme.yaml`));
          mkdirSync(dirname(file), { recursive: true });
          writeFileSync(file, yaml);
          saved = relative(root, file);
          const cfg = refresh();
          registered = (cfg.config.themes ?? []).some((p) => /themes\//.test(p));
        }
        return json({
          theme: def,
          yaml,
          contrastIssues: issues,
          saved,
          registered,
          next: [
            issues.length ? "Fix the contrast issues (adjust accent/neutral or pass overrides)." : "Contrast OK.",
            "preview_theme to see it.",
            saved && !registered ? 'Add { "themes": ["themes/*.theme.yaml"] } to dgm.config.json so diagrams can use it by name.' : undefined,
          ].filter(Boolean),
        });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );

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

  server.registerTool(
    "preview_theme",
    {
      title: "Preview a theme",
      description: "Render a sample diagram with a theme (name, or the YAML of a theme definition) as PNG so you can see it. mode: light, dark or both (default both).",
      inputSchema: {
        theme: z.string().describe("Theme name, or YAML/JSON text of a theme definition."),
        mode: z.enum(["light", "dark", "both"]).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ theme, mode }) => {
      refresh();
      try {
        let t: ThemeDef | string = theme;
        if (/[\n{:]/.test(theme)) t = parseThemeDef(parseSpecText(theme) as unknown, "theme");
        const resolved = resolveTheme(t);
        const modes = mode === "light" || mode === "dark" ? [mode] : (["light", "dark"] as const);
        const content: Content[] = [{ type: "text", text: `Theme "${resolved.name}" — contrast issues: ${JSON.stringify(checkTheme(resolved))}` }];
        for (const m of modes) {
          const png = await renderPng(SAMPLE, { theme: resolved, mode: m as Mode, scale: 1.5 });
          content.push({ type: "text", text: `${m}:` }, { type: "image", data: png.toString("base64"), mimeType: "image/png" });
        }
        return { content };
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );

  /* ------------------------------ diagrams ------------------------------ */

  server.registerTool(
    "validate_diagram",
    {
      title: "Validate a diagram",
      description:
        "Check a diagram spec without rendering. Returns { ok, errors, warnings }. Errors name the field and often a fix (unknown node ids, container↔descendant edges, unknown icons with 'did you mean', unknown themes). Always validate before writing/rendering.",
      inputSchema: { ...specInput, allow_missing_icons: z.boolean().optional().describe("Downgrade unresolvable icons to warnings (a built-in glyph is drawn instead).") },
      annotations: { readOnlyHint: true },
    },
    async (a) => {
      try {
        const { res } = loadSpec(a);
        return json({ ok: res.ok, errors: res.errors, warnings: res.warnings });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );

  server.registerTool(
    "render_diagram",
    {
      title: "Render a diagram",
      description:
        "Render a diagram to PNG (returned as an image so you can LOOK at it and iterate) or SVG (interactive; text, or saved with save_to). Options: theme (name), mode (auto|light|dark), aspect (e.g. 16/9), variant=narrow, scale (PNG). Use save_to to write the file inside the project (e.g. public/diagrams/arch.png). If it fails, the errors say what to fix.",
      inputSchema: {
        ...specInput,
        format: z.enum(["png", "svg"]).optional().describe("Default png."),
        theme: z.string().optional(),
        mode: z.enum(["auto", "light", "dark"]).optional(),
        font: z.enum(["mixed", "sans", "serif"]).optional().describe("Typeface: mixed (default: sans labels + serif title/notes), sans or serif everywhere."),
        aspect: z.union([z.string(), z.number()]).optional().describe("Letterbox to a ratio such as 16/9 or 1.5."),
        padding: z.number().optional(),
        variant: z.enum(["narrow"]).optional().describe("Render the spec's author-defined variants.narrow layout."),
        scale: z.number().min(0.5).max(4).optional().describe("PNG zoom (default 2)."),
        static: z.boolean().optional().describe("SVG without script/animation."),
        allow_missing_icons: z.boolean().optional(),
        save_to: z.string().optional().describe("Output path inside the project (.png / .svg)."),
      },
    },
    async (a) => {
      try {
        const { res, source } = loadSpec(a);
        if (!res.ok) return fail(`${source} is not valid:\n- ${res.errors.join("\n- ")}`);
        let spec = res.spec!;
        if (a.variant) {
          const v = applyVariant(spec, a.variant);
          if (!v) return fail("This spec has no `variants.narrow`. Add `variants: { narrow: {} }` to define one.");
          spec = v;
        }
        const ro = { theme: a.theme, mode: a.mode as Mode | undefined, font: a.font, aspect: parseAspect(a.aspect), padding: a.padding };
        const format = a.format ?? (a.save_to && extname(a.save_to).toLowerCase() === ".svg" ? "svg" : "png");
        const warn = res.warnings.length ? `\nWarnings:\n- ${res.warnings.join("\n- ")}` : "";
        if (format === "png") {
          const png = await renderPng(spec, { ...ro, scale: a.scale });
          let saved = "";
          if (a.save_to) {
            const f = inRoot(a.save_to);
            mkdirSync(dirname(f), { recursive: true });
            writeFileSync(f, png);
            saved = ` Saved to ${relative(root, f)}.`;
          }
          return { content: [{ type: "text", text: `Rendered PNG (${Math.round(png.length / 1024)} KB).${saved}${warn}` }, { type: "image", data: png.toString("base64"), mimeType: "image/png" }] as Content[] };
        }
        const svg = await renderSvg(spec, { ...ro, static: a.static });
        if (a.save_to) {
          const f = inRoot(a.save_to);
          mkdirSync(dirname(f), { recursive: true });
          writeFileSync(f, svg);
          return text(`Rendered SVG (${Math.round(svg.length / 1024)} KB) → ${relative(root, f)}${a.static ? "" : " (interactive: embed inline, <object> or via <Diagram>; <img> loses the script)"}.${warn}`);
        }
        return text(svg.length > 200_000 ? `SVG is ${Math.round(svg.length / 1024)} KB — pass save_to to write it to a file instead.` : svg + warn);
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );

  server.registerTool(
    "write_diagram",
    {
      title: "Save a diagram spec",
      description: "Validate and save a diagram spec as a .diagram.yaml (or .json) file inside the project, e.g. src/diagrams/architecture.diagram.yaml. Refuses invalid specs and paths outside the project; overwrites only with overwrite=true.",
      inputSchema: {
        path: z.string().describe("Destination inside the project; must end in .diagram.yaml, .diagram.yml or .diagram.json"),
        spec: z.string().describe("The diagram as YAML or JSON text."),
        overwrite: z.boolean().optional(),
        allow_missing_icons: z.boolean().optional(),
      },
      annotations: { destructiveHint: false },
    },
    async (a) => {
      try {
        if (!/\.diagram\.(ya?ml|json)$/i.test(a.path)) return fail("path must end in .diagram.yaml, .diagram.yml or .diagram.json");
        const f = inRoot(a.path);
        if (existsSync(f) && !a.overwrite) return fail(`${a.path} already exists. Pass overwrite=true to replace it (read it first with get_example/path if unsure).`);
        const { res } = loadSpec({ spec: a.spec, allow_missing_icons: a.allow_missing_icons });
        if (!res.ok) return fail(`Not saved — the spec is invalid:\n- ${res.errors.join("\n- ")}`);
        mkdirSync(dirname(f), { recursive: true });
        writeFileSync(f, a.spec.endsWith("\n") ? a.spec : a.spec + "\n");
        return json({ saved: relative(root, f), warnings: res.warnings });
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );

  return server;
}
