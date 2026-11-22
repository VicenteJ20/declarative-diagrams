import { parseDocument, isNode } from "yaml";
import type { Diagnostic } from "@codemirror/lint";

export interface EditorIssue {
  message: string;
  severity: "error" | "warning";
}

export interface IssueLocation {
  from: number;
  to: number;
  line: number;
  column: number;
}

export interface BuiltDiagnostics {
  diagnostics: Diagnostic[];
  locations: IssueLocation[];
}

const PATH = /^([a-zA-Z][\w-]*(?:\.[\w-]+)*):\s+([\s\S]+)$/;
const KNOWN_ROOTS = new Set([
  "type",
  "title",
  "subtitle",
  "description",
  "direction",
  "look",
  "theme",
  "font",
  "palette",
  "zoneWidth",
  "notesPosition",
  "variants",
  "legend",
  "nodes",
  "edges",
  "notes",
  "steps",
]);

/** `edges.1.to: unknown node "db"` → path `edges.1.to`, message `unknown node "db"`. */
export function splitIssue(raw: string): { path?: string; message: string } {
  const m = PATH.exec(raw.trim());
  if (!m) return { message: raw };
  const root = m[1].split(".")[0];
  if (!KNOWN_ROOTS.has(root)) return { message: raw };
  return { path: m[1], message: m[2].trim() };
}

const escapeRe = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function lineColumn(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, Math.max(0, offset));
  const line = before.split("\n").length;
  const column = offset - before.lastIndexOf("\n");
  return { line, column };
}

function findIdentifier(text: string, id: string): { from: number; to: number } | null {
  const escaped = escapeRe(id);
  const key = new RegExp(`\\bid\\s*:\\s*["']?${escaped}["']?`).exec(text);
  if (key) {
    const from = key.index + key[0].search(new RegExp(escaped));
    return { from, to: from + id.length };
  }
  const word = new RegExp(`\\b${escaped}\\b`).exec(text);
  return word ? { from: word.index, to: word.index + id.length } : null;
}

function nodeRange(text: string, doc: ReturnType<typeof parseDocument>, path: string) {
  const segments = path.split(".").map((s) => (/^\d+$/.test(s) ? Number(s) : s));
  for (let depth = segments.length; depth > 0; depth--) {
    let node: unknown;
    try {
      node = doc.getIn(segments.slice(0, depth), true);
    } catch {
      node = undefined;
    }
    if (isNode(node) && node.range) {
      const from = node.range[0];
      const to = Math.max(from, node.range[1]);
      return { from: Math.min(from, text.length), to: Math.min(to, text.length) };
    }
  }
  return null;
}

function locate(text: string, doc: ReturnType<typeof parseDocument>, issue: EditorIssue): IssueLocation {
  const { path, message } = splitIssue(issue.message);
  let range: { from: number; to: number } | null = null;

  if (path) range = nodeRange(text, doc, path);

  if (!range) {
    const quoted = /(?:duplicate id|node|edge|unknown node|unknown theme)\s+"([^"]+)"/i.exec(message);
    if (quoted) range = findIdentifier(text, quoted[1]);
  }

  if (!range && path) range = findIdentifier(text, path.split(".").pop() ?? "");
  if (!range) range = { from: 0, to: Math.min(1, text.length) };

  const { line, column } = lineColumn(text, range.from);
  return { from: range.from, to: Math.max(range.to, Math.min(text.length, range.from + 1)), line, column };
}

const formatParseError = (message: string) => message.split("\n")[0].trim();

/**
 * Turn the engine's path-based errors and YAML syntax errors into CodeMirror diagnostics.
 * Syntax errors win: there is no point in showing schema errors for a document that does not parse.
 */
export function buildDiagnostics(text: string, issues: EditorIssue[]): BuiltDiagnostics {
  const doc = parseDocument(text);
  const parseIssues: EditorIssue[] = [
    ...doc.errors.map((e) => ({ message: formatParseError(e.message), severity: "error" as const })),
    ...doc.warnings.map((e) => ({ message: formatParseError(e.message), severity: "warning" as const })),
  ];

  let source = parseIssues.length
    ? parseIssues.map((issue, i) => ({ issue, error: doc.errors[i] ?? doc.warnings[i - doc.errors.length] }))
    : issues.map((issue) => ({ issue, error: null }));

  const diagnostics: Diagnostic[] = [];
  const locations: IssueLocation[] = [];

  for (const { issue, error } of source) {
    let range: { from: number; to: number } | null = null;
    if (error?.pos) {
      range = {
        from: Math.min(error.pos[0], text.length),
        to: Math.max(Math.min(error.pos[0] + 1, text.length), Math.min(error.pos[1], text.length)),
      };
    }
    const loc = range
      ? (() => {
          const { line, column } = lineColumn(text, range!.from);
          return { ...range!, line, column };
        })()
      : locate(text, doc, issue);
    locations.push(loc);
    diagnostics.push({
      from: loc.from,
      to: loc.to,
      severity: issue.severity,
      message: issue.message,
      source: "diagram",
    });
  }

  return { diagnostics, locations };
}
