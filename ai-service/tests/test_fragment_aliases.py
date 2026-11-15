"""#145 / F-LIVE-04: fragments inside a verified full-name occurrence are not aliases."""
from services.entity_pipeline.candidates import EntityCandidate
from services.entity_pipeline.verification import _materializable

TEXT = 'Lâm Phong gặp Lâm Nguyệt. Lâm nói nhỏ.'
LP, LN = 'e-lam-phong', 'e-lam-nguyet'


def cand(cid, start, end):
    return EntityCandidate(cid, TEXT[start:end], start, end, 0, len(TEXT), TEXT, ('test',))


def entity(cid, name, eid):
    return {'candidate_id': cid, 'verdict': 'entity', 'canonical_name': name, 'canonical_entity_id': eid,
            'entity_type': 'PER', 'confidence': 0.9, 'initial_status': 'Unknown', 'status_quote': '',
            'identity_quote': '', 'provisional_identity_key': ''}


def test_fragments_inside_full_names_do_not_become_aliases():
    cands = [cand('c1', 0, 9), cand('c2', 0, 3), cand('c3', 4, 9),        # Lâm Phong / Lâm / Phong
             cand('c4', 14, 24), cand('c5', 14, 17), cand('c6', 18, 24),  # Lâm Nguyệt / Lâm / Nguyệt
             cand('c7', 26, 29)]                                         # standalone "Lâm"
    decisions = [entity('c1', 'Lâm Phong', LP), entity('c2', 'Lâm Phong', LP), entity('c3', 'Lâm Phong', LP),
                 entity('c4', 'Lâm Nguyệt', LN), entity('c5', 'Lâm Nguyệt', LN), entity('c6', 'Lâm Nguyệt', LN),
                 entity('c7', 'Lâm Phong', LP)]
    entities, aliases = _materializable(cands, decisions, {}, TEXT)
    assert sorted(e['phrase'] for e in entities) == ['Lâm Nguyệt', 'Lâm Phong']
    # Only the standalone short-name use is kept as an alias candidate for review.
    assert [(a['alias'], a['entity_id'], a['start']) for a in aliases] == [('Lâm', LP, 26)]
