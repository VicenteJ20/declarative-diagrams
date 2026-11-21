import { z } from "zod";
import YAML from "yaml";
import { KINDS } from "./kinds.js";
import { TONES, Tone, resolveTheme, ThemeDef, Palette } from "./themes/index.js";

export interface NodeSpec {
  id: string;
  label: string;
  kind?: string;
  /** Semantic colour from the theme (e.g. `warn`). Overrides the kind's default. */
  tone?: Tone;
  sublabel?: string;
  /** Shown in a tooltip on hover. */
  description?: string;
  /** Table rows for `kind: entity` (ER diagrams). */
  fields?: { name: string; type?: string; key?: "pk" | "fk" }[];
  children?: NodeSpec[];
}

const NodeSchema: z.ZodType<NodeSpec> = z.lazy(() =>
  z
    .object({
      id: z.string().min(1),
      label: z.string(),
      kind: z.string().optional(),
      tone: z.enum(TONES).optional(),
      sublabel: z.string().optional(),
      description: z.string().optional(),
      fields: z
        .array(
          z
            .object({ name: z.string(), type: z.string().optional(), key: z.enum(["pk", "fk"]).optional() })
            .strict(),
        )
        .optional(),
      children: z.array(NodeSchema).optional(),
    })
    .strict(),
);

const EdgeSchema = z
  .object({
    id: z.string().optional(),
    from: z.string(),
    to: z.string(),
    label: z.string().optional(),
    /** Small labels at the ends, e.g. cardinality "1" / "N" in ER diagrams. */
    fromLabel: z.string().optional(),
    toLabel: z.string().optional(),
    style: z.enum(["solid", "dashed"]).default("solid"),
    /** Animated "packets" travelling along the edge. */
    flow: z.boolean().default(false),
    /** Arrowheads at both ends. */
    both: z.boolean().default(false),
  })
  .strict();

const NoteSchema = z
  .object({
    text: z.string(),
    /** Node id, or edge id (`from->to`). */
    target: z.string(),
  })
  .strict();

const StepSchema = z
  .object({
    title: z.string(),
    text: z.string().optional(),
    /** Node / edge ids highlighted in this step. */
    show: z.array(z.string()).min(1),
  })
  .strict();

export const SpecSchema = z
  .object({
    type: z.enum(["architecture", "flow", "er", "network"]).default("architecture"),
    title: z.string().optional(),
    description: z.string().optional(),
    direction: z.enum(["RIGHT", "DOWN"]).default("RIGHT"),
    /** Theme name (`olive`, `azure`…) or an inline theme definition. Overridable at render time. */
    theme: z.union([z.string(), z.record(z.unknown())]).optional(),
    /** Token overrides on top of the theme. */
    palette: z.record(z.unknown()).optional(),
    /** Where notes go: a margin gutter (default) or a numbered list under the diagram. */
    notesPosition: z.enum(["side", "below"]).default("side"),
    /** Author-defined alternative layouts. Never applied automatically; `<Diagram narrowBelow>` opts in. */
    variants: z
      .object({
        narrow: z
          .object({ direction: z.enum(["RIGHT", "DOWN"]).optional(), notesPosition: z.enum(["side", "below"]).optional() })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    nodes: z.array(NodeSchema).min(1),
    edges: z.array(EdgeSchema).default([]),
    notes: z.array(NoteSchema).default([]),
    steps: z.array(StepSchema).default([]),
  })
  .strict();

export type DiagramSpec = Omit<z.infer<typeof SpecSchema>, "theme" | "palette"> & {
  theme?: string | ThemeDef;
  palette?: Palette;
};
export type EdgeSpec = DiagramSpec["edges"][number] & { id: string };

export interface ValidationResult {
  ok: boolean;
  spec?: DiagramSpec;
  errors: string[];
  warnings: string[];
}

/** Spec for a named variant (`narrow`): its overrides applied, defaulting to a vertical layout with notes below. */
export function applyVariant(spec: DiagramSpec, name: "narrow"): DiagramSpec | null {
  const v = spec.variants?.[name];
  if (!v) return null;
  return { ...spec, direction: v.direction ?? "DOWN", notesPosition: v.notesPosition ?? "below", variants: undefined };
}

export function parseSpecText(text: string): unknown {
  return YAML.parse(text); // YAML is a superset of JSON
}

/** Edge id used by notes/steps: explicit `id`, else `from->to` (`#2`, `#3`… for repeats). */
export function edgeIds(spec: DiagramSpec): string[] {
  const seen = new Map<string, number>();
  return spec.edges.map((e) => {
    if (e.id) return e.id;
    const base = `${e.from}->${e.to}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}#${n}`;
  });
}

export function validateSpec(input: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed = SpecSchema.safeParse(input);
  if (!parsed.success) {
    for (const i of parsed.error.issues) errors.push(`${i.path.join(".") || "(root)"}: ${i.message}`);
    return { ok: false, errors, warnings };
  }
  const spec = parsed.data as DiagramSpec;

  if (spec.theme) {
    try {
      resolveTheme(spec.theme);
    } catch (e) {
      errors.push(`theme: ${(e as Error).message}`);
    }
  }

  const parentOf = new Map<string, string | undefined>();
  const walk = (nodes: NodeSpec[], parent?: string) => {
    for (const n of nodes) {
      if (parentOf.has(n.id)) errors.push(`nodes: duplicate id "${n.id}"`);
      if (/->|#/.test(n.id)) errors.push(`nodes: id "${n.id}" must not contain "->" or "#"`);
      parentOf.set(n.id, parent);
      if (n.kind && !KINDS[n.kind]) warnings.push(`node "${n.id}": unknown kind "${n.kind}" (falls back to a generic style)`);
      if (n.children) walk(n.children, n.id);
    }
  };
  walk(spec.nodes);

  const isAncestor = (a: string, b: string) => {
    for (let p = parentOf.get(b); p; p = parentOf.get(p)) if (p === a) return true;
    return false;
  };

  const ids = edgeIds(spec);
  const edgeSet = new Set<string>();
  spec.edges.forEach((e, i) => {
    if (edgeSet.has(ids[i])) errors.push(`edges.${i}: duplicate edge id "${ids[i]}"`);
    edgeSet.add(ids[i]);
    for (const end of ["from", "to"] as const) {
      if (!parentOf.has(e[end])) errors.push(`edges.${i}.${end}: unknown node "${e[end]}"`);
    }
    if (e.from === e.to) errors.push(`edges.${i}: self-loop on "${e.from}" is not supported`);
    else if (isAncestor(e.from, e.to) || isAncestor(e.to, e.from))
      errors.push(`edges.${i}: edge between a container and its own descendant ("${e.from}" / "${e.to}")`);
  });

  const known = (id: string) => parentOf.has(id) || edgeSet.has(id);
  spec.notes.forEach((n, i) => {
    if (!known(n.target)) errors.push(`notes.${i}.target: unknown node/edge "${n.target}"`);
  });
  spec.steps.forEach((s, i) =>
    s.show.forEach((id, j) => {
      if (!known(id)) errors.push(`steps.${i}.show.${j}: unknown node/edge "${id}"`);
    }),
  );

  return { ok: errors.length === 0, spec, errors, warnings };
}

export function specJsonSchema(): unknown {
  // Small hand-rolled JSON Schema (avoids an extra dependency); mirrors SpecSchema.
  const node: Record<string, unknown> = {
    type: "object",
    required: ["id", "label"],
    additionalProperties: false,
    properties: {
      id: { type: "string" },
      label: { type: "string" },
      kind: { type: "string", enum: Object.keys(KINDS) },
      tone: { enum: [...TONES] },
      sublabel: { type: "string" },
      description: { type: "string" },
      fields: {
        type: "array",
        items: {
          type: "object",
          required: ["name"],
          additionalProperties: false,
          properties: { name: { type: "string" }, type: { type: "string" }, key: { enum: ["pk", "fk"] } },
        },
      },
      children: { type: "array", items: { $ref: "#/definitions/node" } },
    },
  };
  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    required: ["nodes"],
    additionalProperties: false,
    definitions: { node },
    properties: {
      type: { enum: ["architecture", "flow", "er", "network"] },
      title: { type: "string" },
      description: { type: "string" },
      direction: { enum: ["RIGHT", "DOWN"] },
      notesPosition: { enum: ["side", "below"] },
      variants: {
        type: "object",
        additionalProperties: false,
        properties: {
          narrow: {
            type: "object",
            additionalProperties: false,
            properties: { direction: { enum: ["RIGHT", "DOWN"] }, notesPosition: { enum: ["side", "below"] } },
          },
        },
      },
      theme: { description: "Theme name (distill, olive, azure, aws, orange, slate, mono, or a project theme) or an inline theme object", oneOf: [{ type: "string" }, { type: "object" }] },
      palette: { type: "object", description: "Token overrides: { accent, light: {…}, dark: {…}, tones: {…} }" },
      nodes: { type: "array", minItems: 1, items: { $ref: "#/definitions/node" } },
      edges: {
        type: "array",
        items: {
          type: "object",
          required: ["from", "to"],
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            from: { type: "string" },
            to: { type: "string" },
            label: { type: "string" },
            fromLabel: { type: "string" },
            toLabel: { type: "string" },
            style: { enum: ["solid", "dashed"] },
            flow: { type: "boolean" },
            both: { type: "boolean" },
          },
        },
      },
      notes: {
        type: "array",
        items: {
          type: "object",
          required: ["text", "target"],
          additionalProperties: false,
          properties: { text: { type: "string" }, target: { type: "string" } },
        },
      },
      steps: {
        type: "array",
        items: {
          type: "object",
          required: ["title", "show"],
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            text: { type: "string" },
            show: { type: "array", minItems: 1, items: { type: "string" } },
          },
        },
      },
    },
  };
}
