import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  type EdgeTypes,
  type NodeTypes,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import type { Cartograph } from '../../src/schema.js';
import { RoutedEdge } from './edges/RoutedEdge.js';
import { layout } from './layout.js';
import { loadCartograph, readFile } from './load.js';
import { ModuleNode } from './nodes/ModuleNode.js';
import { MemberNode } from './nodes/MemberNode.js';
import { Inspector } from './panels/Inspector.js';
import { IssuesList, Toolbar } from './panels/Toolbar.js';
import { toFlow, type FlowEdge, type FlowNode, type Level } from './toFlow.js';

const nodeTypes: NodeTypes = { module: ModuleNode, member: MemberNode };
const edgeTypes: EdgeTypes = { routed: RoutedEdge };

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
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>([]);
  const { fitView } = useReactFlow();
  const initialized = useNodesInitialized();
  const needsFit = useRef(false);

  // Re-layout whenever the shape of the drawing changes.
  useEffect(() => {
    let cancelled = false;
    const flow = toFlow(map, { level, hideExternal });
    layout(flow.nodes, flow.edges).then((placed) => {
      if (cancelled) return;
      needsFit.current = true;
      setNodes(placed.nodes);
      setEdges(placed.edges);
    });
    return () => {
      cancelled = true;
    };
  }, [map, level, hideExternal, setNodes, setEdges]);

  useEffect(() => {
    if (initialized && needsFit.current) {
      needsFit.current = false;
      // Small maps would otherwise be blown up to fill the screen.
      void fitView({ padding: 0.08, duration: 250, maxZoom: 1.25 });
    }
  }, [initialized, nodes, fitView]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelected(null);
        setIssuesOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Search dims what does not match; a module stays lit when one of its members matches.
  const shownNodes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return nodes;
    const hits = new Set(nodes.filter((n) => n.data.node.name.toLowerCase().includes(q)).map((n) => n.id));
    for (const n of nodes) if (hits.has(n.id) && n.parentId) hits.add(n.parentId);
    return nodes.map((n) => ({ ...n, className: hits.has(n.id) ? 'is-hit' : 'is-dimmed' }));
  }, [nodes, query]);

  const shownEdges = useMemo(() => {
    if (!selected) return edges;
    return edges.map((e) => (e.source === selected || e.target === selected ? { ...e, animated: true, className: `${e.className} is-active` } : e));
  }, [edges, selected]);

  const select = useCallback(
    (id: string | null) => {
      setSelected(id);
      if (id && nodes.some((n) => n.id === id)) void fitView({ nodes: [{ id }], duration: 300, maxZoom: 1.2, padding: 0.6 });
    },
    [nodes, fitView],
  );

  return (
    <ReactFlow
      nodes={shownNodes}
      edges={shownEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={(_, node) => setSelected(node.id)}
      onPaneClick={() => setSelected(null)}
      nodesConnectable={false}
      colorMode="system"
      minZoom={0.05}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable nodeClassName={(n) => `cg-minimap--${n.type}`} />
      <Panel position="top-left">
        <Toolbar
          map={map}
          level={level}
          onLevel={setLevel}
          query={query}
          onQuery={setQuery}
          hideExternal={hideExternal}
          onHideExternal={setHideExternal}
          issuesOpen={issuesOpen}
          onIssues={() => setIssuesOpen((open) => !open)}
        />
        {issuesOpen && <IssuesList map={map} onSelect={select} />}
      </Panel>
      {selected && (
        <Panel position="top-right">
          <Inspector map={map} id={selected} onSelect={select} onClose={() => setSelected(null)} />
        </Panel>
      )}
    </ReactFlow>
  );
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
