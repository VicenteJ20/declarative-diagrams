/** SVG icon ingestion: parse, sanitise and namespace. Pure string work (no fs, no DOM). */

export interface IconData {
  /** SVG children (no <svg> wrapper), already sanitised. */
  inner: string;
  viewBox: string;
  /** `stroke`/`fill`: monochrome icon painted with `currentColor` (themeable). Absent: keeps its own colours (official packs). */
  mono?: "stroke" | "fill";
}

export function kebab(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .replace(/[_\s.]+/g, "-")
    .replace(/[^A-Za-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

/**
 * Parse an SVG file into icon data. Removes scripts, event handlers, foreignObject, <image>,
 * external references and <style>/<title> noise. `mono` recolours via currentColor (custom packs only).
 */
export function parseSvg(src: string, opts: { mono?: boolean } = {}): IconData {
  let s = src
    .replace(/^﻿/, "")
    .replace(/<\?xml[\s\S]*?\?>/g, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  const m = /<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/i.exec(s.trim());
  if (!m) throw new Error("not an SVG document");
  const attrs = m[1];
  let inner = m[2];

  let viewBox = /\bviewBox\s*=\s*"([^"]+)"/i.exec(attrs)?.[1];
  if (!viewBox) {
    const w = /\bwidth\s*=\s*"([\d.]+)/i.exec(attrs)?.[1];
    const h = /\bheight\s*=\s*"([\d.]+)/i.exec(attrs)?.[1];
    viewBox = w && h ? `0 0 ${w} ${h}` : "0 0 24 24";
  }

  inner = inner
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/<image\b[^>]*\/?>(\s*<\/image>)?/gi, "")
    .replace(/<title\b[\s\S]*?<\/title>/gi, "")
    .replace(/<desc\b[\s\S]*?<\/desc>/gi, "")
    .replace(/<metadata\b[\s\S]*?<\/metadata>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/\s+(?:xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, "");

  if (opts.mono) {
    inner = inner.replace(/\s(fill|stroke)\s*=\s*"(?!none)[^"]*"/gi, "");
    return { inner, viewBox, mono: "fill" };
  }
  return { inner, viewBox };
}

/** Prefix every id (and its references) so several inline SVGs on one page never collide. */
export function prefixIds(inner: string, prefix: string): string {
  const ids = new Set<string>();
  for (const m of inner.matchAll(/\sid\s*=\s*"([^"]+)"/g)) ids.add(m[1]);
  if (!ids.size) return inner;
  let out = inner;
  for (const id of ids) {
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out
      .replace(new RegExp(`(\\sid\\s*=\\s*")${esc}(")`, "g"), `$1${prefix}-${id}$2`)
      .replace(new RegExp(`url\\(\\s*['"]?#${esc}['"]?\\s*\\)`, "g"), `url(#${prefix}-${id})`)
      .replace(new RegExp(`((?:xlink:)?href\\s*=\\s*")#${esc}(")`, "g"), `$1#${prefix}-${id}$2`);
  }
  return out;
}

/** Plain slug for file names of official/custom packs: lowercase, non-alphanumerics -> "-" (CloudFront -> cloudfront). */
export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
