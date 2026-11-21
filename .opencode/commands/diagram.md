---
agent: diagram-specialist
description: Create or update a diagram from an idea (validates, previews, saves)
---
Use the `diagram-author` skill and the `dgm` MCP tools to make this diagram:

$ARGUMENTS

Follow the skill's workflow: read the authoring guide for the right topic, find icons with `dgm_search_icons` (never guess
names), write the spec, `dgm_validate_diagram`, `dgm_render_diagram` and look at the PNG before iterating, then save it with
`dgm_write_diagram` (default `src/diagrams/<name>.diagram.yaml` unless I said otherwise) and export what I asked for.
If something blocks you (cloud, level of detail), state the assumption and continue. End with the file paths and the MDX snippet.
