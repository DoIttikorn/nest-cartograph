import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { analyze } from '../analyzer/index.js';
import type { Cartograph } from '../schema.js';

export const DEFAULT_JSON = 'cartograph.json';

/** `nest-cartograph analyze`: source code → cartograph.json (step 1). */
export function runAnalyze(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      project: { type: 'string', short: 'p' },
      out: { type: 'string', short: 'o', default: DEFAULT_JSON },
      'fail-on-cycles': { type: 'boolean', default: false },
      quiet: { type: 'boolean', short: 'q', default: false },
    },
  });

  const map = analyze({ project: values.project });
  const json = toJson(map);
  if (values.out === '-') process.stdout.write(json);
  else writeFileSync(values.out, json);

  if (!values.quiet) report(map, values.out === '-' ? undefined : values.out);
  return values['fail-on-cycles'] && map.cycles.some((c) => !c.guarded) ? 2 : 0;
}

export function toJson(map: Cartograph): string {
  return `${JSON.stringify(map, null, 2)}\n`;
}

/** Summary, warnings and cycles on stderr, so stdout stays clean for `-o -`. */
export function report(map: Cartograph, writtenTo?: string): void {
  const count = (kind: string) => {
    const n = map.nodes.filter((node) => node.kind === kind).length;
    return `${n} ${kind}${n === 1 ? '' : 's'}`;
  };
  const summary = `${count('module')}, ${count('provider')}, ${count('controller')}`;
  process.stderr.write(writtenTo ? `wrote ${writtenTo} (${summary})\n` : `${summary}\n`);
  for (const cycle of map.cycles) {
    const path = [...cycle.names, cycle.names[0]].join(' → ');
    process.stderr.write(`${cycle.guarded ? 'cycle (forwardRef)' : 'cycle WITHOUT forwardRef'}: ${path}\n`);
  }
  for (const warning of map.warnings) process.stderr.write(`warning: ${warning}\n`);
}
