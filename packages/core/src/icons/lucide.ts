import { icons } from "lucide";
import type { IconData } from "./sanitize.js";
import { kebab } from "./sanitize.js";

type IconNode = [string, Record<string, string | number>][];
const table = icons as unknown as Record<string, IconNode>;

const byKebab = new Map<string, string>();
for (const k of Object.keys(table)) byKebab.set(kebab(k), k);

const esc = (v: string | number) => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export const lucideNames = (): string[] => [...byKebab.keys()].sort();

/** `database`, `hard-drive`, `table-2`… → themeable stroke icon (24×24). */
export function lucideIcon(name: string): IconData | null {
  const key = byKebab.get(name.toLowerCase());
  if (!key) return null;
  const inner = table[key]
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        .filter(([k]) => k !== "key")
        .map(([k, v]) => `${k}="${esc(v)}"`)
        .join(" ");
      return `<${tag} ${a}/>`;
    })
    .join("");
  return { inner, viewBox: "0 0 24 24", mono: "stroke" };
}
