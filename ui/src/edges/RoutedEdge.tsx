import { BaseEdge, getBezierPath, useInternalNode, type EdgeProps } from '@xyflow/react';
import type { FlowEdge, XY } from '../toFlow.js';

/**
 * Draws the orthogonal route ELK computed, so edges go around modules instead of through them.
 * Once either end has been dragged the route no longer fits, and the edge falls back to a curve.
 */
export function RoutedEdge(props: EdgeProps<FlowEdge>) {
  const { id, source, target, data, label, markerEnd, style } = props;
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const route = data?.route;
  const fresh =
    route !== undefined &&
    near(sourceNode?.internals.positionAbsolute, route.sourceAt) &&
    near(targetNode?.internals.positionAbsolute, route.targetAt);

  let path: string;
  let labelAt: XY;
  if (fresh) {
    path = roundedPath(route.points);
    labelAt = route.label ?? middleOf(route.points);
  } else {
    const [curve, x, y] = getBezierPath(props);
    path = curve;
    labelAt = { x, y };
  }

  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      style={style}
      label={label}
      labelX={labelAt.x}
      labelY={labelAt.y}
      labelBgPadding={[5, 2]}
      labelBgBorderRadius={4}
      // The map is read-only: edges must never catch clicks meant for the nodes underneath.
      interactionWidth={0}
    />
  );
}

function near(a: XY | undefined, b: XY): boolean {
  return a !== undefined && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
}

/** A polyline with its corners rounded off. */
export function roundedPath(points: XY[], radius = 8): string {
  const [first, ...rest] = points;
  if (!first) return '';
  let d = `M ${first.x},${first.y}`;
  for (let i = 0; i < rest.length - 1; i++) {
    const previous = points[i]!;
    const corner = rest[i]!;
    const next = rest[i + 1]!;
    const r = Math.min(radius, distance(previous, corner) / 2, distance(corner, next) / 2);
    const from = toward(corner, previous, r);
    const to = toward(corner, next, r);
    d += ` L ${from.x},${from.y} Q ${corner.x},${corner.y} ${to.x},${to.y}`;
  }
  const last = rest.at(-1);
  if (last) d += ` L ${last.x},${last.y}`;
  return d;
}

/** Middle of the longest segment: the most likely place for a label to have room. */
function middleOf(points: XY[]): XY {
  let best = { x: points[0]?.x ?? 0, y: points[0]?.y ?? 0 };
  let longest = -1;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const length = distance(a, b);
    if (length > longest) {
      longest = length;
      best = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  }
  return best;
}

function distance(a: XY, b: XY): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function toward(from: XY, to: XY, length: number): XY {
  const d = distance(from, to);
  if (d === 0) return from;
  return { x: from.x + ((to.x - from.x) * length) / d, y: from.y + ((to.y - from.y) * length) / d };
}
