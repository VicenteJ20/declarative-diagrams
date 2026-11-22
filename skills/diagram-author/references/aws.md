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

## Vendor-style (official) look

For diagrams that should look like the ones in AWS documentation, set `look: official` (see `examples/aws-genai-chatbot.diagram.yaml`): the `kind: cloud` container with the `aws-cloud` icon becomes the dark **AWS Cloud** tab, groups are outlined (`aws.vpc` green, `aws.subnet` tinted, logical groups `border: dashed` + `color`), every icon is big and flat with the label below, steps are square blue numbers (`notes` + `notesPosition: below` give the numbered legend), and connectors are thin black lines. Prefer few edge labels in this look; use `subtitle` for the one-line purpose.

## Tips

- Multi-account (organisation) diagrams: one `aws.account` container per account side by side; label cross-account edges
  (`assume role`, `VPC peering`, `TGW`).
- Don't draw security groups as boxes around everything; mention them in a note on the resource they protect.
- Long chains (CloudFront → WAF → ALB → ECS → RDS) read well with `direction: RIGHT`.
