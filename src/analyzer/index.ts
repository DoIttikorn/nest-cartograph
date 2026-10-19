import path from 'node:path';
import { GraphBuilder } from '../graph/builder.js';
import { findModuleCycles } from '../graph/cycles.js';
import { SCHEMA_VERSION, type Cartograph } from '../schema.js';
import type { Context } from './context.js';
import { findDecoratedClasses, PROVIDER_DECORATORS, readModule } from './modules.js';
import { loadProgram, type ProgramOptions } from './program.js';
import { Resolver } from './resolve.js';

export type AnalyzeOptions = ProgramOptions;

/**
 * Step 1: read a NestJS project's TypeScript source and return its map. Nothing is executed.
 *
 * 1. Find every class with a Nest class decorator.
 * 2. For each `@Module()`, read imports, providers, controllers and exports — following constants,
 *    spreads, `forwardRef()` and static `forRoot()` methods — and each provider's injections.
 * 3. Warn about what could not be resolved, and find circular module imports.
 */
export function analyze(options: AnalyzeOptions = {}): Cartograph {
  const { program, rootDir, tsconfig, sourceFiles } = loadProgram(options);
  const graph = new GraphBuilder();
  const ctx: Context = {
    checker: program.getTypeChecker(),
    graph,
    resolve: new Resolver(program.getTypeChecker(), rootDir, (message) => graph.warn(message)),
    moduleClasses: new Set(),
    analysed: new Set(),
  };

  const found = findDecoratedClasses(ctx, sourceFiles);
  for (const info of found) if (info.decorators.has('Module')) readModule(ctx, info);
  warnAboutLeftovers(ctx, found, sourceFiles.length);

  const { nodes, edges, warnings } = graph.build();
  return {
    schemaVersion: SCHEMA_VERSION,
    project: {
      root: toPosix(path.relative(process.cwd(), rootDir)) || '.',
      ...(tsconfig ? { tsconfig: toPosix(path.relative(rootDir, tsconfig)) } : {}),
    },
    nodes,
    edges,
    cycles: findModuleCycles(nodes, edges),
    warnings,
  };
}

function warnAboutLeftovers(ctx: Context, found: ReturnType<typeof findDecoratedClasses>, fileCount: number): void {
  if (ctx.moduleClasses.size === 0) {
    ctx.graph.warn(`No @Module() classes found in ${fileCount} source file(s). Check the tsconfig's "include", or pass --project.`);
  }
  const { nodes, edges } = ctx.graph.build();
  const owned = new Set(edges.filter((e) => e.kind === 'provides' || e.kind === 'controls').map((e) => e.to));
  const implementations = new Set(nodes.map((n) => n.implementation).filter(Boolean));

  for (const info of found) {
    if (info.decorators.has('Module') || owned.has(info.id) || implementations.has(info.name)) continue;
    if ([...info.decorators].some((d) => PROVIDER_DECORATORS.has(d))) {
      ctx.graph.warn(`${info.name} (${info.file}:${info.line}) is decorated but not listed in any module's providers or controllers.`);
    }
  }
  for (const node of nodes) {
    if (node.kind === 'provider' && node.file && !node.external && ctx.graph.isPlaceholder(node.id) && !owned.has(node.id)) {
      ctx.graph.warn(`${node.name} is injected but no module in the analysed source provides it.`);
    }
  }
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}
