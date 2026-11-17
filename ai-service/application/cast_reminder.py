"""Main characters missing from the latest chapters (live retest 11, Y1).

Lam Yên took part in events of ch. 1-8, was not recorded in any ch. 9 event and then vanished from
ch. 10-11: the writing context listed her among a dozen entities but nothing said she had dropped out
of the story. This picks out characters who recur in the recent events but are absent from the last
two chapters, with where and when they were last seen, so the writer is reminded of them.
"""
from __future__ import annotations

from typing import Any

PERSON_TYPES = frozenset({'per', 'person', 'character'})
MIN_RECENT_EVENTS = 2
ABSENT_CHAPTERS = 2
MAX_REMINDERS = 4


def absent_main_characters(entities, recent_events) -> list[dict[str, Any]]:
    events = [e for e in recent_events if isinstance(e.get('chapter_number'), int)]
    if not events:
        return []
    latest = max(e['chapter_number'] for e in events)
    window = latest - ABSENT_CHAPTERS + 1
    out = []
    for entity in entities:
        entity_id = str(entity.get('entity_id') or '')
        if not entity_id or str(entity.get('entity_type', '')).casefold() not in PERSON_TYPES:
            continue
        mine = [e for e in events if entity_id in {str(p) for p in e.get('participants') or ()}]
        if len(mine) < MIN_RECENT_EVENTS or any(e['chapter_number'] >= window for e in mine):
            continue
        last = max(mine, key=lambda e: (e['chapter_number'], e.get('narrative_order') or 0))
        out.append({'entity_id': entity_id, 'name': entity.get('name', ''),
                    'last_event_chapter': last['chapter_number'], 'last_event': last.get('summary', ''),
                    'location': entity.get('location', ''), 'events_in_window': len(mine)})
    out.sort(key=lambda item: (-item['events_in_window'], -item['last_event_chapter']))
    return out[:MAX_REMINDERS]
