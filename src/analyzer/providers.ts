import ts from 'typescript';
import type { CartographNode } from '../schema.js';
import { property, short, unwrap } from './ast.js';
import { classNode, tokenNode, type Context } from './context.js';
import { addClassDependencies } from './injection.js';
import type { ClassInfo } from './resolve.js';

/**
 * Register one entry of `providers: [...]` on a module:
 * a class, or `{ provide, useClass | useValue | useFactory + inject | useExisting }`.
 */
export function addProvider(ctx: Context, module: ClassInfo, expr: ts.Expression, depth = 0): void {
  const node = unwrap(expr);
  if (depth > 8) return;

  if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) {
    const cls = ctx.resolve.classOf(node);
    if (cls) {
      ctx.graph.node(classNode(cls, 'provider'));
      ctx.graph.edge({ kind: 'provides', from: module.id, to: cls.id });
      addClassDependencies(ctx, cls.id, cls);
      return;
    }
    // A constant holding a provider object.
    const def = ctx.resolve.definitionOf(node);
    if (def) return addProvider(ctx, module, def, depth + 1);
  }

  if (!ts.isObjectLiteralExpression(node)) {
    ctx.graph.warn(`Could not resolve the provider \`${short(node)}\` in ${module.name} at ${ctx.resolve.where(node)}.`);
    return;
  }

  const provide = property(node, 'provide');
  if (!provide) {
    ctx.graph.warn(`Provider without \`provide\` in ${module.name} at ${ctx.resolve.where(node)}.`);
    return;
  }
  const token = ctx.resolve.token(provide);
  const base: CartographNode = {
    id: token.id,
    kind: 'provider',
    name: token.name,
    file: token.cls?.file,
    line: token.cls?.line,
    external: token.cls?.external,
  };

  const useClass = property(node, 'useClass');
  const useFactory = property(node, 'useFactory');
  const useExisting = property(node, 'useExisting');

  if (useClass) {
    const impl = ctx.resolve.classOf(useClass);
    ctx.graph.node({ ...base, providerType: 'class', implementation: impl?.name ?? short(useClass) });
    // Nest builds `Impl`, so its constructor decides what the token depends on.
    if (impl) addClassDependencies(ctx, token.id, impl);
  } else if (useFactory) {
    ctx.graph.node({ ...base, providerType: 'factory' });
    const inject = property(node, 'inject');
    if (inject) {
      ctx.resolve.elementsOf(inject).forEach((dep, at) => {
        let target: ts.Expression = dep;
        let optional = false;
        if (ts.isObjectLiteralExpression(dep)) {
          // `{ token: X, optional: true }`
          const tokenProp = property(dep, 'token');
          if (!tokenProp) return;
          target = tokenProp;
          optional = property(dep, 'optional')?.kind === ts.SyntaxKind.TrueKeyword;
        }
        const t = ctx.resolve.token(target);
        ctx.graph.edge({ kind: 'injects', from: token.id, to: tokenNode(ctx, t), at, optional, forwardRef: t.forwardRef });
      });
    }
  } else if (useExisting) {
    ctx.graph.node({ ...base, providerType: 'alias' });
    ctx.graph.edge({ kind: 'aliases', from: token.id, to: tokenNode(ctx, ctx.resolve.token(useExisting)) });
  } else {
    ctx.graph.node({ ...base, providerType: property(node, 'useValue') ? 'value' : 'unknown' });
  }
  ctx.graph.edge({ kind: 'provides', from: module.id, to: token.id });
}
