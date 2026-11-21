# Azure architecture patterns

## Hierarchy (outermost → innermost)

`azure.tenant` › `azure.management-group` › `azure.subscription` › `azure.resource-group` › `azure.vnet` › `azure.subnet` › resource.

Draw only the levels the reader needs. A typical application diagram starts at the **subscription**; a landing-zone diagram
starts at the **management group**. Resource groups group *lifecycle*, VNets/subnets group *network*: a resource can sit in a
resource group (ownership) **and** be shown inside a subnet (network) — pick the one that matters for the message, don't nest both
unless it is true (e.g. `rg › vnet › subnet › vm`).

Container icons: `az-subscription`, `az-resource-group`, `az-vnet` (virtual networks), `az-subnet`, `az-management-group`.

## Common resources (official icon aliases)

| Resource | Icon |
|---|---|
| App Service | `az-webapp` |
| Functions | `az-functions` |
| AKS | `az-aks` |
| Virtual machine | `az-vm` |
| Container Registry | `az-acr` |
| SQL Database / Cosmos DB / Redis | `az-sql` / `az-cosmos` / `az-redis` |
| Storage account | `az-storage` |
| Key Vault | `az-keyvault` |
| Managed identity | `az-managed-identity` |
| App Gateway / Front Door / Load Balancer | `az-appgw` / `az-front-door` / `az-lb` |
| Firewall / Bastion / NSG | `az-firewall` / `az-bastion` / `az-nsg` |
| Private endpoint | `az-private-endpoint` |
| VPN / ExpressRoute | `az-vpn` / `az-expressroute` |
| Service Bus / Event Hubs / Event Grid | `az-servicebus` / `az-eventhub` / `az-eventgrid` |
| API Management | `az-apim` |
| Log Analytics / App Insights / Monitor | `az-loganalytics` / `az-appinsights` / `az-monitor` |
| Defender / Sentinel | `az-defender` / `az-sentinel` |

There is **no Microsoft Entra ID icon** in the official service pack (only `az-entra-*` sub-services such as
`az-entra-connect`); use `lu-key-round` or `lu-shield-check` for "identity provider". Use `search_icons` for anything else.

## Pattern 1 — three-tier web app in one subscription

```yaml
type: architecture
title: Three-tier web app on Azure
nodes:
  - { id: users, label: Users, icon: lu-users }
  - id: sub
    label: prod-workload
    kind: azure.subscription
    icon: az-subscription
    children:
      - { id: agw, label: App Gateway, sublabel: WAF v2, icon: az-appgw }
      - id: vnet
        label: vnet-app
        kind: azure.vnet
        icon: az-vnet
        children:
          - id: snet-app
            label: snet-app
            kind: azure.subnet
            children:
              - { id: web, label: App Service, icon: az-webapp }
          - id: snet-data
            label: snet-data
            kind: azure.subnet
            children:
              - { id: sql, label: SQL Database, icon: az-sql }
              - { id: kv, label: Key Vault, icon: az-keyvault }
      - { id: mon, label: Log Analytics, icon: az-loganalytics }
edges:
  - { from: users, to: agw, label: HTTPS, flow: true }
  - { from: agw, to: web, flow: true }
  - { from: web, to: sql, label: private endpoint, flow: true }
  - { from: web, to: kv, style: dashed, label: managed identity }
  - { from: web, to: mon, style: dashed }
notes:
  - { target: sql, text: Public network access is disabled; only the private endpoint reaches it. }
steps:
  - { title: A request arrives, show: [users, agw, web] }
  - { title: The app reads data, show: [web, sql, kv] }
```

## Pattern 2 — hub-and-spoke

```yaml
type: architecture
title: Hub-and-spoke network
nodes:
  - { id: onprem, label: On-premises, kind: onprem }
  - id: sub-conn
    label: connectivity
    kind: azure.subscription
    icon: az-subscription
    children:
      - id: hub
        label: vnet-hub
        kind: azure.vnet
        icon: az-vnet
        children:
          - { id: fw, label: Azure Firewall, icon: az-firewall }
          - { id: vpn, label: VPN Gateway, icon: az-vpn }
          - { id: bastion, label: Bastion, icon: az-bastion }
  - id: sub-prod
    label: landing-zone-prod
    kind: azure.subscription
    icon: az-subscription
    children:
      - id: spoke1
        label: vnet-spoke-app
        kind: azure.vnet
        icon: az-vnet
        children:
          - { id: app, label: AKS, icon: az-aks }
          - { id: db, label: SQL Database, icon: az-sql }
edges:
  - { from: onprem, to: vpn, label: IPsec, flow: true }
  - { from: vpn, to: fw }
  - { from: fw, to: app, label: peering, flow: true }
  - { from: app, to: db, label: private endpoint }
  - { from: bastion, to: app, style: dashed, label: admin }
notes:
  - { target: fw, text: All spoke-to-spoke and egress traffic is forced through the firewall with UDRs. }
```

## Pattern 3 — private PaaS access

Show the **VNet**, the **private endpoint** as its own node inside the subnet, and the PaaS resource (outside or in its own
container) with the edge labelled `Private Link`. Avoid drawing service endpoints and private endpoints in the same picture.

## Tips

- Management group / tenant levels make the picture wide: use `direction: DOWN` for governance diagrams.
- Cross-subscription traffic: keep the two subscriptions side by side and label the edge (peering, private link, ExpressRoute).
- Per-environment copies (dev/test/prod): one diagram with the pattern + a note, not three copies.
