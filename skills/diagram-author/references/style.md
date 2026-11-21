# Style guide and review checklist

The look follows Distill.pub: restraint, one accent, serif annotations, pale panels. The renderer handles the visuals; your
job is the *content and structure*.

## Principles

1. **One idea per diagram.** If you need two sentences to say what it shows, split it.
2. **Show structure with nesting, behaviour with edges.** Don't use arrows to say "belongs to".
3. **Colour means something.** The theme's accent is for interaction (hover/selection) and numbered notes; `tone` marks a
   semantic category. Don't recolour things for decoration.
4. **Annotate, don't clutter.** Notes carry the *why* (trust boundaries, limits, caveats); labels carry the *what*.
5. **Animate sparingly.** `flow: true` on the 2–3 edges that tell the story.
6. **Names the reader knows.** Use the product's real names for resources and the team's names for services.

## Review checklist (do this on the PNG)

- [ ] Can I say what the diagram shows in one sentence?
- [ ] Is every node's label readable and not overflowing its box?
- [ ] Do edges cross containers only where it matters? Any long detour that suggests a better nesting or `direction`?
- [ ] Are the containers the right levels (not three nested panels with one resource)?
- [ ] ≤ 15 nodes, ≤ 5 notes, 3–5 steps?
- [ ] Proportions between ≈ 1.5 and 3.5 : 1? (`render_diagram` prints the size; a `LAYOUT NOTE` means fix it.) Side branches folded with `stackWith`?
- [ ] Reading order marked with `badge`, edge styles explained by `legend` (not a wall of notes)?
- [ ] Is the main path obvious (animated edges, left-to-right or top-to-bottom)?
- [ ] Do edge labels say protocol/port/verb, not repeat the node names?
- [ ] Icons are official for cloud resources and consistent (one of `card`/`stacked` for all Lucide icons — the validator warns on a mix). Icon tile never dominates the label (tile 32 px vs 12.5 px text).
- [ ] Architecture with zones: nested containers use the tinted-panel look (no dashed borders — dashed means optional/cloud only, on edges).
- [ ] Dark mode: `render_diagram mode=dark` also looks right?
- [ ] Phone: `variants.narrow` present, rendered with `variant=narrow`, ≤ 520 px wide (the report says `phone view`), exported as `<name>.<lang>.narrow.svg`?

## Fixing common problems

| Symptom | Fix |
|---|---|
| Very wide / elongated (> 3.5 : 1) | fold branches with `stackWith` (below the anchor); put the optional/offline path in the stack; shorten notes and keep `notesPosition: side`; `direction: DOWN`; split |
| Very wide diagram | `direction: DOWN`, or split; add `variants: { narrow: {} }` |
| Phone view too wide (> 520 px) | in `variants.narrow.nodes` set `stackWith: null` on side-by-side nodes, shorten labels, or `hide` secondary nodes |
| Edge snakes around a container | connect to the node next to the border; or move the node into the container it talks to |
| Cluttered middle | remove obvious edges (everything→monitoring): say it in a note |
| Label collides with a line | shorten the label; labels sit on the edge midpoint |
| Containers too big / empty | fewer sibling containers; drop levels that add no information |
| Too many colours | remove `tone` except for one or two meanings |

## Re-export every diagram of a page after upgrading dgm

An interactive SVG embeds its own `<style>`. When several are inlined in one page (e.g. `<Diagram>` in MDX) those rules are **global**:
a diagram exported with an older renderer overrides the look of the newer ones. After changing the renderer, re-render *all* diagrams
(wide and `--variant narrow`, every language) of the site, not only the one you are editing.
