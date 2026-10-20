import { MarkerType, type Edge, type Node } from '@xyflow/react';
import type { Cartograph, CartographEdge, CartographNode } from '../../src/schema.js';
import type { FocusResult, Layer } from './focus.js';
import { focusSize, memberSize, moduleHeaderWidth } from './measure.js';

/** `modules`: modules and their imports. `full`: providers and controllers drawn inside their modules. */
export type Level = 'modules' | 'full';

export interface ViewOptions {
  level: Level;
  hideExternal: boolean;
}

export type ModuleData = {
  node: CartographNode;
  /** Drawn without children (the `modules` level, or a module that owns nothing). */
  leaf: boolean;
  /** Part of a circular import without forwardRef(). */
  inCycle: boolean;
  /** Providers and controllers the module owns. */
  members: number;
};

export type MemberData = {
  node: CartographNode;
  exported: boolean;
};

export interface XY {
  x: number;
  y: number;
}

/** Where ELK routed an edge, in absolute flow coordinates. */
export interface Route {
  points: XY[];
  /** Centre of the label, when the edge has one. */
  label?: XY;
  /** Absolute positions of both ends' nodes at layout time; once a node is dragged the route is stale. */
  sourceAt: XY;
  targetAt: XY;
}

export type FocusData = {
  node: CartographNode;
  name: string;
  layer: Layer;
  module?: CartographNode;
  seed: boolean;
};

export type ModuleFlowNode = Node<ModuleData, 'module'>;
export type MemberFlowNode = Node<MemberData, 'member'>;
export type FocusFlowNode = Node<FocusData, 'focus'>;
export type FlowNode = ModuleFlowNode | MemberFlowNode | FocusFlowNode;
export type FlowEdge = Edge<{ edge: CartographEdge; route?: Route }, 'routed'>;

/** Height of a module's title bar, kept clear of its children by the layout. */
export const MODULE_HEADER = 40;

/** Each provider and controller belongs to the first module that provides it. */
export function ownersOf(map: Cartograph): Map<string, string> {
  const owners = new Map<string, string>();
  for (const edge of map.edges) {
    if ((edge.kind === 'provides' || edge.kind === 'controls') && !owners.has(edge.to)) owners.set(edge.to, edge.from);
  }
  return owners;
}

/** Turn the map into React Flow nodes and edges. Positions are filled in by `layout()`. */
export function toFlow(map: Cartograph, options: ViewOptions): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const visible = map.nodes.filter((n) => !(options.hideExternal && n.external));
  const ids = new Set(visible.map((n) => n.id));
  const owners = ownersOf(map);
  const exported = new Set(map.edges.filter((e) => e.kind === 'exports').map((e) => e.to));
  const unguarded = new Set(map.cycles.filter((c) => !c.guarded).flatMap((c) => c.ids));
  const full = options.level === 'full';

  const members = full ? visible.filter((n) => n.kind !== 'module') : [];
  const memberCount = new Map<string, number>();
  for (const m of members) {
    const owner = owners.get(m.id);
    if (owner && ids.has(owner)) memberCount.set(owner, (memberCount.get(owner) ?? 0) + 1);
  }

  // Parents must come before their children.
  const nodes: FlowNode[] = [];
  for (const node of visible) {
    if (node.kind !== 'module') continue;
    const count = memberCount.get(node.id) ?? 0;
    const leaf = !full || count === 0;
    const inCycle = unguarded.has(node.id);
    // A leaf is exactly as wide as its header; a box with children is at least that wide.
    const width = moduleHeaderWidth(node.name, moduleBadges(node, inCycle), leaf ? undefined : count);
    nodes.push({
      id: node.id,
      type: 'module',
      position: { x: 0, y: 0 },
      data: { node, leaf, inCycle, members: count },
      width,
      ...(leaf ? { height: 52 } : {}),
    });
  }
  for (const node of members) {
    const owner = owners.get(node.id);
    const parentId = owner && ids.has(owner) ? owner : undefined;
    const isExported = exported.has(node.id);
    nodes.push({
      id: node.id,
      type: 'member',
      position: { x: 0, y: 0 },
      data: { node, exported: isExported },
      ...memberSize(node, detailOf(node), isExported),
      ...(parentId ? { parentId, extent: 'parent' as const } : {}),
    });
  }

  const drawn = new Set(nodes.map((n) => n.id));
  const isModule = (id: string) => map.nodes.find((n) => n.id === id)?.kind === 'module';
  const edges: FlowEdge[] = [];
  for (const edge of map.edges) {
    if (!drawn.has(edge.from) || !drawn.has(edge.to)) continue;
    const wanted =
      edge.kind === 'imports' ||
      (edge.kind === 'exports' && !full && isModule(edge.to)) ||
      (full && (edge.kind === 'injects' || edge.kind === 'aliases'));
    if (wanted) edges.push(toFlowEdge(edge));
  }
  return { nodes, edges };
}

/** Focus mode: no module boxes, one flat left-to-right flow from controllers to databases and topics. */
export function focusToFlow(result: FocusResult): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = result.nodes.map((n) => ({
    id: n.node.id,
    type: 'focus',
    position: { x: 0, y: 0 },
    data: { node: n.node, name: n.name, layer: n.layer, module: n.module, seed: n.seed },
    ...focusSize(n.name, n.module?.name),
  }));
  const edges: FlowEdge[] = result.edges.map((e) => {
    const edge: CartographEdge = e.edge ?? { from: e.from, to: e.to, kind: 'injects' };
    const flow = toFlowEdge(edge);
    return {
      ...flow,
      id: `focus|${e.from}|${e.to}`,
      label: undefined,
      className: `${flow.className}${e.bridged ? ' is-bridged' : ''}`,
    };
  });
  return { nodes, edges };
}

/** Badges in a module's header, in the order the header draws them. */
export function moduleBadges(node: CartographNode, inCycle: boolean): string[] {
  const badges: string[] = [];
  if (node.global) badges.push('global');
  if (node.dynamic) badges.push('dynamic');
  if (node.external) badges.push('external');
  if (inCycle) badges.push('cycle');
  return badges;
}

/** Second line of a member node: how it is defined, when that is not a plain class. */
export function detailOf(node: CartographNode): string | undefined {
  if (node.implementation && node.implementation !== node.name) return `useClass ${node.implementation}`;
  if (node.providerType === 'factory') return 'useFactory';
  if (node.providerType === 'value') return 'useValue';
  if (node.providerType === 'alias') return 'useExisting';
  if (node.providerType === 'unknown') return 'not provided';
  return undefined;
}

function toFlowEdge(edge: CartographEdge): FlowEdge {
  const label =
    edge.kind === 'imports'
      ? [edge.via, edge.forwardRef ? 'forwardRef' : undefined].filter(Boolean).join(' · ')
      : edge.kind === 'exports'
        ? 're-exports'
        : edge.kind === 'aliases'
          ? 'alias'
          : [edge.optional ? 'optional' : undefined, edge.forwardRef ? 'forwardRef' : undefined].filter(Boolean).join(' · ');
  const dashed = edge.forwardRef || edge.optional || edge.kind === 'aliases' || edge.kind === 'exports';
  return {
    id: `${edge.kind}|${edge.from}|${edge.to}|${edge.at ?? ''}`,
    type: 'routed',
    source: edge.from,
    target: edge.to,
    data: { edge },
    selectable: false,
    focusable: false,
    label: label || undefined,
    className: `cg-edge cg-edge--${edge.kind}${dashed ? ' is-dashed' : ''}`,
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    // Draw injection edges above the module boxes they cross.
    zIndex: edge.kind === 'imports' ? 0 : 1,
  };
}
