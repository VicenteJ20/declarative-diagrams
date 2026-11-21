import { hexToLch, lchToHex, wrapHue } from "./color.js";

export interface Seed {
  accent: string;
  /** Colour of animated flow packets. Default: derived from the accent. */
  flow?: string;
  /** Tint of the panels (light mode). Default: a faint tint of the accent hue. */
  neutral?: string;
}

export type TokenMap = Record<string, string>;

/** Derive a complete light + dark token set from 1–3 seed colours (OKLCH ramps). */
export function fromSeed(seed: Seed): { light: TokenMap; dark: TokenMap } {
  const A = hexToLch(seed.accent);
  if (!A) throw new Error(`seed.accent must be a #hex colour, got "${seed.accent}"`);
  const N = seed.neutral ? hexToLch(seed.neutral) : null;
  if (seed.neutral && !N) throw new Error(`seed.neutral must be a #hex colour, got "${seed.neutral}"`);
  const F = seed.flow ? hexToLch(seed.flow) : null;
  if (seed.flow && !F) throw new Error(`seed.flow must be a #hex colour, got "${seed.flow}"`);
  const hn = N && N.C > 0.004 ? N.h : A.h;
  const hue = A.h;
  const hex = (L: number, C: number, h: number) => lchToHex(L, C, h);

  const tones = (L: number, C: number) => ({
    "tone-compute": hex(L, C, hue),
    "tone-data": hex(L, C, wrapHue(hue + 55)),
    "tone-network": hex(L, C, wrapHue(hue - 55)),
    "tone-neutral": hex(L, 0.012, hn),
    "tone-accent": hex(L, C * 1.3, hue),
    "tone-ok": hex(L, C, 145),
    "tone-warn": hex(L, C * 1.2, 80),
    "tone-danger": hex(L, C, 25),
    "tone-info": hex(L, C, 250),
  });

  const light: TokenMap = {
    "panel-a": seed.neutral ?? hex(0.955, 0.012, hn),
    "panel-b": "#ffffff",
    "panel-stroke": hex(0.885, 0.015, hn),
    "node-bg": "#ffffff",
    stroke: hex(0.62, 0.02, hn),
    text: hex(0.27, 0.02, hn),
    muted: hex(0.5, 0.02, hn),
    edge: hex(0.5, 0.02, hn),
    accent: seed.accent,
    flow: seed.flow ?? hex(0.72, 0.16, wrapHue(hue + 150)),
    "label-bg": "#ffffff",
    "icon-ink": hex(0.36, 0.05, hue),
    ...tones(0.88, 0.06),
  };

  const dark: TokenMap = {
    "panel-a": hex(0.255, 0.015, hn),
    "panel-b": hex(0.205, 0.012, hn),
    "panel-stroke": hex(0.34, 0.02, hn),
    "node-bg": hex(0.3, 0.015, hn),
    stroke: hex(0.62, 0.02, hn),
    text: hex(0.94, 0.01, hn),
    muted: hex(0.72, 0.015, hn),
    edge: hex(0.7, 0.015, hn),
    accent: hex(Math.max(A.L, 0.78), Math.min(A.C, 0.16), hue),
    flow: F ? hex(Math.max(F.L, 0.8), Math.min(F.C, 0.16), F.h) : hex(0.8, 0.15, wrapHue(hue + 150)),
    "label-bg": hex(0.205, 0.012, hn),
    "icon-ink": hex(0.95, 0.03, hue),
    ...tones(0.42, 0.08),
  };
  return { light, dark };
}
