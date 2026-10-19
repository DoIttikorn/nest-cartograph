import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/analyzer/index.js';
import type { Cartograph, EdgeKind } from '../src/schema.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (...parts: string[]) => path.join(here, 'fixtures', ...parts);

// Read through the fixture's tsconfig, the way the CLI does: paths are relative to test/fixtures.
const map = analyze({ project: fixture('tsconfig.json') });

const node = (name: string) => {
  const found = map.nodes.filter((n) => n.name === name);
  if (found.length !== 1) throw new Error(`Expected one node named ${name}, found ${found.length}`);
  return found[0]!;
};
const edge = (kind: EdgeKind, from: string, to: string, graph: Cartograph = map) =>
  graph.edges.find((e) => e.kind === kind && e.from === node(from).id && e.to === node(to).id);

describe('analyze', () => {
  // Like a Go golden file: `npm run test:update` rewrites it, and the diff shows what changed.
  it('matches the golden file', async () => {
    await expect(`${JSON.stringify(map, null, 2)}\n`).toMatchFileSnapshot('./testdata/app.golden.json');
  });

  it('finds every module with its source location', () => {
    expect(map.nodes.filter((n) => n.kind === 'module').map((n) => n.name)).toEqual(
      expect.arrayContaining(['AppModule', 'ConfigModule', 'HealthModule', 'OrdersModule', 'UsersModule']),
    );
    expect(node('UsersModule')).toMatchObject({ file: 'app/users/users.module.ts', line: 6 });
  });

  it('reads dynamic and global modules, including what forRoot() returns', () => {
    expect(node('ConfigModule')).toMatchObject({ global: true, dynamic: true });
    expect(edge('imports', 'AppModule', 'ConfigModule')).toMatchObject({ via: 'forRoot' });
    expect(node('CONFIG_OPTIONS').providerType).toBe('value');
    expect(edge('exports', 'ConfigModule', 'ConfigService')).toBeDefined();
  });

  it('follows spread arrays held in constants', () => {
    expect(edge('imports', 'AppModule', 'HealthModule')).toBeDefined();
    expect(edge('provides', 'OrdersModule', 'OrdersService')).toBeDefined();
  });

  it('marks forwardRef() imports and reports the cycle as guarded', () => {
    expect(edge('imports', 'UsersModule', 'OrdersModule')?.forwardRef).toBe(true);
    expect(map.cycles).toEqual([expect.objectContaining({ guarded: true })]);
    expect(map.cycles[0]!.names.toSorted()).toEqual(['OrdersModule', 'UsersModule']);
  });

  it('reads custom providers', () => {
    expect(node('PAYMENT_GATEWAY')).toMatchObject({ providerType: 'class', implementation: 'FakePaymentGateway' });
    expect(node('CLOCK').providerType).toBe('factory');
    expect(edge('injects', 'CLOCK', 'ConfigService')).toBeDefined();
    expect(edge('aliases', 'LEGACY_ORDERS', 'OrdersService')).toBeDefined();
  });

  it('reads constructor injection by type, by @Inject() token and through forwardRef()', () => {
    expect(edge('injects', 'UsersService', 'UsersRepository')).toMatchObject({ at: 0 });
    expect(edge('injects', 'UsersService', 'OrdersService')).toMatchObject({ at: 2, forwardRef: true });
    expect(edge('injects', 'ConfigService', 'CONFIG_OPTIONS')).toBeDefined();
    expect(edge('injects', 'OrdersService', 'AUDIT')).toMatchObject({ optional: true });
    expect(edge('injects', 'AppController', 'HealthService')).toBeDefined();
  });

  it('warns about decorated classes that no module registers, and nothing else', () => {
    expect(map.warnings).toEqual([expect.stringMatching(/^OrphanService \(app\/shared\/health\.ts:\d+\) is decorated/)]);
  });

  it('reports a circular import without forwardRef() as unguarded', () => {
    const broken = analyze({ files: [fixture('cycle/a.module.ts')], rootDir: fixture('cycle') });
    expect(broken.cycles).toEqual([expect.objectContaining({ names: expect.arrayContaining(['AModule', 'BModule']), guarded: false })]);
  });

  it('also reads a list of files, with paths relative to rootDir', () => {
    const viaFiles = analyze({ files: [fixture('app/app.module.ts')], rootDir: fixture('app') });
    expect(map.project.tsconfig).toBe('tsconfig.json');
    expect(viaFiles.project.tsconfig).toBeUndefined();
    expect(viaFiles.nodes).toHaveLength(map.nodes.length);
    expect(viaFiles.nodes.find((n) => n.name === 'UsersModule')?.file).toBe('users/users.module.ts');
  });

  it('gives a clear error when there is no tsconfig', () => {
    expect(() => analyze({ project: fixture('missing.json') })).toThrow(/No tsconfig found/);
  });
});
