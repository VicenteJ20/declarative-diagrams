import { describe, it, expect } from "vitest";
import { validateSpec, renderSvg, renderPng } from "./index.js";
import { parseSvg } from "./icons/sanitize.js";
import { parseThemeDef } from "./themes/schema.js";

const base = { nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }], edges: [{ from: "a", to: "b" }] };

describe("SVG output is not injectable through theme values", () => {
  it("rejects a palette value that would close the <style> block", async () => {
    const res = validateSpec({ ...base, palette: { accent: "red}</style><script>alert(1)</script><style>" } });
    if (!res.ok) return; // rejected at validation: fine
    await expect(renderSvg(res.spec!)).rejects.toThrow(/unsafe CSS value/);
  });
  it("rejects unsafe font stacks and colours in theme files", () => {
    expect(() => parseThemeDef({ name: "x", fonts: { sans: "a;}</style><script>" } })).toThrow();
    expect(() => parseThemeDef({ name: "x", light: { accent: "url(https://evil/x)" } })).toThrow();
    expect(() => parseThemeDef({ name: "x", light: { accent: "rgb(10, 20, 30)" } })).not.toThrow();
  });
});

describe("step text is escaped in data-steps", () => {
  it("keeps the SVG well-formed and renders to PNG with & and < in titles", async () => {
    const res = validateSpec({ ...base, steps: [{ title: "R&D <x> 'q'", text: 'say "hi"', show: ["a", "b"] }] });
    expect(res.ok).toBe(true);
    const svg = await renderSvg(res.spec!);
    expect(svg).not.toMatch(/data-steps='/);
    const png = await renderPng(res.spec!);
    expect(png.length).toBeGreaterThan(100);
  });
});

describe("icon sanitiser", () => {
  const wrap = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${inner}</svg>`;
  const clean = (inner: string) => parseSvg(wrap(inner)).inner;

  it("strips event handlers however they are spelled", () => {
    expect(clean(`<path/onclick="alert(1)" d="M0 0"/>`)).not.toMatch(/onclick/i);
    expect(clean(`<path onclick=alert(1) d="M0 0"/>`)).not.toMatch(/onclick/i);
    expect(clean(`<path ONLOAD='x()' d="M0 0"/>`)).not.toMatch(/onload/i);
  });
  it("drops scripts, even unclosed, and animation/link elements", () => {
    expect(clean(`<script>alert(1)`)).not.toMatch(/script|alert/i);
    expect(clean(`<path d="M0 0"><animate attributeName="href" values="javascript:alert(1)"/></path>`)).not.toMatch(/animate|javascript/i);
    expect(clean(`<a href="javascript:alert(1)"><path d="M0 0"/></a>`)).not.toMatch(/javascript|<a/i);
    expect(clean(`<foreignObject><div>x</div></foreignObject>`)).toBe("");
  });
  it("only keeps in-document hrefs", () => {
    expect(clean(`<use href="#a"/>`)).toContain('href="#a"');
    expect(clean(`<use xlink:href="https://evil/x.svg#a"/>`)).not.toMatch(/href/);
  });
  it("keeps harmless style rules but drops unsafe ones", () => {
    expect(clean(`<style>.c{fill:#fff}</style><path class="c" d="M0 0"/>`)).toContain("<style>.c{fill:#fff}</style>");
    expect(clean(`<style>@import url(https://evil/x.css);</style><path d="M0 0"/>`)).not.toMatch(/import|evil/);
  });
  it("keeps normal drawing content intact", () => {
    const inner = `<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><path d="M0 0L5 5" fill="url(#g)"/>`;
    expect(clean(inner)).toBe(inner);
  });
});
