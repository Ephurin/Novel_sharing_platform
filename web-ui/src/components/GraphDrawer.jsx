import React, { useMemo, useState, useEffect, useCallback } from 'react';
import ReactFlow, { Background, MarkerType, useReactFlow } from 'reactflow';
import useStore from '../store/useStore';
import { X, Network, Database, Info } from 'lucide-react';
import 'reactflow/dist/style.css';

// Stable layout: tính position 1 lần dựa trên tên entity, không random mỗi render
const getStablePosition = (name, index, total) => {
  if (total <= 1) return { x: 200, y: 200 };
  // Xếp thành vòng tròn với offset deterministic từ tên
  const hash = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const angle = (index / total) * 2 * Math.PI + (hash % 100) / 100;
  const radius = Math.min(160 + (total * 8), 260);
  return {
    x: 220 + radius * Math.cos(angle),
    y: 200 + radius * Math.sin(angle),
  };
};

const NODE_STYLES = {
  PERSON: {
    background: 'rgba(129,140,248,0.12)',
    border: '1.5px solid rgba(129,140,248,0.5)',
    color: '#818cf8',
    boxShadow: '0 0 14px rgba(129,140,248,0.18)',
  },
  PER: {
    background: 'rgba(129,140,248,0.12)',
    border: '1.5px solid rgba(129,140,248,0.5)',
    color: '#818cf8',
    boxShadow: '0 0 14px rgba(129,140,248,0.18)',
  },
  LOCATION: {
    background: 'rgba(56,189,248,0.10)',
    border: '1.5px solid rgba(56,189,248,0.45)',
    color: '#38bdf8',
    boxShadow: '0 0 14px rgba(56,189,248,0.15)',
  },
  LOC: {
    background: 'rgba(56,189,248,0.10)',
    border: '1.5px solid rgba(56,189,248,0.45)',
    color: '#38bdf8',
    boxShadow: '0 0 14px rgba(56,189,248,0.15)',
  },
  ORG: {
    background: 'rgba(251,191,36,0.10)',
    border: '1.5px solid rgba(251,191,36,0.40)',
    color: '#fbbf24',
    boxShadow: '0 0 14px rgba(251,191,36,0.12)',
  },
  UNKNOWN: {
    background: 'rgba(148,163,184,0.08)',
    border: '1.5px solid rgba(148,163,184,0.25)',
    color: '#94a3b8',
    boxShadow: 'none',
  },
};

const GraphDrawer = () => {
  const { drawerOpen, setDrawerOpen, kbData, focusMode } = useStore();
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const { fitView } = useReactFlow();

  const nodes = useMemo(() => {
    if (!kbData?.entities) return [];
    const entries = Object.entries(kbData.entities);
    const total = entries.length;

    return entries.map(([key, entity], index) => {
      const type = (entity.entity_type || 'UNKNOWN').toUpperCase();
      const nodeStyle = NODE_STYLES[type] || NODE_STYLES.UNKNOWN;

      return {
        id: entity.name,
        data: { label: entity.name },
        // FIX 1: position stable, không random
        position: getStablePosition(entity.name, index, total),
        style: {
          ...nodeStyle,
          borderRadius: '50%',
          padding: '8px',
          fontSize: '8px',
          fontWeight: '700',
          width: 80,
          height: 80,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          textTransform: 'uppercase',
          letterSpacing: '0.4px',
          cursor: 'pointer',
          transition: 'all 0.2s',
          lineHeight: '1.3',
        },
      };
    });
  }, [kbData]);

  const edges = useMemo(() => {
    if (!kbData?.relations) return [];

    return kbData.relations
      .filter(rel => rel.relation !== 'MENTIONED_IN')
      .map((rel, idx) => {
        const isAlly = rel.relation?.includes('ALLY');
        const isEnemy = rel.relation?.includes('ENEMY') || rel.relation?.includes('RIVAL');
        const edgeColor = isAlly
          ? 'rgba(74,222,128,0.35)'
          : isEnemy
          ? 'rgba(251,113,133,0.35)'
          : 'rgba(148,163,184,0.2)';

        return {
          id: `e-${idx}`,
          source: rel.subject,
          target: rel.object,
          label: rel.relation?.replace(/_/g, ' '),
          animated: isAlly || isEnemy,
          labelStyle: {
            fill: 'rgba(148,163,184,0.7)',
            fontSize: 7,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          },
          labelBgStyle: {
            fill: 'rgba(10,13,31,0.85)',
            borderRadius: 3,
          },
          style: { stroke: edgeColor, strokeWidth: 1.2 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: edgeColor,
            width: 12,
            height: 12,
          },
        };
      });
  }, [kbData]);

  useEffect(() => {
    if (drawerOpen && nodes.length > 0) {
      const timer = setTimeout(() => {
        fitView({ padding: 0.25, duration: 600 });
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [nodes.length, drawerOpen, fitView]);

  const onNodeClick = useCallback((event, node) => {
    setSelectedNodeId(prev => prev === node.id ? null : node.id);
  }, []);

  // FIX 2: casefold() không tồn tại trong JS → dùng toLowerCase()
  const selectedEntity = useMemo(() => {
    if (!selectedNodeId || !kbData?.entities) return null;
    // Thử match theo key hoặc theo .name
    const byKey = kbData.entities[selectedNodeId.toLowerCase()];
    if (byKey) return byKey;
    return Object.values(kbData.entities).find(
      e => e.name?.toLowerCase() === selectedNodeId.toLowerCase()
    ) || null;
  }, [selectedNodeId, kbData]);

  const selectedEntityRelations = useMemo(() => {
    if (!selectedNodeId || !kbData?.relations) return [];
    return kbData.relations
      .filter(r =>
        (r.subject === selectedNodeId || r.object === selectedNodeId) &&
        r.relation !== 'MENTIONED_IN'
      )
      .slice(0, 5);
  }, [selectedNodeId, kbData]);

  if (focusMode) return null;

  const entityCount = kbData?.entities ? Object.keys(kbData.entities).length : 0;
  const relationCount = kbData?.relations?.filter(r => r.relation !== 'MENTIONED_IN').length || 0;

  return (
    <div className="w-full h-full flex flex-col overflow-hidden" style={{ background: '#0a0d1f' }}>
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      >
        <div className="flex items-center gap-2">
          <Network size={11} style={{ color: '#38bdf8' }} />
          <span style={{
            fontSize: '9px', fontWeight: '700',
            textTransform: 'uppercase', letterSpacing: '1.5px', color: '#475569'
          }}>
            Knowledge Graph
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Stats badges */}
          <div className="flex items-center gap-2">
            <span style={{
              fontSize: '8px', fontWeight: '600', color: '#818cf8',
              background: 'rgba(129,140,248,0.1)', padding: '1px 6px',
              borderRadius: '3px', border: '1px solid rgba(129,140,248,0.2)',
              fontFamily: 'monospace'
            }}>
              {entityCount} nodes
            </span>
            <span style={{
              fontSize: '8px', fontWeight: '600', color: '#38bdf8',
              background: 'rgba(56,189,248,0.08)', padding: '1px 6px',
              borderRadius: '3px', border: '1px solid rgba(56,189,248,0.15)',
              fontFamily: 'monospace'
            }}>
              {relationCount} edges
            </span>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="transition-colors"
            style={{ color: '#475569', padding: '4px', borderRadius: '4px' }}
            onMouseEnter={e => e.target.style.color = '#94a3b8'}
            onMouseLeave={e => e.target.style.color = '#475569'}
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Empty state */}
      {entityCount === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 opacity-25">
          <Network size={28} style={{ color: '#475569' }} />
          <p style={{ fontSize: '10px', color: '#475569', textAlign: 'center', lineHeight: '1.6', maxWidth: '140px' }}>
            Nhấn Analyze để trích xuất entities và xây dựng graph
          </p>
        </div>
      ) : (
        <>
          {/* ReactFlow Canvas */}
          <div className="flex-1 relative" style={{ background: '#04050f' }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodeClick={onNodeClick}
              fitView
              fitViewOptions={{ padding: 0.25 }}
              minZoom={0.3}
              maxZoom={2}
              style={{ width: '100%', height: '100%' }}
              proOptions={{ hideAttribution: true }}
            >
              <Background
                color="rgba(255,255,255,0.025)"
                gap={24}
                size={1}
              />
            </ReactFlow>
          </div>

          {/* Node Detail Panel */}
          {selectedNodeId && selectedEntity && (
            <div
              className="shrink-0"
              style={{
                borderTop: '1px solid rgba(255,255,255,0.07)',
                background: 'rgba(15,18,37,0.97)',
                backdropFilter: 'blur(12px)',
                padding: '14px',
                maxHeight: '220px',
                overflowY: 'auto',
              }}
            >
              {/* Entity header */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#f1f5f9', marginBottom: '3px' }}>
                    {selectedEntity.name}
                  </div>
                  <span style={{
                    fontSize: '8px', fontWeight: '700', textTransform: 'uppercase',
                    letterSpacing: '0.8px', color: '#818cf8',
                    background: 'rgba(129,140,248,0.1)', padding: '1px 7px',
                    borderRadius: '3px', border: '1px solid rgba(129,140,248,0.2)'
                  }}>
                    {selectedEntity.entity_type || 'Entity'}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedNodeId(null)}
                  style={{ color: '#475569', padding: '2px' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#94a3b8'}
                  onMouseLeave={e => e.currentTarget.style.color = '#475569'}
                >
                  <X size={11} />
                </button>
              </div>

              {/* State */}
              <div style={{ marginBottom: '10px' }}>
                <div className="flex items-center gap-1.5" style={{ marginBottom: '6px' }}>
                  <Database size={9} style={{ color: '#475569' }} />
                  <span style={{ fontSize: '8px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '1px' }}>
                    Active State
                  </span>
                </div>
                <div style={{ paddingLeft: '8px', borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
                  {[
                    { key: 'Status', val: selectedEntity.status, color: selectedEntity.status === 'Alive' ? '#4ade80' : '#fb7185' },
                    { key: 'Location', val: selectedEntity.location, color: '#94a3b8' },
                    { key: 'Mentions', val: selectedEntity.mentions, color: '#94a3b8' },
                  ].filter(r => r.val != null).map(({ key, val, color }) => (
                    <div key={key} className="flex justify-between items-center" style={{ marginBottom: '4px', fontSize: '10px' }}>
                      <span style={{ color: '#475569' }}>{key}</span>
                      <span style={{ color }}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Relations */}
              {selectedEntityRelations.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5" style={{ marginBottom: '6px' }}>
                    <Info size={9} style={{ color: '#475569' }} />
                    <span style={{ fontSize: '8px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '1px' }}>
                      Relations
                    </span>
                  </div>
                  <div style={{ paddingLeft: '8px', borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
                    {selectedEntityRelations.map((r, i) => {
                      const other = r.subject === selectedNodeId ? r.object : r.subject;
                      const isAlly = r.relation?.includes('ALLY');
                      const isEnemy = r.relation?.includes('ENEMY') || r.relation?.includes('RIVAL');
                      const tagColor = isAlly ? { bg: 'rgba(74,222,128,0.1)', border: 'rgba(74,222,128,0.25)', text: '#4ade80' }
                        : isEnemy ? { bg: 'rgba(251,113,133,0.1)', border: 'rgba(251,113,133,0.25)', text: '#fb7185' }
                        : { bg: 'rgba(56,189,248,0.08)', border: 'rgba(56,189,248,0.2)', text: '#38bdf8' };
                      return (
                        <div key={i} className="flex items-center gap-1.5 flex-wrap" style={{ marginBottom: '5px' }}>
                          <span style={{
                            fontSize: '7px', fontWeight: '700', textTransform: 'uppercase',
                            letterSpacing: '0.4px', padding: '1px 5px', borderRadius: '3px',
                            background: tagColor.bg, border: `1px solid ${tagColor.border}`, color: tagColor.text
                          }}>
                            {r.relation?.replace(/_/g, ' ')}
                          </span>
                          <span style={{ fontSize: '10px', color: '#94a3b8', maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {other}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default GraphDrawer;
