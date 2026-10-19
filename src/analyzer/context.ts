import type ts from 'typescript';
import type { GraphBuilder } from '../graph/builder.js';
import type { CartographNode, NodeKind } from '../schema.js';
import type { ClassInfo, Resolver, Token } from './resolve.js';

/** State shared by the analyzer passes. */
export interface Context {
  checker: ts.TypeChecker;
  graph: GraphBuilder;
  resolve: Resolver;
  /** Ids of every class decorated with `@Module()` in the analysed source. */
  moduleClasses: Set<string>;
  /** `<owner id>\0<class id>` pairs whose dependencies were already read. */
  analysed: Set<string>;
}

export function classNode(cls: ClassInfo, kind: NodeKind): CartographNode {
  return {
    id: cls.id,
    kind,
    name: cls.name,
    file: cls.file,
    line: cls.line,
    external: cls.external,
    ...(kind === 'provider' ? { providerType: 'class' as const } : {}),
  };
}

/**
 * Make sure a node exists for an injected token and return its id. Until a module provides the
 * token, the node is a placeholder (`providerType: 'unknown'` for non-class tokens).
 */
export function tokenNode(ctx: Context, token: Token): string {
  if (token.cls) {
    ctx.graph.node(classNode(token.cls, 'provider'), { placeholder: true });
  } else {
    ctx.graph.node({ id: token.id, kind: 'provider', name: token.name, providerType: 'unknown' }, { placeholder: true });
  }
  return token.id;
}
