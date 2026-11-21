import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { unzipSync } from "fflate";
import { slugify } from "./sanitize.js";
import type { OfficialPack, PackIndex } from "./store.js";

interface Entry {
  path: string; // path inside the package (forward slashes)
  data: string;
}

/** Slug rules for the official file names. Returns null for files that are not icons of the pack. */
export function slugFor(pack: string, path: string): { primary: string; full: string } | null {
  const file = basename(path);
  if (!/\.svg$/i.test(file)) return null;
  if (/(^|\/)__MACOSX\//.test(path) || file.startsWith(".")) return null; // macOS zip metadata

  if (pack !== "azure" && pack !== "aws") {
    // generic pack (gcp…): every svg is an icon, named after its file
    const full = slugify(file.replace(/\.svg$/i, ""));
    return full ? { primary: full, full } : null;
  }

  let name: string;
  let prefix = "";
  if (pack === "azure") {
    // 10035-icon-service-App-Services.svg
    const m = /icon-service-(.+)\.svg$/i.exec(file);
    if (!m) return null;
    name = m[1];
  } else {
    let m: RegExpExecArray | null;
    if ((m = /^(Arch(?:-Category)?)_(.+?)_64\.svg$/i.exec(file))) {
      // Arch_AWS-Lambda_64.svg · Arch-Category_Compute_64.svg   (service + category icons, 64px)
      name = (m[1].toLowerCase().includes("category") ? "Category-" : "") + m[2];
    } else if (/Group-Icons/i.test(path) && (m = /^(.+?)_32\.svg$/i.exec(file))) {
      // Architecture-Group-Icons/AWS-Account_32.svg · Public-subnet_32.svg   (containers: account, VPC, subnet…)
      name = m[1];
    } else if ((m = /^Res_(.+?)_48\.svg$/i.exec(file))) {
      // Resource-Icons/…/Res_Amazon-VPC_NAT-Gateway_48.svg   -> aws-res-vpc-nat-gateway
      name = m[1];
      prefix = "res-";
    } else return null;
  }
  const slug = slugify(name);
  const stripped = slug.replace(pack === "azure" ? /^azure-/ : /^(amazon|aws)-/, "") || slug;
  return { primary: prefix + stripped, full: prefix + slug };
}

function zipEntries(buf: Uint8Array): Entry[] {
  const files = unzipSync(buf, { filter: (f) => /\.svg$/i.test(f.name) && !/(^|\/)(__MACOSX\/|\.)/.test(f.name) });
  return Object.entries(files).map(([path, u8]) => ({ path: path.replace(/\\/g, "/"), data: Buffer.from(u8).toString("utf8") }));
}

function dirEntries(dir: string): Entry[] {
  return (readdirSync(dir, { recursive: true }) as string[])
    .filter((f) => /\.svg$/i.test(f))
    .map((f) => ({ path: f.replace(/\\/g, "/"), data: readFileSync(join(dir, f), "utf8") }));
}

/** Which official pack a set of files is (Azure: `…icon-service-…svg`; AWS: `Arch_…_64.svg`), or null. */
export function detectPack(entries: { path: string }[]): string | null {
  const az = entries.filter((e) => slugFor("azure", e.path)).length;
  const aws = entries.filter((e) => slugFor("aws", e.path)).length;
  if (!az && !aws) return null;
  return az >= aws ? "azure" : "aws";
}

function writePack(pack: string, entries: Entry[], source: string, dest: string) {
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
  /** Path relative to the inbox, e.g. `azure/Azure_Public_Service_Icons_V25.zip`. */
  file: string;
  status: "imported" | "skipped" | "error";
  pack?: string;
  count?: number;
  deleted?: boolean;
  message?: string;
}

/**
 * Process the zips in the inbox folder and extract them into `<dest>/<pack>/`, then delete each zip (unless `keep`).
 *
 *   icons-inbox/azure/*.zip   -> pack "azure"      (the folder name IS the pack id)
 *   icons-inbox/aws/*.zip     -> pack "aws"
 *   icons-inbox/gcp/*.zip     -> pack "gcp"        (any other folder: generic pack, every svg is an icon)
 *   icons-inbox/*.zip         -> loose zips: Azure or AWS is detected from the contents
 *
 * Oldest zip first, so the newest of a pack wins. Zips that fail or are not recognised are left untouched.
 */
export function importInbox(inbox: string, dest = ".dgm/icons", opts: { keep?: boolean } = {}): InboxResult[] {
  const root = resolve(inbox);
  if (!existsSync(root)) return [];
  const jobs: { rel: string; abs: string; pack?: string; t: number }[] = [];
  const zipsIn = (dir: string, pack?: string) => {
    for (const f of readdirSync(dir)) {
      const abs = join(dir, f);
      if (/\.zip$/i.test(f) && statSync(abs).isFile()) jobs.push({ rel: pack ? `${pack}/${f}` : f, abs, pack, t: statSync(abs).mtimeMs });
    }
  };
  zipsIn(root);
  for (const d of readdirSync(root, { withFileTypes: true }))
    if (d.isDirectory() && !d.name.startsWith(".")) zipsIn(join(root, d.name), slugify(d.name));
  jobs.sort((a, b) => a.t - b.t);

  const out: InboxResult[] = [];
  for (const j of jobs) {
    try {
      const entries = zipEntries(readFileSync(j.abs));
      const pack = j.pack ?? detectPack(entries);
      if (!pack) {
        out.push({ file: j.rel, status: "skipped", message: "not recognised as an Azure or AWS package; move it to icons-inbox/<pack>/ (e.g. azure, aws, gcp). Left in place" });
        continue;
      }
      const r = writePack(pack, entries, j.rel, dest);
      if (!opts.keep) rmSync(j.abs, { force: true });
      out.push({ file: j.rel, status: "imported", pack, count: r.count, deleted: !opts.keep });
    } catch (e) {
      out.push({ file: j.rel, status: "error", message: (e as Error).message });
    }
  }
  return out;
}
