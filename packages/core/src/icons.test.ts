import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { validateSpec, renderSvg, resolveIcon, configureIcons, syncPack, listIcons } from "./index.js";
import { parseSvg, prefixIds } from "./icons/sanitize.js";
import { slugFor } from "./icons/sync.js";

// Synthetic stand-ins for the official packages (same file-name conventions, made-up artwork).
const gradient = (c: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18"><defs><linearGradient id="a"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><rect width="18" height="18" rx="3" fill="url(#a)"/></svg>`;
const flat = (c: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${c}"/></svg>`;

let tmp: string;
let dest: string;

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), "dgm-icons-"));
  dest = join(tmp, ".dgm", "icons");

  const azure = join(tmp, "azure-src");
  mkdirSync(join(azure, "Icons", "app services"), { recursive: true });
  writeFileSync(join(azure, "Icons", "app services", "10035-icon-service-App-Services.svg"), gradient("#0078d4"));
  writeFileSync(join(azure, "Icons", "app services", "10021-icon-service-Virtual-Machine.svg"), gradient("#50e6ff"));
  writeFileSync(join(azure, "Icons", "app services", "10121-icon-service-Azure-Cosmos-DB.svg"), gradient("#59b4d9"));
  writeFileSync(join(azure, "Icons", "readme.svg"), gradient("#000")); // not a service icon
  await syncPack("azure", azure, dest);

  // AWS comes as a zip: only the 64px Arch_ icons count
  const zip = zipSync({
    "Architecture-Service-Icons_X/Arch_Compute/64/Arch_AWS-Lambda_64.svg": strToU8(flat("#ed7100")),
    "Architecture-Service-Icons_X/Arch_Compute/48/Arch_AWS-Lambda_48.svg": strToU8(flat("#000000")),
    "Architecture-Service-Icons_X/Arch_Storage/64/Arch_Amazon-Simple-Storage-Service_64.svg": strToU8(flat("#7aa116")),
    "Resource-Icons_X/Res_Compute/Res_Amazon-EC2_Instance_48.svg": strToU8(flat("#000000")),
  });
  const zipPath = join(tmp, "aws.zip");
  writeFileSync(zipPath, zip);
  await syncPack("aws", zipPath, dest);

  const my = join(tmp, "my-icons");
  mkdirSync(my);
  writeFileSync(join(my, "Company Logo.svg"), `<svg viewBox="0 0 10 10"><script>alert(1)</script><path onclick="x()" d="M0 0h10v10z" fill="red"/><image href="http://evil/x.png"/></svg>`);
  configureIcons({ root: tmp, iconsDir: dest, custom: [{ prefix: "my", dir: my, monochrome: true }] });
});

afterAll(() => {
  configureIcons({ root: process.cwd(), custom: [] });
  rmSync(tmp, { recursive: true, force: true });
});

describe("icon file-name rules", () => {
  it("azure: drops the number prefix and the Azure- prefix, keeps the full name as alternative", () => {
    expect(slugFor("azure", "x/10035-icon-service-App-Services.svg")).toEqual({ primary: "app-services", full: "app-services" });
    expect(slugFor("azure", "x/10121-icon-service-Azure-Cosmos-DB.svg")).toEqual({ primary: "cosmos-db", full: "azure-cosmos-db" });
    expect(slugFor("azure", "x/readme.svg")).toBeNull();
  });
  it("aws: only 64px Arch_ icons; strips Amazon-/AWS-", () => {
    expect(slugFor("aws", "A/Arch_AWS-Lambda_64.svg")).toEqual({ primary: "lambda", full: "aws-lambda" });
    expect(slugFor("aws", "A/Arch_Amazon-Simple-Storage-Service_64.svg")?.primary).toBe("simple-storage-service");
    expect(slugFor("aws", "A/Arch_AWS-Lambda_48.svg")).toBeNull();
    expect(slugFor("aws", "R/Res_Amazon-EC2_Instance_64.svg")).toBeNull();
    expect(slugFor("aws", "__MACOSX/A/._Arch_AWS-Lambda_64.svg")).toBeNull();
  });
  it("aws: group icons (containers) and resource icons are included; dark variants are not", () => {
    expect(slugFor("aws", "Architecture-Group-Icons_x/AWS-Account_32.svg")).toEqual({ primary: "account", full: "aws-account" });
    expect(slugFor("aws", "Architecture-Group-Icons_x/Public-subnet_32.svg")?.primary).toBe("public-subnet");
    expect(slugFor("aws", "Architecture-Group-Icons_x/AWS-Cloud_32_Dark.svg")).toBeNull();
    expect(slugFor("aws", "Resource-Icons_x/Res_Networking/Res_Amazon-VPC_NAT-Gateway_48.svg")).toEqual({ primary: "res-vpc-nat-gateway", full: "res-amazon-vpc-nat-gateway" });
    expect(slugFor("aws", "Resource-Icons_x/Res_Networking/Res_Amazon-VPC_NAT-Gateway_48_Dark.svg")).toBeNull();
  });
  it("generic packs ignore macOS metadata", () => {
    expect(slugFor("gcp", "__MACOSX/icons/._Compute Engine.svg")).toBeNull();
    expect(slugFor("gcp", "icons/Compute Engine.svg")?.primary).toBe("compute-engine");
  });
});

describe("resolving icons", () => {
  it("syncs only service icons, writing an index", () => {
    expect(listIcons("az").map((i) => i.ref)).toEqual(["az-app-services", "az-cosmos-db", "az-virtual-machine"]);
    expect(listIcons("aws").map((i) => i.ref)).toEqual(["aws-lambda", "aws-res-ec2-instance", "aws-simple-storage-service"]);
    expect(existsSync(join(dest, "azure", "index.json"))).toBe(true);
  });

  it("resolves short aliases and full names", () => {
    expect(resolveIcon("az-webapp")).toMatchObject({ ok: true, slug: "app-services" });
    expect(resolveIcon("az-vm")).toMatchObject({ ok: true, slug: "virtual-machine" });
    expect(resolveIcon("az-azure-cosmos-db")).toMatchObject({ ok: true, slug: "cosmos-db" });
    expect(resolveIcon("aws-lambda")).toMatchObject({ ok: true });
    expect(resolveIcon("aws-s3")).toMatchObject({ ok: true, slug: "simple-storage-service" });
  });

  it("resolves Lucide icons as themeable strokes", () => {
    const r = resolveIcon("lu-database");
    expect(r.ok && r.data.mono).toBe("stroke");
    expect(r.ok && r.data.viewBox).toBe("0 0 24 24");
    expect(resolveIcon("lu-hard-drive").ok).toBe(true);
  });

  it("custom packs: sanitised and recoloured when monochrome", () => {
    const r = resolveIcon("my-company-logo");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.inner).not.toMatch(/script|onclick|image|evil|fill="red"/);
    expect(r.data.mono).toBe("fill");
  });

  it("explains unknown names with suggestions, unknown prefixes, and missing packs", () => {
    const bad = resolveIcon("az-webap");
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.suggestions).toContain("az-webapp");
    expect(resolveIcon("zz-foo")).toMatchObject({ ok: false, error: expect.stringContaining("unknown icon prefix") });
    const empty = mkdtempSync(join(tmpdir(), "dgm-empty-"));
    configureIcons({ root: empty, custom: [] });
    const missing = resolveIcon("az-webapp");
    expect(missing.ok).toBe(false);
    expect(missing.ok ? "" : missing.error).toMatch(/dgm icons update/);
    rmSync(empty, { recursive: true, force: true });
    configureIcons({ root: tmp, iconsDir: dest, custom: [] });
  });
});

describe("sanitising", () => {
  it("strips scripts, handlers, foreignObject and external refs", () => {
    const d = parseSvg(`<?xml version="1.0"?><svg viewBox="0 0 5 5"><foreignObject><div/></foreignObject><a href="http://x"><path d="M0 0" onload="x()"/></a><use href="#ok"/></svg>`);
    expect(d.inner).not.toMatch(/foreignObject|onload|http/);
    expect(d.inner).toContain('href="#ok"');
  });
  it("prefixes ids and their references", () => {
    const out = prefixIds(`<defs><linearGradient id="a"/></defs><rect fill="url(#a)"/><use href="#a"/>`, "p");
    expect(out).toContain('id="p-a"');
    expect(out).toContain("url(#p-a)");
    expect(out).toContain('href="#p-a"');
  });
});

const spec = (nodes: any[]) => validateSpec({ nodes, edges: [] });

describe("rendering with icons", () => {
  it("validate: unknown icon is an error with a hint; missingIcons:warn downgrades it", () => {
    const r = spec([{ id: "a", label: "A", icon: "az-webap" }]);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/did you mean az-webapp/);
    const w = validateSpec({ nodes: [{ id: "a", label: "A", icon: "az-nope-nope" }] }, { missingIcons: "warn" });
    expect(w.ok).toBe(true);
    expect(w.warnings.length).toBe(1);
  });

  it("official icons are stacked and keep their colours; Lucide sits in a badge", async () => {
    const s = spec([
      { id: "web", label: "Web", icon: "az-webapp" },
      { id: "db", label: "DB", icon: "lu-database" },
    ]).spec!;
    const svg = await renderSvg(s);
    expect(svg).toMatch(/class="el node stacked/);
    expect(svg).toContain("<symbol");
    expect(svg).toMatch(/<g class="badge[^>]*>.*<use /s);
    expect(svg).toContain("stop-color=\"#0078d4\""); // untouched artwork
  });

  it("namespaces ids so two diagrams on one page cannot collide", async () => {
    const a = await renderSvg(spec([{ id: "web", label: "Web", icon: "az-webapp" }]).spec!);
    const b = await renderSvg(spec([{ id: "web2", label: "Other", icon: "az-webapp" }]).spec!);
    const grad = (s: string) => /id="(d[a-z0-9]+-azure-app-services-a)"/.exec(s)?.[1];
    expect(grad(a)).toBeTruthy();
    expect(grad(a)).not.toEqual(grad(b));
  });

  it("variant overrides the default; container icons render in the header", async () => {
    const card = await renderSvg(spec([{ id: "x", label: "X", icon: "az-webapp", variant: "card" }]).spec!);
    expect(card).not.toMatch(/node stacked/);
    const cont = await renderSvg(spec([{ id: "g", label: "Group", kind: "group", icon: "lu-cloud", children: [{ id: "c", label: "C" }] }]).spec!);
    expect(cont).toMatch(/class="el cont[^>]*>.*<use /s);
  });

  it("static output has no custom properties and still draws the icons", async () => {
    const svg = await renderSvg(spec([{ id: "d", label: "D", icon: "lu-database" }]).spec!, { static: true });
    expect(svg).not.toContain("var(--");
    expect(svg).toContain("<use ");
    expect(readFileSync).toBeTruthy();
  });
});

describe("inbox import", () => {
  it("detects Azure vs AWS zips, extracts them, deletes the zips, and leaves unknown ones", async () => {
    const { importInbox, detectPack } = await import("./index.js");
    const inbox = mkdtempSync(join(tmpdir(), "dgm-inbox-"));
    const out = mkdtempSync(join(tmpdir(), "dgm-out-"));
    writeFileSync(join(inbox, "azure.zip"), zipSync({ "Icons/10035-icon-service-App-Services.svg": strToU8(gradient("#0078d4")) }));
    writeFileSync(join(inbox, "aws.zip"), zipSync({ "A/Arch_AWS-Lambda_64.svg": strToU8(flat("#ed7100")) }));
    writeFileSync(join(inbox, "other.zip"), zipSync({ "readme.svg": strToU8(flat("#000")) }));
    writeFileSync(join(inbox, "notes.txt"), "ignored");

    expect(detectPack([{ path: "x/Arch_AWS-Lambda_64.svg" }])).toBe("aws");
    const r = importInbox(inbox, out);
    const by = Object.fromEntries(r.map((x) => [x.file, x]));
    expect(by["azure.zip"]).toMatchObject({ status: "imported", pack: "azure", count: 1, deleted: true });
    expect(by["aws.zip"]).toMatchObject({ status: "imported", pack: "aws", count: 1 });
    expect(by["other.zip"].status).toBe("skipped");
    expect(existsSync(join(inbox, "azure.zip"))).toBe(false);
    expect(existsSync(join(inbox, "other.zip"))).toBe(true);
    expect(existsSync(join(out, "azure", "index.json"))).toBe(true);

    // --keep keeps the zip
    writeFileSync(join(inbox, "azure2.zip"), zipSync({ "Icons/10035-icon-service-App-Services.svg": strToU8(gradient("#0078d4")) }));
    expect(importInbox(inbox, out, { keep: true }).find((x) => x.file === "azure2.zip")?.deleted).toBe(false);
    expect(existsSync(join(inbox, "azure2.zip"))).toBe(true);
    rmSync(inbox, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  });
});

describe("inbox: folder name is the pack", () => {
  it("imports icons-inbox/<pack>/*.zip, including generic packs like gcp, and resolves them by prefix", async () => {
    const { importInbox } = await import("./index.js");
    const inbox = mkdtempSync(join(tmpdir(), "dgm-inbox2-"));
    const out = join(inbox, "out");
    for (const d of ["azure", "aws", "gcp"]) mkdirSync(join(inbox, d));
    writeFileSync(join(inbox, "azure", "Azure_Public_Service_Icons_V99.zip"), zipSync({ "Azure_Public_Service_Icons/Icons/compute/10021-icon-service-Virtual-Machine.svg": strToU8(gradient("#50e6ff")) }));
    writeFileSync(join(inbox, "aws", "Asset-Package_x.zip"), zipSync({ "Architecture-Service-Icons_x/Arch_Compute/64/Arch_AWS-Lambda_64.svg": strToU8(flat("#ed7100")) }));
    writeFileSync(join(inbox, "gcp", "gcp-icons.zip"), zipSync({ "icons/Compute Engine.svg": strToU8(flat("#4285f4")), "icons/readme.txt": strToU8("x") }));
    writeFileSync(join(inbox, "aws", "wrong.zip"), zipSync({ "just-a-logo.svg": strToU8(flat("#000")) })); // not an AWS package

    const r = importInbox(inbox, out);
    const by = Object.fromEntries(r.map((x) => [x.file, x]));
    expect(by["azure/Azure_Public_Service_Icons_V99.zip"]).toMatchObject({ status: "imported", pack: "azure", count: 1 });
    expect(by["aws/Asset-Package_x.zip"]).toMatchObject({ status: "imported", pack: "aws" });
    expect(by["gcp/gcp-icons.zip"]).toMatchObject({ status: "imported", pack: "gcp", count: 1 });
    expect(by["aws/wrong.zip"].status).toBe("error"); // left in place, nothing overwritten
    expect(existsSync(join(inbox, "aws", "wrong.zip"))).toBe(true);
    expect(existsSync(join(inbox, "gcp", "gcp-icons.zip"))).toBe(false);

    configureIcons({ root: inbox, iconsDir: out, custom: [] });
    expect(resolveIcon("gcp-compute-engine")).toMatchObject({ ok: true, pack: "gcp" });
    expect(listIcons("gcp").map((i) => i.ref)).toEqual(["gcp-compute-engine"]);
    expect(resolveIcon("az-vm")).toMatchObject({ ok: true });
    configureIcons({ root: process.cwd(), custom: [] });
    rmSync(inbox, { recursive: true, force: true });
  });
});
