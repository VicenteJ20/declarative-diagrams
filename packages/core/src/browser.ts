// Browser entry (`@declarative-diagrams/core/browser`): parse, validate, lay out and render a spec to an interactive SVG string
// entirely on the client (ELK runs in the page). No file system, no PNG export (native), no project config.
// Only the bundled Lucide icons resolve here; Azure/AWS packs and custom packs are read from disk by the Node entries.
export { parseSpecText, validateSpec, applyVariant, specJsonSchema, SpecSchema } from "./spec.js";
export type { DiagramSpec, NodeSpec, ValidationResult } from "./spec.js";
export { layoutSpec } from "./layout.js";
export { renderSvg, renderLayout } from "./render.js";
export type { RenderOptions, Look } from "./render.js";
export { attach } from "./runtime.js";
export { KINDS } from "./kinds.js";
export { listIcons } from "./icons/store.js";
export * from "./themes/index.js";
export { parseThemeDef } from "./themes/schema.js";
export { canvasAdvice, checkConnections, svgSize } from "./diagnostics.js";
export type { CanvasAdvice } from "./diagnostics.js";
