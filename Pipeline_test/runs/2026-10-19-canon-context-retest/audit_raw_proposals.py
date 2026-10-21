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
    for char in ['"', '"', '“', '”', "'", "'", "‘", "’", '«', '»']:
        text = text.replace(char, ' ')
    return " ".join(text.split())

def main():
    gold_rows = []
    with open(RUN_DIR / 'memory_items.csv', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        gold_rows = list(reader)

    raw_proposals = json.loads((EVIDENCE_DIR / 'raw-proposals.json').read_text(encoding='utf-8'))
    print(f"Loaded {len(gold_rows)} gold items (G01-G35) and {len(raw_proposals)} raw proposals.")

    audit_results = []
    matched_count = 0
    critical_matched = 0
    total_critical = sum(1 for g in gold_rows if g.get('critical', '').lower() == 'true')

    for g in gold_rows:
        item_id = g['item_id']
        excerpt = normalize(g['source_excerpt'])
        assertion = normalize(g['expected_assertion'])
        mem_type = g.get('memory_type', '').lower()
        is_critical = g.get('critical', '').lower() == 'true'

        matching_proposals = []
        for p in raw_proposals:
            payload = p.get('payload', {})
            evidence = p.get('evidence', [])
            
            # Combine all text fields in payload and evidence
            text_blocks = []
            for k, v in payload.items():
                if isinstance(v, str):
                    text_blocks.append(v)
                elif isinstance(v, list):
                    text_blocks.extend([str(x) for x in v if isinstance(x, (str, int, float))])
                elif isinstance(v, dict):
                    text_blocks.extend([str(x) for x in v.values() if isinstance(x, (str, int, float))])

            for ev in evidence:
                if isinstance(ev, dict):
                    text_blocks.append(ev.get('quote', ''))
                    text_blocks.append(ev.get('context', ''))

            combined_norm = normalize(" ".join(text_blocks))

            # Match criteria: excerpt in text or semantic key words of assertion
            excerpt_words = [w for w in excerpt.split() if len(w) > 2]
            assertion_words = [w for w in assertion.split() if len(w) > 2]
            
            # Direct excerpt match
            if excerpt and excerpt in combined_norm:
                matching_proposals.append(p)
                continue
            
            # High overlap of excerpt words (>= 80%)
            if excerpt_words:
                match_words = sum(1 for w in excerpt_words if w in combined_norm)
                if match_words / len(excerpt_words) >= 0.8:
                    matching_proposals.append(p)
                    continue

            # Semantic assertion match if excerpt was short
            if assertion_words:
                match_words = sum(1 for w in assertion_words if w in combined_norm)
                if match_words / len(assertion_words) >= 0.8:
                    matching_proposals.append(p)

        matched = len(matching_proposals) > 0
        if matched:
            matched_count += 1
            if is_critical:
                critical_matched += 1

        audit_results.append({
            'item_id': item_id,
            'source_chapter': g.get('source_chapter'),
            'memory_type': mem_type,
            'critical': is_critical,
            'source_excerpt': g['source_excerpt'],
            'expected_assertion': g['expected_assertion'],
            'expected_certainty': g['expected_certainty'],
            'matched': matched,
            'matching_proposal_ids': [p.get('proposal_id') or p.get('id') for p in matching_proposals],
            'matching_proposal_types': [p.get('proposal_type') for p in matching_proposals],
            'sample_quote': [p.get('evidence', [{}])[0].get('quote') if p.get('evidence') else '' for p in matching_proposals[:2]]
        })

    recall = matched_count / len(gold_rows) if gold_rows else 0
    critical_recall = critical_matched / total_critical if total_critical else 0
    print(f"\n--- AUDIT RESULTS FOR P1-M0 RAW EXTRACTION ---")
    print(f"Overall Recall: {matched_count}/{len(gold_rows)} ({recall:.1%})")
    print(f"Critical Recall: {critical_matched}/{total_critical} ({critical_recall:.1%})")

    # Specifically check the target repair items
    print("\nTarget Repair Probe Checks:")
    for target_id in ['G06', 'G07', 'G08', 'G09', 'G10', 'G12', 'G13', 'G14', 'G15', 'G16', 'G17', 'G18', 'G19', 'G20']:
        res = next((r for r in audit_results if r['item_id'] == target_id), None)
        if res:
            status = "FOUND" if res['matched'] else "MISSING"
            print(f"[{status}] {target_id}: {res['expected_assertion']} -> {res['matching_proposal_ids']}")

    output_path = P1_M0_DIR / 'raw-audit-results.json'
    output_path.write_text(json.dumps({
        'overall_recall': recall,
        'critical_recall': critical_recall,
        'matched_count': matched_count,
        'total_gold': len(gold_rows),
        'critical_matched': critical_matched,
        'total_critical': total_critical,
        'items': audit_results
    }, indent=2, ensure_ascii=False), encoding='utf-8')
    print(f"\nSaved detailed audit results to {output_path}")

if __name__ == '__main__':
    main()
