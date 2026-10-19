import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { layout } from '../ui/src/layout.js';
import { parseCartograph } from '../ui/src/load.js';
import { toFlow, type FlowNode } from '../ui/src/toFlow.js';

// The golden file written by analyzer.test.ts doubles as realistic UI input.
const map = parseCartograph(JSON.parse(readFileSync(new URL('./testdata/app.golden.json', import.meta.url), 'utf8')));
const byName = (nodes: FlowNode[], name: string) => nodes.find((n) => n.data.node.name === name)!;

describe('toFlow', () => {
  it('draws only modules and imports at the modules level', () => {
    const { nodes, edges } = toFlow(map, { level: 'modules', hideExternal: false });
    expect(nodes.every((n) => n.type === 'module' && n.data.leaf)).toBe(true);
    expect(nodes).toHaveLength(5);
    expect(edges.every((e) => e.data!.edge.kind === 'imports' || e.data!.edge.kind === 'exports')).toBe(true);
    expect(edges.find((e) => e.label === 'forRoot')).toBeDefined();
  });

  it('nests providers inside the module that provides them, parents first', () => {
    const { nodes, edges } = toFlow(map, { level: 'full', hideExternal: false });
    const users = byName(nodes, 'UsersModule');
    const service = byName(nodes, 'UsersService');
    expect(users.data).toMatchObject({ leaf: false, members: 2 });
    expect(service.parentId).toBe(users.id);
    expect(nodes.indexOf(users)).toBeLessThan(nodes.indexOf(service));
    // a token nobody provides is drawn on its own
    expect(byName(nodes, 'AUDIT').parentId).toBeUndefined();
    expect(edges.some((e) => e.data!.edge.kind === 'injects' && e.label === 'optional')).toBe(true);
  });
});

describe('layout', () => {
  it('places every node, sizes module boxes around their children', async () => {
    const { nodes, edges } = toFlow(map, { level: 'full', hideExternal: false });
    const placed = (await layout(nodes, edges)).nodes;
    const users = byName(placed, 'UsersModule');
    const service = byName(placed, 'UsersService');
    expect(placed.every((n) => Number.isFinite(n.position.x) && Number.isFinite(n.position.y))).toBe(true);
    // child positions are relative to the parent and fit inside it
    expect(service.position.y).toBeGreaterThanOrEqual(40);
    expect(service.position.x + service.width!).toBeLessThanOrEqual(users.width!);
    expect(service.position.y + service.height!).toBeLessThanOrEqual(users.height!);
  });

  it('routes edges in absolute coordinates, from the source border to the target border', async () => {
    const flow = toFlow(map, { level: 'full', hideExternal: false });
    const placed = await layout(flow.nodes, flow.edges);
    const absolute = (id: string): { x: number; y: number; width: number; height: number } => {
      const node = placed.nodes.find((n) => n.id === id)!;
      const parent = node.parentId ? absolute(node.parentId) : { x: 0, y: 0 };
      return { x: parent.x + node.position.x, y: parent.y + node.position.y, width: node.width!, height: node.height! };
    };
    const inside = (p: { x: number; y: number }, box: ReturnType<typeof absolute>) =>
      p.x >= box.x - 1 && p.x <= box.x + box.width + 1 && p.y >= box.y - 1 && p.y <= box.y + box.height + 1;

    expect(placed.edges.every((e) => e.data?.route)).toBe(true);
    for (const edge of placed.edges) {
      const { points } = edge.data!.route!;
      // Routes inside a module (UsersService → UsersRepository) and across modules both line up.
      expect(inside(points[0]!, absolute(edge.source))).toBe(true);
      expect(inside(points.at(-1)!, absolute(edge.target))).toBe(true);
    }
    const labelled = placed.edges.find((e) => e.label === 'forRoot')!;
    expect(labelled.data!.route!.label).toBeDefined();
  });
});
