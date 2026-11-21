#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, extname } from "node:path";
import { parseSpecText, validateSpec, renderSvg, renderPng, specJsonSchema, KINDS } from "@dgm/core";

const HELP = `dgm — Distill-style interactive diagrams

Usage:
  dgm render <spec> -o <out.svg|out.png> [--static] [--theme light|dark] [--scale 2]
  dgm validate <spec>          Print errors/warnings (exit 1 on errors)
  dgm schema                   Print the JSON Schema of the spec
  dgm kinds                    List known node kinds

<spec> is a .yaml/.yml/.json file. SVG output is interactive unless --static.
PNG output is always static.`;

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function load(path: string) {
  const res = validateSpec(parseSpecText(readFileSync(path, "utf8")));
  for (const w of res.warnings) console.error(`warning: ${w}`);
  if (!res.ok) {
    for (const e of res.errors) console.error(`error: ${e}`);
    process.exit(1);
  }
  return res.spec!;
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case "validate": {
      load(args[0]);
      console.log("ok");
      break;
    }
    case "schema":
      console.log(JSON.stringify(specJsonSchema(), null, 2));
      break;
    case "kinds":
      for (const [k, v] of Object.entries(KINDS)) console.log(`${k}${v.tag ? `  (container: ${v.tag})` : ""}`);
      break;
    case "render": {
      const spec = load(args[0]);
      const out = flag(args, "-o") ?? flag(args, "--out");
      if (!out) throw new Error("missing -o <output>");
      const theme = flag(args, "--theme") as "light" | "dark" | undefined;
      mkdirSync(dirname(out), { recursive: true });
      if (extname(out).toLowerCase() === ".png") {
        const scale = Number(flag(args, "--scale") ?? 2);
        writeFileSync(out, await renderPng(spec, { theme, scale }));
      } else {
        writeFileSync(out, await renderSvg(spec, { theme, static: args.includes("--static") }));
      }
      console.log(`wrote ${out}`);
      break;
    }
    default:
      console.log(HELP);
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
