import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, statSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { parseSpecText, validateSpec, loadConfig, parseThemeDef, resolveTheme, checkTheme } from "@dgm/core";
import { createServer } from "./server.js";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

let root: string;
let client: Client;

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const r: any = await client.callTool({ name, arguments: args });
  const texts = (r.content as any[]).filter((c) => c.type === "text").map((c) => c.text as string);
  const images = (r.content as any[]).filter((c) => c.type === "image");
  return { isError: !!r.isError, text: texts.join("\n"), images };
};

const GOOD = `
type: architecture
title: T
nodes:
  - { id: a, label: A, icon: lu-database }
  - id: g
    label: G
    kind: cloud
    children:
      - { id: b, label: B }
edges:
  - { from: a, to: b, flow: true }
`;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "dgm-mcp-"));
  const server = createServer({ root });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(st), client.connect(ct)]);
});

afterAll(async () => {
  await client.close();
  rmSync(root, { recursive: true, force: true });
});

describe("MCP tools", () => {
  it("exposes the expected tools", async () => {
    const names = (await client.listTools()).tools.map((t) => t.name);
    for (const n of [
      "get_authoring_guide", "get_spec_schema", "list_kinds", "get_example", "list_icon_packs", "search_icons", "update_icons",
      "list_themes", "get_theme", "create_theme", "preview_theme", "validate_diagram", "render_diagram", "write_diagram",
    ]) expect(names, n).toContain(n);
  });

  it("serves the authoring guide from the Skill files", async () => {
    const o = await call("get_authoring_guide");
    expect(o.isError).toBe(false);
    expect(o.text).toContain("Diagram author");
    expect((await call("get_authoring_guide", { topic: "azure" })).text).toContain("Hub-and-spoke");
    expect((await call("get_authoring_guide", { topic: "aws" })).text).toContain("serverless API");
  });

  it("lists kinds, schema and examples", async () => {
    expect(JSON.parse((await call("list_kinds")).text).kinds.some((k: any) => k.kind === "azure.subscription")).toBe(true);
    expect(JSON.parse((await call("get_spec_schema")).text).properties.nodes).toBeTruthy();
    expect(JSON.parse((await call("get_example")).text)).toContain("azure-landing-zone");
    expect((await call("get_example", { name: "login-flow" })).text).toContain("type: flow");
  });

  it("validates: ok, and actionable errors", async () => {
    expect(JSON.parse((await call("validate_diagram", { spec: GOOD })).text).ok).toBe(true);
    const bad = JSON.parse((await call("validate_diagram", { spec: GOOD.replace("to: b", "to: zzz") })).text);
    expect(bad.ok).toBe(false);
    expect(bad.errors.join()).toContain("zzz");
    const icon = JSON.parse((await call("validate_diagram", { spec: GOOD.replace("lu-database", "lu-databse") })).text);
    expect(icon.errors.join()).toMatch(/did you mean lu-database/);
  });

  it("renders a PNG the agent can see, and an SVG", async () => {
    const png = await call("render_diagram", { spec: GOOD, theme: "olive", mode: "dark" });
    expect(png.isError).toBe(false);
    expect(png.images).toHaveLength(1);
    expect(Buffer.from(png.images[0].data, "base64").subarray(1, 4).toString()).toBe("PNG");
    const svg = await call("render_diagram", { spec: GOOD, format: "svg", static: true });
    expect(svg.text).toContain("<svg");
    expect(svg.text).not.toContain("<script");
  });

  it("render failures explain what to fix", async () => {
    const r = await call("render_diagram", { spec: GOOD.replace("to: b", "to: nope") });
    expect(r.isError).toBe(true);
    expect(r.text).toContain("nope");
    expect((await call("render_diagram", { spec: GOOD, variant: "narrow" })).isError).toBe(true);
  });

  it("save_to / write_diagram stay inside the project", async () => {
    const ok = await call("render_diagram", { spec: GOOD, save_to: "out/a.png" });
    expect(ok.isError).toBe(false);
    expect(existsSync(join(root, "out", "a.png"))).toBe(true);
    expect((await call("render_diagram", { spec: GOOD, save_to: "../escape.png" })).isError).toBe(true);
    expect((await call("write_diagram", { path: "../x.diagram.yaml", spec: GOOD })).isError).toBe(true);
    expect((await call("write_diagram", { path: "x.yaml", spec: GOOD })).text).toContain(".diagram.");

    const w = await call("write_diagram", { path: "src/diagrams/a.diagram.yaml", spec: GOOD });
    expect(w.isError).toBe(false);
    expect(existsSync(join(root, "src/diagrams/a.diagram.yaml"))).toBe(true);
    expect((await call("write_diagram", { path: "src/diagrams/a.diagram.yaml", spec: GOOD })).text).toMatch(/overwrite/);
    expect((await call("write_diagram", { path: "src/diagrams/a.diagram.yaml", spec: GOOD, overwrite: true })).isError).toBe(false);
    expect((await call("write_diagram", { path: "src/diagrams/bad.diagram.yaml", spec: "nodes: []" })).isError).toBe(true);
    expect(existsSync(join(root, "src/diagrams/bad.diagram.yaml"))).toBe(false);
    // reads back by path
    expect(JSON.parse((await call("validate_diagram", { path: "src/diagrams/a.diagram.yaml" })).text).ok).toBe(true);
  });

  it("render save_to: right extension, no silent overwrite, no escape via absolute path, symlink or lookalike name", async () => {
    expect((await call("render_diagram", { spec: GOOD, save_to: "package.json" })).text).toMatch(/must end in \.png/);
    expect((await call("render_diagram", { spec: GOOD, format: "svg", save_to: "x.png" })).isError).toBe(true);
    expect((await call("render_diagram", { spec: GOOD, save_to: "out/a.png" })).text).toMatch(/already exists/); // out/a.png from the test above
    expect((await call("render_diagram", { spec: GOOD, save_to: "out/a.png", overwrite: true })).isError).toBe(false);
    expect((await call("render_diagram", { spec: GOOD, save_to: join(tmpdir(), "dgm-abs-escape.png") })).isError).toBe(true);
    expect((await call("render_diagram", { spec: GOOD, save_to: "..\\win-escape.png" })).isError).toBe(true);
    // a file whose *name* starts with ".." is inside the root and must be accepted
    expect((await call("render_diagram", { spec: GOOD, save_to: "..lookalike.png" })).isError).toBe(false);
    // symlink / junction pointing outside the root
    const outside = mkdtempSync(join(tmpdir(), "dgm-outside-"));
    try {
      symlinkSync(outside, join(root, "link"), "junction");
      const r = await call("render_diagram", { spec: GOOD, save_to: "link/leak.png" });
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/outside the project root/);
      expect(existsSync(join(outside, "leak.png"))).toBe(false);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("create_theme refuses to replace a saved theme unless overwrite=true", async () => {
    const args = { name: "once-only", accent: "#4f7a5a", save: true };
    expect((await call("create_theme", args)).isError).toBe(false);
    expect((await call("create_theme", args)).isError).toBe(true);
    expect((await call("create_theme", { ...args, overwrite: true })).isError).toBe(false);
  });

  it("themes: list, create (with contrast check), save, preview", async () => {
    expect(JSON.parse((await call("list_themes")).text).map((t: any) => t.name)).toContain("olive");
    expect(JSON.parse((await call("get_theme", { name: "aws" })).text).contrastIssues).toEqual([]);
    const c = await call("create_theme", { name: "sage-test", accent: "#4f7a5a", flow: "#d08a2e", neutral: "#eef3ec", save: true });
    const o = JSON.parse(c.text);
    expect(o.contrastIssues).toEqual([]);
    expect(o.saved).toBe("themes\\sage-test.theme.yaml".replace("\\", process.platform === "win32" ? "\\" : "/"));
    expect(existsSync(join(root, "themes", "sage-test.theme.yaml"))).toBe(true);
    expect((await call("create_theme", { name: "x", accent: "red" })).isError).toBe(true);
    const p = await call("preview_theme", { theme: o.yaml });
    expect(p.images).toHaveLength(2);
    expect((await call("preview_theme", { theme: "nope" })).isError).toBe(true);
  });

  it("icons: packs and search", async () => {
    const packs = JSON.parse((await call("list_icon_packs")).text).packs;
    expect(packs.find((p: any) => p.prefix === "lu").installed).toBe(true);
    const s = JSON.parse((await call("search_icons", { query: "database", pack: "lu", limit: 3 })).text);
    expect(s.results).toContain("lu-database");
    expect(s.results.length).toBeLessThanOrEqual(3);
  });

  it("update_icons without a zip explains where to put them", async () => {
    mkdirSync(join(root, "icons-inbox"), { recursive: true });
    expect((await call("update_icons")).text).toContain("icons-inbox/<pack>");
  });
});

describe("Skill documentation stays valid", () => {
  const walk = (d: string): string[] =>
    readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f.endsWith(".md") ? [join(d, f)] : []));
  const files = walk(join(repo, "skills", "diagram-author"));

  it("has the Skill front matter", () => {
    const s = readFileSync(join(repo, "skills/diagram-author/SKILL.md"), "utf8");
    expect(s).toMatch(/^---\nname: diagram-author\ndescription: .{80,}\n---/);
  });

  it("every ```yaml block is a valid diagram or theme", () => {
    loadConfig(repo); // real icon packs are validated when imported locally; otherwise they are warnings
    let diagrams = 0;
    let themes = 0;
    for (const f of files) {
      const md = readFileSync(f, "utf8");
      for (const m of md.matchAll(/```yaml\n([\s\S]*?)```/g)) {
        const block = m[1];
        if (/^nodes:/m.test(block)) {
          const r = validateSpec(parseSpecText(block), { missingIcons: "warn" });
          expect(r.errors, `${f}\n${block.slice(0, 80)}`).toEqual([]);
          diagrams++;
        } else if (/^name:/m.test(block) && /^(seed|extends|light|dark):/m.test(block)) {
          const t = parseThemeDef(parseSpecText(block) as unknown, f);
          expect(checkTheme(resolveTheme(t)), f).toEqual([]);
          themes++;
        }
      }
    }
    expect(diagrams).toBeGreaterThanOrEqual(7);
    expect(themes).toBeGreaterThanOrEqual(1);
  });
});

describe("OpenCode agent stays consistent with the tools", () => {
  const file = join(repo, ".opencode", "agents", "diagram-specialist.md");
  const md = readFileSync(file, "utf8");

  it("has valid front matter (description, primary mode, dgm permissions)", () => {
    const m = /^---\n([\s\S]*?)\n---\n/.exec(md)!;
    const fm = parseSpecText(m[1]) as any;
    expect(fm.description.length).toBeGreaterThan(80);
    expect(fm.mode).toBe("primary");
    expect(fm.permission["dgm_*"]).toBe("allow");
    expect(fm.permission["dgm_update_icons"]).toBe("ask");
  });

  it("only mentions dgm_<tool> names that exist, and covers every tool", async () => {
    const real = new Set((await client.listTools()).tools.map((t) => t.name));
    const mentioned = new Set([...md.matchAll(/\bdgm_([a-z]+(?:_[a-z]+)*)/g)].map((x) => x[1]));
    for (const n of mentioned) expect(real.has(n), `dgm_${n} is not a tool`).toBe(true);
    for (const n of real) expect(mentioned.has(n), `tool ${n} is not mentioned in the agent`).toBe(true);
  });

  it("its YAML example is a valid diagram", () => {
    loadConfig(repo);
    const blocks = [...md.matchAll(/```yaml\n([\s\S]*?)```/g)].map((m) => m[1]).filter((b) => /^nodes:/m.test(b));
    expect(blocks.length).toBeGreaterThanOrEqual(1);
    for (const b of blocks) expect(validateSpec(parseSpecText(b), { missingIcons: "warn" }).errors).toEqual([]);
  });

  it("commands run with the agent", () => {
    for (const c of ["diagram", "diagram-theme"]) {
      expect(readFileSync(join(repo, ".opencode", "commands", `${c}.md`), "utf8")).toMatch(/^---\nagent: diagram-specialist\n/);
    }
  });
});
