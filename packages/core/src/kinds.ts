/** Visual vocabulary: how each `kind` looks. Palette follows Distill: purple / blue / pink / grey. */
export type Tone = "compute" | "data" | "network" | "neutral";

export interface Glyph {
  /** SVG path in a ~12x12 box centred on 0,0 (stroked, not filled). */
  path?: string;
  text?: string;
}

export interface KindDef {
  /** Outline shape for leaf nodes (default rect with a glyph badge). */
  shape?: "pill" | "diamond" | "plain" | "entity";
  /** Small uppercase tag shown in a container header. */
  tag?: string;
  tone: Tone;
  glyph: Glyph;
}

const G = {
  box: { path: "M-4 -4h8v8h-8z" },
  database: { path: "M-5 -4a5 2 0 0 1 10 0a5 2 0 0 1 -10 0v8a5 2 0 0 0 10 0v-8" },
  compute: { path: "M-5 -4h10v6h-10z M-2 5h4 M0 2v3" },
  fn: { text: "λ" },
  queue: { path: "M-5 0h8 M0 -4l4 4l-4 4" },
  storage: { path: "M-5 -3h10v7h-10z M-5 -3l2 -2h6l2 2" },
  globe: { path: "M-5 0a5 5 0 1 0 10 0a5 5 0 1 0 -10 0 M-5 0h10 M0 -5a2.5 5 0 0 1 0 10a2.5 5 0 0 1 0 -10" },
  firewall: { path: "M-5 -4h10v8h-10z M-5 0h10 M0 -4v4 M-2.5 0v4" },
  lb: { path: "M-5 0h3 M-2 0l4 -4h3 M-2 0l4 4h3" },
  user: { path: "M-2.5 -2.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0 M-5 5a5 4 0 0 1 10 0" },
  lock: { path: "M-4 -1h8v6h-8z M-2.5 -1v-2a2.5 2.5 0 0 1 5 0v2" },
  bolt: { path: "M1 -5l-4 6h4l-1 4l5 -7h-4z" },
  monitor: { path: "M-5 -4h10v7h-10z M-2 5h4" },
  cloud: { path: "M-5 3a3 3 0 0 1 1 -6a4 4 0 0 1 7 1a2.5 2.5 0 0 1 0 5z" },
};

export const KINDS: Record<string, KindDef> = {
  // generic leaves
  service: { tone: "compute", glyph: G.box },
  compute: { tone: "compute", glyph: G.compute },
  function: { tone: "compute", glyph: G.fn },
  container: { tone: "compute", glyph: G.box },
  database: { tone: "data", glyph: G.database },
  storage: { tone: "data", glyph: G.storage },
  cache: { tone: "data", glyph: G.bolt },
  queue: { tone: "data", glyph: G.queue },
  gateway: { tone: "network", glyph: G.globe },
  firewall: { tone: "network", glyph: G.firewall },
  "load-balancer": { tone: "network", glyph: G.lb },
  dns: { tone: "network", glyph: G.globe },
  identity: { tone: "neutral", glyph: G.lock },
  secret: { tone: "neutral", glyph: G.lock },
  monitor: { tone: "neutral", glyph: G.monitor },
  user: { tone: "neutral", glyph: G.user },
  external: { tone: "neutral", glyph: G.cloud },
  // flowchart
  start: { shape: "pill", tone: "neutral", glyph: G.box },
  end: { shape: "pill", tone: "neutral", glyph: G.box },
  process: { shape: "plain", tone: "compute", glyph: G.box },
  decision: { shape: "diamond", tone: "network", glyph: G.box },
  io: { shape: "plain", tone: "data", glyph: G.box },
  // entity-relationship
  entity: { shape: "entity", tone: "data", glyph: G.box },
  // generic containers
  group: { tone: "neutral", glyph: G.box },
  cloud: { tag: "Cloud", tone: "neutral", glyph: G.cloud },
  onprem: { tag: "On-premises", tone: "neutral", glyph: G.box },
  network: { tag: "Network", tone: "network", glyph: G.box },
  subnet: { tag: "Subnet", tone: "network", glyph: G.box },
  // Azure containers
  "azure.tenant": { tag: "Tenant", tone: "neutral", glyph: G.box },
  "azure.management-group": { tag: "Management group", tone: "neutral", glyph: G.box },
  "azure.subscription": { tag: "Subscription", tone: "neutral", glyph: G.box },
  "azure.resource-group": { tag: "Resource group", tone: "neutral", glyph: G.box },
  "azure.vnet": { tag: "Virtual network", tone: "network", glyph: G.box },
  "azure.subnet": { tag: "Subnet", tone: "network", glyph: G.box },
  // AWS containers
  "aws.org": { tag: "Organization", tone: "neutral", glyph: G.box },
  "aws.account": { tag: "Account", tone: "neutral", glyph: G.box },
  "aws.region": { tag: "Region", tone: "neutral", glyph: G.box },
  "aws.vpc": { tag: "VPC", tone: "network", glyph: G.box },
  "aws.az": { tag: "Availability zone", tone: "neutral", glyph: G.box },
  "aws.subnet": { tag: "Subnet", tone: "network", glyph: G.box },
};

export const FALLBACK: KindDef = { tone: "compute", glyph: G.box };
export const kindOf = (k?: string): KindDef => (k && KINDS[k]) || FALLBACK;
