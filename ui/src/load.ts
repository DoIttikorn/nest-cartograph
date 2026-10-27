import { SCHEMA_VERSION, type Cartograph } from '../../src/schema.js';

declare global {
  interface Window {
    /** Set by `nest-cartograph view -o file.html`, which embeds the map in the page. */
    __CARTOGRAPH__?: unknown;
    /** Set by `nest-cartograph view` when it serves the page: the absolute folder file paths are relative to. */
    __CARTOGRAPH_ROOT__?: string;
  }
}

/** The absolute project folder, known only when the page is served by `nest-cartograph view`. */
export function projectFolder(): string | undefined {
  return typeof window.__CARTOGRAPH_ROOT__ === 'string' ? window.__CARTOGRAPH_ROOT__ : undefined;
}

/**
 * Where the map comes from, in order:
 * 1. embedded in the page (`view -o`),
 * 2. `./cartograph.json` next to the page (`view` serves it there),
 * 3. nothing — the UI then asks for a file.
 */
export async function loadCartograph(): Promise<Cartograph | null> {
  if (window.__CARTOGRAPH__) return parseCartograph(window.__CARTOGRAPH__);
  let response: Response;
  try {
    response = await fetch('./cartograph.json', { cache: 'no-store' });
  } catch {
    return null; // opened from disk with nothing embedded
  }
  if (!response.ok) return null;
  return parseCartograph(await response.json());
}

export async function readFile(file: File): Promise<Cartograph> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error(`${file.name} is not valid JSON.`);
  }
  return parseCartograph(parsed);
}

export function parseCartograph(value: unknown): Cartograph {
  if (!value || typeof value !== 'object') throw new Error('This is not a cartograph.json file.');
  const map = value as Partial<Cartograph>;
  if (map.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Expected schemaVersion ${SCHEMA_VERSION} but found ${String(map.schemaVersion)}. Run \`nest-cartograph analyze\` again.`);
  }
  if (!Array.isArray(map.nodes) || !Array.isArray(map.edges)) throw new Error('The file has no nodes or edges.');
  return { project: { root: '.' }, cycles: [], warnings: [], ...map } as Cartograph;
}
