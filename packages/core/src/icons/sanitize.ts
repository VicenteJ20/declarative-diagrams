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

/** Elements kept from an icon (allowlist). Everything else is dropped; some are dropped *with* their content. */
const ALLOWED_TAGS = new Set(
  (
    "g path rect circle ellipse line polyline polygon text tspan defs symbol use lineargradient radialgradient stop " +
    "clippath mask pattern marker filter style " +
    "feblend fecolormatrix fecomponenttransfer fecomposite feconvolvematrix fediffuselighting fedisplacementmap " +
    "fedropshadow feflood fefunca fefuncb fefuncg fefuncr fegaussianblur feimage femerge femergenode femorphology " +
    "feoffset fespecularlighting fetile feturbulence fedistantlight fepointlight fespotlight"
  ).split(" "),
);
/** Dropped together with everything inside them. */
const DROP_WITH_CONTENT = /<(script|foreignObject|title|desc|metadata|animate\w*|set|iframe|object|embed|audio|video|canvas|image|a|switch)\b[\s\S]*?(?:<\/\1\s*>|$)/gi;

const unsafeUrl = (v: string) => /javascript\s*:|data\s*:|vbscript\s*:|expression\s*\(|@import|url\(\s*['"]?\s*(?!#)/i.test(v);

/** Keep only allowlisted elements and attributes; `href` may only point at in-document `#ids`. */
export function sanitizeInner(src: string): string {
  let s = src.replace(DROP_WITH_CONTENT, "");
  s = s.replace(/<style\b[^>]*>([\s\S]*?)(?:<\/style\s*>|$)/gi, (_m, css: string) =>
    unsafeUrl(css) || /<|]]>/.test(css) ? "" : `<style>${css}</style>`,
  );
  const stash: string[] = [];
  s = s.replace(/<style>[\s\S]*?<\/style>/g, (m) => `\u0000${stash.push(m) - 1}\u0000`);
  // every remaining tag: allowlisted name, safe attributes; stray "<" that is not a tag is escaped
  s = s.replace(/<(\/?)([a-zA-Z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|<(?![\u0000])/g, (m, close?: string, name?: string, rest?: string) => {
    if (name === undefined) return "&lt;";
    if (!ALLOWED_TAGS.has(name.toLowerCase())) return "";
    if (close) return `</${name}>`;
    const selfClose = /\/\s*$/.test(rest ?? "");
    let attrs = "";
    for (const a of (rest ?? "").matchAll(/([^\s"'=<>\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
      const k = a[1];
      const val = a[2] ?? a[3] ?? a[4] ?? "";
      const lk = k.toLowerCase();
      if (lk.startsWith("on")) continue;
      if (lk === "href" || lk === "xlink:href") {
        if (!/^\s*#/.test(val)) continue;
      } else if (unsafeUrl(val)) continue;
      attrs += ` ${k}="${val.replace(/"/g, "&quot;")}"`;
    }
    return `<${name}${attrs}${selfClose ? "/" : ""}>`;
  });
  return s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => stash[+i]);
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

  inner = sanitizeInner(inner);

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
