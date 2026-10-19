import path from 'node:path';
import ts from 'typescript';
import { isInNodeModules } from './ast.js';

export interface ProgramOptions {
  /** tsconfig.json to read. Default: `tsconfig.json` in the current directory. Ignored when `files` is set. */
  project?: string;
  /** Analyse these entry files instead of reading a tsconfig. Their imports are followed. */
  files?: string[];
  /** File paths in the output are relative to this directory. Default: the tsconfig's directory, or the current directory. */
  rootDir?: string;
  /** Skip source files whose path contains the string or matches the RegExp. Default: spec and test files. */
  exclude?: (string | RegExp)[];
}

export interface LoadedProgram {
  program: ts.Program;
  rootDir: string;
  /** Absolute path of the tsconfig that was read. */
  tsconfig?: string;
  /** The files to look for decorated classes in: no declaration files, nothing from node_modules, no excluded files. */
  sourceFiles: ts.SourceFile[];
}

const DEFAULT_EXCLUDE = [/\.(spec|test|e2e-spec)\.[cm]?tsx?$/];

/** Options that make any NestJS source parse the way Nest compiles it, whatever the tsconfig says. */
const REQUIRED: ts.CompilerOptions = { experimentalDecorators: true, noEmit: true, skipLibCheck: true };

export function loadProgram(options: ProgramOptions): LoadedProgram {
  const exclude = options.exclude ?? DEFAULT_EXCLUDE;
  const keep = (sf: ts.SourceFile) =>
    !sf.isDeclarationFile &&
    !isInNodeModules(sf.fileName) &&
    !exclude.some((p) => (typeof p === 'string' ? sf.fileName.includes(p) : p.test(sf.fileName)));

  if (options.files) {
    const files = options.files.map((f) => path.resolve(f));
    const missing = files.filter((f) => !ts.sys.fileExists(f));
    if (missing.length > 0) throw new Error(`File not found: ${missing.join(', ')}`);
    const program = ts.createProgram(files, {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      ...REQUIRED,
    });
    return { program, rootDir: path.resolve(options.rootDir ?? process.cwd()), sourceFiles: program.getSourceFiles().filter(keep) };
  }

  const tsconfig = path.resolve(options.project ?? 'tsconfig.json');
  if (!ts.sys.fileExists(tsconfig)) {
    throw new Error(`No tsconfig found at ${tsconfig}. Run inside a NestJS project, or pass --project <path/to/tsconfig.json>.`);
  }
  const read = ts.readConfigFile(tsconfig, ts.sys.readFile);
  if (read.error) throw new Error(`Cannot read ${tsconfig}: ${ts.flattenDiagnosticMessageText(read.error.messageText, '\n')}`);
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(tsconfig), REQUIRED, tsconfig);
  if (parsed.fileNames.length === 0) throw new Error(`${tsconfig} does not include any source files.`);
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options, projectReferences: parsed.projectReferences });
  return {
    program,
    rootDir: path.resolve(options.rootDir ?? path.dirname(tsconfig)),
    tsconfig,
    sourceFiles: program.getSourceFiles().filter(keep),
  };
}
