import type { Cartograph, CartographEdge, CartographNode } from '../../src/schema.js';
import { ownersOf } from './toFlow.js';

/**
 * What role a provider plays in a request's path, guessed from its name. Focus mode uses it to colour
 * nodes and to let the reader hide whole layers (logging, config, interfaces) that add noise.
 */
export type Layer = 'controller' | 'service' | 'db' | 'messaging' | 'external' | 'guard' | 'infra' | 'interface';

export const LAYERS: { layer: Layer; label: string }[] = [
  { layer: 'controller', label: 'Controllers' },
  { layer: 'service', label: 'Services' },
  { layer: 'db', label: 'Database' },
  { layer: 'messaging', label: 'Kafka / events' },
  { layer: 'external', label: 'External APIs' },
  { layer: 'guard', label: 'Guards / pipes' },
  { layer: 'infra', label: 'Logger / config' },
  { layer: 'interface', label: 'Interfaces' },
];

export type Depth = 1 | 2 | 3 | 'all';

export interface FocusOptions {
  query: string;
  /** Start from every provider and controller of this module id instead of the `query` matches. */
  module?: string;
  /** Follow what the matches depend on: controller → service → repository. */
  downstream: boolean;
  /** Follow what depends on the matches: repository → service → controller. */
  upstream: boolean;
  depth: Depth;
  hiddenLayers: ReadonlySet<Layer>;
  /** Module ids whose providers are left out of the walk. */
  hiddenModules: ReadonlySet<string>;
}

export interface FocusNode {
  node: CartographNode;
  /** What to show: the implementation for `{ provide: IFoo, useClass: Foo }` when interfaces are hidden. */
  name: string;
  layer: Layer;
  module?: CartographNode;
  /** Matched the query, rather than reached from a match. */
  seed: boolean;
  /** Reached going downstream and depends on nothing else left in the walk: where the flow ends. */
  end: boolean;
}

export interface FocusEdge {
  from: string;
  to: string;
  /** Stands for a path through hidden interfaces. */
  bridged: boolean;
  edge?: CartographEdge;
}

export interface FocusModule {
  module: CartographNode;
  /** Providers and controllers of this module the walk reaches, ignoring `hiddenModules`. */
  count: number;
  hidden: boolean;
}

export interface FocusResult {
  nodes: FocusNode[];
  edges: FocusEdge[];
  /** Every module the walk touches, so a module can be switched back on after hiding it. */
  modules: FocusModule[];
  /** How many nodes each layer has in the result before `hiddenLayers` applies. */
  layerCounts: Map<Layer, number>;
}

const PATTERNS: [Layer, RegExp][] = [
  ['messaging', /kafka|producer|publisher|consumer|rabbit|amqp|queue|pubsub|eventbus|eventemitter|nats|sqs|sns/i],
  ['db', /repository$|^inject(model|connection|repository|datasource|entitymanager)\b|prisma|sequelize|typeorm|mongoose|datasource|entitymanager|database|knex|drizzle/i],
  ['guard', /(guard|interceptor|pipe|filter|strategy|middleware)$/i],
  ['infra', /logger|^(app)?config(service)?$|configservice|clientcontext|contextstorage|health|metric|tracing|tracer/i],
  ['external', /integration$|client(service)?$|http|grpc|api(service)?$|gateway$|storage|redis|cache/i],
];

/** A provider token that names an interface: `IFoo`, or a `useExisting` alias. */
export function isInterface(node: CartographNode): boolean {
  if (node.kind !== 'provider') return false;
  if (node.providerType === 'alias') return true;
  return node.id.startsWith('token:') && /^I[A-Z]/.test(node.name);
}

export function layerOf(node: CartographNode, name = node.name): Layer {
  if (node.kind === 'controller') return 'controller';
  for (const [layer, pattern] of PATTERNS) if (pattern.test(name)) return layer;
  return 'service';
}

/**
 * The part of the map around the providers and controllers whose name contains `query` (or that
 * belong to `module`): what they depend on (downstream), what depends on them (upstream), or both,
 * up to `depth` hops.
 *
 * Hidden interfaces are bridged (`A → IFoo → Foo` becomes `A → Foo`, and `IFoo` bound with `useClass`
 * is shown as `Foo`); other hidden layers are dropped and the walk does not continue through them.
 */
export function focus(map: Cartograph, options: FocusOptions): FocusResult {
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const owners = ownersOf(map);
  const hideInterfaces = options.hiddenLayers.has('interface');

  // Display name and layer of every provider and controller.
  const shown = new Map<string, { name: string; layer: Layer }>();
  for (const node of map.nodes) {
    if (node.kind === 'module') continue;
    const name = hideInterfaces && node.implementation && isInterface(node) ? node.implementation : node.name;
    // `IFoo` bound with useClass is shown as `Foo` when interfaces are hidden; other interfaces stay one.
    const asInterface = isInterface(node) && !(hideInterfaces && node.implementation);
    shown.set(node.id, { name, layer: asInterface ? 'interface' : layerOf(node, name) });
  }

  // Dependency edges, with hidden interfaces bridged out.
  const deps = map.edges.filter((e) => (e.kind === 'injects' || e.kind === 'aliases') && shown.has(e.from) && shown.has(e.to));
  const skip = (id: string) => hideInterfaces && shown.get(id)?.layer === 'interface';
  const outOf = new Map<string, CartographEdge[]>();
  for (const e of deps) outOf.set(e.from, [...(outOf.get(e.from) ?? []), e]);
  const edges: FocusEdge[] = [];
  const seenEdge = new Set<string>();
  const addEdge = (from: string, to: string, bridged: boolean, edge?: CartographEdge) => {
    const key = `${from}|${to}`;
    if (from === to || seenEdge.has(key)) return;
    seenEdge.add(key);
    edges.push({ from, to, bridged, edge });
  };
  for (const e of deps) {
    if (skip(e.from)) continue;
    if (!skip(e.to)) {
      addEdge(e.from, e.to, false, e);
      continue;
    }
    // Follow the chain of hidden interfaces to whatever implements them.
    const stack = [e.to];
    const visited = new Set<string>();
    while (stack.length) {
      const id = stack.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      for (const next of outOf.get(id) ?? []) {
        if (skip(next.to)) stack.push(next.to);
        else addEdge(e.from, next.to, true);
      }
    }
  }

  const hiddenLayer = (id: string) => options.hiddenLayers.has(shown.get(id)!.layer);
  const q = options.query.trim().toLowerCase();
  const seeds = [...shown.keys()].filter((id) => {
    if (hiddenLayer(id)) return false;
    if (options.module !== undefined) return owners.get(id) === options.module;
    const node = byId.get(id)!;
    return node.name.toLowerCase().includes(q) || shown.get(id)!.name.toLowerCase().includes(q);
  });

  const forward = new Map<string, string[]>();
  const backward = new Map<string, string[]>();
  for (const e of edges) {
    forward.set(e.from, [...(forward.get(e.from) ?? []), e.to]);
    backward.set(e.to, [...(backward.get(e.to) ?? []), e.from]);
  }
  const limit = options.depth === 'all' ? Infinity : options.depth;

  const walk = (blocked: (id: string) => boolean): Set<string> => {
    const start = seeds.filter((id) => !blocked(id));
    const reached = new Set(start);
    // Each direction starts from the matches, so upstream never climbs back up from what downstream found.
    const go = (next: Map<string, string[]>) => {
      const seen = new Set(start);
      let frontier = start;
      for (let hop = 0; hop < limit && frontier.length; hop++) {
        const following: string[] = [];
        for (const id of frontier) {
          for (const to of next.get(id) ?? []) {
            if (blocked(to) || seen.has(to)) continue;
            seen.add(to);
            reached.add(to);
            following.push(to);
          }
        }
        frontier = following;
      }
    };
    if (options.downstream) go(forward);
    if (options.upstream) go(backward);
    return reached;
  };

  const moduleOf = (id: string) => owners.get(id);
  const everything = walk(hiddenLayer);
  const blocked = (id: string) => hiddenLayer(id) || options.hiddenModules.has(moduleOf(id) ?? '');
  const included = walk(blocked);

  const moduleCounts = new Map<string, number>();
  for (const id of everything) {
    const owner = moduleOf(id);
    if (owner) moduleCounts.set(owner, (moduleCounts.get(owner) ?? 0) + 1);
  }
  const modules = [...moduleCounts]
    .map(([id, count]) => ({ module: byId.get(id)!, count, hidden: options.hiddenModules.has(id) }))
    .filter((m) => m.module)
    .sort((a, b) => b.count - a.count || a.module.name.localeCompare(b.module.name));

  // Layer counts ignore hidden layers, so a hidden layer still shows how much it would add.
  const layerCounts = new Map<Layer, number>();
  const unfiltered = walk(() => false);
  for (const id of unfiltered) {
    const layer = shown.get(id)!.layer;
    layerCounts.set(layer, (layerCounts.get(layer) ?? 0) + 1);
  }

  const seedSet = new Set(seeds);
  // An end has nothing further down even without the depth limit, so a cut-off walk does not fake one.
  const isEnd = (id: string) => options.downstream && !seedSet.has(id) && !(forward.get(id) ?? []).some((to) => !blocked(to));
  const nodes: FocusNode[] = [...included]
    .sort()
    .map((id) => {
      const owner = moduleOf(id);
      return { node: byId.get(id)!, ...shown.get(id)!, module: owner ? byId.get(owner) : undefined, seed: seedSet.has(id), end: isEnd(id) };
    });
  return {
    nodes,
    edges: edges.filter((e) => included.has(e.from) && included.has(e.to)),
    modules,
    layerCounts,
  };
}
