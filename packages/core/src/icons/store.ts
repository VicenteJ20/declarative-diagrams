import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve, basename, extname } from "node:path";
import { IconData, slugify, parseSvg } from "./sanitize.js";
import { lucideIcon, lucideNames } from "./lucide.js";
import azureAliases from "./aliases.azure.json" with { type: "json" };
import awsAliases from "./aliases.aws.json" with { type: "json" };

export interface CustomPack {
  prefix: string;
  dir: string;
  /** Recolour with the theme's icon ink (strips fills/strokes). Default false: icons keep their colours. */
  monochrome?: boolean;
}

export interface PackIndex {
  pack: "azure" | "aws";
  source?: string;
  syncedAt?: string;
  /** primary slug -> file name */
  icons: Record<string, string>;
  /** alternative slug -> primary slug */
  alt?: Record<string, string>;
}

export type OfficialPack = "azure" | "aws";

const PREFIX: Record<string, string> = { az: "azure", aws: "aws", lu: "lucide" };
export const OFFICIAL_URL: Record<OfficialPack, string> = {
  azure: "https://learn.microsoft.com/azure/architecture/icons/",
  aws: "https://aws.amazon.com/architecture/icons/",
};
const ALIASES: Record<OfficialPack, Record<string, string[]>> = { azure: azureAliases, aws: awsAliases };

const state = { root: process.cwd(), iconsDir: undefined as string | undefined, custom: [] as CustomPack[] };
const cache = new Map<string, unknown>();

/** Called by `loadConfig`; safe to call repeatedly. */
export function configureIcons(o: { root?: string; iconsDir?: string; custom?: CustomPack[] }) {
  if (o.root) state.root = resolve(o.root);
  state.iconsDir = o.iconsDir ? resolve(state.root, o.iconsDir) : undefined;
  state.custom = (o.custom ?? []).map((c) => ({ ...c, dir: resolve(state.root, c.dir) }));
  cache.clear();
}

/** Directories searched for synced packs: explicit → DGM_ICONS_DIR → `.dgm/icons` walking up from the project root. */
export function iconsDirs(): string[] {
  const out: string[] = [];
  if (state.iconsDir) out.push(state.iconsDir);
  if (process.env.DGM_ICONS_DIR) out.push(resolve(process.env.DGM_ICONS_DIR));
  let d = state.root;
  for (;;) {
    out.push(join(d, ".dgm", "icons"));
    const up = dirname(d);
    if (up === d) break;
    d = up;
  }
  return out;
}

export function loadIndex(pack: OfficialPack): { index: PackIndex; dir: string } | null {
  const k = `index:${pack}:${state.root}:${state.iconsDir}`;
  if (cache.has(k)) return cache.get(k) as any;
  let found: { index: PackIndex; dir: string } | null = null;
  for (const base of iconsDirs()) {
    const f = join(base, pack, "index.json");
    if (existsSync(f)) {
      found = { index: JSON.parse(readFileSync(f, "utf8")), dir: join(base, pack) };
      break;
    }
  }
  cache.set(k, found);
  return found;
}

function customIndex(p: CustomPack): Record<string, string> {
  const k = `custom:${p.dir}`;
  if (cache.has(k)) return cache.get(k) as Record<string, string>;
  const map: Record<string, string> = {};
  if (existsSync(p.dir) && statSync(p.dir).isDirectory()) {
    for (const f of readdirSync(p.dir, { recursive: true }) as string[]) {
      if (extname(f).toLowerCase() === ".svg") map[slugify(basename(f, ".svg"))] = join(p.dir, f);
    }
  }
  cache.set(k, map);
  return map;
}

export type IconResult =
  | { ok: true; ref: string; pack: string; slug: string; data: IconData }
  | { ok: false; ref: string; error: string; suggestions: string[] };

export function parseIconRef(ref: string): { prefix: string; name: string } | null {
  const i = ref.indexOf("-");
  if (i <= 0) return null;
  return { prefix: ref.slice(0, i).toLowerCase(), name: ref.slice(i + 1).toLowerCase() };
}

/** Pack a ref's prefix belongs to (cheap; no fs): "azure" | "aws" | "lucide" | custom prefix | null. */
export function packOfPrefix(prefix: string): string | null {
  if (PREFIX[prefix]) return PREFIX[prefix];
  return state.custom.some((c) => c.prefix === prefix) ? prefix : null;
}

function lev(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

function suggest(name: string, names: string[], prefix: string): string[] {
  return names
    .map((n) => ({ n, d: n.includes(name) || name.includes(n) ? 0 : lev(name, n) }))
    .filter((x) => x.d <= Math.max(2, Math.floor(name.length / 4)))
    .sort((a, b) => a.d - b.d || a.n.length - b.n.length)
    .slice(0, 4)
    .map((x) => `${prefix}-${x.n}`);
}

function allNames(pack: OfficialPack): string[] {
  const l = loadIndex(pack);
  if (!l) return [];
  return [...Object.keys(l.index.icons), ...Object.keys(ALIASES[pack])];
}

export function resolveIcon(ref: string): IconResult {
  const p = parseIconRef(ref);
  if (!p) return { ok: false, ref, error: `icon "${ref}" must look like <pack>-<name>, e.g. az-webapp, aws-lambda, lu-database`, suggestions: [] };
  const pack = packOfPrefix(p.prefix);
  if (!pack) {
    const known = ["az", "aws", "lu", ...state.custom.map((c) => c.prefix)].join(", ");
    return { ok: false, ref, error: `unknown icon prefix "${p.prefix}-" (known: ${known})`, suggestions: [] };
  }

  if (pack === "lucide") {
    const data = lucideIcon(p.name);
    return data
      ? { ok: true, ref, pack, slug: p.name, data }
      : { ok: false, ref, error: `unknown Lucide icon "${p.name}"`, suggestions: suggest(p.name, lucideNames(), "lu") };
  }

  if (pack === "azure" || pack === "aws") {
    const l = loadIndex(pack);
    const short = pack === "azure" ? "az" : "aws";
    if (!l)
      return {
        ok: false,
        ref,
        error: `${pack === "azure" ? "Azure" : "AWS"} icons are not installed. Download the official package from ${OFFICIAL_URL[pack]} and run: dgm icons sync ${pack} --from <zip|folder>`,
        suggestions: [],
      };
    const cands = [p.name, ...(ALIASES[pack][p.name] ?? [])];
    for (const c of cands) {
      const slug = l.index.icons[c] ? c : l.index.alt?.[c];
      if (slug && l.index.icons[slug]) {
        const key = `svg:${l.dir}:${slug}`;
        let data = cache.get(key) as IconData | undefined;
        if (!data) {
          data = parseSvg(readFileSync(join(l.dir, l.index.icons[slug]), "utf8"));
          cache.set(key, data);
        }
        return { ok: true, ref, pack, slug, data };
      }
    }
    return { ok: false, ref, error: `unknown ${pack === "azure" ? "Azure" : "AWS"} icon "${p.name}"`, suggestions: suggest(p.name, allNames(pack), short) };
  }

  const cp = state.custom.find((c) => c.prefix === pack)!;
  const idx = customIndex(cp);
  const f = idx[p.name];
  if (!f) return { ok: false, ref, error: `unknown icon "${p.name}" in pack "${cp.prefix}" (${cp.dir})`, suggestions: suggest(p.name, Object.keys(idx), cp.prefix) };
  const key = `svg:${f}`;
  let data = cache.get(key) as IconData | undefined;
  if (!data) {
    data = parseSvg(readFileSync(f, "utf8"), { mono: cp.monochrome });
    cache.set(key, data);
  }
  return { ok: true, ref, pack, slug: p.name, data };
}

export interface IconListing {
  ref: string;
  pack: string;
}

/** Names available in a pack (`az`, `aws`, `lu` or a custom prefix); all packs when omitted. */
export function listIcons(prefix?: string): IconListing[] {
  const out: IconListing[] = [];
  const add = (pk: string, pre: string, names: string[]) => names.forEach((n) => out.push({ ref: `${pre}-${n}`, pack: pk }));
  const want = (pre: string) => !prefix || prefix === pre;
  if (want("az")) add("azure", "az", Object.keys(loadIndex("azure")?.index.icons ?? {}).sort());
  if (want("aws")) add("aws", "aws", Object.keys(loadIndex("aws")?.index.icons ?? {}).sort());
  if (want("lu")) add("lucide", "lu", lucideNames());
  for (const c of state.custom) if (want(c.prefix)) add(c.prefix, c.prefix, Object.keys(customIndex(c)).sort());
  return out;
}

/** Short names (aliases) that resolve for an official pack, e.g. `az-webapp`. */
export function listAliases(pack: OfficialPack): string[] {
  return Object.keys(ALIASES[pack]).sort();
}
