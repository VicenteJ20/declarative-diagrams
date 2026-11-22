import { describe, it, expect } from "vitest";
import {
  resolveTheme,
  applyPalette,
  checkTheme,
  fromSeed,
  listThemes,
  themeToCssVars,
  registerTheme,
  isMode,
  contrast,
  TOKEN_KEYS,
} from "./themes/index.js";
import { parseThemeDef } from "./themes/schema.js";
import { validateSpec, renderSvg } from "./index.js";

describe("themes", () => {
  it("ships the named presets and each defines every token in both modes", () => {
    const names = listThemes().map((t) => t.name);
    for (const n of ["distill", "olive", "azure", "aws", "orange", "slate", "mono"]) expect(names).toContain(n);
    for (const n of names) {
      const t = resolveTheme(n);
      for (const k of TOKEN_KEYS) {
        expect(t.light[k], `${n}.light.${k}`).toBeTruthy();
        expect(t.dark[k], `${n}.dark.${k}`).toBeTruthy();
      }
    }
  });

  it("presets pass the contrast checks", () => {
    for (const t of listThemes()) expect(checkTheme(resolveTheme(t.name)), t.name).toEqual([]);
  });

  it("seed generates a full palette with readable text", () => {
    const { light, dark } = fromSeed({ accent: "#6b7a2f" });
    expect(contrast(light.text, light["panel-b"])!).toBeGreaterThan(7);
    expect(contrast(dark.text, dark["panel-b"])!).toBeGreaterThan(7);
    expect(light.accent).toBe("#6b7a2f");
  });

  it("extends: inherits what is not redefined", () => {
    registerTheme({ name: "t-ext", extends: "olive", light: { accent: "#123456" } });
    const t = resolveTheme("t-ext");
    expect(t.light.accent).toBe("#123456");
    expect(t.light["panel-a"]).toBe(resolveTheme("olive").light["panel-a"]);
  });

  it("palette overrides apply to both modes, light/dark overrides to one", () => {
    const t = applyPalette(resolveTheme("distill"), { accent: "#ff0000", dark: { accent: "#00ff00" } });
    expect(t.light.accent).toBe("#ff0000");
    expect(t.dark.accent).toBe("#00ff00");
  });

  it("rejects unknown themes and bad theme files", () => {
    expect(() => resolveTheme("nope")).toThrow(/Unknown theme/);
    expect(() => parseThemeDef({ name: "x", seed: { accent: "red" } })).toThrow(/hex/);
    expect(() => parseThemeDef({ name: "x", light: { bogus: "#fff" } })).toThrow();
  });

  it("exposes --dgm-* css variables for both modes", () => {
    const v = themeToCssVars(resolveTheme("aws"));
    expect(v["--dgm-accent"]).toBeTruthy();
    expect(v["--dgm-dark-accent"]).toBeTruthy();
  });

  it("mode keywords", () => {
    expect(isMode("dark") && isMode("auto") && !isMode("olive")).toBe(true);
  });
});

const spec = validateSpec({ nodes: [{ id: "a", label: "A", tone: "warn" }, { id: "b", label: "B" }], edges: [{ from: "a", to: "b" }] }).spec!;

describe("render with themes", () => {
  it("interactive svg bakes theme fallbacks, supports host overrides and data-mode", async () => {
    const s = await renderSvg(spec, { theme: "olive", mode: "dark" });
    expect(s).toContain("var(--dgm-accent,");
    expect(s).toContain('data-mode="dark"');
    expect(s).not.toContain("data-mode=\"auto\"");
  });

  it("a dark static svg carries its own dark background, so light text never lands on white", async () => {
    const dark = await renderSvg(spec, { theme: "olive", static: true, mode: "dark" });
    expect(dark).toContain(`<rect class="bg"`);
    expect(dark).toContain(`fill="${resolveTheme("olive").dark["panel-b"]}"`);
    expect(await renderSvg(spec, { theme: "olive", static: true, mode: "light" })).not.toContain(`<rect class="bg"`);
    expect(await renderSvg(spec, { theme: "olive", mode: "dark" })).not.toContain(`<rect class="bg"`);
  });

  it("static svg has literal colours only", async () => {
    const s = await renderSvg(spec, { theme: "olive", static: true });
    expect(s).not.toContain("var(--");
    expect(s).not.toContain("@media");
  });

  it("legacy theme:'dark' is read as the mode", async () => {
    const s = await renderSvg(spec, { theme: "dark" });
    expect(s).toContain('data-mode="dark"');
  });

  it("spec.theme is used unless overridden", async () => {
    const withTheme = { ...spec, theme: "aws" };
    const a = await renderSvg(withTheme, { static: true });
    const b = await renderSvg(withTheme, { static: true, theme: "olive" });
    expect(a).not.toEqual(b);
    expect(a).toContain(resolveTheme("aws").light.accent);
  });

  it("validateSpec reports unknown themes and tones", () => {
    expect(validateSpec({ theme: "nope", nodes: [{ id: "a", label: "A" }] }).errors.join()).toMatch(/Unknown theme/);
    expect(validateSpec({ nodes: [{ id: "a", label: "A", tone: "purple" }] }).ok).toBe(false);
  });
});
