# Spec reference

A diagram is a `*.diagram.yaml` (or `.json`) file. The authoritative definitions are generated from the code:

```bash
dgm schema        # full JSON Schema of the spec (use it for editor autocompletion/validation)
dgm kinds         # node kinds (azure.subscription, aws.vpc, …) and tones
dgm validate f    # errors and warnings, with "did you mean …" fixes
```

The human-readable reference, with Azure/AWS patterns and the style checklist, is the Skill's guide:
[`skills/diagram-author/references/spec.md`](../skills/diagram-author/references/spec.md) (also served by the MCP tool
`get_authoring_guide`). Ready-made specs: [`examples/`](../examples). See also [themes](themes.md), [layout](layout.md), [icons](icons.md).
