import { fromSeed, Seed, TokenMap } from "./seed.js";
import { contrast } from "./color.js";

export type Mode = "auto" | "light" | "dark";
export const MODES: Mode[] = ["auto", "light", "dark"];
export const isMode = (v: unknown): v is Mode => typeof v === "string" && (MODES as string[]).includes(v);

/** Typeface style: `mixed` = Distill (sans labels, serif title/notes) · `sans` = everything sans · `serif` = everything serif. */
export type FontMode = "mixed" | "sans" | "serif";
export const FONT_MODES: FontMode[] = ["mixed", "sans", "serif"];
export const isFontMode = (v: unknown): v is FontMode => typeof v === "string" && (FONT_MODES as string[]).includes(v);
export const FONT_STACKS = {
  serif: `Georgia,'Source Serif 4','Times New Roman',serif`,
  sans: `'Segoe UI',-apple-system,'Helvetica Neue',Helvetica,Arial,sans-serif`,
};

export const TONES = ["compute", "data", "network", "neutral", "accent", "ok", "warn", "danger", "info"] as const;
export type Tone = (typeof TONES)[number];

export const TOKEN_KEYS = [
  "panel-a",
  "panel-b",
  "panel-stroke",
  "node-bg",
  "stroke",
  "text",
  "muted",
  "edge",
  "accent",
  "flow",
  "label-bg",
  "icon-ink",
  ...TONES.map((t) => `tone-${t}`),
];

export type { Seed, TokenMap };

/** Overlay of tokens; `tones: {compute: "#…"}` is sugar for `tone-compute`. */
export type TokenOverlay = { tones?: Partial<Record<Tone, string>> } & Record<string, unknown>;

export interface ThemeDef {
  name: string;
  description?: string;
  /** Inherit every token this theme does not define. Default: `distill`. */
  extends?: string;
  /** Generate a full palette from 1–3 colours; explicit `light`/`dark` still win. */
  seed?: Seed;
  light?: TokenOverlay;
  dark?: TokenOverlay;
  fonts?: { serif?: string; sans?: string };
  /** Default typeface style of the theme (render option / spec `font` win). */
  font?: FontMode;
}

export interface ResolvedTheme {
  resolved: true;
  name: string;
  light: TokenMap;
  dark: TokenMap;
  fonts: { serif?: string; sans?: string };
  font?: FontMode;
}

/** Palette overrides applied on top of a theme: `{ accent, light: {…}, dark: {…}, tones: {…} }`. */
export type Palette = TokenOverlay & { light?: TokenOverlay; dark?: TokenOverlay };

function flatten(o: TokenOverlay | undefined): TokenMap {
  const out: TokenMap = {};
  if (!o) return out;
  for (const [k, v] of Object.entries(o)) {
    if (v == null) continue;
    if (k === "tones" && typeof v === "object") {
      for (const [t, c] of Object.entries(v as Record<string, string>)) out[`tone-${t}`] = String(c);
    } else if (typeof v === "string") out[k.replace(/^icon$/, "icon-ink")] = v;
  }
  return out;
}

/* ---------------- registry ---------------- */

const registry = new Map<string, ThemeDef>();
export const registerTheme = (def: ThemeDef) => void registry.set(def.name, def);
export const listThemes = () => [...registry.values()];
export const hasTheme = (name: string) => registry.has(name);

export function resolveTheme(input: string | ThemeDef | ResolvedTheme = "distill", _depth = 0): ResolvedTheme {
  if (_depth > 8) throw new Error("theme `extends` chain is too deep (cycle?)");
  if (typeof input !== "string" && (input as ResolvedTheme).resolved) return input as ResolvedTheme;
  const def = typeof input === "string" ? registry.get(input) : (input as ThemeDef);
  if (!def) throw new Error(`Unknown theme "${input}". Available: ${[...registry.keys()].join(", ")}`);

  const baseName = def.extends ?? (def.name === "distill" ? undefined : "distill");
  const base: ResolvedTheme | null = baseName ? resolveTheme(baseName, _depth + 1) : null;
  const gen = def.seed ? fromSeed(def.seed) : null;
  const light = { ...(base?.light ?? {}), ...(gen?.light ?? {}), ...flatten(def.light) };
  const dark = { ...(base?.dark ?? {}), ...(gen?.dark ?? {}), ...flatten(def.dark) };
  return { resolved: true, name: def.name, light, dark, fonts: { ...(base?.fonts ?? {}), ...(def.fonts ?? {}) }, font: def.font ?? base?.font };
}

export function applyPalette(theme: ResolvedTheme, palette?: Palette | null): ResolvedTheme {
  if (!palette) return theme;
  const { light, dark, ...both } = palette;
  const b = flatten(both as TokenOverlay);
  return {
    ...theme,
    light: { ...theme.light, ...b, ...flatten(light) },
    dark: { ...theme.dark, ...b, ...flatten(dark) },
  };
}

/** CSS custom properties the SVG reads (`--dgm-*` light, `--dgm-dark-*` dark): set them on any ancestor to re-theme at runtime. */
export function themeToCssVars(theme: ResolvedTheme): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(theme.light)) out[`--dgm-${k}`] = v;
  for (const [k, v] of Object.entries(theme.dark)) out[`--dgm-dark-${k}`] = v;
  if (theme.fonts.serif) out["--dgm-serif"] = theme.fonts.serif;
  if (theme.fonts.sans) out["--dgm-sans"] = theme.fonts.sans;
  return out;
}

/** CSS variables that switch the typeface style at runtime (what `<Diagram font>` sets). */
export function fontToCssVars(font: FontMode, fonts: { serif?: string; sans?: string } = {}): Record<string, string> {
  const serif = fonts.serif ?? FONT_STACKS.serif;
  const sans = fonts.sans ?? FONT_STACKS.sans;
  return { "--dgm-serif": font === "sans" ? sans : serif, "--dgm-sans": font === "serif" ? serif : sans };
}

export interface ContrastIssue {
  mode: "light" | "dark";
  pair: string;
  ratio: number;
  min: number;
}

const PAIRS: [string, string, number][] = [
  ["text", "panel-a", 4.5],
  ["text", "panel-b", 4.5],
  ["text", "node-bg", 4.5],
  ["muted", "panel-b", 3],
  ["muted", "panel-a", 3],
  ["accent", "panel-b", 3],
  ["edge", "panel-a", 3],
  ["icon-ink", "tone-compute", 3],
  ["icon-ink", "tone-data", 3],
  ["icon-ink", "tone-network", 3],
];

/** WCAG contrast check of the token pairs that matter for legibility. */
export function checkTheme(theme: ResolvedTheme): ContrastIssue[] {
  const issues: ContrastIssue[] = [];
  for (const mode of ["light", "dark"] as const) {
    const t = theme[mode];
    for (const [a, b, min] of PAIRS) {
      const r = t[a] && t[b] ? contrast(t[a], t[b]) : null;
      if (r != null && r < min) issues.push({ mode, pair: `${a} on ${b}`, ratio: Math.round(r * 100) / 100, min });
    }
  }
  return issues;
}

import { PRESETS } from "./presets.js";
PRESETS.forEach(registerTheme);

export { fromSeed } from "./seed.js";
export { contrast, hexToLch, lchToHex } from "./color.js";
