import type { Completion, CompletionContext, CompletionResult, CompletionSource } from "@codemirror/autocomplete";

export interface EditorVocab {
  icons: string[];
  kinds: string[];
  tones: string[];
  themes: string[];
}

const TOP_KEYS: Completion[] = [
  ["type", "architecture · flow · er · network"],
  ["title", "heading above the diagram"],
  ["subtitle", "second line under the title"],
  ["description", "one-line description"],
  ["direction", "RIGHT or DOWN"],
  ["look", "default · official · azure"],
  ["theme", "built-in name or inline theme"],
  ["font", "mixed · sans · serif"],
  ["palette", "token overrides"],
  ["zoneWidth", "auto · equal"],
  ["notesPosition", "side · below"],
  ["variants", "alternative layouts (narrow)"],
  ["legend", "compact key under the diagram"],
  ["nodes", "boxes, zones and resources"],
  ["edges", "connectors between nodes"],
  ["notes", "numbered notes"],
  ["steps", "click-through scenarios"],
].map(([label, info]) => ({ label, info, type: "keyword", apply: `${label}: ` }));

const NODE_KEYS: Completion[] = [
  ["id", "unique id used by edges, notes and steps"],
  ["label", "main text"],
  ["sublabel", "small second line"],
  ["kind", "service · database · cloud · decision · entity …"],
  ["tone", "semantic colour"],
  ["icon", "lu-… (Lucide) or a synced official pack"],
  ["variant", "card · stacked"],
  ["badge", "small numbered/lettered circle"],
  ["stackWith", "sibling id in the same step"],
  ["placement", "below · left · right"],
  ["color", "#hex border (official look)"],
  ["border", "solid · dashed · dotted · tinted · filled"],
  ["description", "tooltip text"],
  ["fields", "table rows for kind: entity"],
  ["children", "nested nodes (a zone)"],
].map(([label, info]) => ({ label, info, type: "property", apply: `${label}: ` }));

const EDGE_KEYS: Completion[] = [
  ["id", "stable id (also used by notes and steps)"],
  ["from", "source node id"],
  ["to", "target node id"],
  ["label", "text on the connector"],
  ["fromLabel", "small label at the source end"],
  ["toLabel", "small label at the target end"],
  ["style", "solid · dashed"],
  ["flow", "animate packets"],
  ["both", "arrowheads at both ends"],
].map(([label, info]) => ({ label, info, type: "property", apply: `${label}: ` }));

const NOTE_KEYS: Completion[] = [
  ["target", "node id or from->to"],
  ["text", "note text"],
].map(([label, info]) => ({ label, info, type: "property", apply: `${label}: ` }));

const STEP_KEYS: Completion[] = [
  ["title", "step label"],
  ["text", "optional explanation"],
  ["show", "ids highlighted in this step"],
  ["sequence", "optional reveal order"],
].map(([label, info]) => ({ label, info, type: "property", apply: `${label}: ` }));

const NARROW_KEYS: Completion[] = [
  ["direction", "RIGHT · DOWN"],
  ["notesPosition", "side · below"],
  ["hide", "node ids dropped on phones"],
  ["nodes", "per-node overrides"],
].map(([label, info]) => ({ label, info, type: "property", apply: `${label}: ` }));

const FIELDS_KEYS: Completion[] = [
  ["name", "column name"],
  ["type", "column type"],
  ["key", "pk · fk"],
].map(([label, info]) => ({ label, info, type: "property", apply: `${label}: ` }));

const COMMON_ICONS = [
  "lu-users",
  "lu-server",
  "lu-database",
  "lu-globe",
  "lu-lock",
  "lu-cloud",
  "lu-monitor",
  "lu-shield",
  "lu-workflow",
  "lu-container",
  "lu-hard-drive",
  "lu-zap",
  "lu-boxes",
  "lu-layers",
  "lu-key",
  "lu-file-text",
  "lu-git-branch",
  "lu-router",
  "lu-cpu",
  "lu-waypoints",
];

const asEnum = (values: string[]): Completion[] =>
  values.map((label) => ({ label, type: "enum", apply: label }));

const bools = (): Completion[] => [
  { label: "true", type: "constant", apply: "true" },
  { label: "false", type: "constant", apply: "false" },
];

/** Walk up to the nearest mapping key that owns this indentation. List item lines (`- id: …`) are skipped. */
function enclosingSection(context: CompletionContext, indent: number, lineNumber: number): string | undefined {
  for (let n = lineNumber - 1; n >= 1; n--) {
    const line = context.state.doc.line(n);
    const text = line.text.trim();
    if (!text || text.startsWith("#") || text.startsWith("-")) continue;
    const indentation = /^\s*/.exec(line.text)?.[0].length ?? 0;
    if (indentation >= indent) continue;
    const key = /^(?:-\s+)?([\w-]+)\s*:/.exec(text);
    if (key) return key[1];
  }
  return undefined;
}

function keysFor(section: string | undefined): Completion[] {
  switch (section) {
    case "nodes":
    case "children":
      return NODE_KEYS;
    case "edges":
      return EDGE_KEYS;
    case "notes":
      return NOTE_KEYS;
    case "steps":
      return STEP_KEYS;
    case "narrow":
    case "variants":
      return NARROW_KEYS;
    case "fields":
      return FIELDS_KEYS;
    default:
      return TOP_KEYS;
  }
}

function iconOptions(vocab: EditorVocab, query: string): Completion[] {
  const q = query.toLowerCase();
  const ordered = [...COMMON_ICONS.filter((name) => vocab.icons.includes(name) || !vocab.icons.length)];
  const rest = vocab.icons.filter((name) => !ordered.includes(name));
  const matches = [...ordered, ...rest].filter((name) => !q || name.toLowerCase().includes(q));
  return matches.slice(0, 80).map((label) => ({
    label,
    type: "constant",
    detail: "icon",
    boost: label.startsWith(q) ? 10 : 0,
  }));
}

const ENUMS: Record<string, string[]> = {
  type: ["architecture", "flow", "er", "network"],
  direction: ["RIGHT", "DOWN"],
  notesPosition: ["side", "below"],
  zoneWidth: ["auto", "equal"],
  look: ["default", "official", "azure"],
  font: ["mixed", "sans", "serif"],
  variant: ["card", "stacked"],
  placement: ["below", "left", "right"],
  border: ["solid", "dashed", "dotted", "tinted", "filled"],
  style: ["solid", "dashed"],
  key: ["pk", "fk"],
};

function valueOptions(vocab: EditorVocab, key: string, query: string): Completion[] | null {
  if (ENUMS[key]) return asEnum(ENUMS[key]);
  switch (key) {
    case "flow":
    case "both":
      return bools();
    case "tone":
      return asEnum(vocab.tones);
    case "kind":
      return asEnum(vocab.kinds);
    case "theme":
      return asEnum(vocab.themes);
    case "icon":
      return iconOptions(vocab, query);
    default:
      return null;
  }
}

/** YAML completions driven by the public spec: keys by section, enum values, and the bundled Lucide icon names. */
export function makeYamlCompletions(vocab: EditorVocab): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    console.log("dgm-completion", context.pos, context.explicit);
    const line = context.state.doc.lineAt(context.pos);
    const before = line.text.slice(0, context.pos - line.from);

    if (before.trimStart().startsWith("#")) return null;
    if ((before.match(/"/g)?.length ?? 0) % 2 === 1) return null;

    // `icon: lu-da`, inside a block mapping or a flow mapping.
    const value = /([\w-]+)\s*:\s*["']?([\w-]*)$/.exec(before);
    if (value) {
      const [, key, typed] = value;
      const options = valueOptions(vocab, key, typed);
      if (!options) return null;
      return {
        from: context.pos - typed.length,
        options,
        validFor: /^[\w-]*$/,
      };
    }

    const indent = /^\s*/.exec(line.text)?.[0].length ?? 0;
    const section = indent > 0 ? enclosingSection(context, indent, line.number) : undefined;
    const word = context.matchBefore(/[\w-]*/);
    if (!word) return null;
    if (word.from === word.to && !context.explicit) return null;

    // Flow mapping `- { id: a, lab` — suggest keys after a comma or brace.
    const flow = /[{,]\s*([\w-]*)$/.exec(before);
    const options = flow ? (section ? keysFor(section) : NODE_KEYS) : indent === 0 ? TOP_KEYS : keysFor(section);

    return {
      from: word.from,
      options,
      validFor: /^[\w-]*$/,
    };
  };
}
