import { Handle, Position, type NodeProps } from '@xyflow/react';
import { moduleBadges, type ModuleFlowNode } from '../toFlow.js';

/** A module: a small card at the `modules` level, a titled box around its providers at the `full` level. */
export function ModuleNode({ data, selected }: NodeProps<ModuleFlowNode>) {
  const { node, leaf, inCycle, members } = data;
  const classes = ['cg-module', leaf ? 'is-leaf' : 'is-group'];
  if (node.global) classes.push('is-global');
  if (node.external) classes.push('is-external');
  if (inCycle) classes.push('is-cycle');
  if (selected) classes.push('is-selected');

  return (
    <div className={classes.join(' ')} title={node.file ? `${node.file}:${node.line}` : node.name}>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <div className="cg-module__header">
        <span className="cg-module__name">{node.name}</span>
        {moduleBadges(node, inCycle).map((badge) => (
          <span key={badge} className={`cg-badge cg-badge--${badge}`}>
            {badge}
          </span>
        ))}
        {!leaf && <span className="cg-module__count">{members}</span>}
      </div>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}
