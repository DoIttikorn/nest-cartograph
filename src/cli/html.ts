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
  return withScript(readUi(), `window.__CARTOGRAPH__ = ${safeJson(map)};`);
}

/**
 * The UI as `view` serves it, with the absolute project folder so file paths can open in VS Code or Zed.
 * Only for the local server: a written HTML file is shared, and must not carry paths from this machine.
 */
export function renderServedHtml(projectFolder: string): string {
  return withScript(readUi(), `window.__CARTOGRAPH_ROOT__ = ${safeJson(projectFolder)};`);
}

function withScript(html: string, code: string): string {
  const script = `<script>${code}</script>`;
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
