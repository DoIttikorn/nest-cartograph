import ELK, { type ElkExtendedEdge, type ElkNode } from 'elkjs/lib/elk.bundled.js';
import { labelSize } from './measure.js';
import { MODULE_HEADER, type FlowEdge, type FlowNode, type XY } from './toFlow.js';

const elk = new ELK();

export type Direction = 'RIGHT' | 'DOWN';

/**
 * Position every node and route every edge with ELK's layered algorithm.
 *
 * Modules that own providers become nested ELK graphs, which matches React Flow sub flows: child
 * positions come back relative to their parent. Edge routes and label positions come back relative
 * to the edge's `container` node; they are turned into absolute coordinates for `RoutedEdge`.
 */
export async function layout(
  nodes: FlowNode[],
  edges: FlowEdge[],
  direction: Direction = 'RIGHT',
): Promise<{ nodes: FlowNode[]; edges: FlowEdge[] }> {
  const children = new Map<string | undefined, FlowNode[]>();
  for (const node of nodes) children.set(node.parentId, [...(children.get(node.parentId) ?? []), node]);

  const toElk = (node: FlowNode): ElkNode => {
    const inner = children.get(node.id);
    if (!inner) return { id: node.id, width: node.width ?? 160, height: node.height ?? 44 };
    return {
      id: node.id,
      layoutOptions: {
        'elk.padding': `[top=${MODULE_HEADER + 14},left=16,bottom=16,right=16]`,
        // Never narrower than the header, so the module name is not cut off.
        'elk.nodeSize.constraints': 'MINIMUM_SIZE',
        'elk.nodeSize.minimum': `(${Math.max(200, node.width ?? 0)}, 100)`,
      },
      children: inner.map(toElk),
    };
  };

  const graph: ElkNode = {
    id: ROOT,
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.spacing.nodeNodeBetweenLayers': '64',
      'elk.layered.spacing.edgeNodeBetweenLayers': '20',
      'elk.spacing.nodeNode': '28',
      'elk.spacing.edgeNode': '16',
      'elk.spacing.edgeEdge': '10',
      'elk.spacing.edgeLabel': '4',
      'elk.spacing.componentComponent': '64',
      'elk.edgeLabels.placement': 'CENTER',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
    },
    children: (children.get(undefined) ?? []).map(toElk),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
      labels: typeof edge.label === 'string' ? [{ id: `${edge.id}:label`, text: edge.label, ...labelSize(edge.label) }] : [],
    })),
  };

  const result = await elk.layout(graph);

  // Absolute position of every node, to place routes drawn inside nested modules.
  const placed = new Map<string, ElkNode>();
  const absolute = new Map<string, XY>([[ROOT, { x: 0, y: 0 }]]);
  const walk = (node: ElkNode, offset: XY) => {
    for (const child of node.children ?? []) {
      const at = { x: offset.x + (child.x ?? 0), y: offset.y + (child.y ?? 0) };
      placed.set(child.id, child);
      absolute.set(child.id, at);
      walk(child, at);
    }
  };
  walk(result, { x: 0, y: 0 });

  const routes = new Map((result.edges ?? []).map((edge) => [edge.id, edge]));
  return {
    nodes: nodes.map((node) => {
      const box = placed.get(node.id);
      if (!box) return node;
      return { ...node, position: { x: box.x ?? 0, y: box.y ?? 0 }, width: box.width ?? node.width, height: box.height ?? node.height } as FlowNode;
    }),
    edges: edges.map((edge) => {
      const routed = routes.get(edge.id);
      const sourceAt = absolute.get(edge.source);
      const targetAt = absolute.get(edge.target);
      const route = routed && sourceAt && targetAt ? toRoute(routed, absolute) : undefined;
      if (!route || !sourceAt || !targetAt || !edge.data) return edge;
      return { ...edge, data: { ...edge.data, route: { ...route, sourceAt, targetAt } } };
    }),
  };
}

const ROOT = '__root__';

function toRoute(edge: ElkExtendedEdge, absolute: Map<string, XY>): { points: XY[]; label?: XY } | undefined {
  const section = edge.sections?.[0];
  if (!section) return undefined;
  const container = (edge as ElkExtendedEdge & { container?: string }).container ?? ROOT;
  const offset = absolute.get(container) ?? { x: 0, y: 0 };
  const shift = (p: XY) => ({ x: p.x + offset.x, y: p.y + offset.y });
  const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(shift);
  const label = edge.labels?.[0];
  const labelCentre =
    label && label.x !== undefined && label.y !== undefined
      ? shift({ x: label.x + (label.width ?? 0) / 2, y: label.y + (label.height ?? 0) / 2 })
      : undefined;
  return labelCentre ? { points, label: labelCentre } : { points };
}
