import React, { useMemo, useState } from 'react';
import useStore from '../store/useStore';
import WikiEntityCard from './WikiEntityCard';
import WikiTimeline from './WikiTimeline';
import {
  X, BookOpen, Search, Users, MapPin, Swords, Gem,
  ChevronDown, ChevronRight, AlertTriangle, Building2
} from 'lucide-react';

// Category config: icon, color, filter key
const CATEGORIES = [
  { key: 'ALL', label: 'Tất cả', icon: BookOpen, color: '#94a3b8' },
  { key: 'PER', label: 'Nhân vật', icon: Users, color: '#818cf8' },
  { key: 'LOC', label: 'Địa điểm', icon: MapPin, color: '#38bdf8' },
  { key: 'ORG', label: 'Tổ chức', icon: Building2, color: '#fbbf24' },
  { key: 'SKILL', label: 'Kỹ năng', icon: Swords, color: '#fb7185' },
  { key: 'ITEM', label: 'Vật phẩm', icon: Gem, color: '#4ade80' },
];

const WikiDrawer = () => {
  const { drawerOpen, setDrawerOpen, kbData, focusMode } = useStore();
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedEntity, setExpandedEntity] = useState(null);
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'timeline'
  const [mainTab, setMainTab] = useState('lorebook'); // 'lorebook' | 'pending'

  // Parse entities from KB data
  const allEntities = useMemo(() => {
    if (!kbData?.entities) return [];
    return Object.entries(kbData.entities).map(([key, entity]) => ({
      ...entity,
      _key: key,
    }));
  }, [kbData]);

  // Filter entities by category and search
  const filteredEntities = useMemo(() => {
    let list = allEntities;

    if (activeCategory !== 'ALL') {
      list = list.filter(e => {
        const type = (e.entity_type || '').toUpperCase();
        return type === activeCategory || type === `${activeCategory}SON`;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(e =>
        (e.name || '').toLowerCase().includes(q) ||
        (e.entity_type || '').toLowerCase().includes(q)
      );
    }

    return list;
  }, [allEntities, activeCategory, searchQuery]);

  // Get relations for a specific entity
  const getEntityRelations = (entityName) => {
    if (!kbData?.relations) return [];
    return kbData.relations.filter(
      r =>
        (r.subject === entityName || r.object === entityName) &&
        r.relation !== 'MENTIONED_IN'
    );
  };

  // Get events for a specific entity
  const getEntityEvents = (entityName) => {
    if (!kbData?.enhanced_events) return [];
    return kbData.enhanced_events.filter(
      evt =>
        evt.subject_id === entityName ||
        evt.object_id === entityName
    );
  };

  // Get states for a specific entity
  const getEntityStates = (entityName) => {
    if (!kbData?.entity_states) return [];
    
    // Backend returns entity_states as a Dictionary { entity_id: [states] }
    if (!Array.isArray(kbData.entity_states)) {
      const key = (entityName || '').toLowerCase();
      return kbData.entity_states[key] || [];
    }
    
    // Fallback if it's an array
    return kbData.entity_states.filter(
      s => (s.entity_id || '').toLowerCase() === (entityName || '').toLowerCase()
    );
  };

  // Detect conflicts: entity appears at multiple locations, dead but still acting, etc.
  const getConflicts = (entityName, entity) => {
    const conflicts = [];

    // Check dead but appearing in recent events
    if (entity.status === 'Dead' || entity.status === 'dead') {
      const recentEvents = getEntityEvents(entityName);
      if (recentEvents.length > 0) {
        conflicts.push({
          code: 'DEAD_BUT_ACTIVE',
          message: `⚠️ Nhân vật "${entityName}" đang có trạng thái "Dead" nhưng vẫn xuất hiện trong ${recentEvents.length} sự kiện.`,
        });
      }
    }

    // Check multiple locations in states
    const states = getEntityStates(entityName);
    const locationStates = states.filter(s => s.attribute === 'location');
    if (locationStates.length >= 2) {
      const uniqueLocs = [...new Set(locationStates.map(s => s.value))];
      if (uniqueLocs.length >= 2) {
        conflicts.push({
          code: 'MULTI_LOCATION',
          message: `⚠️ "${entityName}" được ghi nhận ở ${uniqueLocs.length} địa điểm: ${uniqueLocs.join(', ')}`,
        });
      }
    }

    return conflicts;
  };

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts = { ALL: allEntities.length };
    CATEGORIES.forEach(cat => {
      if (cat.key !== 'ALL') {
        counts[cat.key] = allEntities.filter(e => {
          const type = (e.entity_type || '').toUpperCase();
          return type === cat.key || type === `${cat.key}SON`;
        }).length;
      }
    });
    return counts;
  }, [allEntities]);

  // Handle clicking an entity name in a relation to navigate
  const handleEntityClick = (name) => {
    setExpandedEntity(name);
    setActiveTab('profile');
  };

  if (focusMode) return null;

  const entityCount = allEntities.length;

  return (
    <div className="w-full h-full flex flex-col overflow-hidden wiki-drawer">
      {/* ── Header ─────────────────────────────── */}
      <div className="wiki-header">
        <div className="flex items-center gap-4 w-full">
          <button 
            className={`font-semibold text-sm pb-1 border-b-2 ${mainTab === 'lorebook' ? 'border-primary text-primary' : 'border-transparent text-text-dim hover:text-text-bright'}`}
            onClick={() => setMainTab('lorebook')}
          >
            <BookOpen size={14} className="inline mr-1" /> Lorebook
          </button>
          <button 
            className={`font-semibold text-sm pb-1 border-b-2 flex items-center ${mainTab === 'pending' ? 'border-orange-500 text-orange-500' : 'border-transparent text-text-dim hover:text-text-bright'}`}
            onClick={() => setMainTab('pending')}
          >
            <AlertTriangle size={14} className="inline mr-1" /> Chờ duyệt
            <span className="ml-1 bg-orange-500/20 text-orange-500 text-[10px] px-1.5 py-0.5 rounded-full">3</span>
          </button>
          <div className="ml-auto">
            <button onClick={() => setDrawerOpen(false)} className="wiki-close-btn">
              <X size={14} />
            </button>
          </div>
        </div>
      </div>

      {mainTab === 'pending' && (
        <div className="p-4 flex flex-col gap-3">
          <div className="text-xs text-text-dim bg-surface p-2 rounded">
            Các thực thể AI vừa nhận diện được. Hãy duyệt hàng loạt tại đây thay vì hiển thị popup che mất văn bản.
          </div>
          {/* Mock pending entity */}
          <div className="bg-panel border border-dim rounded p-3 flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-text-bright">Vạn Kiếm Quy Tông</span>
              <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">SKILL</span>
            </div>
            <div className="flex gap-2 mt-2">
              <button className="flex-1 bg-primary/20 text-primary text-xs py-1 rounded hover:bg-primary/30">✓ Xác nhận</button>
              <button className="flex-1 bg-surface text-text-dim text-xs py-1 rounded hover:text-text-bright">Sửa</button>
              <button className="flex-1 bg-surface text-text-dim text-xs py-1 rounded hover:text-text-bright">Bỏ qua</button>
            </div>
          </div>
        </div>
      )}

      {mainTab === 'lorebook' && (
        <>

      {/* ── Search ──────────────────────────────── */}
      <div className="wiki-search-bar">
        <Search size={12} className="wiki-search-icon" />
        <input
          type="text"
          placeholder="Tìm thực thể..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="wiki-search-input"
        />
      </div>

      {/* ── Category Tabs ───────────────────────── */}
      <div className="wiki-categories">
        {CATEGORIES.map(cat => {
          const Icon = cat.icon;
          const isActive = activeCategory === cat.key;
          const count = categoryCounts[cat.key] || 0;
          return (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={`wiki-cat-btn ${isActive ? 'active' : ''}`}
              style={{
                '--cat-color': cat.color,
                '--cat-bg': `${cat.color}15`,
                '--cat-bg-active': `${cat.color}25`,
                '--cat-border': `${cat.color}40`,
              }}
              title={cat.label}
            >
              <Icon size={11} />
              <span className="wiki-cat-count">{count}</span>
            </button>
          );
        })}
      </div>

      {/* ── Entity List ─────────────────────────── */}
      <div className="wiki-entity-list">
        {entityCount === 0 ? (
          <div className="wiki-empty">
            <BookOpen size={28} style={{ color: '#475569', opacity: 0.4 }} />
            <p>Nhấn <strong>Analyze</strong> để bắt đầu xây dựng Lorebook</p>
          </div>
        ) : filteredEntities.length === 0 ? (
          <div className="wiki-empty">
            <Search size={20} style={{ color: '#475569', opacity: 0.4 }} />
            <p>Không tìm thấy thực thể nào</p>
          </div>
        ) : (
          filteredEntities.map(entity => {
            const name = entity.name;
            const isExpanded = expandedEntity === name;
            const relations = getEntityRelations(name);
            const events = getEntityEvents(name);
            const states = getEntityStates(name);
            const conflicts = getConflicts(name, entity);
            const type = (entity.entity_type || 'UNKNOWN').toUpperCase();
            const catConfig = CATEGORIES.find(c => c.key === type) || CATEGORIES[0];

            return (
              <div key={entity._key} className="wiki-entity-item">
                {/* Accordion Header */}
                <button
                  className="wiki-entity-header"
                  onClick={() => setExpandedEntity(isExpanded ? null : name)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    <span
                      className="wiki-entity-type-dot"
                      style={{ background: catConfig.color }}
                    />
                    <span className="wiki-entity-name">{name}</span>
                    {conflicts.length > 0 && (
                      <AlertTriangle size={11} style={{ color: '#fb7185', flexShrink: 0 }} />
                    )}
                  </div>
                  <span
                    className="wiki-entity-type-badge"
                    style={{
                      color: catConfig.color,
                      background: `${catConfig.color}12`,
                      borderColor: `${catConfig.color}30`,
                    }}
                  >
                    {type}
                  </span>
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="wiki-entity-content">
                    {/* Conflict Warnings */}
                    {conflicts.length > 0 && (
                      <div className="wiki-conflicts">
                        {conflicts.map((c, i) => (
                          <div key={i} className="wiki-conflict-item">
                            {c.message}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Sub-tabs: Profile | Timeline */}
                    <div className="wiki-subtabs">
                      <button
                        className={`wiki-subtab ${activeTab === 'profile' ? 'active' : ''}`}
                        onClick={() => setActiveTab('profile')}
                      >
                        Hồ sơ
                      </button>
                      <button
                        className={`wiki-subtab ${activeTab === 'timeline' ? 'active' : ''}`}
                        onClick={() => setActiveTab('timeline')}
                      >
                        Dòng thời gian ({events.length})
                      </button>
                    </div>

                    {activeTab === 'profile' ? (
                      <WikiEntityCard
                        entity={entity}
                        relations={relations}
                        states={states}
                        onEntityClick={handleEntityClick}
                      />
                    ) : (
                      <WikiTimeline events={events} entityName={name} />
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
        </>
      )}
    </div>
  );
};

export default WikiDrawer;
