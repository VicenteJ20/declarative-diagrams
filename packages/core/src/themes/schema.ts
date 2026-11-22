import { z } from "zod";
import { TOKEN_KEYS, TONES, ThemeDef } from "./index.js";

const hex = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "must be a #hex colour");
// no `<>{};&\`, comments or url() — these values end up inside the SVG's <style> block
const safeCss = (v: string) => v.length > 0 && v.length < 300 && !/[<>{};&\\]|\/\*|\*\/|url\s*\(|@import|expression\s*\(|javascript:/i.test(v);
const color = z.string().refine(safeCss, "invalid or unsafe CSS value");
const font = z.string().refine(safeCss, "invalid or unsafe font stack");

const overlay = z
  .object({
    tones: z.object(Object.fromEntries(TONES.map((t) => [t, color.optional()])) as Record<string, z.ZodTypeAny>).strict().optional(),
    ...Object.fromEntries(TOKEN_KEYS.filter((k) => !k.startsWith("tone-")).map((k) => [k, color.optional()])),
  })
  .strict();

export const ThemeDefSchema = z
  .object({
    name: z.string().regex(/^[a-z0-9][a-z0-9-_]*$/i, "use letters, digits, - or _"),
    description: z.string().optional(),
    extends: z.string().optional(),
    seed: z.object({ accent: hex, flow: hex.optional(), neutral: hex.optional() }).strict().optional(),
    light: overlay.optional(),
    dark: overlay.optional(),
    font: z.enum(["mixed", "sans", "serif"]).optional(),
    fonts: z.object({ serif: font.optional(), sans: font.optional() }).strict().optional(),
  })
  .strict();

export function parseThemeDef(input: unknown, source = "theme"): ThemeDef {
  const r = ThemeDefSchema.safeParse(input);
  if (!r.success)
    throw new Error(`${source}: ${r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`);
  return r.data as ThemeDef;
}
