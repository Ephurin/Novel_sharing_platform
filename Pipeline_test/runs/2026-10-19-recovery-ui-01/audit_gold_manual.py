"""Offline reviewer judgments over frozen gold and saved snapshots; never calls an LLM.

Verdicts below are explicit semantic judgments, not keyword-overlap scores. Raw
assertion fidelity, author-reviewed retention and context presence are separate.
"""
import csv
import json
from collections import Counter
from pathlib import Path

RUN = Path(__file__).resolve().parent
RAW = RUN / 'evidence/s02-raw'
APPROVED = RUN / 'evidence/m0-after-review'

# item: (raw verdict, supporting raw proposal prefixes, semantic rationale)
JUDGMENTS = {
 'G01': ('PASS', ['aa54dd2c'], 'Mai Linh age 29 is explicit.'),
 'G02': ('PASS', ['b2d85e2b'], 'Eleven-year absence is represented.'),
 'G03': ('PASS', ['fa390415'], 'Flood marker refers to the flood 17 years earlier; subject is unresolved.'),
 'G04': ('PASS', ['fe93ad4d'], '23 flood victims is explicit; subject is unresolved.'),
 'G05': ('PASS', ['38939d70'], 'Mai Lam explicitly Dead, not a default Alive state.'),
 'G06': ('FAIL', [], 'No proposition records the painted blue edge of CV-04.'),
 'G07': ('FAIL', [], 'No proposition records the curved hook-shaped crack of CV-04.'),
 'G08': ('FAIL', [], 'Playback is represented but a durable scan_count=1 proposition is absent.'),
 'G09': ('PASS', ['0ca33305'], 'Each read loses more high-frequency spectrum.'),
 'G10': ('PARTIAL', ['eba8dbd4'], 'Value 3 retained, but the recommended/proposed qualifier is lost; rejected in review.'),
 'G11': ('PASS', ['b1f769dd'], 'The recording contains Open Gate Four; not an executed command.'),
 'G12': ('PASS', ['0bd310da'], 'Linh thinks the voice may be her father; hypothesis preserved.'),
 'G13': ('FAIL', [], 'No explicit limit on what the bell proves about time/location.'),
 'G14': ('PASS', ['8e602f4d'], 'Duy left-ear hearing loss is explicit.'),
 'G15': ('FAIL', [], 'No chapter-2 assertion preserves the full right-ear/instrument compensation.'),
 'G16': ('FAIL', [], 'No two-storage-drives proposition.'),
 'G17': ('FAIL', [], 'No sealed drive in Hoa cabinet proposition.'),
 'G18': ('FAIL', [], 'No separate drive in Linh moisture-proof bag proposition.'),
 'G19': ('PASS', ['1b83c77a'], 'Triangular notch retained on the copper ring, including identity in subject name.'),
 'G20': ('FAIL', [], 'Toolbox location alone does not state that Duy stores the ring inside it.'),
 'G21': ('FAIL', ['7d15916f', 'b63d2be3'], 'Sam account promoted to confirmed bell history without attribution; rejected in review.'),
 'G22': ('FAIL', ['83c90ccd'], 'Conflates observed hidden notebook with unverified market-book explanation; rejected.'),
 'G23': ('FAIL', [], 'No explicit Linh saw but has not read notebook assertion.'),
 'G24': ('FAIL', [], 'Meeting/discussion is present but conditional survey permission is not.'),
 'G25': ('FAIL', [], 'No durable restriction against operating the water gate.'),
 'G26': ('FAIL', [], 'No durable restriction against entering the sealed compartment.'),
 'G27': ('FAIL', [], 'No explicit uncertainty about Vu willingness to tell everything.'),
 'G28': ('PASS', ['ec5196ac', '6e0caf3b', '5ee08e31'], 'Map marking and observed sound are separately qualified; no physical blockage is established.'),
 'G29': ('PARTIAL', ['d5d29415'], 'Day two/Station Four/west branch retained; morning qualifier is not explicit in stored proposition.'),
 'G30': ('PASS', ['4070ae11', '8bc71941'], 'An ties the boat outside.'),
 'G31': ('PARTIAL', ['1fab813c'], 'Linh upper-floor/not-descended state retained; Duy is not independently bound to that state.'),
 'G32': ('PASS', ['6abdfef6'], 'Confirmed fact about Duy lack of evidence, not an assertion that nobody is below.'),
 'G33': ('PASS', ['5bcc3024', '1438b48e'], 'Three short knocks followed by a fourth long sound are explicit.'),
 'G34': ('PARTIAL', ['5bcc3024', '1438b48e'], 'Unknown placeholder is unresolved; explicit unknown-source wording is supplied by author review.'),
 'G35': ('PASS', ['0cba063c'], 'Reflecting waterline in the door gap begins rising.'),
}


def main():
    raw = json.loads((RAW / 'proposals-pending.json').read_text(encoding='utf-8'))
    accepted = json.loads((APPROVED / 'proposals-accepted.json').read_text(encoding='utf-8'))
    memory = json.loads((APPROVED / 'official-memory.json').read_text(encoding='utf-8'))
    revs = {r['revision_id']: r for r in json.loads((RAW / 'revisions.json').read_text(encoding='utf-8'))}
    accepted_ids = {p['proposal_id'] for p in accepted}
    gold = list(csv.DictReader((RUN / 'memory_items.csv').open(encoding='utf-8')))
    assert set(JUDGMENTS) == {g['item_id'] for g in gold} and len(gold) == 35
    structural = []
    for proposal in raw:
        for ev in proposal['evidence']:
            rev = revs[ev['revision_id']]
            assert rev['content'][ev['start']:ev['end']] == ev['quote']
            assert ev['text_hash'] == rev['content_hash']
            structural.append(proposal['proposal_id'])
    results = []
    probe_rows = []
    for g in gold:
        verdict, prefixes, rationale = JUDGMENTS[g['item_id']]
        props = [p for p in raw if any(p['proposal_id'].startswith(prefix) for prefix in prefixes)]
        assert len(props) == len(prefixes), g['item_id']
        records = []
        for p in props:
            if p['proposal_id'] not in accepted_ids:
                continue
            ev = p['evidence'][0]
            if p['proposal_type'] == 'fact':
                records.extend({'kind': 'fact', **f} for f in memory['facts']
                    if f.get('source_revision_id') == ev['revision_id']
                    and f.get('source_start') == ev['start'] and f.get('source_end') == ev['end']
                    and f.get('fact_key') == p['payload']['fact_key'])
            elif p['proposal_type'] == 'event':
                records.extend({'kind': 'event', **e} for e in memory['events']
                    if e['summary'] == p['payload']['summary'] and e['chapter'] == ev['chapter_number'])
        reviewed_verdict = verdict if records else 'FAIL'
        if g['item_id'] == 'G34' and len(records) == 2:
            reviewed_verdict = 'PASS_AFTER_AUTHOR_WORDING'
        result = {'item_id': g['item_id'], 'assertion': g['expected_assertion'],
            'raw_verdict': verdict, 'raw_proposal_ids': [p['proposal_id'] for p in props],
            'reviewed_verdict': reviewed_verdict,
            'record_ids': list(dict.fromkeys(r.get('fact_id') or r.get('event_id') for r in records)),
            'rationale': rationale}
        results.append(result)
        g.update(raw_match=verdict, raw_proposal_ids=';'.join(result['raw_proposal_ids']),
            persisted_match=reviewed_verdict, persisted_record_ids=';'.join(result['record_ids']),
            provenance_correct='SPAN_HASH_VALID_SEMANTIC_SEPARATE' if props else 'NOT_APPLICABLE',
            post_correction_match=reviewed_verdict,
            evidence='evidence/m0-gold-manual.json#' + g['item_id'])
        for budget in [4000, 8192]:
            context = json.loads((APPROVED / f'context-{budget}.json').read_text(encoding='utf-8'))
            paths = []
            packed_ids = []
            for record in records:
                identifier = record.get('fact_id') or record.get('event_id')
                lane = 'world_rules' if record['kind'] == 'fact' else 'recent_events'
                for index, packed in enumerate(context[lane]):
                    if identifier == (packed.get('id') or packed.get('fact_id') or packed.get('event_id')):
                        packed_ids.append(identifier)
                        paths.append(f'/{lane}/{index}')
                if record['kind'] == 'fact' and record.get('subject_entity_id'):
                    for index, state in enumerate(context['current_states']):
                        if state.get('entity_id') != record['subject_entity_id']:
                            continue
                        key = record['fact_key']
                        value = state.get('state', {}).get(key, state.get(key))
                        if value == record['fact_value']:
                            packed_ids.append(identifier)
                            paths.append(f'/current_states/{index}/state-or-field/{key}')
            retained = len(set(packed_ids)) == len(set(result['record_ids'])) and bool(records)
            final_verdict = ('PASS' if retained else 'DROPPED') if reviewed_verdict in {'PASS', 'PASS_AFTER_AUTHOR_WORDING'} else 'UPSTREAM_GAP'
            probe_rows.append({'audit_id': 'P1-M0', 'item_id': g['item_id'], 'budget': budget,
                'query': 'character=Linh; chapter_cutoff=5 (inclusive)', 'expected': g['expected_assertion'],
                'verdict': final_verdict, 'packed_ids': ';'.join(sorted(set(packed_ids))),
                'json_paths': ';'.join(paths), 'context_file': f'evidence/m0-after-review/context-{budget}.json'})
    for name, rows in [('memory_items.csv', gold), ('memory_gold_probes.csv', probe_rows)]:
        with (RUN / name).open('w', encoding='utf-8', newline='') as handle:
            writer = csv.DictWriter(handle, fieldnames=list(rows[0])); writer.writeheader(); writer.writerows(rows)
    summary = {'reviewer': 'Codex developer/retester (not independent)',
        'method': 'Explicit manual assertion judgments; deterministic ID/span checks only for evidence linkage',
        'raw_counts': dict(Counter(x['raw_verdict'] for x in results)), 'expected_n': 35,
        'critical_expected_n': 35, 'structural_span_hash_valid_n': len(structural),
        'structural_checked_n': len(raw), 'semantic_provenance_accuracy': 'NOT_AGGREGATED',
        'reviewed_counts': dict(Counter(x['reviewed_verdict'] for x in results)),
        'raw_gold_gate': 'FAIL', 'items': results}
    (RUN / 'evidence/m0-gold-manual.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k: v for k, v in summary.items() if k != 'items'}, ensure_ascii=True))


if __name__ == '__main__':
    main()
