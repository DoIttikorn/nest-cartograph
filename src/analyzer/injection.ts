import ts from 'typescript';
import { decoratorsOf, isCustomInject, type DecoratorInfo } from './ast.js';
import { tokenNode, type Context } from './context.js';
import type { ClassInfo, Token } from './resolve.js';

/**
 * Add `injects` edges from `from` for every constructor parameter and `@Inject()` property of `cls`.
 * When the class has no constructor, the nearest parent class constructor is used, as Nest does.
 */
export function addClassDependencies(ctx: Context, from: string, cls: ClassInfo): void {
  const key = `${from}\u0000${cls.id}`;
  if (ctx.analysed.has(key) || cls.external) return;
  ctx.analysed.add(key);

  let owner: ts.ClassDeclaration | undefined = cls.decl;
  let ctor: ts.ConstructorDeclaration | undefined;
  for (let hops = 0; owner && hops < 10; hops++) {
    ctor = owner.members.find(ts.isConstructorDeclaration);
    if (ctor) break;
    const heritage: ts.ExpressionWithTypeArguments | undefined = owner.heritageClauses?.find(
      (h) => h.token === ts.SyntaxKind.ExtendsKeyword,
    )?.types[0];
    const parent: ts.Declaration | undefined = heritage ? ctx.resolve.declarationOf(heritage.expression) : undefined;
    owner = parent && ts.isClassDeclaration(parent) ? parent : undefined;
  }

  ctor?.parameters.forEach((param, at) => {
    const dep = injectedToken(ctx, decoratorsOf(param), param.type, `${cls.name} constructor parameter #${at}`, param);
    if (dep) ctx.graph.edge({ kind: 'injects', from, to: tokenNode(ctx, dep.token), at, optional: dep.optional, forwardRef: dep.token.forwardRef });
  });

  for (const member of cls.decl.members) {
    if (!ts.isPropertyDeclaration(member) || !ts.isIdentifier(member.name)) continue;
    const decorators = decoratorsOf(member);
    if (!decorators.some((d) => d.name === 'Inject' || isCustomInject(d.name))) continue;
    const at = member.name.text;
    const dep = injectedToken(ctx, decorators, member.type, `${cls.name}.${at}`, member);
    if (dep) ctx.graph.edge({ kind: 'injects', from, to: tokenNode(ctx, dep.token), at, optional: dep.optional, forwardRef: dep.token.forwardRef });
  }
}

/** The token Nest would inject for one parameter or property, or undefined if there is none. */
function injectedToken(
  ctx: Context,
  decorators: DecoratorInfo[],
  type: ts.TypeNode | undefined,
  label: string,
  node: ts.Node,
): { token: Token; optional: boolean } | undefined {
  const optional = decorators.some((d) => d.name === 'Optional');

  const inject = decorators.find((d) => d.name === 'Inject');
  if (inject?.args[0]) return { token: ctx.resolve.token(inject.args[0]), optional };

  const custom = decorators.find((d) => isCustomInject(d.name));
  if (custom) {
    const name = `${custom.name}(${custom.args.map((a) => a.getText()).join(', ')})`;
    return { token: { id: `token:${name}`, name }, optional };
  }

  // No decorator: Nest uses the parameter's type, which only works for classes.
  if (type && ts.isTypeReferenceNode(type)) {
    const decl = ctx.resolve.declarationOf(type.typeName);
    if (decl && ts.isClassDeclaration(decl)) {
      const cls = ctx.resolve.classInfo(decl);
      return { token: { id: cls.id, name: cls.name, cls }, optional };
    }
  }
  if (!optional) {
    ctx.graph.warn(`${label} at ${ctx.resolve.where(node)} has no injection token: its type is not a class and there is no @Inject().`);
  }
  return undefined;
}
