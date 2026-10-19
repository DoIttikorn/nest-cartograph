import type { CartographEdge, CartographNode, ModuleCycle } from '../schema.js';

/**
 * Find groups of modules that import each other: the strongly connected components of the
 * module import graph (Tarjan's algorithm).
 */
export function findModuleCycles(nodes: CartographNode[], edges: CartographEdge[]): ModuleCycle[] {
  const names = new Map(nodes.filter((n) => n.kind === 'module').map((n) => [n.id, n.name]));
  const imports = edges.filter((e) => e.kind === 'imports' && names.has(e.from) && names.has(e.to));
  const adjacency = new Map<string, string[]>([...names.keys()].map((id) => [id, []]));
  for (const edge of imports) adjacency.get(edge.from)!.push(edge.to);

  let counter = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const groups: string[][] = [];

  const visit = (v: string): void => {
    index.set(v, counter);
    low.set(v, counter);
    counter++;
    stack.push(v);
    onStack.add(v);
    for (const w of adjacency.get(v)!) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, index.get(w)!));
      }
    }
    if (low.get(v) === index.get(v)) {
      const group: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        group.push(w);
      } while (w !== v);
      groups.push(group.reverse());
    }
  };
  for (const id of adjacency.keys()) if (!index.has(id)) visit(id);

  return groups
    .filter((group) => group.length > 1 || adjacency.get(group[0]!)!.includes(group[0]!))
    .map((group) => {
      const members = new Set(group);
      const inner = imports.filter((e) => members.has(e.from) && members.has(e.to));
      return { ids: group, names: group.map((id) => names.get(id)!), guarded: inner.every((e) => e.forwardRef === true) };
    });
}
