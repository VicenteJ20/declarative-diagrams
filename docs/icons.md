# Icons

Any node (leaf or container) takes `icon: <prefix>-<name>`:

```yaml
- { id: web, label: App Service, icon: az-webapp }     # Azure (official)
- { id: fn,  label: Orders,      icon: aws-lambda }     # AWS (official)
- { id: db,  label: Cache,       icon: lu-database }    # Lucide (bundled)
- { id: x,   label: Mine,        icon: my-logo }        # your own pack
```

| Prefix | Source | Drawn as (default) |
|---|---|---|
| `az-` | Official Azure architecture icons | **stacked**: big icon, label under it, no box (the Azure/AWS diagram convention) |
| `aws-` | Official AWS architecture icons | stacked |
| `lu-` | [Lucide](https://lucide.dev) via the `lucide` package (2400+ icons, bundled) | **card**: themeable stroke icon in the Distill circular badge |
| `<prefix>-` | Your SVG folder (`dgm.config.json`) | stacked |

Override per node with `variant: card | stacked`. Official icons are never recoloured (brand guidelines); the theme only
changes what surrounds them. Lucide and `monochrome` custom icons follow the theme's `icon-ink`.

## Official Azure / AWS packs — synced locally, never committed

Microsoft and AWS allow their icons in architecture diagrams and documentation, but redistribution inside a package or
repo is not clearly allowed, so this project ships **none**. You import the official download once:

1. Download the Azure icons (<https://learn.microsoft.com/azure/architecture/icons/>) and/or the AWS icons
   (<https://aws.amazon.com/architecture/icons/>) — read their terms.
2. Import them (zip, extracted folder, or a URL you control):

```
dgm icons sync azure --from ~/Downloads/Azure_Public_Service_Icons_V23.zip
dgm icons sync aws   --from ~/Downloads/Asset-Package_01302025.zip
dgm icons packs                      # what is installed
dgm icons search app                 # find names:  az-app-services, aws-app-runner …
```

Files go to `.dgm/icons/<azure|aws>/` (searched upwards from the project, or `DGM_ICONS_DIR`, or `iconsDir` in
`dgm.config.json`). `.dgm/` is in `.gitignore`.

**Names.** Slugs come from the official file names, lower-cased (`10035-icon-service-App-Services.svg` → `az-app-services`,
`Arch_AWS-Lambda_64.svg` → `aws-lambda`; a leading `Azure-`, `Amazon-` or `AWS-` is dropped, the full name still works).
Short aliases are built in (`az-webapp`, `az-vm`, `az-sql`, `az-aks`, `az-keyvault`, `az-vnet`, `aws-s3`, `aws-ec2`,
`aws-rds`, `aws-vpc`… — `dgm icons aliases azure|aws`). A wrong name fails with suggestions
(`unknown Azure icon "webap" — did you mean az-webapp?`).

**CI / deployment.** The build needs the packs too. Either add a step before the build
(`dgm icons sync azure --from $AZURE_ICONS_URL`, a private URL you control), or let the build degrade:
`dgm({ missingIcons: "glyph" })` (Vite plugin) / `--allow-missing-icons` (CLI) render the node's built-in glyph with a warning.

## Your own icons

```json
// dgm.config.json
{ "icons": [{ "prefix": "my", "dir": "./icons", "monochrome": false }] }
```

Every `*.svg` becomes `my-<file-name>` (lower-cased, non-alphanumerics → `-`). `monochrome: true` strips fills/strokes so the
theme colours them. All SVGs are sanitised (scripts, event handlers, `foreignObject`, external references are removed) and
their internal ids are namespaced per diagram, so several diagrams on one page never clash.
