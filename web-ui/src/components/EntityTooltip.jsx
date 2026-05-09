import React from 'react';
import { Check, X, Edit2, AlertCircle } from 'lucide-react';

const EntityTooltip = ({ entity, position, onClose }) => {
  const name = entity.resolved_name || entity.word;
  const confidence = (entity.confidence * 100).toFixed(0);

  return (
    <div 
      className="fixed z-50 bg-slate-800 border border-slate-700 shadow-2xl rounded-lg p-4 w-64 animate-in zoom-in-95 duration-150"
      style={{ left: position.x, top: position.y }}
    >
      <div className="flex flex-col gap-3">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-bold text-slate-100 text-sm leading-tight">{name}</h3>
            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
              {entity.type || "PER"}
            </span>
          </div>
          <div className="flex items-center gap-1 text-[10px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">
            <AlertCircle size={10} /> {confidence}%
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-700">
          <button 
            className="flex flex-col items-center gap-1 p-1.5 rounded hover:bg-emerald-500/10 text-emerald-500 transition-colors"
            onClick={onClose}
          >
            <Check size={14} />
            <span className="text-[8px] font-bold uppercase">Confirm</span>
          </button>
          <button 
            className="flex flex-col items-center gap-1 p-1.5 rounded hover:bg-sky-500/10 text-sky-500 transition-colors"
            onClick={onClose}
          >
            <Edit2 size={14} />
            <span className="text-[8px] font-bold uppercase">Edit</span>
          </button>
          <button 
            className="flex flex-col items-center gap-1 p-1.5 rounded hover:bg-rose-500/10 text-rose-500 transition-colors"
            onClick={onClose}
          >
            <X size={14} />
            <span className="text-[8px] font-bold uppercase">Ignore</span>
          </button>
        </div>
      </div>
      
      {/* Arrow down to the highlighted word */}
      <div className="absolute -top-2 left-4 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-bottom-[8px] border-b-slate-800"></div>
    </div>
  );
};

export default EntityTooltip;
