import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { parseArgs } from 'node:util';
import { SCHEMA_VERSION, type Cartograph } from '../schema.js';
import { DEFAULT_JSON, toJson } from './analyze.js';
import { readUi, renderHtml } from './html.js';

export interface ViewOptions {
  port: number;
  open: boolean;
}

export const VIEW_OPTIONS = {
  port: { type: 'string', default: '4300' },
  'no-open': { type: 'boolean', default: false },
  out: { type: 'string', short: 'o' },
} as const;

/** `nest-cartograph view [file]`: cartograph.json → UI in the browser (step 2). */
export async function runView(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args: argv, options: VIEW_OPTIONS, allowPositionals: true });
  const file = positionals[0] ?? DEFAULT_JSON;
  const map = readMap(file);
  if (values.out) {
    writeFileSync(values.out, renderHtml(map));
    process.stderr.write(`wrote ${values.out} — open it in any browser, no server needed\n`);
    return 0;
  }
  await serve(map, { port: parsePort(values.port), open: !values['no-open'] });
  return 0;
}

export function readMap(file: string): Cartograph {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    const reason = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'file not found' : (error as Error).message;
    throw new Error(`Cannot read ${file}: ${reason}. Create it with \`nest-cartograph analyze\`.`);
  }
  const version = (parsed as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (version !== SCHEMA_VERSION) {
    throw new Error(`${file} has schemaVersion ${String(version)}; this version of nest-cartograph reads ${SCHEMA_VERSION}. Run \`nest-cartograph analyze\` again.`);
  }
  return parsed as Cartograph;
}

export function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`--port must be a number from 0 to 65535, got "${value}"`);
  return port;
}

/** Serve the UI and the map on 127.0.0.1 until Ctrl+C. Falls back to a free port when the chosen one is taken. */
export async function serve(map: Cartograph, options: ViewOptions): Promise<void> {
  const html = readUi();
  const json = toJson(map);
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (path === '/' || path === '/index.html') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      response.end(html);
    } else if (path === '/cartograph.json') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      response.end(json);
    } else {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    }
  });

  const port = await listen(server, options.port).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EADDRINUSE') throw error;
    return listen(server, 0);
  });
  const url = `http://localhost:${port}`;
  process.stderr.write(`nest-cartograph: ${url}  (Ctrl+C to stop)\n`);
  if (options.open) openBrowser(url);
}

function listen(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      const address = server.address();
      resolve(typeof address === 'object' && address ? address.port : port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

/** Best effort: if no browser opens, the URL is already printed. */
function openBrowser(url: string): void {
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];
  try {
    const child = spawn(command, args as string[], { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    // ignore
  }
}
