import type { Cartograph } from '../../../src/schema.js';
import type { Level } from '../toFlow.js';

interface Props {
  map: Cartograph;
  level: Level;
  onLevel: (level: Level) => void;
  /** Showing the flow around a search instead of a level. */
  focused: boolean;
  /** Enter in the search box: show only the flow around the matches. */
  onSubmit: (query: string) => void;
  query: string;
  onQuery: (query: string) => void;
  hideExternal: boolean;
  onHideExternal: (hide: boolean) => void;
  issuesOpen: boolean;
  onIssues: () => void;
}

export function Toolbar(props: Props) {
  const { map, level, query, hideExternal, issuesOpen, focused } = props;
  const count = (kind: string) => map.nodes.filter((n) => n.kind === kind).length;
  const hasExternal = map.nodes.some((n) => n.external);
  const issues = map.warnings.length + map.cycles.filter((c) => !c.guarded).length;

  return (
    <div className="cg-toolbar">
      <div className="cg-toolbar__title">
        <strong>nest-cartograph</strong>
        <span className="cg-muted">{map.project.root}</span>
      </div>

      <div className="cg-segmented" role="group" aria-label="Detail level">
        {(['modules', 'full'] as const).map((value) => (
          <button key={value} type="button" aria-pressed={!focused && level === value} onClick={() => props.onLevel(value)}>
            {value === 'modules' ? 'Modules' : 'Providers'}
          </button>
        ))}
      </div>

      <input
        className="cg-search"
        type="search"
        placeholder="Find, then Enter to see its flow"
        value={query}
        onChange={(event) => props.onQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') props.onSubmit(query);
        }}
        aria-label="Find a module or provider; press Enter to show only its flow"
      />

      {hasExternal && (
        <label className="cg-check">
          <input type="checkbox" checked={hideExternal} onChange={(event) => props.onHideExternal(event.target.checked)} />
          Hide node_modules
        </label>
      )}

      <span className="cg-muted cg-toolbar__stats">
        {count('module')} modules · {count('provider')} providers · {count('controller')} controllers
      </span>

      <button
        type="button"
        className={`cg-issues-button${issues > 0 ? ' has-issues' : ''}`}
        aria-pressed={issuesOpen}
        onClick={props.onIssues}
      >
        {issues === 0 ? 'No issues' : `${issues} issue${issues === 1 ? '' : 's'}`}
      </button>
    </div>
  );
}

export function IssuesList({ map, onSelect }: { map: Cartograph; onSelect: (id: string) => void }) {
  if (map.cycles.length === 0 && map.warnings.length === 0) return <div className="cg-issues cg-muted">Nothing to report.</div>;
  return (
    <div className="cg-issues">
      {map.cycles.length > 0 && <h3>Circular imports</h3>}
      <ul>
        {map.cycles.map((cycle) => (
          <li key={cycle.ids.join()} className={cycle.guarded ? 'is-ok' : 'is-bad'}>
            <button type="button" className="cg-link" onClick={() => onSelect(cycle.ids[0]!)}>
              {[...cycle.names, cycle.names[0]].join(' → ')}
            </button>
            <span className="cg-muted">{cycle.guarded ? ' forwardRef on every import' : ' missing forwardRef()'}</span>
          </li>
        ))}
      </ul>
      {map.warnings.length > 0 && <h3>Warnings</h3>}
      <ul>
        {map.warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </div>
  );
}
