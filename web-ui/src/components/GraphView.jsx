import React, { useMemo } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap,
  MarkerType 
} from 'reactflow';
import 'reactflow/dist/style.css';

const nodeTypes = {};

const GraphView = ({ nodes: initialNodes = [], edges: initialEdges = [] }) => {
  // Simple layout logic or just let user drag
  // For demo, we'll just position them in a circle or grid if no position provided
  
  const formattedNodes = useMemo(() => initialNodes.map((node, idx) => ({
    id: node.id,
    data: { label: node.label },
    position: node.position || { x: Math.random() * 400, y: Math.random() * 400 },
    style: {
      background: node.type === 'character' ? '#38bdf8' : '#10b981',
      color: '#fff',
      borderRadius: '8px',
      padding: '10px',
      fontSize: '12px',
      fontWeight: 'bold',
      border: 'none',
      width: 120,
      textAlign: 'center',
    },
  })), [initialNodes]);

  const formattedEdges = useMemo(() => initialEdges.map((edge) => ({
    id: `e-${edge.source}-${edge.target}`,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    animated: true,
    labelStyle: { fill: '#94a3b8', fontSize: 10, fontWeight: 700 },
    style: { stroke: '#334155' },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: '#334155',
    },
  })), [initialEdges]);

  return (
    <div className="w-full h-full bg-slate-900 rounded-lg overflow-hidden border border-slate-800">
      <ReactFlow
        nodes={formattedNodes}
        edges={formattedEdges}
        fitView
      >
        <Background color="#1e293b" gap={16} />
        <Controls />
        <MiniMap 
          nodeColor={(n) => n.style.background} 
          maskColor="rgba(15, 23, 42, 0.6)"
          style={{ background: '#0f172a' }}
        />
      </ReactFlow>
    </div>
  );
};

export default GraphView;
