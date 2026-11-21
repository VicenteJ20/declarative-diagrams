# Icons

`icon: <prefix>-<name>` on any node (leaf or container).

| Prefix | Pack | Default look |
|---|---|---|
| `az-` | Official Azure architecture icons (imported locally) | stacked: big icon, label under it, no box |
| `aws-` | Official AWS architecture icons (imported locally): services, categories, **groups** (account, VPC, subnets, region…) and **resources** (`aws-res-…`) | stacked |
| `lu-` | Lucide (bundled, 2400+ line icons) | card: themeable icon in a circular badge |
| `<prefix>-` | Project packs from `dgm.config.json` (`{ "icons": [{ "prefix": "my", "dir": "./icons" }] }`) | stacked |
| other synced packs (e.g. `gcp-`) | any folder under `icons-inbox/<pack>/` imported with `update_icons` | stacked |

Override per node with `variant: card|stacked`. Official icons are never recoloured (brand rules); Lucide/monochrome icons follow the
theme.

## Finding the right name

1. `list_icon_packs` — which packs are installed.
2. `search_icons query="sql" pack=az` — returns real refs (`az-sql-database`, `az-sql-managed-instance`…).
3. Short aliases also resolve and are easier to remember: `az-webapp`, `az-vm`, `az-aks`, `az-keyvault`, `az-vnet`, `az-sql`,
   `aws-s3`, `aws-ec2`, `aws-rds`, `aws-vpc`, `aws-alb`, `aws-apigw`, `aws-nat`… An alias wins over an exact slug.
4. A wrong name fails validation with suggestions: use them, don't retry blindly.

## Installing the official packs (needs the user)

Microsoft and AWS publish the icons as zips on their pages; the tool does not bundle or download them.
Tell the user:

1. Download the zip(s): Azure — https://learn.microsoft.com/azure/architecture/icons/ · AWS — https://aws.amazon.com/architecture/icons/
2. Drop each zip in `icons-inbox/azure/` / `icons-inbox/aws/` (the folder name is the pack id; `icons-inbox/gcp/` etc. work too).
3. Run `dgm icons update` (or the `update_icons` tool). The zips are extracted to `.dgm/icons/` and deleted (the tool keeps them
   unless `keep=false`). Nothing is committed to git.

If a pack is missing, don't block: use `lu-` icons or `allow_missing_icons` (a generic glyph is drawn) and mention it.

## Gotchas

- Azure has no "Entra ID" service icon; use `lu-key-round` / `lu-shield-check` or an `az-entra-*` sub-service.
- AWS resource icons are 48 px "resource" glyphs (NAT, IGW, instance…); service icons are the 64 px squares.
- Containers can have icons (shown in the header): use the official group icons for AWS accounts/VPCs/subnets and
  `az-subscription` / `az-resource-group` / `az-vnet` for Azure.
- Build servers (CI) don't have `.dgm/icons`: the Vite plugin option `missingIcons: "glyph"` degrades instead of failing.
