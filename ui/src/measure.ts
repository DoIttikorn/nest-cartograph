import type { CartographNode } from '../../src/schema.js';

// Keep in step with styles.css: the layout needs node sizes before anything is rendered.
const SANS = `ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif`;
const MONO = `ui-monospace, 'SF Mono', Menlo, Consolas, monospace`;
const FONTS = {
  memberName: { css: `600 13px ${SANS}`, fallback: 8.2 },
  moduleName: { css: `700 13px ${SANS}`, fallback: 8.4 },
  detail: { css: `11px ${MONO}`, fallback: 7 },
  badge: { css: `11px ${SANS}`, fallback: 6.6 },
  label: { css: `11px ${SANS}`, fallback: 6.6 },
} as const;

let context: CanvasRenderingContext2D | null | undefined;

/** Width of a text in the UI font. Measured with a canvas in the browser, estimated elsewhere (tests). */
export function textWidth(text: string, font: keyof typeof FONTS): number {
  if (context === undefined) {
    context = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  }
  const { css, fallback } = FONTS[font];
  if (!context) return text.length * fallback;
  context.font = css;
  return context.measureText(text).width;
}

export interface Size {
  width: number;
  height: number;
}

/** Badge, name, optional detail line and the "exported" dot of a provider or controller. */
export function memberSize(node: CartographNode, detail: string | undefined, exported: boolean): Size {
  const text = Math.max(textWidth(node.name, 'memberName'), detail ? textWidth(detail, 'detail') : 0);
  const chrome = 2 * 10 + 2 + 20 + 8 + (exported ? 8 + 7 : 0) + 6;
  return { width: clamp(Math.ceil(text + chrome), 120, 380), height: detail ? 54 : 40 };
}

/** A node in focus mode: layer badge and name, with the owning module on a second line. */
export function focusSize(name: string, module: string | undefined): Size {
  const text = Math.max(textWidth(name, 'memberName'), module ? textWidth(module, 'detail') : 0);
  return { width: clamp(Math.ceil(text + 2 * 10 + 2 + 26 + 8 + 6), 140, 420), height: module ? 54 : 40 };
}

/** Header of a module: name, badges and, for a box with children, the member count. */
export function moduleHeaderWidth(name: string, badges: string[], count?: number): number {
  const badgeWidth = badges.reduce((sum, badge) => sum + 6 + textWidth(badge, 'badge') + 14, 0);
  const countWidth = count === undefined ? 0 : 12 + String(count).length * 8;
  return clamp(Math.ceil(2 * 12 + 3 + textWidth(name, 'moduleName') + badgeWidth + countWidth + 6), 120, 520);
}

/** Room an edge label takes, with the background padding React Flow draws around it. */
export function labelSize(text: string): Size {
  return { width: Math.ceil(textWidth(text, 'label') + 10), height: 18 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
