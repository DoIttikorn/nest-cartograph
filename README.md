# nest-cartograph

Map a NestJS app — modules, providers, controllers and who injects what — straight from its TypeScript source, then explore the map in your browser.

```bash
npx nest-cartograph
```

Nothing in your app runs: no database, no environment variables, no build. The analyzer reads the code with the TypeScript compiler API, the same way your editor does.

## How it works

Two steps, like `go test -coverprofile` followed by `go tool cover -html`:

| Step | Command | Output |
| --- | --- | --- |
| 1. Analyze | `npx nest-cartograph analyze` | `cartograph.json` |
| 2. View | `npx nest-cartograph view cartograph.json` | an interactive map at `http://localhost:4300` |

`npx nest-cartograph` with no command does both, without writing the JSON.

`cartograph.json` is deterministic — no timestamps, everything sorted — so you can commit it and review how the architecture changed in a pull request.

## Commands

```bash
npx nest-cartograph analyze                       # writes ./cartograph.json
npx nest-cartograph analyze -p apps/api/tsconfig.json -o docs/cartograph.json
npx nest-cartograph analyze -o - | jq '.cycles'   # JSON to stdout
npx nest-cartograph analyze --fail-on-cycles      # exit code 2 on circular imports without forwardRef()

npx nest-cartograph view                          # serves ./cartograph.json and opens the browser
npx nest-cartograph view docs/cartograph.json --port 5055 --no-open
npx nest-cartograph view -o cartograph.html       # one self-contained HTML file, no server needed
```

Summaries, warnings and cycles go to stderr. Run `npx nest-cartograph --help` for everything.

### Following one flow

On a big app the Providers view is too dense to read. Type a name in the search box and press
**Enter** to see only the flow around the matches, laid out left to right from controllers to
repositories and Kafka producers. The panel on the left filters it:

- **Relationship**: what the matches call, what calls them, or both, and how many hops away.
- **Layers**: controllers, services, database, Kafka / events, external APIs, guards, logger / config
  and interfaces, guessed from names. Logger / config, guards and interfaces start hidden; a hidden
  interface is skipped over, so `Controller → IFooService → FooService` reads `Controller → FooService`.
- **Modules**: every module the flow reaches, for example `ReportModule` when searching `employee`,
  with a checkbox to drop it.

**Esc** closes the panels, then leaves the flow view. **Show flow** in a node's details does the same
for that node.

## What the analyzer understands

| In your code | On the map |
| --- | --- |
| `@Module({ imports, providers, controllers, exports })` | modules, what they own, what they export |
| `ConfigModule.forRoot(...)`, `TypeOrmModule.forFeature(...)` | an import labelled with the method |
| `static forRoot() { return { module: ThisModule, providers, exports, global } }` | the returned module's providers and exports |
| `@Global()` | global modules |
| `forwardRef(() => X)` in imports and `@Inject()` | dashed edges and cycle detection |
| `[...SHARED_PROVIDERS]`, `providers: ORDERS_PROVIDERS`, `.concat()` | arrays held in constants, across files |
| `useClass`, `useValue`, `useFactory` + `inject`, `useExisting` | custom providers |
| constructor parameters, `@Inject(TOKEN)`, `@Optional()`, `@Inject()` properties | injection edges |
| string tokens, `Symbol('x')`, constants holding either | one node per token, shared by provider and consumer |
| `@InjectRepository(User)`, `@InjectModel(Cat.name)`, ... | a token named after the decorator call |

It also warns about decorated classes that no module registers, injections without a token, and anything it could not resolve.

**Limits.** Static analysis does not run code: modules picked at runtime (both sides of `cond ? A : B` are shown), providers built in loops, and providers created inside third-party dynamic modules are not visible.

## The JSON format

```jsonc
{
  "schemaVersion": 1,
  "project": { "root": ".", "tsconfig": "tsconfig.json" },
  "nodes": [
    { "id": "src/users/users.module.ts#UsersModule", "kind": "module", "name": "UsersModule", "file": "src/users/users.module.ts", "line": 6 },
    { "id": "src/users/users.service.ts#UsersService", "kind": "provider", "providerType": "class", "name": "UsersService", "file": "src/users/users.service.ts", "line": 8 }
  ],
  "edges": [
    { "from": "src/app.module.ts#AppModule", "to": "src/users/users.module.ts#UsersModule", "kind": "imports" },
    { "from": "src/users/users.module.ts#UsersModule", "to": "src/users/users.service.ts#UsersService", "kind": "provides" }
  ],
  "cycles": [{ "ids": ["..."], "names": ["UsersModule", "OrdersModule"], "guarded": true }],
  "warnings": []
}
```

Edge kinds: `imports`, `provides`, `controls`, `exports`, `injects`, `aliases`. The full types are in [`src/schema.ts`](src/schema.ts), and also exported:

```ts
import { analyze, type Cartograph } from 'nest-cartograph';

const map: Cartograph = analyze({ project: 'tsconfig.json' });
```

## Requirements

Node.js 22 or later. The analyzer brings its own TypeScript 6, so it works whatever TypeScript your project uses — including TypeScript 7, which has no compiler API yet.

## Development

```bash
npm install
npm test            # analyzer golden test + UI logic tests (vitest)
npm run test:update # rewrite test/testdata/app.golden.json after an intended change
npm run lint        # oxlint
npm run typecheck   # src + test, and ui/
npm run build       # tsc → dist/, then vite → dist/ui/index.html
npm run dev:ui      # UI with hot reload, on the fixture app's map
node dist/cli/index.js -p test/fixtures/tsconfig.json   # try the built CLI
```

```
src/
  cli/          index.ts (commands) · analyze.ts (step 1) · view.ts (step 2: server, browser) · html.ts (embed JSON in the UI)
  analyzer/     index.ts (the passes) · program.ts (tsconfig → ts.Program) · resolve.ts (names → classes, tokens, arrays)
                modules.ts (@Module, forRoot) · providers.ts (custom providers) · injection.ts (constructors, @Inject)
                context.ts (shared state) · ast.ts (syntax helpers)
  graph/        builder.ts (dedupe, placeholders, stable order) · cycles.ts (Tarjan)
  schema.ts     the cartograph.json contract, shared with the UI
ui/             React + React Flow (@xyflow/react) + elkjs, built by Vite into ONE html file
  src/          App.tsx · load.ts · toFlow.ts (JSON → nodes/edges) · layout.ts (ELK positions + edge routes)
                measure.ts (text widths) · nodes/ · edges/RoutedEdge.tsx · panels/
test/
  fixtures/app  a NestJS app exercising every case above
  testdata/     golden output
```

Releases: bump `version` in package.json, commit, then `git tag v0.1.0 && git push --tags`. The release workflow publishes with npm Trusted Publishing. The very first version has to be published by hand (`npm publish`), because the Trusted Publisher setting lives on the package's page on npmjs.com.

## License

MIT. The bundled UI includes [elkjs](https://github.com/kieler/elkjs) (EPL-2.0) and [React Flow](https://reactflow.dev) (MIT).
