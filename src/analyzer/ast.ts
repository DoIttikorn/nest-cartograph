import path from 'node:path';
import ts from 'typescript';

/** Small, stateless helpers for reading TypeScript syntax trees. */

export interface DecoratorInfo {
  /** `Module` for both `@Module()` and `@common.Module()`. */
  name: string;
  args: readonly ts.Expression[];
  node: ts.Decorator;
}

export function decoratorsOf(node: ts.Node): DecoratorInfo[] {
  if (!ts.canHaveDecorators(node)) return [];
  return (ts.getDecorators(node) ?? []).flatMap((decorator) => {
    const expr = decorator.expression;
    const call = ts.isCallExpression(expr) ? expr : undefined;
    const target = call ? call.expression : expr;
    const name = ts.isIdentifier(target) ? target.text : ts.isPropertyAccessExpression(target) ? target.name.text : undefined;
    return name ? [{ name, args: call?.arguments ?? [], node: decorator }] : [];
  });
}

/** The value of `name` in an object literal: `{ name: value }` or the shorthand `{ name }`. */
export function property(object: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  for (const prop of object.properties) {
    const key = prop.name && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : undefined);
    if (key !== name) continue;
    if (ts.isPropertyAssignment(prop)) return unwrap(prop.initializer);
    if (ts.isShorthandPropertyAssignment(prop)) return prop.name;
    return undefined;
  }
  return undefined;
}

/** Strip parentheses, `as`, `satisfies`, `<T>` casts and `!`. */
export function unwrap(expr: ts.Expression): ts.Expression {
  let node = expr;
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    node = node.expression;
  }
  return node;
}

/** Object literals returned by a function body, ignoring returns inside nested functions. */
export function returnedObjects(body: ts.Block): ts.ObjectLiteralExpression[] {
  const found: ts.ObjectLiteralExpression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node) && node.expression) {
      const value = unwrap(node.expression);
      if (ts.isObjectLiteralExpression(value)) found.push(value);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return found;
}

export function calleeName(call: ts.CallExpression): string | undefined {
  const e = call.expression;
  return ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : undefined;
}

export function isStatic(member: ts.ClassElement): boolean {
  return ts.canHaveModifiers(member) && (ts.getModifiers(member) ?? []).some((m) => m.kind === ts.SyntaxKind.StaticKeyword);
}

/** `@InjectRepository(User)`, `@InjectModel(Cat.name)`, `@InjectQueue('mail')`, ... */
export function isCustomInject(name: string): boolean {
  return name.startsWith('Inject') && name !== 'Inject' && name !== 'Injectable';
}

/** Source text on one line, cut to 60 characters, for warnings. */
export function short(node: ts.Node): string {
  const text = node.getText().replace(/\s+/g, ' ');
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

/** `@nestjs/common` for a file inside `node_modules/@nestjs/common/...`. */
export function packageOf(fileName: string): string {
  const parts = fileName.split(/[\\/]/);
  const at = parts.lastIndexOf('node_modules');
  if (at === -1) return path.basename(fileName);
  const first = parts[at + 1] ?? '';
  return first.startsWith('@') ? `${first}/${parts[at + 2] ?? ''}` : first;
}

export function isInNodeModules(fileName: string): boolean {
  return /[\\/]node_modules[\\/]/.test(fileName);
}
