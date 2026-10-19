import type { CartographEdge, CartographNode } from '../schema.js';

/**
 * Collects nodes and edges without duplicates.
 *
 * The analyzer often meets a dependency before its definition (a service injects a token that a
 * later module provides). Such nodes are added as placeholders and replaced by the first real
 * definition that arrives.
 */
export class GraphBuilder {
  readonly #nodes = new Map<string, CartographNode>();
  readonly #placeholders = new Set<string>();
  readonly #edges = new Map<string, CartographEdge>();
  readonly #warnings: string[] = [];

  /**
   * Add a node, or fill in fields of an existing one. Fields that are already set are kept,
   * except on placeholders, which the first real definition replaces completely.
   */
  node(node: CartographNode, options: { placeholder?: boolean } = {}): CartographNode {
    const existing = this.#nodes.get(node.id);
    if (!existing) {
      const created = compact({ ...node });
      this.#nodes.set(node.id, created);
      if (options.placeholder) this.#placeholders.add(node.id);
      return created;
    }
    if (options.placeholder) return existing;
    if (this.#placeholders.delete(node.id)) {
      for (const key of Object.keys(existing)) delete (existing as unknown as Record<string, unknown>)[key];
      Object.assign(existing, compact({ ...node }));
      return existing;
    }
    const target = existing as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(node)) {
      if (value !== undefined && value !== false && target[key] === undefined) target[key] = value;
    }
    return existing;
  }

  isPlaceholder(id: string): boolean {
    return this.#placeholders.has(id);
  }

  edge(edge: CartographEdge): void {
    const key = [edge.kind, edge.from, edge.to, edge.at ?? '', edge.via ?? ''].join('\u0000');
    const existing = this.#edges.get(key);
    if (!existing) {
      this.#edges.set(key, compact({ ...edge }));
      return;
    }
    if (edge.forwardRef) existing.forwardRef = true;
    if (edge.optional) existing.optional = true;
  }

  warn(message: string): void {
    if (!this.#warnings.includes(message)) this.#warnings.push(message);
  }

  /** Nodes and edges sorted by id, so the output is the same no matter which file was read first. */
  build(): { nodes: CartographNode[]; edges: CartographEdge[]; warnings: string[] } {
    const nodes = [...this.#nodes.values()].sort((a, b) => compare(a.id, b.id));
    const edges = [...this.#edges.values()].sort(
      (a, b) => compare(a.from, b.from) || compare(a.kind, b.kind) || compare(a.to, b.to) || compare(String(a.at ?? ''), String(b.at ?? '')),
    );
    return { nodes, edges, warnings: [...this.#warnings] };
  }
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Drop keys whose value is `undefined` or `false`, so the JSON output stays small. */
function compact<T extends object>(value: T): T {
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (record[key] === undefined || record[key] === false) delete record[key];
  }
  return value;
}
