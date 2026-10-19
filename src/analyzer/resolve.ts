import path from 'node:path';
import ts from 'typescript';
import { calleeName, decoratorsOf, isInNodeModules, packageOf, property, short, unwrap } from './ast.js';

/** A class the analyzer has seen, in the project or in a dependency. */
export interface ClassInfo {
  decl: ts.ClassDeclaration;
  /** `<file>#<Name>` for project classes, `ext:<package>#<Name>` for classes from node_modules. */
  id: string;
  name: string;
  file?: string;
  line?: number;
  external: boolean;
  decorators: Set<string>;
}

/** What one entry of `imports: [...]` points to. */
export interface ModuleRef {
  cls: ClassInfo;
  /** Static method used, for example `forRoot`. */
  via?: string;
  forwardRef?: boolean;
  dynamic?: boolean;
}

/** An injection token: a class, a string, a symbol, or a constant holding one of those. */
export interface Token {
  id: string;
  name: string;
  cls?: ClassInfo;
  forwardRef?: boolean;
}

const MAX_DEPTH = 8;

/**
 * Follows names back to what they mean: identifiers to class declarations across files and
 * re-exports, constants to their values, `forwardRef(() => X)` to `X`, spreads to array elements.
 */
export class Resolver {
  readonly #classes = new Map<ts.ClassDeclaration, ClassInfo>();
  readonly #takenIds = new Set<string>();
  readonly #checker: ts.TypeChecker;
  readonly #rootDir: string;
  readonly #warn: (message: string) => void;

  constructor(checker: ts.TypeChecker, rootDir: string, warn: (message: string) => void) {
    this.#checker = checker;
    this.#rootDir = rootDir;
    this.#warn = warn;
  }

  /** Path relative to the project root, with forward slashes on every OS. */
  relative(fileName: string): string {
    return path.relative(this.#rootDir, fileName).split(path.sep).join('/');
  }

  /** `src/users/users.module.ts:12`, for warnings. */
  where(node: ts.Node): string {
    const sf = node.getSourceFile();
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    return `${this.relative(sf.fileName)}:${line + 1}`;
  }

  classInfo(decl: ts.ClassDeclaration): ClassInfo {
    const known = this.#classes.get(decl);
    if (known) return known;
    const sf = decl.getSourceFile();
    const name = decl.name?.text ?? 'AnonymousClass';
    const external = sf.isDeclarationFile || isInNodeModules(sf.fileName);
    const base = external ? `ext:${packageOf(sf.fileName)}#${name}` : `${this.relative(sf.fileName)}#${name}`;
    const info: ClassInfo = {
      decl,
      id: this.#uniqueId(base),
      name,
      external,
      decorators: new Set(decoratorsOf(decl).map((d) => d.name)),
      ...(external ? {} : { file: this.relative(sf.fileName), line: sf.getLineAndCharacterOfPosition(decl.getStart(sf)).line + 1 }),
    };
    this.#classes.set(decl, info);
    return info;
  }

  /** The symbol a name points to, following `import { X } from` and `export { X } from`. */
  symbolOf(node: ts.Node): ts.Symbol | undefined {
    let symbol = this.#checker.getSymbolAtLocation(ts.isPropertyAccessExpression(node) ? node.name : node);
    while (symbol && symbol.flags & ts.SymbolFlags.Alias) {
      const next = this.#checker.getAliasedSymbol(symbol);
      if (next === symbol) break;
      symbol = next;
    }
    return symbol;
  }

  declarationOf(node: ts.Node): ts.Declaration | undefined {
    const symbol = this.symbolOf(node);
    return symbol?.valueDeclaration ?? symbol?.declarations?.[0];
  }

  classOf(node: ts.Node): ClassInfo | undefined {
    const decl = this.declarationOf(node);
    return decl && ts.isClassDeclaration(decl) ? this.classInfo(decl) : undefined;
  }

  /** Follow `const X = <expr>` and `{ KEY: <expr> }` back to the expression that defines a value. */
  definitionOf(node: ts.Expression, depth = 0): ts.Expression | undefined {
    if (depth > MAX_DEPTH) return undefined;
    const decl = this.declarationOf(node);
    return decl ? this.#initializerOf(decl, depth) : undefined;
  }

  /** Flatten an array expression, following spreads, constants and `.concat()`. */
  elementsOf(expr: ts.Expression, depth = 0): ts.Expression[] {
    const node = unwrap(expr);
    if (depth > MAX_DEPTH) return [];
    if (ts.isArrayLiteralExpression(node)) {
      return node.elements.flatMap((el) => (ts.isSpreadElement(el) ? this.elementsOf(el.expression, depth + 1) : [unwrap(el)]));
    }
    if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) {
      const def = this.definitionOf(node);
      if (def && ts.isArrayLiteralExpression(def)) return this.elementsOf(def, depth + 1);
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'concat') {
      return [...this.elementsOf(node.expression.expression, depth + 1), ...node.arguments.flatMap((a) => this.elementsOf(a, depth + 1))];
    }
    this.#warn(`Could not read the array \`${short(node)}\` at ${this.where(node)}.`);
    return [];
  }

  /** `X` for `forwardRef(() => X)`, otherwise undefined. */
  forwardRefTarget(node: ts.Expression): ts.Expression | undefined {
    if (!ts.isCallExpression(node) || calleeName(node) !== 'forwardRef') return undefined;
    const fn = node.arguments[0] && unwrap(node.arguments[0]);
    if (!fn || !(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) return undefined;
    if (ts.isBlock(fn.body)) {
      const ret = fn.body.statements.find(ts.isReturnStatement);
      return ret?.expression && unwrap(ret.expression);
    }
    return unwrap(fn.body);
  }

  /** The module(s) one entry of `imports: [...]` refers to. A ternary yields both branches. */
  moduleRefs(expr: ts.Expression, depth = 0): ModuleRef[] {
    const node = unwrap(expr);
    if (depth > MAX_DEPTH) return [];
    const forwarded = this.forwardRefTarget(node);
    if (forwarded) return this.moduleRefs(forwarded, depth + 1).map((r) => ({ ...r, forwardRef: true }));
    if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) {
      const cls = this.classOf(node);
      if (cls) return [{ cls }];
      const def = this.definitionOf(node);
      if (def) return this.moduleRefs(def, depth + 1);
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const cls = this.classOf(node.expression.expression);
      if (cls) return [{ cls, via: node.expression.name.text, dynamic: true }];
    }
    if (ts.isAwaitExpression(node)) return this.moduleRefs(node.expression, depth + 1);
    if (ts.isConditionalExpression(node)) return [...this.moduleRefs(node.whenTrue, depth + 1), ...this.moduleRefs(node.whenFalse, depth + 1)];
    if (ts.isObjectLiteralExpression(node)) {
      const moduleProp = property(node, 'module');
      const cls = moduleProp && this.classOf(moduleProp);
      if (cls) return [{ cls, dynamic: true }];
    }
    this.#warn(`Could not resolve the import \`${short(node)}\` at ${this.where(node)}.`);
    return [];
  }

  token(expr: ts.Expression, depth = 0): Token {
    const node = unwrap(expr);
    const forwarded = this.forwardRefTarget(node);
    if (forwarded) return { ...this.token(forwarded, depth + 1), forwardRef: true };
    if (ts.isStringLiteralLike(node)) return { id: `token:${node.text}`, name: node.text };
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText();
      const arg = node.arguments[0] && unwrap(node.arguments[0]);
      if ((callee === 'Symbol' || callee === 'Symbol.for') && arg && ts.isStringLiteralLike(arg)) {
        return { id: `token:${arg.text}`, name: arg.text };
      }
    }
    if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) {
      const cls = this.classOf(node);
      if (cls) return { id: cls.id, name: cls.name, cls };
      // `Cat.name` is a string token equal to the class name.
      if (ts.isPropertyAccessExpression(node) && node.name.text === 'name') {
        const owner = this.classOf(node.expression);
        if (owner) return { id: `token:${owner.name}`, name: owner.name };
      }
      if (depth < MAX_DEPTH) {
        const def = this.definitionOf(node);
        if (def && (ts.isStringLiteralLike(def) || ts.isCallExpression(def) || ts.isIdentifier(def) || ts.isPropertyAccessExpression(def))) {
          const resolved = this.token(def, depth + 1);
          if (!resolved.id.startsWith('expr:')) return resolved;
        }
      }
      return { id: `token:${node.getText()}`, name: node.getText() };
    }
    return { id: `expr:${short(node)}`, name: short(node) };
  }

  #initializerOf(decl: ts.Declaration, depth: number): ts.Expression | undefined {
    if ((ts.isVariableDeclaration(decl) || ts.isPropertyAssignment(decl) || ts.isEnumMember(decl)) && decl.initializer) {
      return unwrap(decl.initializer);
    }
    if (ts.isShorthandPropertyAssignment(decl) && depth < MAX_DEPTH) {
      // `{ providers }`: the value lives in the variable named `providers`.
      const value = this.#checker.getShorthandAssignmentValueSymbol(decl)?.valueDeclaration;
      return value ? this.#initializerOf(value, depth + 1) : undefined;
    }
    return undefined;
  }

  #uniqueId(base: string): string {
    let id = base;
    for (let n = 2; this.#takenIds.has(id); n++) id = `${base}~${n}`;
    this.#takenIds.add(id);
    return id;
  }
}
