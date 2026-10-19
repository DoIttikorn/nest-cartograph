#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { analyze } from '../analyzer/index.js';
import { report, runAnalyze } from './analyze.js';
import { renderHtml } from './html.js';
import { parsePort, runView, serve, VIEW_OPTIONS } from './view.js';

const HELP = `nest-cartograph — map a NestJS app from its source code

Usage
  nest-cartograph [options]              analyze, then open the map in the browser
  nest-cartograph analyze [options]      step 1: source code → cartograph.json
  nest-cartograph view [file] [options]  step 2: cartograph.json → map in the browser

analyze
  -p, --project <file>   tsconfig.json to read (default: ./tsconfig.json)
  -o, --out <file>       where to write the JSON; "-" for stdout (default: cartograph.json)
      --fail-on-cycles   exit with code 2 when modules import each other without forwardRef()
  -q, --quiet            no summary or warnings on stderr

view
      --port <n>         port to serve on (default: 4300; a free one is used if taken)
      --no-open          do not open the browser
  -o, --out <file>       write one self-contained HTML file instead of serving

Examples
  npx nest-cartograph
  npx nest-cartograph analyze -o docs/cartograph.json
  npx nest-cartograph view docs/cartograph.json -o docs/cartograph.html
`;

async function main(argv: string[]): Promise<number> {
  const [first, ...rest] = argv;
  if (first === '-h' || first === '--help' || first === 'help') return print(HELP);
  if (first === '-v' || first === '--version') return print(`${version()}\n`);

  switch (first) {
    case 'analyze':
      return runAnalyze(rest);
    case 'view':
      return runView(rest);
    default:
      if (first !== undefined && !first.startsWith('-')) throw new UsageError(`Unknown command "${first}".`);
      return runAll(argv);
  }
}

/** No subcommand: both steps in one go, without writing cartograph.json. */
async function runAll(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: { project: { type: 'string', short: 'p' }, quiet: { type: 'boolean', short: 'q', default: false }, ...VIEW_OPTIONS },
  });
  const map = analyze({ project: values.project });
  if (!values.quiet) report(map);
  if (values.out) {
    writeFileSync(values.out, renderHtml(map));
    process.stderr.write(`wrote ${values.out}\n`);
    return 0;
  }
  await serve(map, { port: parsePort(values.port), open: !values['no-open'] });
  return 0;
}

function print(text: string): number {
  process.stdout.write(text);
  return 0;
}

function version(): string {
  return (createRequire(import.meta.url)('../../package.json') as { version: string }).version;
}

class UsageError extends Error {}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`nest-cartograph: ${message}\n`);
    const code = (error as { code?: string }).code;
    if (error instanceof UsageError || code?.startsWith('ERR_PARSE_ARGS')) process.stderr.write('Run nest-cartograph --help for usage.\n');
    process.exitCode = 1;
  },
);
