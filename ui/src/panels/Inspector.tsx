import type { Cartograph, CartographEdge, CartographNode, EdgeKind } from '../../../src/schema.js';
import { detailOf } from '../toFlow.js';

interface Props {
  map: Cartograph;
  id: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}

/** Everything known about the selected node, with links to its neighbours. */
export function Inspector({ map, id, onSelect, onClose }: Props) {
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const node = byId.get(id);
  if (!node) return null;

  const out = (...kinds: EdgeKind[]) => map.edges.filter((e) => e.from === id && kinds.includes(e.kind));
  const into = (...kinds: EdgeKind[]) => map.edges.filter((e) => e.to === id && kinds.includes(e.kind));
  const ownerEdge = into('provides', 'controls')[0];

  const sections: [string, CartographEdge[], 'to' | 'from'][] =
    node.kind === 'module'
      ? [
          ['Imports', out('imports'), 'to'],
          ['Imported by', into('imports'), 'from'],
          ['Providers', out('provides'), 'to'],
          ['Controllers', out('controls'), 'to'],
          ['Exports', out('exports'), 'to'],
        ]
      : [
          ['Depends on', out('injects', 'aliases'), 'to'],
          ['Used by', into('injects', 'aliases'), 'from'],
          ['Exported by', into('exports'), 'from'],
        ];

  return (
    <aside className="cg-inspector" aria-label={`Details of ${node.name}`}>
      <header>
        <div>
          <span className="cg-muted">{label(node)}</span>
          <h2>{node.name}</h2>
        </div>
        <button type="button" className="cg-close" onClick={onClose} aria-label="Close details">
          ×
        </button>
      </header>
      {node.file && (
        <code className="cg-inspector__file">
          {node.file}:{node.line}
        </code>
      )}
      {ownerEdge && (
        <p>
          In{' '}
          <button type="button" className="cg-link" onClick={() => onSelect(ownerEdge.from)}>
            {byId.get(ownerEdge.from)?.name}
          </button>
        </p>
      )}
      {sections.map(([title, edges, side]) =>
        edges.length === 0 ? null : (
          <section key={title}>
            <h3>
              {title} <span className="cg-muted">{edges.length}</span>
            </h3>
            <ul>
              {edges.map((edge) => {
                const other = byId.get(side === 'to' ? edge.to : edge.from);
                if (!other) return null;
                return (
                  <li key={`${edge.kind}|${edge.from}|${edge.to}|${edge.at ?? ''}`}>
                    <button type="button" className="cg-link" onClick={() => onSelect(other.id)}>
                      {other.name}
                    </button>
                    <span className="cg-muted">{note(edge)}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        ),
      )}
    </aside>
  );
}

function label(node: CartographNode): string {
  const parts: string[] = [node.kind];
  if (node.global) parts.push('global');
  if (node.dynamic) parts.push('dynamic');
  const detail = detailOf(node);
  if (detail) parts.push(detail);
  if (node.external) parts.push('external');
  return parts.join(' · ');
}

function note(edge: CartographEdge): string {
  const parts = [
    edge.via && `.${edge.via}()`,
    typeof edge.at === 'number' ? `param #${edge.at}` : edge.at !== undefined ? `property ${edge.at}` : undefined,
    edge.kind === 'aliases' ? 'alias' : undefined,
    edge.optional ? 'optional' : undefined,
    edge.forwardRef ? 'forwardRef' : undefined,
  ].filter(Boolean);
  return parts.length ? ` ${parts.join(' · ')}` : '';
}
