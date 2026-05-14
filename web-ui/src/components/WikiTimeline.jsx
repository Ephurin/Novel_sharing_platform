import React from 'react';
import { Clock, ArrowRight } from 'lucide-react';

const WikiTimeline = ({ events, entityName }) => {
  if (!events || events.length === 0) {
    return (
      <div className="wiki-timeline-empty">
        <Clock size={16} style={{ color: '#475569', opacity: 0.5 }} />
        <p>Chưa có sự kiện nào được ghi nhận</p>
      </div>
    );
  }

  return (
    <div className="wiki-timeline">
      {events.map((evt, idx) => {
        const isSubject = evt.subject_id === entityName;
        const otherEntity = isSubject ? evt.object_id : evt.subject_id;
        const action = evt.action || 'interacted with';

        // Sentiment color
        const polarity = (evt.polarity || '').toLowerCase();
        let dotColor = '#94a3b8'; // neutral
        if (polarity === 'positive') dotColor = '#4ade80';
        else if (polarity === 'negative') dotColor = '#fb7185';

        return (
          <div key={evt.id || idx} className="wiki-timeline-item">
            {/* Timeline line + dot */}
            <div className="wiki-timeline-track">
              <div
                className="wiki-timeline-dot"
                style={{ background: dotColor, boxShadow: `0 0 8px ${dotColor}50` }}
              />
              {idx < events.length - 1 && <div className="wiki-timeline-line" />}
            </div>

            {/* Event content */}
            <div className="wiki-timeline-content">
              <div className="wiki-timeline-action">
                <span className="wiki-timeline-subject">
                  {isSubject ? entityName : otherEntity}
                </span>
                <ArrowRight size={10} className="wiki-timeline-arrow" />
                <span className="wiki-timeline-verb">{action}</span>
                <ArrowRight size={10} className="wiki-timeline-arrow" />
                <span className="wiki-timeline-object">
                  {isSubject ? otherEntity : entityName}
                </span>
              </div>

              {/* Metadata tags */}
              <div className="wiki-timeline-meta">
                {evt.emotion && (
                  <span className="wiki-timeline-tag" style={{ color: '#fbbf24', background: 'rgba(251,191,36,0.1)', borderColor: 'rgba(251,191,36,0.25)' }}>
                    {evt.emotion}
                  </span>
                )}
                {evt.intent && (
                  <span className="wiki-timeline-tag" style={{ color: '#818cf8', background: 'rgba(129,140,248,0.1)', borderColor: 'rgba(129,140,248,0.25)' }}>
                    {evt.intent}
                  </span>
                )}
                {evt.confidence != null && (
                  <span className="wiki-timeline-tag" style={{ color: '#94a3b8', background: 'rgba(148,163,184,0.08)', borderColor: 'rgba(148,163,184,0.15)' }}>
                    {Math.round(evt.confidence * 100)}%
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default WikiTimeline;
