import { describe, it, expect } from "vitest";
import { validateSpec, renderSvg } from "./index.js";

const ok = { nodes: [{ id: "a", label: "A", children: [{ id: "b", label: "B" }] }, { id: "c", label: "C" }], edges: [{ from: "b", to: "c" }] };

describe("spec", () => {
  it("accepts a valid nested spec", () => expect(validateSpec(ok).ok).toBe(true));
  it("reports unknown edge endpoints", () => {
    const r = validateSpec({ ...ok, edges: [{ from: "b", to: "zzz" }] });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain("zzz");
  });
  it("rejects container->descendant edges", () =>
    expect(validateSpec({ ...ok, edges: [{ from: "a", to: "b" }] }).ok).toBe(false));
});

describe("render", () => {
  it("embeds runtime when interactive, omits when static", async () => {
    const spec = validateSpec(ok).spec!;
    expect(await renderSvg(spec)).toContain("<script>");
    const s = await renderSvg(spec, { static: true });
    expect(s).not.toContain("<script>");
    expect(s).not.toContain("var(--");
  });
});
