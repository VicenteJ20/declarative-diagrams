#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

// Usage: dgm-mcp [--root <project dir>]   (env DGM_ROOT also works; default: current directory)
const args = process.argv.slice(2);
const i = args.indexOf("--root");
const root = (i >= 0 ? args[i + 1] : undefined) ?? process.env.DGM_ROOT ?? process.cwd();

const server = createServer({ root });
await server.connect(new StdioServerTransport());
console.error(`dgm-mcp ready (root: ${root})`); // stdout is the protocol channel: log to stderr only
