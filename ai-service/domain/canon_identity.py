"""Shared transactional checks for reviewed reuse and versioned canon."""
from domain.projection import ProjectionError


def active_facts(facts):
    replaced = {str(f['supersedes_id']) for f in facts if f.get('supersedes_id')}
    return [f for f in facts if str(f.get('fact_id') or f.get('id')) not in replaced and not f.get('is_retired')]


def active_events(events):
    replacements = {str(e.metadata['supersedes_id']): e for e in events if e.metadata.get('supersedes_id')}
    result = []
    for e in events:
        if e.metadata.get('supersedes_id'):
            continue
        seen = set()
        while e.event_id in replacements:
            if e.event_id in seen:
                raise ProjectionError('Cyclic event history')
            seen.add(e.event_id)
            e = replacements[e.event_id]
        if not e.metadata.get('is_retired'):
            result.append(e)
    return result


def validate_canon_reference(kind, payload, evidence, events, facts):
    target = payload.get('reuse_artifact_id') or payload.get('supersedes_id')
    if not target:
        return None
    if kind == 'event':
        artifact = next((e for e in active_events(events) if e.event_id == target), None)
        chapter = artifact.chapter if artifact else None
    elif kind == 'fact':
        artifact = next((f for f in active_facts(facts) if str(f.get('fact_id') or f.get('id')) == target), None)
        chapter = artifact.get('chapter_number') if artifact else None
        if artifact and artifact.get('is_locked') and not payload.get('reuse_artifact_id'):
            raise ProjectionError('Cannot reconcile an author-locked fact')
    else:
        raise ProjectionError('Only events and facts can reference canon')
    source_chapter = (evidence[0] if evidence else {}).get('chapter_number') or payload.get('chapter_number') or payload.get('chapter')
    if not artifact or (source_chapter is not None and chapter is not None and int(source_chapter) != int(chapter)):
        raise ProjectionError('Canon target is missing, superseded or belongs to another source chapter')
    return target


def validate_reconciliation_base(proposals, events, facts):
    """Called under the repository brain lock before any group writes."""
    for proposal in proposals:
        if proposal.proposal_type not in {'event', 'fact'} or not proposal.analysis_run_id:
            continue
        if proposal.payload.get('source_type') == 'author':
            continue
        chapter = (proposal.evidence[0] if proposal.evidence else {}).get('chapter_number') or proposal.payload.get('chapter_number')
        if chapter is None:
            continue
        current = sorted([e.event_id for e in active_events(events) if e.chapter == chapter] +
            [str(f.get('fact_id') or f.get('id')) for f in active_facts(facts) if f.get('chapter_number') == chapter])
        expected = proposal.payload.get('reconciliation_base_ids')
        if (expected is None and current) or (expected is not None and sorted(expected) != current):
            raise ProjectionError('Canon changed after analysis. Reanalyse this saved revision before approval.')
