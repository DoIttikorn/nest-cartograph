import { LAYERS, type Depth, type FocusResult, type Layer } from '../focus.js';

interface Props {
  query: string;
  /** Set when the flow starts from a whole module rather than the query matches. */
  module?: string;
  result: FocusResult;
  downstream: boolean;
  upstream: boolean;
  onDirection: (direction: { downstream: boolean; upstream: boolean }) => void;
  depth: Depth;
  onDepth: (depth: Depth) => void;
  hiddenLayers: ReadonlySet<Layer>;
  onToggleLayer: (layer: Layer) => void;
  onToggleModule: (id: string) => void;
  onAllModules: (show: boolean) => void;
  onSelect: (id: string) => void;
  onExit: () => void;
}

const DEPTHS: Depth[] = [1, 2, 3, 'all'];

/** Filters for focus mode: which way to walk, how far, and which layers and modules to keep. */
export function FocusPanel(props: Props) {
  const { result, downstream, upstream, depth, hiddenLayers } = props;
  const seeds = result.nodes.filter((n) => n.seed).length;
  const ends = result.nodes.filter((n) => n.end).sort((a, b) => a.layer.localeCompare(b.layer) || a.name.localeCompare(b.name));
  const direction = downstream && upstream ? 'both' : downstream ? 'down' : 'up';

  return (
    <div className="cg-focus-panel">
      <header>
        <div>
          <span className="cg-muted">Flow of</span> {props.module ? <strong>{props.module}</strong> : <strong>“{props.query}”</strong>}
          <div className="cg-muted">
            {seeds} {props.module ? `member${seeds === 1 ? '' : 's'}` : `match${seeds === 1 ? '' : 'es'}`} · {result.nodes.length} nodes ·{' '}
            {result.edges.length} links
          </div>
        </div>
        <button type="button" className="cg-close" onClick={props.onExit} aria-label="Leave flow view" title="Leave flow view (Esc)">
          ×
        </button>
      </header>

      <h3>Relationship</h3>
      <div className="cg-segmented" role="group" aria-label="Direction">
        {(
          [
            ['down', 'Calls →', 'What the matches depend on, down to the database and Kafka'],
            ['up', '← Called by', 'What depends on the matches, up to the controllers'],
            ['both', 'Both', 'Both directions'],
          ] as const
        ).map(([value, label, title]) => (
          <button
            key={value}
            type="button"
            title={title}
            aria-pressed={direction === value}
            onClick={() => props.onDirection({ downstream: value !== 'up', upstream: value !== 'down' })}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="cg-segmented" role="group" aria-label="Depth">
        {DEPTHS.map((value) => (
          <button key={value} type="button" aria-pressed={depth === value} onClick={() => props.onDepth(value)}>
            {value === 'all' ? 'All hops' : `${value} hop${value === 1 ? '' : 's'}`}
          </button>
        ))}
      </div>

      {ends.length > 0 && (
        <>
          <h3>
            Ends at <span className="cg-muted">{ends.length}</span>
          </h3>
          <ul className="cg-filter-list cg-ends">
            {ends.map((n) => (
              <li key={n.node.id}>
                <span className={`cg-swatch is-layer-${n.layer}`} />
                <button type="button" className="cg-link" onClick={() => props.onSelect(n.node.id)}>
                  {n.name}
                </button>
                {n.module && <span className="cg-muted">{n.module.name}</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>Layers</h3>
      <ul className="cg-filter-list">
        {LAYERS.map(({ layer, label }) => {
          const count = result.layerCounts.get(layer) ?? 0;
          return (
            <li key={layer}>
              <label className={`cg-check${count === 0 ? ' is-empty' : ''}`}>
                <input type="checkbox" checked={!hiddenLayers.has(layer)} onChange={() => props.onToggleLayer(layer)} />
                <span className={`cg-swatch is-layer-${layer}`} />
                {label}
                <span className="cg-muted">{count}</span>
              </label>
            </li>
          );
        })}
      </ul>

      {result.modules.length > 0 && (
        <>
          <h3>
            Modules
            <span className="cg-filter-actions">
              <button type="button" className="cg-link" onClick={() => props.onAllModules(true)}>
                all
              </button>
              <button type="button" className="cg-link" onClick={() => props.onAllModules(false)}>
                none
              </button>
            </span>
          </h3>
          <ul className="cg-filter-list">
            {result.modules.map(({ module, count, hidden }) => (
              <li key={module.id}>
                <label className="cg-check">
                  <input type="checkbox" checked={!hidden} onChange={() => props.onToggleModule(module.id)} />
                  {module.name}
                  <span className="cg-muted">{count}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
