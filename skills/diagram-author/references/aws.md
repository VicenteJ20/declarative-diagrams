# AWS architecture patterns

## Hierarchy (outermost → innermost)

`aws.org` › `aws.account` › `aws.region` › `aws.vpc` › `aws.az` › `aws.subnet` › resource.

Container icons (official **group** icons): `aws-account`, `aws-cloud`, `aws-region`, `aws-vpc-group`, `aws-public-subnet`,
`aws-private-subnet`, `aws-auto-scaling-group`, `aws-datacenter` (corporate data center). Regional services that are not "inside"
a VPC (S3, DynamoDB, CloudFront, Route 53, SQS…) sit in the account/region container but **outside** the VPC.

## Common resources (official icon aliases)

| Resource | Icon |
|---|---|
| EC2 / Lambda / Fargate | `aws-ec2` / `aws-lambda` / `aws-fargate` |
| ECS / EKS / ECR | `aws-ecs` / `aws-eks` / `aws-ecr` |
| ALB / NLB (Elastic Load Balancing) | `aws-alb` |
| API Gateway / CloudFront / Route 53 | `aws-apigw` / `aws-cloudfront` / `aws-route53` |
| S3 / EBS / EFS | `aws-s3` / `aws-ebs` / `aws-efs` |
| RDS / Aurora / DynamoDB / ElastiCache | `aws-rds` / `aws-aurora` / `aws-dynamodb` / `aws-elasticache` |
| SQS / SNS / EventBridge / Step Functions | `aws-sqs` / `aws-sns` / `aws-eventbridge` / `aws-step-functions` |
| IAM / Cognito / KMS / Secrets Manager / WAF | `aws-iam` / `aws-cognito` / `aws-kms` / `aws-secrets-manager` / `aws-waf` |
| CloudWatch / CloudTrail | `aws-cloudwatch` / `aws-cloudtrail` |
| NAT / Internet gateway (resource icons) | `aws-nat` / `aws-internet-gateway` |
| Transit Gateway / Direct Connect / VPN | `aws-tgw` / `aws-direct-connect` / `aws-vpn` |

Resource-level icons (`aws-res-…`) exist for things like NAT and IGW: `search_icons query=nat pack=aws`.

## Pattern 1 — containerised API in a VPC

```yaml
type: architecture
look: official
title: Containerised API on AWS
nodes:
  - { id: users, label: Users, icon: lu-users }
  - { id: cdn, label: CloudFront, icon: aws-cloudfront }
  - id: acct
    label: production
    kind: aws.account
    icon: aws-account
    children:
      - id: vpc
        label: vpc-main
        kind: aws.vpc
        icon: aws-vpc-group
        children:
          - id: pub
            label: public subnet
            kind: aws.subnet
            icon: aws-public-subnet
            children:
              - { id: alb, label: Load balancer, icon: aws-alb }
          - id: priv
            label: private subnet
            kind: aws.subnet
            icon: aws-private-subnet
            children:
              - { id: ecs, label: API service, sublabel: ECS Fargate, icon: aws-ecs }
              - { id: db, label: Orders, icon: aws-rds }
      - { id: s3, label: Exports, icon: aws-s3 }
edges:
  - { from: users, to: cdn, label: HTTPS, flow: true }
  - { from: cdn, to: alb, flow: true }
  - { from: alb, to: ecs, flow: true }
  - { from: ecs, to: db }
  - { from: ecs, to: s3, style: dashed }
notes:
  - { target: db, text: Multi-AZ; only reachable from the private subnet's security group. }
```

## Pattern 2 — serverless API

```yaml
type: architecture
look: official
title: Serverless API
nodes:
  - { id: users, label: Users, icon: lu-users }
  - id: acct
    label: production
    kind: aws.account
    icon: aws-account
    children:
      - { id: cognito, label: Cognito, icon: aws-cognito }
      - { id: apigw, label: API Gateway, icon: aws-apigw }
      - { id: fn, label: Orders, sublabel: Lambda, icon: aws-lambda }
      - { id: ddb, label: Orders table, icon: aws-dynamodb }
      - { id: q, label: Events, icon: aws-sqs }
edges:
  - { from: users, to: apigw, label: HTTPS, flow: true }
  - { from: apigw, to: cognito, style: dashed, label: authorise }
  - { from: apigw, to: fn, flow: true }
  - { from: fn, to: ddb }
  - { from: fn, to: q, style: dashed }
```

## Pattern 3 — two availability zones

Inside the VPC, one `aws.az` container per zone, each holding its subnets; put the load balancer **in the VPC but outside the AZ
containers** (it spans them). Use a dashed edge with `label: replication` between the two database nodes.

## House style for AWS diagrams — always `look: official`

Every AWS diagram uses the vendor look, so they all read like the diagrams in AWS documentation and connect the same way.
Reference: `examples/aws-genai-chatbot.diagram.yaml`. Follow this recipe; do not improvise.

1. **Header.** `look: official`, `title` (what it is) and `subtitle` (one sentence: the purpose). `direction: RIGHT`, `notesPosition: below`.
2. **AWS Cloud.** One `kind: cloud`, `icon: aws-cloud` container ("AWS Cloud" with the dark logo tab) holds every AWS service. Actors and
   on-premises things stay **outside** it, with Lucide icons (`lu-user`, `lu-monitor`, `lu-files`). Do not put an AWS service outside.
3. **Groups** (outlined, no fill unless noted). Kind gives the default, `color`/`border` override it:

   | Group | Spec |
   |---|---|
   | Region / AZ | `aws.region` (teal dashed) / `aws.az` (blue dashed) |
   | VPC | `aws.vpc` + `icon: aws-vpc-group` (green) |
   | Public / private subnet | `aws.subnet` + `icon: aws-public-subnet` `color: "#7AA116"`, `border: tinted` / `aws-private-subnet` (blue, tinted) |
   | ECS cluster, Auto Scaling group | `kind: group`, `color: "#ED7100"`, `border: dashed`, icon `aws-ecs` / `aws-auto-scaling-group` |
   | Step Functions workflow, other logical groups | `kind: group`, `color: "#E7157B"`, `border: solid` (workflow) or grey dashed |

4. **Icons.** Official `aws-*` for services (find them with `search_icons`, never guess; if a new service has no icon in the imported pack,
   use the closest parent service icon and say so). Label = service name, `sublabel` = its role ("Orchestrator", "Embeddings").
   Auxiliary services that annotate a flow (EventBridge Scheduler, WAF, Route 53, Lambda@Edge) are their own node next to the node they act on,
   joined with a **dashed** edge (`stackWith` the main node keeps them beside it).
5. **Connectors.** Thin black lines; arrow = direction of the request. Few or no labels (protocol only when it matters).
   `flow: true` on the one main path, `style: dashed` for triggers, schedules, security and control. Never draw two edges between the same pair.
6. **Numbering.** Write one `note` per reading step, **in reading order**: they become the square blue numbers on the diagram and the numbered
   legend below it (target = the node where the step happens). Do not also set `badge` on those nodes. Add `steps` that replay each note.
7. **Check the connections** (the renderer does it for you; this is what you must do with the result):
   - the render report must not contain any `connection check:` / `CONNECTION CHECK:` line. Each line names a connector that runs through a
     node or two arrowheads on one point. Fix by reordering nodes, `stackWith`, splitting a fan-out, or removing a redundant edge;
   - every arrow must end on an icon and have its own arrowhead; no connector may cross an icon; look at the PNG for lines that wander.
8. **Group by responsibility.** For anything over ~12 icons, wrap related services in logical groups (`kind: group`, grey dashed): e.g. *Web delivery* (CloudFront, Route 53, WAF, S3), *Chat backend* (API Gateway, Cognito, Lambdas, data stores) and *Ingestion* (schedulers, ECS, S3, Step Functions). Groups keep each service next to its neighbours, so the layout reads as rectangles instead of a diagonal staircase; edges between groups are allowed.
9. **Use the space.** Actors and on-premises sources → `placement: left`; consumers / identity → `placement: right`; never leave a node without an edge. Edge labels ≤ 14 characters or none; a `label overlaps` line in the connection check means shorten it. Do not nest more than 4 container levels.
10. **Repeatability.** Same inputs → same picture: do not hand-tune coordinates (there are none). Keep ids kebab-case, nodes in reading order,
   and commit the `*.diagram.yaml` next to its exported `.png`/`.svg`.

## Tips

- Multi-account (organisation) diagrams: one `aws.account` container per account side by side; label cross-account edges
  (`assume role`, `VPC peering`, `TGW`).
- Don't draw security groups as boxes around everything; mention them in a note on the resource they protect.
- Long chains (CloudFront → WAF → ALB → ECS → RDS) read well with `direction: RIGHT`.
