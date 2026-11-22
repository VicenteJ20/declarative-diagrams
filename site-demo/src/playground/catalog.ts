// The examples offered by the playground. Everything comes from /examples, so the docs, the README and the demo never drift apart.
import hello from "../../../examples/hello.diagram.yaml?raw";
import landingZone from "../../../examples/azure-landing-zone.diagram.yaml?raw";
import localFirst from "../../../examples/local-first-app.diagram.yaml?raw";
import loginFlow from "../../../examples/login-flow.diagram.yaml?raw";
import releasePipeline from "../../../examples/release-pipeline.diagram.yaml?raw";
import shopEr from "../../../examples/shop-er.diagram.yaml?raw";
import iconsLucide from "../../../examples/icons-lucide.diagram.yaml?raw";
import awsChatbot from "../../../examples/aws-genai-chatbot.diagram.yaml?raw";
import awsIcons from "../../../examples/aws-icons.diagram.yaml?raw";
import azureRag from "../../../examples/azure-rag-landing-zone.diagram.yaml?raw";
import azureIcons from "../../../examples/azure-icons.diagram.yaml?raw";

export type Group = "Featured" | "AWS" | "Azure" | "Architecture" | "Flows" | "Data" | "Start";
// Order of the picker: the flagship first, then the pre-rendered cloud diagrams, then the smaller examples.
export const GROUPS: Group[] = ["Featured", "AWS", "Azure", "Architecture", "Flows", "Data", "Start"];

/** The example loaded when the playground opens. */
export const DEFAULT_ID = "landing-zone";

export interface Example {
  id: string;
  group: Group;
  title: string;
  /** One line shown under the picker. */
  blurb: string;
  yaml: string;
  /** Built-in theme applied when the example is opened. */
  theme: string;
  /**
   * Cloud examples use the official AWS / Azure icons. Those packs are not bundled (licences), so these diagrams are
   * pre-rendered at build time (`npm run gallery`) and shown read-only.
   */
  prerendered?: boolean;
  /** A phone version was pre-rendered too (`<id>.narrow.svg`). */
  narrow?: boolean;
}

export const EXAMPLES: Example[] = [
  { id: "hello", group: "Start", title: "Hello, diagrams", blurb: "The smallest useful diagram. Edit it: the picture redraws as you type.", yaml: hello, theme: "" },
  { id: "landing-zone", group: "Featured", title: "Azure landing zone", blurb: "Zones, boxed icon + label nodes, numbered notes, steps — in the Distill look, themeable.", yaml: landingZone, theme: "" },
  { id: "local-first", group: "Architecture", title: "Local-first app + optional cloud", blurb: "On-premises zones with a cloud box placed below (placement: below).", yaml: localFirst, theme: "" },
  { id: "icons", group: "Architecture", title: "Icons and tones", blurb: "Lucide icons on cards, with a semantic tone (data, warn…).", yaml: iconsLucide, theme: "" },
  { id: "login-flow", group: "Flows", title: "Login with optional MFA", blurb: "A flowchart: start, process, decision and end shapes.", yaml: loginFlow, theme: "" },
  { id: "release-pipeline", group: "Flows", title: "Release pipeline with rollback", blurb: "Decisions, a rollback branch and step-by-step scenarios.", yaml: releasePipeline, theme: "" },
  { id: "shop-er", group: "Data", title: "Shop data model (ER)", blurb: "Entities with typed fields, keys and cardinality labels.", yaml: shopEr, theme: "" },
  { id: "aws-genai-chatbot", group: "AWS", title: "GenAI chatbot (RAG)", blurb: "AWS house style (look: official): groups, numbered legend, one connector per port.", yaml: awsChatbot, theme: "aws", prerendered: true, narrow: true },
  { id: "aws-icons", group: "AWS", title: "Containerised API", blurb: "VPC, subnets, account and official service icons.", yaml: awsIcons, theme: "aws", prerendered: true },
  { id: "azure-rag-landing-zone", group: "Azure", title: "Enterprise RAG landing zone", blurb: "Azure house style (look: azure): tenant, subscriptions, vnets, subnets, private endpoints.", yaml: azureRag, theme: "azure", prerendered: true, narrow: true },
  { id: "azure-icons", group: "Azure", title: "Web app on Azure", blurb: "Subscription, gateway, App Service, SQL and Key Vault with official icons.", yaml: azureIcons, theme: "azure", prerendered: true },
];

export const THEMES = ["olive", "distill", "azure", "aws", "orange", "slate", "mono"];
