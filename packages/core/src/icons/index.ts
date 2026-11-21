import type { NodeSpec } from "../spec.js";
import { prefixIds, IconData } from "./sanitize.js";
import { resolveIcon, parseIconRef, IconResult } from "./store.js";

export { resolveIcon, parseIconRef, configureIcons, listIcons, listAliases, packOfPrefix, OFFICIAL_URL } from "./store.js";
export type { IconResult, CustomPack, OfficialPack } from "./store.js";
export { syncPack, importInbox, detectPack } from "./sync.js";
export type { InboxResult } from "./sync.js";
export type { IconData } from "./sanitize.js";

export const STACK_ICON = 40;
export const CARD_ICON = 22;
export const HEAD_ICON = 18;

export type IconVariant = "card" | "stacked";

/** Resolved icon of a node + how it is drawn; null when the node has no (resolvable) icon. */
export function nodeIcon(n: NodeSpec): { res: Extract<IconResult, { ok: true }>; variant: IconVariant } | null {
  if (!n.icon) return null;
  const res = resolveIcon(n.icon);
  if (!res.ok) return null;
  const pre = parseIconRef(n.icon)!.prefix;
  const variant: IconVariant = n.variant ?? (pre === "lu" ? "card" : "stacked");
  return { res, variant };
}

/** Collects the <symbol>s used by one diagram; ids are namespaced so several inline SVGs never collide. */
export class IconEmitter {
  private defs = new Map<string, string>();
  constructor(private ns: string) {}

  private symbol(res: Extract<IconResult, { ok: true }>): string {
    const id = `${this.ns}-${res.pack}-${res.slug}`;
    if (!this.defs.has(id)) {
      const d: IconData = res.data;
      const inner = prefixIds(d.inner, id);
      const wrapped =
        d.mono === "stroke"
          ? `<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`
          : d.mono === "fill"
            ? `<g fill="currentColor">${inner}</g>`
            : inner;
      this.defs.set(id, `<symbol id="${id}" viewBox="${d.viewBox}">${wrapped}</symbol>`);
    }
    return id;
  }

  /** `<use>` placing the icon in the box (x, y, size). Monochrome icons take the theme's icon ink. */
  use(res: Extract<IconResult, { ok: true }>, x: number, y: number, size: number): string {
    const id = this.symbol(res);
    const cls = res.data.mono ? ' class="ico"' : "";
    const r = (v: number) => Math.round(v * 10) / 10;
    return `<use href="#${id}" xlink:href="#${id}" x="${r(x)}" y="${r(y)}" width="${size}" height="${size}"${cls}/>`;
  }

  markup(): string {
    return [...this.defs.values()].join("");
  }
}

/** Short deterministic namespace for a diagram (djb2 over its content). */
export function diagramNs(seed: string): string {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  return "d" + (h >>> 0).toString(36);
}
