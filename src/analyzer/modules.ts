import ts from 'typescript';
import { decoratorsOf, isInNodeModules, isStatic, property, returnedObjects, short, unwrap, type DecoratorInfo } from './ast.js';
import { classNode, tokenNode, type Context } from './context.js';
import { addClassDependencies } from './injection.js';
import { addProvider } from './providers.js';
import type { ClassInfo } from './resolve.js';

export const PROVIDER_DECORATORS = new Set(['Injectable', 'Controller', 'Resolver', 'WebSocketGateway']);
const CLASS_DECORATORS = new Set(['Module', 'Global', ...PROVIDER_DECORATORS]);
const NEST_PACKAGE = /[\\/]node_modules[\\/]@nestjs[\\/]/;

/** Every class in the source files that carries a Nest class decorator. */
export function findDecoratedClasses(ctx: Context, sourceFiles: readonly ts.SourceFile[]): ClassInfo[] {
  const found: ClassInfo[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isClassDeclaration(node) && node.name && decoratorsOf(node).some((d) => isNestDecorator(ctx, d))) {
      const info = ctx.resolve.classInfo(node);
      found.push(info);
      if (info.decorators.has('Module')) ctx.moduleClasses.add(info.id);
    }
    ts.forEachChild(node, visit);
  };
  for (const sf of sourceFiles) visit(sf);
  return found;
}

/** Read one `@Module()` class: its metadata, plus whatever its static `forRoot()`-style methods return. */
export function readModule(ctx: Context, info: ClassInfo): void {
  ctx.graph.node({ ...classNode(info, 'module'), global: info.decorators.has('Global') });

  const decorator = decoratorsOf(info.decl).find((d) => d.name === 'Module');
  const arg = decorator?.args[0] && unwrap(decorator.args[0]);
  const metadata = arg && (ts.isObjectLiteralExpression(arg) ? arg : ctx.resolve.definitionOf(arg));
  if (metadata && ts.isObjectLiteralExpression(metadata)) readMetadata(ctx, info, metadata);
  else if (arg) ctx.graph.warn(`Could not read the @Module() metadata of ${info.name} at ${ctx.resolve.where(arg)}.`);

  // static forRoot() / register() / forFeature() returning `{ module: ThisModule, providers, exports }`
  for (const member of info.decl.members) {
    if (!ts.isMethodDeclaration(member) || !member.body || !isStatic(member)) continue;
    for (const literal of returnedObjects(member.body)) {
      const target = property(literal, 'module');
      if (!target || (target.kind !== ts.SyntaxKind.ThisKeyword && ctx.resolve.classOf(target)?.id !== info.id)) continue;
      readMetadata(ctx, info, literal);
      if (property(literal, 'global')?.kind === ts.SyntaxKind.TrueKeyword) {
        ctx.graph.node({ ...classNode(info, 'module'), global: true });
      }
    }
  }
}

function readMetadata(ctx: Context, module: ClassInfo, metadata: ts.ObjectLiteralExpression): void {
  const imported = new Set<string>();

  const imports = property(metadata, 'imports');
  if (imports) {
    for (const el of ctx.resolve.elementsOf(imports)) {
      for (const ref of ctx.resolve.moduleRefs(el)) {
        ctx.graph.node({ ...classNode(ref.cls, 'module'), dynamic: ref.dynamic });
        ctx.graph.edge({ kind: 'imports', from: module.id, to: ref.cls.id, forwardRef: ref.forwardRef, via: ref.via });
        imported.add(ref.cls.id);
      }
    }
  }

  const providers = property(metadata, 'providers');
  if (providers) for (const el of ctx.resolve.elementsOf(providers)) addProvider(ctx, module, el);

  const controllers = property(metadata, 'controllers');
  if (controllers) {
    for (const el of ctx.resolve.elementsOf(controllers)) {
      const cls = ctx.resolve.classOf(el);
      if (!cls) {
        ctx.graph.warn(`Could not resolve the controller \`${short(el)}\` in ${module.name} at ${ctx.resolve.where(el)}.`);
        continue;
      }
      ctx.graph.node(classNode(cls, 'controller'));
      ctx.graph.edge({ kind: 'controls', from: module.id, to: cls.id });
      addClassDependencies(ctx, cls.id, cls);
    }
  }

  const exportsProp = property(metadata, 'exports');
  if (exportsProp) {
    for (const el of ctx.resolve.elementsOf(exportsProp)) {
      const reexported = moduleTarget(ctx, el, imported);
      if (reexported) {
        ctx.graph.edge({ kind: 'exports', from: module.id, to: reexported });
        continue;
      }
      const tokenExpr = ts.isObjectLiteralExpression(el) ? property(el, 'provide') : el;
      if (!tokenExpr) continue;
      // A provider object listed directly in `exports` is also provided.
      if (ts.isObjectLiteralExpression(el)) addProvider(ctx, module, el);
      ctx.graph.edge({ kind: 'exports', from: module.id, to: tokenNode(ctx, ctx.resolve.token(tokenExpr)) });
    }
  }
}

/** If an `exports` entry is a module (a re-export), its id. */
function moduleTarget(ctx: Context, el: ts.Expression, imported: Set<string>): string | undefined {
  const node = unwrap(el);
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    return ctx.resolve.classOf(node.expression.expression)?.id;
  }
  if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) {
    const cls = ctx.resolve.classOf(node);
    if (cls && (ctx.moduleClasses.has(cls.id) || imported.has(cls.id) || cls.decorators.has('Module'))) return cls.id;
  }
  return undefined;
}

/** `@Module`, `@Injectable`, ... imported from `@nestjs/*`, or from the project itself (custom wrappers). */
function isNestDecorator(ctx: Context, decorator: DecoratorInfo): boolean {
  if (!CLASS_DECORATORS.has(decorator.name)) return false;
  const expr = decorator.node.expression;
  const target = ts.isCallExpression(expr) ? expr.expression : expr;
  const file = ctx.resolve.declarationOf(target)?.getSourceFile().fileName;
  // Types not installed, or declared in the project: trust the name.
  if (!file || !isInNodeModules(file)) return true;
  return NEST_PACKAGE.test(file);
}
