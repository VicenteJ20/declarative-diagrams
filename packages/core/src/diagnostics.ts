/** Size/proportion report for an exported diagram, with advice when it is badly proportioned for a page. */
export interface CanvasAdvice {
  width: number;
  height: number;
  aspect: number;
  /** One line, e.g. "Canvas 2876×882 px (3.3:1)". */
  text: string;
  /** Present when the proportions are poor; says how to fix them. */
  hint?: string;
}

export const WIDE_LIMIT = 3.5;
export const TALL_LIMIT = 0.45;

/** Widest phone canvas that still keeps 12 px labels readable (≈ 0.75× on a 390 px screen → ~9 px). */
export const PHONE_MAX_WIDTH = 520;

/** `phone`: the canvas is the `variants.narrow` version — judge it by width (readability on a phone), not by ratio. A number = the PNG pixel scale to divide out. */
export function canvasAdvice(width: number, height: number, phone: boolean | number = false): CanvasAdvice {
  const aspect = width / height;
  const text = `Canvas ${Math.round(width)}×${Math.round(height)} px (${aspect.toFixed(1)}:1)`;
  let hint: string | undefined;
  if (phone) {
    const nat = width / (typeof phone === "number" ? phone : 1);
    const scale = Math.min(1, 360 / nat);
    if (nat > PHONE_MAX_WIDTH)
      hint =
        `Too wide for a phone: on a 360 px screen it shows at ${Math.round(scale * 100)}% (12 px labels → ${(12 * scale).toFixed(1)} px). Aim for ≤ ${PHONE_MAX_WIDTH} px wide: ` +
        "in `variants.narrow.nodes` set `stackWith: null` on nodes that sit beside others (one per row where possible), shorten `label`/`sublabel`, " +
        "or `hide` secondary nodes.";
    return { width, height, aspect, text: `${text} — phone view`, hint };
  }
  if (aspect > WIDE_LIMIT)
    hint =
      "Very wide for a page column (comfortable range ≈ 1.5–3.5:1). Fold branches that leave the main flow with `stackWith: <id>` " +
      "(same step, stacked below the anchor), use `direction: DOWN` for layered diagrams, keep notes in the side gutter and short " +
      "(`notesPosition: side`), put long explanations in `steps`/`description`, drop rarely-needed nodes, or split into overview + detail diagrams.";
  else if (aspect < TALL_LIMIT)
    hint =
      "Very tall (comfortable range ≈ 1.5–3.5:1 wide). Use `direction: RIGHT`, stack siblings side by side with `stackWith`, or split the diagram.";
  return { width, height, aspect, text, hint };
}

/** Pixel size of a PNG buffer (IHDR). */
export function pngSize(buf: Uint8Array): { width: number; height: number } {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return { width: dv.getUint32(16), height: dv.getUint32(20) };
}

/** `viewBox` size of an SVG string. */
export function svgSize(svg: string): { width: number; height: number } | null {
  const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}
