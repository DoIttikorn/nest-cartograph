/**
 * The shape of `cartograph.json`: the contract between the analyzer (step 1) and the UI (step 2).
 *
 * The file is deterministic — no timestamps, nodes and edges sorted by id — so it only changes
 * when the code changes, and can be committed and diffed like a Go golden file.
 * Bump SCHEMA_VERSION whenever a field changes meaning or is removed.
 */
export const SCHEMA_VERSION = 1;

export type NodeKind = 'module' | 'provider' | 'controller';

/** How a provider is defined. `unknown` means it is injected somewhere but no definition was found. */
export type ProviderType = 'class' | 'value' | 'factory' | 'alias' | 'unknown';

export interface CartographNode {
  /** Unique id: `<file>#<ClassName>` for classes, `token:<name>` for string and symbol tokens. */
  id: string;
  kind: NodeKind;
  /** Class name, or the injection token for custom providers. */
  name: string;
  /** Source file, relative to `project.root`. */
  file?: string;
  /** 1-based line of the class declaration. */
  line?: number;
  /** Module decorated with `@Global()` or returning `global: true` from a static method. */
  global?: boolean;
  /** Module imported through a static method such as `forRoot()`. */
  dynamic?: boolean;
  providerType?: ProviderType;
  /** For `{ provide: TOKEN, useClass: Impl }`: the name of `Impl`. */
  implementation?: string;
  /** Declared outside the analysed source, for example in `node_modules`. */
  external?: boolean;
}

export type EdgeKind =
  /** module → module */
  | 'imports'
  /** module → provider */
  | 'provides'
  /** module → controller */
  | 'controls'
  /** module → provider, or module → module for re-exports */
  | 'exports'
  /** provider/controller → provider: constructor parameter, `@Inject()` property or factory `inject` */
  | 'injects'
  /** provider → provider, for `useExisting` */
  | 'aliases';

export interface CartographEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  /** The reference is wrapped in `forwardRef()`. */
  forwardRef?: boolean;
  /** `injects` only: the dependency is marked `@Optional()`. */
  optional?: boolean;
  /** `imports` only: the static method used, for example `forRoot`. */
  via?: string;
  /** `injects` only: constructor parameter index, or property name for property injection. */
  at?: number | string;
}

export interface ModuleCycle {
  /** Ids of modules that import each other, directly or through other modules in the group. */
  ids: string[];
  names: string[];
  /** Every import inside the group is wrapped in `forwardRef()`. Unguarded cycles fail at startup. */
  guarded: boolean;
}

export interface Cartograph {
  schemaVersion: typeof SCHEMA_VERSION;
  project: {
    /** Directory the file paths are relative to, relative to where the analyzer ran. */
    root: string;
    /** tsconfig that was analysed, relative to `root`. Absent when files were passed directly. */
    tsconfig?: string;
  };
  nodes: CartographNode[];
  edges: CartographEdge[];
  cycles: ModuleCycle[];
  /** Things the analyzer could not resolve, with a location when one is known. */
  warnings: string[];
}
