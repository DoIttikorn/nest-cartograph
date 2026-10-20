import {
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type EdgeTypes,
  type NodeTypes,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import type { Cartograph } from '../../src/schema.js';
import { focus, type Depth, type Layer } from './focus.js';
import { FocusNode } from './nodes/FocusNode.js';
import { FocusPanel } from './panels/FocusPanel.js';
import { RoutedEdge } from './edges/RoutedEdge.js';
import { layout } from './layout.js';
import { loadCartograph, readFile } from './load.js';
import { ModuleNode } from './nodes/ModuleNode.js';
import { MemberNode } from './nodes/MemberNode.js';
import { Inspector } from './panels/Inspector.js';
import { IssuesList, Toolbar } from './panels/Toolbar.js';
import { focusToFlow, toFlow, type FlowEdge, type FlowNode, type Level } from './toFlow.js';

const nodeTypes: NodeTypes = { module: ModuleNode, member: MemberNode, focus: FocusNode };

/** Noise when following a request from controller to database: hidden until asked for. */
const DEFAULT_HIDDEN_LAYERS: Layer[] = ['infra', 'guard', 'interface'];
const edgeTypes: EdgeTypes = { routed: RoutedEdge };

/** What the flow view starts from: the providers matching a search, or every member of a module. */
type FocusTarget = { query: string; module?: undefined } | { query?: undefined; module: string };

export function App() {
  const [map, setMap] = useState<Cartograph | null | undefined>(undefined);
  const [error, setError] = useState<string>();

  useEffect(() => {
    loadCartograph().then(setMap, (e: Error) => {
      setError(e.message);
      setMap(null);
    });
  }, []);

  if (map === undefined) return <div className="cg-splash">Loading map…</div>;
  if (map === null) return <FilePicker error={error} onMap={setMap} onError={setError} />;
  return (
    <ReactFlowProvider>
      <Atlas map={map} />
    </ReactFlowProvider>
  );
}

function Atlas({ map }: { map: Cartograph }) {
  const [level, setLevel] = useState<Level>(() => (map.nodes.length > 150 ? 'modules' : 'full'));
  const [hideExternal, setHideExternal] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [issuesOpen, setIssuesOpen] = useState(false);
  // Focus mode: set by pressing Enter in the search box (or "Show flow" on a module), shows only the flow around it.
  const [target, setTarget] = useState<FocusTarget | null>(null);
  // Locked: nodes stay where the layout put them, and dragging anywhere pans the map.
  const [locked, setLocked] = useState(false);
  const [direction, setDirection] = useState({ downstream: true, upstream: true });
  const [depth, setDepth] = useState<Depth>('all');
  const [hiddenLayers, setHiddenLayers] = useState<ReadonlySet<Layer>>(() => new Set(DEFAULT_HIDDEN_LAYERS));
  const [hiddenModules, setHiddenModules] = useState<ReadonlySet<string>>(() => new Set());
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>([]);
  const { fitView, setViewport } = useReactFlow();
  const pane = useRef<HTMLDivElement>(null);

  const focused = useMemo(
    () => (target === null ? null : focus(map, { query: target.query ?? '', module: target.module, ...direction, depth, hiddenLayers, hiddenModules })),
    [map, target, direction, depth, hiddenLayers, hiddenModules],
  );

  // Re-layout whenever the shape of the drawing changes.
  useEffect(() => {
    let cancelled = false;
    const flow = focused ? focusToFlow(focused) : toFlow(map, { level, hideExternal });
    layout(flow.nodes, flow.edges).then((placed) => {
      if (cancelled) return;
      setNodes(placed.nodes);
      setEdges(placed.edges);
      // Fit from the layout itself: right after a swap React Flow has not measured the new nodes, and
      // fitView() would frame whatever it already knows.
      const viewport = fitting(placed.nodes, pane.current, focused ? FOCUS_PANEL_WIDTH : 0);
      if (viewport) void setViewport(viewport, { duration: 250 });
    });
    return () => {
      cancelled = true;
    };
  }, [map, level, hideExternal, focused, setNodes, setEdges, setViewport]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // First Escape closes panels, the next one leaves the flow view.
      setSelected((current) => {
        if (current === null) setTarget(null);
        return null;
      });
      setIssuesOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Search dims what does not match; a module stays lit when one of its members matches.
  const shownNodes = useMemo(() => {
    const q = query.trim().toLowerCase();
    // The flow view already shows only what relates to its query; the seeds are outlined instead.
    if (!q || (target !== null && query.trim() === target.query)) return nodes;
    const hits = new Set(nodes.filter((n) => n.data.node.name.toLowerCase().includes(q)).map((n) => n.id));
    for (const n of nodes) if (hits.has(n.id) && n.parentId) hits.add(n.parentId);
    return nodes.map((n) => ({ ...n, className: hits.has(n.id) ? 'is-hit' : 'is-dimmed' }));
  }, [nodes, query, target]);

  const shownEdges = useMemo(() => {
    if (!selected) return edges;
    return edges.map((e) => (e.source === selected || e.target === selected ? { ...e, animated: true, className: `${e.className} is-active` } : e));
  }, [edges, selected]);

  const startFocus = useCallback((q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return setTarget(null);
    setQuery(trimmed);
    setTarget({ query: trimmed });
    setHiddenModules(new Set());
    setSelected(null);
  }, []);

  // A module's flow answers "where does this end up": follow its calls down, as far as they go.
  const startModuleFocus = useCallback((id: string) => {
    setQuery('');
    setTarget({ module: id });
    setDirection({ downstream: true, upstream: false });
    setDepth('all');
    setHiddenModules(new Set());
    setSelected(null);
  }, []);

  const toggle = <T,>(set: ReadonlySet<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (!next.delete(value)) next.add(value);
    return next;
  };

  const select = useCallback(
    (id: string | null) => {
      setSelected(id);
      if (id && nodes.some((n) => n.id === id)) void fitView({ nodes: [{ id }], duration: 300, maxZoom: 1.2, padding: 0.6 });
    },
    [nodes, fitView],
  );

  return (
    <ReactFlow
      ref={pane}
      nodes={shownNodes}
      edges={shownEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={(_, node) => setSelected(node.id)}
      onPaneClick={() => setSelected(null)}
      nodesConnectable={false}
      nodesDraggable={!locked}
      colorMode="system"
      minZoom={0.05}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
      <Controls showInteractive={false}>
        <ControlButton
          onClick={() => setLocked((value) => !value)}
          aria-pressed={locked}
          title={locked ? 'Unlock: drag nodes around' : 'Lock: drag only pans and zooms the map'}
          aria-label={locked ? 'Unlock nodes' : 'Lock nodes'}
          className={locked ? 'is-locked' : undefined}
        >
          <LockIcon locked={locked} />
        </ControlButton>
      </Controls>
      <MiniMap pannable zoomable nodeClassName={(n) => `cg-minimap--${n.type}`} />
      <Panel position="top-left">
        <Toolbar
          map={map}
          level={level}
          onLevel={(value) => {
            setTarget(null);
            setLevel(value);
          }}
          focused={focused !== null}
          onSubmit={startFocus}
          query={query}
          onQuery={setQuery}
          hideExternal={hideExternal}
          onHideExternal={setHideExternal}
          issuesOpen={issuesOpen}
          onIssues={() => setIssuesOpen((open) => !open)}
        />
        {issuesOpen && <IssuesList map={map} onSelect={select} />}
        {focused && target !== null && (
          <FocusPanel
            query={target.query ?? ''}
            module={target.module === undefined ? undefined : map.nodes.find((n) => n.id === target.module)?.name}
            result={focused}
            {...direction}
            onDirection={setDirection}
            depth={depth}
            onDepth={setDepth}
            hiddenLayers={hiddenLayers}
            onToggleLayer={(layer) => setHiddenLayers((set) => toggle(set, layer))}
            onToggleModule={(id) => setHiddenModules((set) => toggle(set, id))}
            onAllModules={(show) => setHiddenModules(show ? new Set() : new Set(focused.modules.map((m) => m.module.id)))}
            onSelect={select}
            onExit={() => setTarget(null)}
          />
        )}
        {focused && focused.nodes.length === 0 && (
          <div className="cg-issues cg-muted">
            {target?.module !== undefined ? 'This module calls nothing with these filters.' : `Nothing matches “${target?.query}” with these filters.`}
          </div>
        )}
      </Panel>
      {selected && (
        <Panel position="top-right">
          <Inspector
            map={map}
            id={selected}
            onSelect={select}
            onFocus={startFocus}
            onFocusModule={startModuleFocus}
            onClose={() => setSelected(null)}
          />
        </Panel>
      )}
    </ReactFlow>
  );
}

function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={
          locked
            ? 'M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1h1zm2 0h6V7a3 3 0 0 0-6 0v3z'
            : 'M9 10h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1h1V7a5 5 0 0 1 9.6-2l-1.8.9A3 3 0 0 0 9 7v3z'
        }
      />
    </svg>
  );
}

/** Room the focus panel takes on the left, kept clear when framing the flow. */
const FOCUS_PANEL_WIDTH = 320;

/** Viewport that frames the top-level nodes right of `inset`. Small maps are not blown up past 125%. */
function fitting(nodes: FlowNode[], pane: HTMLElement | null, inset: number): { x: number; y: number; zoom: number } | undefined {
  const roots = nodes.filter((n) => !n.parentId);
  if (!pane || roots.length === 0) return undefined;
  const left = Math.min(...roots.map((n) => n.position.x));
  const top = Math.min(...roots.map((n) => n.position.y));
  const right = Math.max(...roots.map((n) => n.position.x + (n.width ?? 0)));
  const bottom = Math.max(...roots.map((n) => n.position.y + (n.height ?? 0)));
  const box = pane.getBoundingClientRect();
  const height = box.height;
  // A narrow window would leave no room beside the panel; then the panel just covers part of the flow.
  const offset = box.width - inset > 320 ? inset : 0;
  const width = box.width - offset;
  const zoom = Math.max(0.05, Math.min(1.25, (width * 0.92) / (right - left || 1), (height * 0.92) / (bottom - top || 1)));
  return { x: offset + (width - (right - left) * zoom) / 2 - left * zoom, y: (height - (bottom - top) * zoom) / 2 - top * zoom, zoom };
}

/** Shown when the page has no map: opened from disk, or served without cartograph.json. */
function FilePicker({ error, onMap, onError }: { error?: string; onMap: (map: Cartograph) => void; onError: (message: string) => void }) {
  const [dragging, setDragging] = useState(false);
  const open = (file: File | undefined) => {
    if (file) readFile(file).then(onMap, (e: Error) => onError(e.message));
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    open(event.dataTransfer.files[0]);
  };

  return (
    <div
      className={`cg-splash cg-drop${dragging ? ' is-dragging' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <h1>nest-cartograph</h1>
      <p>
        Drop a <code>cartograph.json</code> here, or
      </p>
      <label className="cg-button">
        Choose a file
        <input type="file" accept=".json,application/json" hidden onChange={(event) => open(event.target.files?.[0])} />
      </label>
      <p className="cg-muted">
        Create one with <code>npx nest-cartograph analyze</code> in a NestJS project.
      </p>
      {error && <p className="cg-error">{error}</p>}
    </div>
  );
}
