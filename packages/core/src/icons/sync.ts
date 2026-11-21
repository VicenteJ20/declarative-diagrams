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

function readPackage(from: string, buf?: Uint8Array): Entry[] {
  if (buf) {
    const files = unzipSync(buf, { filter: (f) => /\.svg$/i.test(f.name) });
    return Object.entries(files).map(([path, u8]) => ({ path: path.replace(/\\/g, "/"), data: Buffer.from(u8).toString("utf8") }));
  }
  const st = statSync(from);
  if (st.isDirectory()) {
    return (readdirSync(from, { recursive: true }) as string[])
      .filter((f) => /\.svg$/i.test(f))
      .map((f) => ({ path: f.replace(/\\/g, "/"), data: readFileSync(join(from, f), "utf8") }));
  }
  return readPackage(from, readFileSync(from));
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
    entries = readPackage(from, new Uint8Array(await res.arrayBuffer()));
  } else {
    if (!existsSync(from)) throw new Error(`not found: ${from}`);
    entries = readPackage(resolve(from));
  }

  const dir = resolve(dest, pack);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const index: PackIndex = { pack, source: from, syncedAt: new Date().toISOString(), icons: {}, alt: {} };
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
    writeFileSync(join(dir, `${slug}.svg`), e.data);
    index.icons[slug] = `${slug}.svg`;
    if (s.full !== slug) index.alt![s.full] = slug;
  }
  const count = Object.keys(index.icons).length;
  if (!count) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(`no ${pack} service icons found in ${from} (expected the official package; ${entries.length} svg files scanned)`);
  }
  writeFileSync(join(dir, "index.json"), JSON.stringify(index, null, 2));
  return { count, dir, skipped };
}
