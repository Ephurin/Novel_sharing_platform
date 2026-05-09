import React from 'react';
import useStore from '../store/useStore';
import { Sparkles, AlertTriangle, Users, Activity, ChevronRight } from 'lucide-react';

// Dùng inline styles cho custom tokens thay vì Tailwind custom classes
// vì bg-sky/10, text-sky, border-dim... không hoạt động nếu chưa config Tailwind đúng

const MOOD_CONFIG = [
  {
    id: 'neutral',
    label: 'Neutral',
    active: { background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.35)', color: '#38bdf8' },
  },
  {
    id: 'romantic',
    label: 'Romantic',
    active: { background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24' },
  },
  {
    id: 'tragic',
    label: 'Tragic',
    active: { background: 'rgba(251,113,133,0.12)', border: '1px solid rgba(251,113,133,0.35)', color: '#fb7185' },
  },
  {
    id: 'dark',
    label: 'Dark',
    active: { background: 'rgba(129,140,248,0.12)', border: '1px solid rgba(129,140,248,0.35)', color: '#818cf8' },
    span: false,
  },
  {
    id: 'comedic',
    label: 'Comedic',
    active: { background: 'rgba(74,222,128,0.10)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80' },
    span: true,
  },
];

const IDLE_MOOD_STYLE = {
  background: 'rgba(15,18,37,1)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: '#475569',
};

const sectionLabel = {
  fontSize: '9px',
  fontWeight: '700',
  textTransform: 'uppercase',
  letterSpacing: '1.5px',
  color: '#475569',
  display: 'flex',
  alignItems: 'center',
  gap: '5px',
  marginBottom: '8px',
};

const ChatPanel = () => {
  const {
    suggestions,
    isGettingSuggestion,
    mood,
    setMood,
    targetCharacter,
    setTargetCharacter,
    entities,
    focusMode,
  } = useStore();

  if (focusMode) return null;

  const perEntities = Array.isArray(entities)
    ? entities.filter(e => {
        const type = (e.entity_type || '').toUpperCase();
        return type === 'PERSON' || type === 'PER' || type === 'UNKNOWN';
      })
    : [];

  const lowConfidence = Array.isArray(entities)
    ? entities.filter(e => typeof e.confidence === 'number' && e.confidence < 0.8).slice(0, 1)
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', gap: '10px',
        flexShrink: 0,
      }}>
        <div style={{
          width: 24, height: 24,
          background: 'linear-gradient(135deg, rgba(56,189,248,0.2), rgba(129,140,248,0.15))',
          border: '1px solid rgba(56,189,248,0.2)',
          borderRadius: '6px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Sparkles size={11} style={{ color: '#38bdf8' }} />
        </div>
        <span style={{ fontSize: '9px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1.5px', color: '#475569' }}>
          AI Assistant
        </span>
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>

        {/* Section 1: Focus Character */}
        <div style={{ marginBottom: '20px' }}>
          <label style={sectionLabel}>
            <Users size={9} /> Focus Character
          </label>
          <select
            value={targetCharacter}
            onChange={e => setTargetCharacter(e.target.value)}
            style={{
              width: '100%',
              background: 'rgba(15,18,37,1)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px',
              padding: '8px 32px 8px 12px',
              fontSize: '12px',
              color: '#94a3b8',
              outline: 'none',
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 10px center',
              cursor: 'pointer',
            }}
          >
            <option value="">Select a character...</option>
            {perEntities.map((e, idx) => {
              const name = e.name || e.resolved_name || e.word;
              return <option key={idx} value={name}>{name}</option>;
            })}
          </select>
        </div>

        {/* Section 2: Narrative Mood */}
        <div style={{ marginBottom: '20px' }}>
          <label style={sectionLabel}>
            <Activity size={9} /> Narrative Mood
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {MOOD_CONFIG.map(m => {
              const isActive = mood === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setMood(m.id)}
                  style={{
                    ...(isActive ? m.active : IDLE_MOOD_STYLE),
                    gridColumn: m.span ? 'span 2' : 'span 1',
                    padding: '8px',
                    borderRadius: '7px',
                    fontSize: '10px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    letterSpacing: '0.3px',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => {
                    if (!isActive) {
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)';
                      e.currentTarget.style.color = '#94a3b8';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                      e.currentTarget.style.color = '#475569';
                    }
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 3: Warning banner */}
        {lowConfidence.length > 0 && (
          <div style={{
            padding: '10px 12px',
            background: 'rgba(251,191,36,0.06)',
            border: '1px solid rgba(251,191,36,0.18)',
            borderRadius: '8px',
            display: 'flex', gap: '8px', alignItems: 'flex-start',
            marginBottom: '20px',
          }}>
            <AlertTriangle size={12} style={{ color: '#fbbf24', flexShrink: 0, marginTop: '1px' }} />
            <p style={{ fontSize: '10px', color: 'rgba(251,191,36,0.85)', lineHeight: '1.6' }}>
              Thực thể <strong>{lowConfidence[0].word || lowConfidence[0].name}</strong> có độ chính xác thấp (
              {lowConfidence[0].confidence.toFixed(2)}). Hãy xác nhận để cải thiện gợi ý.
            </p>
          </div>
        )}

        {/* Section 4: Suggestions */}
        <div>
          <label style={{ ...sectionLabel, marginBottom: '12px' }}>
            <Sparkles size={9} /> Gợi ý tình tiết
          </label>

          {!targetCharacter ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', padding: '40px 0', gap: '10px', opacity: 0.2,
            }}>
              <Sparkles size={22} style={{ color: '#475569' }} />
              <p style={{ fontSize: '10px', color: '#475569', textAlign: 'center', lineHeight: '1.6', maxWidth: '130px' }}>
                Chọn nhân vật và mood để bắt đầu gợi ý.
              </p>
            </div>
          ) : isGettingSuggestion ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{
                  height: '80px', borderRadius: '10px',
                  background: 'rgba(15,18,37,1)',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }} />
              ))}
            </div>
          ) : suggestions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', opacity: 0.25 }}>
              <p style={{ fontSize: '10px', color: '#475569' }}>Chưa có gợi ý. Thử nhấn Analyze.</p>
            </div>
          ) : (
            suggestions.map((s, idx) => (
              <SuggestionCard key={idx} text={s} mood={mood} />
            ))
          )}
        </div>
      </div>

      {/* ── Footer legend ── */}
      <div style={{
        padding: '10px 16px',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', gap: '14px', alignItems: 'center',
        flexShrink: 0,
      }}>
        {[
          { color: '#818cf8', glow: 'rgba(129,140,248,0.5)', label: 'Person' },
          { color: '#38bdf8', glow: 'rgba(56,189,248,0.5)', label: 'Location' },
          { color: '#fbbf24', glow: 'rgba(251,191,36,0.5)', label: 'Org' },
        ].map(({ color, glow, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: color, boxShadow: `0 0 5px ${glow}`,
            }} />
            <span style={{ fontSize: '8px', fontWeight: '600', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Tách ra component riêng để hover state sạch hơn
const SuggestionCard = ({ text, mood }) => {
  const [hovered, setHovered] = React.useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        padding: '14px 14px 14px 18px',
        background: hovered ? 'rgba(20,23,48,1)' : 'rgba(15,18,37,1)',
        border: hovered ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,255,255,0.04)',
        borderRadius: '10px',
        marginBottom: '8px',
        cursor: 'pointer',
        transform: hovered ? 'translateX(2px)' : 'translateX(0)',
        transition: 'all 0.18s ease',
        overflow: 'hidden',
      }}
    >
      {/* Left accent bar */}
      <div style={{
        position: 'absolute', left: 0, top: 0,
        width: '3px', height: '100%',
        background: 'linear-gradient(180deg, #38bdf8, #818cf8)',
        opacity: 0.75,
      }} />

      <p style={{
        fontFamily: "'Lora', 'Georgia', serif",
        fontSize: '12px',
        lineHeight: '1.75',
        color: '#94a3b8',
        fontStyle: 'italic',
        marginBottom: '10px',
      }}>
        {text}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontSize: '8px', fontWeight: '700', textTransform: 'uppercase',
          letterSpacing: '0.8px', padding: '2px 7px', borderRadius: '3px',
          background: 'rgba(56,189,248,0.08)', color: 'rgba(56,189,248,0.7)',
          border: '1px solid rgba(56,189,248,0.15)',
        }}>
          {mood}
        </span>
        <button
          style={{
            display: 'flex', alignItems: 'center', gap: '3px',
            fontSize: '9px', fontWeight: '700',
            color: '#38bdf8',
            opacity: hovered ? 1 : 0,
            transition: 'opacity 0.15s',
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Dùng <ChevronRight size={9} />
        </button>
      </div>
    </div>
  );
};

export default ChatPanel;
