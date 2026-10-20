import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { Layer } from '../focus.js';
import type { FocusFlowNode } from '../toFlow.js';

const BADGE: Record<Layer, string> = {
  controller: 'C',
  service: 'S',
  db: 'DB',
  messaging: 'K',
  external: 'API',
  guard: 'G',
  infra: 'L',
  interface: 'I',
};

/** A provider or controller in focus mode, coloured by the layer it belongs to. */
export function FocusNode({ data, selected }: NodeProps<FocusFlowNode>) {
  const { node, name, layer, module, seed, end } = data;
  const classes = ['cg-member', 'cg-focus', `is-layer-${layer}`, `is-${node.providerType ?? 'class'}`];
  if (seed) classes.push('is-seed');
  if (end) classes.push('is-end');
  if (selected) classes.push('is-selected');

  return (
    <div className={classes.join(' ')} title={node.file ? `${node.file}:${node.line}` : node.name}>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <span className="cg-member__kind cg-focus__badge" aria-label={layer}>
        {BADGE[layer]}
      </span>
      <span className="cg-member__text">
        <span className="cg-member__name">{name}</span>
        {module && <span className="cg-member__detail">{module.name}</span>}
      </span>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}
