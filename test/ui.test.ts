import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { editorUrl } from '../ui/src/editor.js';
import { focus, layerOf, type FocusOptions, type Layer } from '../ui/src/focus.js';
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

describe('focus', () => {
  const options = (overrides: Partial<FocusOptions> = {}): FocusOptions => ({
    query: '',
    downstream: true,
    upstream: true,
    depth: 'all',
    hiddenLayers: new Set<Layer>(),
    hiddenModules: new Set<string>(),
    ...overrides,
  });
  const names = (result: ReturnType<typeof focus>) => result.nodes.map((n) => n.name).sort();

  it('walks down from a controller to what it ends up calling', () => {
    const result = focus(map, options({ query: 'AppController', upstream: false }));
    expect(names(result)).toEqual(
      ['AUDIT', 'AppController', 'AppService', 'CONFIG_OPTIONS', 'ConfigService', 'HealthService', 'OrdersService', 'PAYMENT_GATEWAY', 'UsersRepository', 'UsersService'].sort(),
    );
    expect(result.nodes.filter((n) => n.seed).map((n) => n.name)).toEqual(['AppController']);
  });

  it('starts from every member of a module and marks where the flow ends', () => {
    const app = map.nodes.find((n) => n.name === 'AppModule')!.id;
    const result = focus(map, options({ query: 'ignored', module: app, upstream: false }));
    expect(result.nodes.filter((n) => n.seed).map((n) => n.name).sort()).toEqual(['AppController', 'AppService']);
    expect(names(result)).toContain('UsersRepository');
    const ends = result.nodes.filter((n) => n.end).map((n) => n.name);
    expect(ends).toContain('UsersRepository');
    expect(ends).not.toContain('UsersService');
    // A depth limit cuts the walk short, but a node with more below it is still not an end.
    expect(focus(map, options({ module: app, upstream: false, depth: 1 })).nodes.filter((n) => n.end).map((n) => n.name)).not.toContain('UsersService');
  });

  it('limits the walk by direction and depth', () => {
    expect(names(focus(map, options({ query: 'UsersRepository', downstream: false, depth: 1 })))).toEqual(['UsersRepository', 'UsersService']);
    expect(names(focus(map, options({ query: 'UsersRepository', upstream: false })))).toEqual(['UsersRepository']);
  });

  it('drops hidden modules from the walk but still lists them', () => {
    const users = map.nodes.find((n) => n.name === 'UsersModule')!.id;
    const result = focus(map, options({ query: 'AppController', upstream: false, hiddenModules: new Set([users]) }));
    expect(names(result)).not.toContain('UsersService');
    expect(names(result)).not.toContain('UsersRepository');
    expect(result.modules.find((m) => m.module.id === users)).toMatchObject({ hidden: true });
  });

  it('bridges hidden interfaces and drops other hidden layers', () => {
    const shown = focus(map, options({ query: 'LEGACY_ORDERS', upstream: false, depth: 1 }));
    expect(shown.nodes.find((n) => n.name === 'LEGACY_ORDERS')?.layer).toBe('interface');
    const bridged = focus(map, options({ query: 'Service', hiddenLayers: new Set<Layer>(['interface', 'infra']) }));
    expect(names(bridged)).not.toContain('LEGACY_ORDERS');
    expect(names(bridged)).not.toContain('ConfigService');
  });

  it('guesses layers from names', () => {
    const node = (name: string, kind: 'provider' | 'controller' = 'provider') => ({ id: name, kind, name });
    expect(layerOf(node('UsersController', 'controller'))).toBe('controller');
    expect(layerOf(node('UsersRepository'))).toBe('db');
    expect(layerOf(node('InjectModel(User)'))).toBe('db');
    expect(layerOf(node('KafkaProducerService'))).toBe('messaging');
    expect(layerOf(node('EmployeeDataTriggerPublisher'))).toBe('messaging');
    expect(layerOf(node('PayrollReportIntegration'))).toBe('external');
    expect(layerOf(node('AppConfigService'))).toBe('infra');
    expect(layerOf(node('ReportService'))).toBe('service');
  });
});

describe('editorUrl', () => {
  it('opens the file at its line in VS Code or Zed', () => {
    expect(editorUrl('vscode', '/work/api', 'src/users/users.service.ts', 12)).toBe('vscode://file/work/api/src/users/users.service.ts:12');
    expect(editorUrl('zed', '/work/api/', './src/app.module.ts')).toBe('zed://file/work/api/src/app.module.ts');
  });

  it('resolves "..", Windows paths and characters a URL would misread', () => {
    expect(editorUrl('vscode', '/work/api', '../node_modules/@nestjs/config/index.d.ts', 3)).toBe(
      'vscode://file/work/node_modules/@nestjs/config/index.d.ts:3',
    );
    expect(editorUrl('zed', 'C:\\work\\api', 'src/a.ts', 1)).toBe('zed://file/C:/work/api/src/a.ts:1');
    expect(editorUrl('vscode', '/my work/#1', 'a.ts')).toBe('vscode://file/my%20work/%231/a.ts');
  });
});
