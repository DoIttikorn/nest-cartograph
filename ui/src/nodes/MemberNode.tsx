import { Handle, Position, type NodeProps } from '@xyflow/react';
import { detailOf, type MemberFlowNode } from '../toFlow.js';

const KIND_LABEL = { controller: 'C', provider: 'P', module: 'M' } as const;

/** A provider or controller, drawn inside the module that owns it. */
export function MemberNode({ data, selected }: NodeProps<MemberFlowNode>) {
  const { node, exported } = data;
  const detail = detailOf(node);
  const classes = ['cg-member', `is-${node.kind}`, `is-${node.providerType ?? 'class'}`];
  if (exported) classes.push('is-exported');
  if (node.external) classes.push('is-external');
  if (selected) classes.push('is-selected');

  return (
    <div className={classes.join(' ')} title={node.file ? `${node.file}:${node.line}` : node.name}>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <span className="cg-member__kind" aria-label={node.kind}>
        {KIND_LABEL[node.kind]}
      </span>
      <span className="cg-member__text">
        <span className="cg-member__name">{node.name}</span>
        {detail && <span className="cg-member__detail">{detail}</span>}
      </span>
      {exported && <span className="cg-member__exported" title="Exported by its module" />}
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}
