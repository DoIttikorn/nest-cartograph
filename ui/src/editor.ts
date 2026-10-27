export type Editor = 'vscode' | 'zed';

export const EDITORS: { editor: Editor; label: string }[] = [
  { editor: 'vscode', label: 'VS Code' },
  { editor: 'zed', label: 'Zed' },
];

/**
 * A link that opens `file` at `line` in the editor: `vscode://file/<path>:<line>` or `zed://file/<path>:<line>`.
 * `root` is the absolute project folder; `file` is relative to it, as in cartograph.json.
 */
export function editorUrl(editor: Editor, root: string, file: string, line?: number): string {
  const path = joinPath(root, file);
  // encodeURI keeps "/" and the ":" of a Windows drive, but not "#" or "?", which would end the path.
  const encoded = encodeURI(path).replace(/[#?]/g, encodeURIComponent);
  return `${editor}://file${path.startsWith('/') ? '' : '/'}${encoded}${line ? `:${line}` : ''}`;
}

/** `root` + `file` with "." and ".." resolved and forward slashes, on every OS. */
function joinPath(root: string, file: string): string {
  const full = `${root}/${file}`.replaceAll('\\', '/');
  const parts: string[] = [];
  for (const part of full.split('/')) {
    if (part === '..') parts.pop();
    else if (part !== '.' && part !== '') parts.push(part);
  }
  return `${full.startsWith('/') ? '/' : ''}${parts.join('/')}`;
}
