import React from 'react';
import {
  Heart, MapPin, Zap, Shield, User, Package, ChevronRight
} from 'lucide-react';

const STATE_ICONS = {
  health: Heart,
  location: MapPin,
  emotion: Zap,
  status: Shield,
};

const STATE_COLORS = {
  health: '#fb7185',
  location: '#38bdf8',
  emotion: '#fbbf24',
  status: '#4ade80',
};

const WikiEntityCard = ({ entity, relations, states, onEntityClick }) => {
  // Group relations by type
  const relationsByType = {};
  relations.forEach(r => {
    const type = (r.relation || 'UNKNOWN').replace(/_/g, ' ');
    if (!relationsByType[type]) relationsByType[type] = [];
    const otherName = r.subject === entity.name ? r.object : r.subject;
    if (!relationsByType[type].includes(otherName)) {
      relationsByType[type].push(otherName);
    }
  });

  // Group states by attribute, keep only latest
  const latestStates = {};
  states.forEach(s => {
    const attr = s.attribute;
    // Keep the last one (assuming array is chronological)
    latestStates[attr] = s;
  });

  return (
    <div className="wiki-card">
      {/* ── Basic Info ─────────────────── */}
      <div className="wiki-card-section">
        <div className="wiki-card-section-title">
          <User size={10} /> Thông tin
        </div>
        <div className="wiki-card-grid">
          <div className="wiki-card-field">
            <span className="wiki-card-label">Tên</span>
            <span className="wiki-card-value">{entity.name}</span>
          </div>
          <div className="wiki-card-field">
            <span className="wiki-card-label">Loại</span>
            <span className="wiki-card-value">{entity.entity_type || 'Chưa xác định'}</span>
          </div>
          {entity.status && (
            <div className="wiki-card-field">
              <span className="wiki-card-label">Trạng thái</span>
              <span
                className="wiki-card-value"
                style={{
                  color:
                    entity.status === 'Alive' ? '#4ade80' :
                    entity.status === 'Dead' ? '#fb7185' : '#94a3b8'
                }}
              >
                {entity.status}
              </span>
            </div>
          )}
          {entity.location && (
            <div className="wiki-card-field">
              <span className="wiki-card-label">Vị trí</span>
              <span className="wiki-card-value" style={{ color: '#38bdf8' }}>
                {entity.location}
              </span>
            </div>
          )}
          {entity.mentions != null && (
            <div className="wiki-card-field">
              <span className="wiki-card-label">Đề cập</span>
              <span className="wiki-card-value">{entity.mentions} lần</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Active States (Attributes) ── */}
      {Object.keys(latestStates).length > 0 && (
        <div className="wiki-card-section">
          <div className="wiki-card-section-title">
            <Package size={10} /> Thuộc tính
          </div>
          <div className="wiki-state-list">
            {Object.entries(latestStates).map(([attr, state]) => {
              const Icon = STATE_ICONS[attr] || Shield;
              const color = STATE_COLORS[attr] || '#94a3b8';
              return (
                <div key={attr} className="wiki-state-item">
                  <div className="wiki-state-icon" style={{ color }}>
                    <Icon size={10} />
                  </div>
                  <span className="wiki-state-attr">{attr}</span>
                  <span className="wiki-state-value" style={{ color }}>
                    {state.value}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Relations (Dropdown style) ── */}
      {Object.keys(relationsByType).length > 0 && (
        <div className="wiki-card-section">
          <div className="wiki-card-section-title">
            <ChevronRight size={10} /> Mối quan hệ
          </div>
          <div className="wiki-relation-list">
            {Object.entries(relationsByType).map(([relType, names]) => {
              const isAlly = relType.includes('ALLY');
              const isEnemy = relType.includes('ENEMY') || relType.includes('RIVAL');
              const tagColor = isAlly
                ? '#4ade80'
                : isEnemy
                ? '#fb7185'
                : '#38bdf8';

              return (
                <div key={relType} className="wiki-relation-group">
                  <span
                    className="wiki-relation-tag"
                    style={{
                      color: tagColor,
                      background: `${tagColor}12`,
                      borderColor: `${tagColor}30`,
                    }}
                  >
                    {relType}
                  </span>
                  <div className="wiki-relation-names">
                    {names.map(name => (
                      <button
                        key={name}
                        className="wiki-relation-link"
                        onClick={() => onEntityClick?.(name)}
                        title={`Xem hồ sơ: ${name}`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default WikiEntityCard;
