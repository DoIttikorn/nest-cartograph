import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Cartograph } from '../schema.js';

/** The UI, built by Vite into one self-contained HTML file. */
const UI_HTML = fileURLToPath(new URL('../ui/index.html', import.meta.url));

export function readUi(): string {
  if (!existsSync(UI_HTML)) {
    throw new Error(`The UI is not built (${UI_HTML} is missing). Run \`npm run build:ui\` first.`);
  }
  return readFileSync(UI_HTML, 'utf8');
}

/**
 * The UI with the map embedded, so the file opens straight from disk — no server needed.
 * The UI reads `window.__CARTOGRAPH__` before it tries to fetch `./cartograph.json`.
 */
export function renderHtml(map: Cartograph): string {
  const html = readUi();
  const script = `<script>window.__CARTOGRAPH__ = ${safeJson(map)};</script>`;
  // Insert right after the opening <head> tag: it comes before the inlined bundle, whose code
  // may itself contain the text "</head>". A classic script runs before the deferred module one.
  const head = /<head[^>]*>/i.exec(html);
  if (!head) return `${script}\n${html}`;
  const at = head.index + head[0].length;
  return `${html.slice(0, at)}\n${script}${html.slice(at)}`;
}

/** JSON that cannot close the <script> element it sits in. */
function safeJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
}
