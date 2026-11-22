import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../styles/tokens.css", import.meta.url), "utf8");

function tokensFor(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`tokens.css is missing ${selector}`);
  const open = css.indexOf("{", start) + 1;
  const close = css.indexOf("}", open);
  const tokens: Record<string, string> = {};
  for (const line of css.slice(open, close).split("\n")) {
    const match = /--([\w-]+):\s*(#[0-9a-fA-F]{3,8})/.exec(line);
    if (match) tokens[match[1]] = match[2];
  }
  return tokens;
}

function luminance(hex: string): number {
  let h = hex.slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const channels = [0, 2, 4]
    .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const PAIRS = [
  ["text", "bg"],
  ["text-muted", "bg"],
  ["text-muted", "surface"],
  ["text-subtle", "surface"],
  ["accent", "bg"],
  ["on-accent", "accent"],
  ["danger", "danger-bg"],
  ["warning", "warning-bg"],
  ["success", "success-bg"],
  ["cm-key", "surface"],
  ["cm-string", "surface"],
  ["cm-number", "surface"],
  ["cm-bool", "surface"],
  ["cm-comment", "surface"],
  ["cm-punct", "surface"],
  ["cm-sep", "surface"],
  ["cm-meta", "surface"],
  ["cm-anchor", "surface"],
] as const;

describe.each([
  ["light", tokensFor(":root {")],
  ["dark", tokensFor('[data-theme="dark"]')],
])("the %s palette", (_name, tokens) => {
  it.each(PAIRS)("keeps --%s readable on --%s", (fg, bg) => {
    expect(tokens[fg], `--${fg}`).toBeTruthy();
    expect(tokens[bg], `--${bg}`).toBeTruthy();
    expect(contrast(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it("uses a dedicated on-accent ink, never the body colour", () => {
    expect(tokens["on-accent"]).not.toBe(tokens["text"]);
  });
});
