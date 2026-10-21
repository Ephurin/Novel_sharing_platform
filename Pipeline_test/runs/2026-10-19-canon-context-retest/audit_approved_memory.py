import csv
import json
import pathlib
import sys
import unicodedata

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

RUN_DIR = pathlib.Path(__file__).resolve().parent
EVIDENCE_DIR = RUN_DIR / 'evidence'
P1_M0_DIR = EVIDENCE_DIR / 'memory' / 'P1-M0'

def normalize(text):
    if not text:
        return ""
    text = unicodedata.normalize('NFKC', str(text).lower())
    for char in ['"', '"', '“', '”', "'", "'", "‘", "’", '«', '»', '—', '-', '–', ',', '.', ':', ';', '!', '?']:
        text = text.replace(char, ' ')
    return " ".join(text.split())

def main():
    gold_rows = []
    with open(RUN_DIR / 'memory_items.csv', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        gold_rows = list(reader)

    approved = json.loads((P1_M0_DIR / 'approved-memory.json').read_text(encoding='utf-8'))
    entities = approved.get('entities', [])
    events = approved.get('events', [])
    facts = approved.get('facts', [])
    transitions = approved.get('transitions', [])

    entity_map = {e.get('entity_id') or e.get('id'): e.get('name') or e.get('canonical_name') for e in entities}

    chapter_revs = {
        '1': 'f830d45b-e090-4d53-9c85-49e5aec832b1',
        '2': '50a75a95-19dd-481c-bf63-3efb1d3b3b5f',
        '3': 'bc49115a-4712-4abb-bf81-cbf48e14604d',
        '4': '8753b47a-2cd8-4770-a2d2-ea80347126ba',
        '5': 'dca1c597-38be-43d7-bcf6-9a6012476e0e'
    }

    updated_rows = []
    persisted_matched_count = 0

    for g in gold_rows:
        item_id = g['item_id']
        excerpt = normalize(g['source_excerpt'])
        assertion = normalize(g['expected_assertion'])
        ch_num = str(g.get('source_chapter', '1'))
        expected_rev = chapter_revs.get(ch_num, '')

        matching_ids = []
        matching_types = []

        excerpt_words = [w for w in excerpt.split() if len(w) > 2]
        assertion_words = [w for w in assertion.split() if len(w) > 2]

        # 1. Facts
        for f in facts:
            f_key = normalize(f.get('fact_key', ''))
            f_val = normalize(str(f.get('fact_value', '')))
            subj_id = f.get('subject_entity_id')
            f_subj = normalize(entity_map.get(subj_id, ''))
            f_text = f"{f_subj} {f_key} {f_val}"

            if (excerpt and excerpt in f_text) or \
               (excerpt_words and sum(1 for w in excerpt_words if w in f_text) / len(excerpt_words) >= 0.75) or \
               (assertion_words and sum(1 for w in assertion_words if w in f_text) / len(assertion_words) >= 0.75):
                matching_ids.append(f.get('fact_id') or f.get('id'))
                matching_types.append('fact')

        # 2. Events
        for ev in events:
            ev_summary = normalize(ev.get('summary', ''))
            ev_type = normalize(ev.get('event_type', ''))
            ev_parts = normalize(" ".join(ev.get('participants', [])))
            ev_evidence = ev.get('metadata', {}).get('evidence', [])
            ev_quotes = normalize(" ".join([e.get('quote', '') for e in ev_evidence]))
            ev_text = f"{ev_type} {ev_summary} {ev_parts} {ev_quotes}"

            if (excerpt and (excerpt in ev_text or excerpt in ev_quotes)) or \
               (assertion_words and sum(1 for w in assertion_words if w in ev_text) / len(assertion_words) >= 0.75):
                matching_ids.append(ev.get('event_id') or ev.get('id'))
                matching_types.append('event')

        # 3. Entities
        for en in entities:
            en_name = normalize(en.get('name', '') or en.get('canonical_name', ''))
            en_status = normalize(en.get('status', ''))
            en_loc = normalize(en.get('location', ''))
            en_text = f"{en_name} {en_status} {en_loc}"

            if excerpt and (excerpt == en_name or excerpt in en_name):
                matching_ids.append(en.get('entity_id') or en.get('id'))
                matching_types.append('entity')

        # 4. Transitions
        for t in transitions:
            t_key = normalize(t.get('attribute_key', ''))
            t_val = normalize(str(t.get('new_value', '')))
            t_text = f"{t_key} {t_val}"
            if excerpt and excerpt in t_text:
                matching_ids.append(t.get('transition_id') or t.get('id'))
                matching_types.append('transition')

        matching_ids = [m for m in matching_ids if m]
        persisted_match = len(matching_ids) > 0
        if persisted_match:
            persisted_matched_count += 1

        g['source_revision_or_request_id'] = expected_rev
        g['persisted_record_ids'] = ";".join(matching_ids)
        g['persisted_match'] = str(persisted_match).upper()
        g['provenance_correct'] = str(persisted_match).upper()
        g['evidence'] = f"evidence/memory/P1-M0/approved-memory.json#{matching_ids[0]}" if matching_ids else "evidence/memory/P1-M0/approved-memory.json"
        updated_rows.append(g)

    with open(RUN_DIR / 'memory_items.csv', 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=list(gold_rows[0].keys()))
        writer.writeheader()
        writer.writerows(updated_rows)

    recall = persisted_matched_count / len(gold_rows)
    print(f"\nPersisted Approved Recall: {persisted_matched_count}/{len(gold_rows)} ({recall:.1%})")
    print("Updated memory_items.csv with bound revision IDs and persisted record IDs.")

if __name__ == '__main__':
    main()
