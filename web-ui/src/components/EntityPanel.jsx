import React from 'react';
import { Check, X, Edit3, Trash2 } from 'lucide-react';

const EntityPanel = ({ entity, position, onClose }) => {
  const name = entity.word || "Unknown";
  const confidence = entity.confidence || 0;
  const bars = Math.round(confidence * 6);
  const barStr = '█'.repeat(bars) + '░'.repeat(6 - bars);

  return (
    <div 
      className="absolute z-[200] w-[220px] bg-raised border border-mid rounded-[12px] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.5),0_0_0_1px_rgba(56,189,248,0.1)] animate-in fade-in slide-in-from-top-1 duration-150 flex flex-col font-sans"
      style={{ left: position.x, top: position.y }}
    >
      {/* Glow effect pseudo-logic */}
      <div className="absolute inset-0 rounded-[12px] bg-gradient-to-br from-sky/5 to-transparent pointer-events-none" />

      <div className="flex justify-between items-center mb-1 relative z-10">
        <h3 className="panel-ent-name text-[15px] font-semibold text-text-bright truncate pr-4">{name}</h3>
        <span className="text-[9px] font-bold uppercase tracking-wider text-violet opacity-70">
          [{entity.entity_type || 'PER'}]
        </span>
      </div>

      <div className="panel-separator h-[1px] bg-dim my-2 relative z-10" />

      <div className="space-y-2 relative z-10">
        <div className="panel-field flex justify-between items-center text-[11px]">
          <span className="panel-field-key text-text-dim">Normalized</span>
          <span className="panel-field-val text-text-mid font-medium truncate max-w-[100px]">{entity.resolved_name || name}</span>
        </div>
        <div className="panel-field flex justify-between items-center text-[11px]">
          <span className="panel-field-key text-text-dim">Confidence</span>
          <span className="panel-field-val font-mono text-sky/80 flex items-center gap-1.5">
            <span className="tracking-tighter">{barStr}</span> {confidence.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="panel-separator h-[1px] bg-dim my-2 relative z-10" />

      <div className="panel-actions flex gap-2 mt-2 relative z-10">
        <button 
          onClick={onClose}
          className="panel-btn pbtn-confirm flex-1 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all bg-emerald-500/10 border border-emerald-500/25 text-emerald-500 hover:bg-emerald-500/20"
        >
          ✔ Xác nhận
        </button>
        <button 
          onClick={onClose}
          className="panel-btn pbtn-edit flex-1 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all bg-sky/10 border border-sky/25 text-sky hover:bg-sky/20"
        >
          ✏ Sửa
        </button>
      </div>
      <button 
        onClick={onClose}
        className="panel-btn pbtn-ignore mt-2 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all bg-rose/10 border border-rose/25 text-rose hover:bg-rose/20 relative z-10"
      >
        ✕ Bỏ qua
      </button>

      {/* Arrow/Tail (Optional based on visual preference, but keeping it clean) */}
    </div>
  );
};

export default EntityPanel;
