/**
 * Reveal order of a step: the groups of elements (nodes + edges) that "switch on" one after another when a host plays the step
 * with a stagger (`svg.dgm.show(k, { stagger })`). Pure data, derived at render time; the host decides the timing (0 = all at once).
 *
 * Auto (default): nodes are layered along the edges (longest path from the sources, cycles ignored), each edge joins the group of
 * the node it arrives at. Explicit (`step.sequence`): groups in the order written; a group may be one id or a list lit together.
 */
export function buildSequence(
  nodeIds: string[],
  edges: { id: string; from: string; to: string }[],
  explicit?: (string | string[])[],
): string[][] {
  const nodes = new Set(nodeIds);
  const level = new Map<string, number>();
  const edgeIds = new Set(edges.map((e) => e.id));
  const flat = (g: string | string[]) => (Array.isArray(g) ? g : [g]);

  if (explicit?.length) {
    explicit.forEach((g, i) => flat(g).forEach((id) => nodes.has(id) && level.set(id, i)));
    const last = explicit.length - 1;
    nodeIds.forEach((id) => !level.has(id) && level.set(id, last)); // not mentioned: with the last group
  } else {
    const preds = new Map<string, string[]>();
    edges.forEach((e) => {
      if (nodes.has(e.from) && nodes.has(e.to) && e.from !== e.to) preds.set(e.to, [...(preds.get(e.to) ?? []), e.from]);
    });
    const busy = new Set<string>();
    const lvl = (id: string): number => {
      if (level.has(id)) return level.get(id)!;
      if (busy.has(id)) return 0; // cycle: ignore the back edge
      busy.add(id);
      const l = Math.max(-1, ...(preds.get(id) ?? []).map(lvl)) + 1;
      busy.delete(id);
      level.set(id, l);
      return l;
    };
    nodeIds.forEach(lvl);
  }

  const groups: string[][] = [];
  const put = (i: number, id: string) => {
    groups[i] ??= [];
    if (!groups[i].includes(id)) groups[i].push(id);
  };
  nodeIds.forEach((id) => put(level.get(id)!, id));
  // explicit groups may also name edges
  explicit?.forEach((g, i) => flat(g).forEach((id) => edgeIds.has(id) && put(i, id)));
  edges.forEach((e) => {
    if (groups.some((g) => g?.includes(e.id))) return;
    put(Math.max(level.get(e.from) ?? 0, level.get(e.to) ?? 0), e.id);
  });
  return groups.filter((g) => g && g.length);
}
