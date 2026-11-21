import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { unzipSync } from "fflate";
import { slugify } from "./sanitize.js";
import type { OfficialPack, PackIndex } from "./store.js";

interface Entry {
  path: string; // path inside the package (forward slashes)
  data: string;
}

/** Slug rules for the official file names. Returns null for files that are not service icons. */
export function slugFor(pack: OfficialPack, path: string): { primary: string; full: string } | null {
  const file = basename(path);
  if (!/\.svg$/i.test(file)) return null;
  let name: string;
  if (pack === "azure") {
    // 10035-icon-service-App-Services.svg
    const m = /icon-service-(.+)\.svg$/i.exec(file);
    if (!m) return null;
    name = m[1];
  } else {
    // Arch_AWS-Lambda_64.svg · Arch-Category_Compute_64.svg   (only the 64px architecture icons)
    if (/(^|\/)Res_/i.test(path)) return null;
    const m = /^(Arch(?:-Category)?)_(.+?)_64\.svg$/i.exec(file);
    if (!m) return null;
    name = (m[1].toLowerCase().includes("category") ? "Category-" : "") + m[2];
  }
  const full = slugify(name);
  const primary = full.replace(pack === "azure" ? /^azure-/ : /^(amazon|aws)-/, "") || full;
  return { primary, full };
}

function zipEntries(buf: Uint8Array): Entry[] {
  const files = unzipSync(buf, { filter: (f) => /\.svg$/i.test(f.name) });
  return Object.entries(files).map(([path, u8]) => ({ path: path.replace(/\\/g, "/"), data: Buffer.from(u8).toString("utf8") }));
}

function dirEntries(dir: string): Entry[] {
  return (readdirSync(dir, { recursive: true }) as string[])
    .filter((f) => /\.svg$/i.test(f))
    .map((f) => ({ path: f.replace(/\\/g, "/"), data: readFileSync(join(dir, f), "utf8") }));
}

/** Which official pack a set of files is (Azure: `…icon-service-…svg`; AWS: `Arch_…_64.svg`), or null. */
export function detectPack(entries: { path: string }[]): OfficialPack | null {
  const az = entries.filter((e) => slugFor("azure", e.path)).length;
  const aws = entries.filter((e) => slugFor("aws", e.path)).length;
  if (!az && !aws) return null;
  return az >= aws ? "azure" : "aws";
}

function writePack(pack: OfficialPack, entries: Entry[], source: string, dest: string) {
  const dir = resolve(dest, pack);
  const index: PackIndex = { pack, source, syncedAt: new Date().toISOString(), icons: {}, alt: {} };
  const files: [string, string][] = [];
  let skipped = 0;
  for (const e of entries) {
    const s = slugFor(pack, e.path);
    if (!s) {
      skipped++;
      continue;
    }
    let slug = s.primary;
    if (index.icons[slug]) {
      // duplicate primary (e.g. two variants): keep the first as primary, the other under its full name
      if (index.icons[s.full]) continue;
      slug = s.full;
    }
    files.push([`${slug}.svg`, e.data]);
    index.icons[slug] = `${slug}.svg`;
    if (s.full !== slug) index.alt![s.full] = slug;
  }
  const count = Object.keys(index.icons).length;
  if (!count) throw new Error(`no ${pack} service icons found in ${source} (${entries.length} svg files scanned)`);
  // only touch the existing pack once we know the new one is good
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const [name, data] of files) writeFileSync(join(dir, name), data);
  writeFileSync(join(dir, "index.json"), JSON.stringify(index, null, 2));
  return { count, dir, skipped };
}

/**
 * Import an official icon package (zip file, extracted folder or URL) into `<dest>/<pack>/` and write its index.
 * Icons stay on this machine: `.dgm/` is git-ignored and nothing is bundled with the tool.
 */
export async function syncPack(pack: OfficialPack, from: string, dest = ".dgm/icons"): Promise<{ count: number; dir: string; skipped: number }> {
  let entries: Entry[];
  if (/^https?:\/\//i.test(from)) {
    const res = await fetch(from);
    if (!res.ok) throw new Error(`download failed: HTTP ${res.status} for ${from}`);
    entries = zipEntries(new Uint8Array(await res.arrayBuffer()));
  } else {
    if (!existsSync(from)) throw new Error(`not found: ${from}`);
    entries = statSync(from).isDirectory() ? dirEntries(resolve(from)) : zipEntries(readFileSync(resolve(from)));
  }
  return writePack(pack, entries, from, dest);
}

export interface InboxResult {
  file: string;
  status: "imported" | "skipped" | "error";
  pack?: OfficialPack;
  count?: number;
  deleted?: boolean;
  message?: string;
}

/**
 * Process every `.zip` dropped in the inbox folder: detect Azure vs AWS from the contents, extract into
 * `<dest>/<pack>/`, then delete the zip (unless `keep`). Oldest first, so the newest zip of a pack wins.
 * Zips that are not recognised, or that fail, are left untouched.
 */
export function importInbox(inbox: string, dest = ".dgm/icons", opts: { keep?: boolean } = {}): InboxResult[] {
  const dir = resolve(inbox);
  if (!existsSync(dir)) return [];
  const zips = readdirSync(dir)
    .filter((f) => /\.zip$/i.test(f))
    .map((f) => ({ f, p: join(dir, f), t: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => a.t - b.t);
  const out: InboxResult[] = [];
  for (const z of zips) {
    try {
      const entries = zipEntries(readFileSync(z.p));
      const pack = detectPack(entries);
      if (!pack) {
        out.push({ file: z.f, status: "skipped", message: "not an Azure or AWS architecture icon package (no service icons found); left in place" });
        continue;
      }
      const r = writePack(pack, entries, z.f, dest);
      if (!opts.keep) rmSync(z.p, { force: true });
      out.push({ file: z.f, status: "imported", pack, count: r.count, deleted: !opts.keep });
    } catch (e) {
      out.push({ file: z.f, status: "error", message: (e as Error).message });
    }
  }
  return out;
}
