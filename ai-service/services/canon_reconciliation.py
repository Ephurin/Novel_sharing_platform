"""LLM comparison of source occurrences; only review proposals may change canon."""
from dataclasses import replace
import json
from typing import Literal
from pydantic import BaseModel, Field
from core.structured_call import call_structured
from domain.canon_identity import active_events, active_facts


class CanonDecision(BaseModel):
    proposal_id: str
    action: Literal['new', 'reuse', 'replace']
    target_id: str = ''
    reason: str = Field(min_length=1)


class CanonComparison(BaseModel):
    decisions: list[CanonDecision]
    removed_ids: list[str] = Field(default_factory=list)


def reconcile_proposals(brain, proposals, chapter_number, content, llm, *, source_proposal=None):
    prior = {}
    for e in active_events(brain.events):
        if e.chapter == chapter_number:
            prior[e.event_id] = {'kind': 'event', 'payload': {**e.metadata, 'summary': e.summary,
                'event_type': e.event_type, 'participants': list(e.participants)}}
    for f in active_facts(brain.facts):
        if f.get('chapter_number') == chapter_number:
            prior[str(f.get('fact_id') or f.get('id'))] = {'kind': 'fact', 'payload': f}
    candidates = {p.proposal_id: p for p in proposals if p.proposal_type in {'event', 'fact'}}
    if not prior:
        return [replace(p, payload={**p.payload, 'reconciliation_base_ids': []})
                if p.proposal_type in {'event', 'fact'} else p for p in proposals]
    raw = call_structured(llm, operation='canon_reconciliation', system_prompt=(
        'Compare extracted propositions against approved canon for ONE chapter revision. '
        'Return a decision for EVERY candidate. reuse means the SAME real occurrence/proposition '
        'is already recorded, even if summary, event_type or entity spelling differs. '
        'replace means that same occurrence was actually changed by the author. new means a '
        'distinct occurrence, including a genuinely repeated action at another time or position. '
        'Do not merge merely because participants, action or attribute keys match. Use source '
        'quotes, narrative time and context. One target may be matched only once. '
        'removed_ids are approved occurrences explicitly removed from this revision, NOT merely '
        'missed by extraction. Never retire an occurrence still supported by the source. '
        'No future plans or guesses. Schema: ' + json.dumps(CanonComparison.model_json_schema())),
        user_prompt=json.dumps({'source_text': content, 'approved': prior, 'candidates': [
            {'proposal_id': p.proposal_id, 'kind': p.proposal_type, 'payload': p.payload, 'evidence': p.evidence}
            for p in candidates.values()]}, ensure_ascii=False, default=str))
    result = CanonComparison.model_validate_json(raw)
    if len(result.decisions) != len(candidates) or {d.proposal_id for d in result.decisions} != set(candidates):
        raise ValueError('Canon reconciliation must cover each candidate exactly once')
    targets = set()
    mapped = {}
    for d in result.decisions:
        proposal = candidates[d.proposal_id]
        payload = dict(proposal.payload)
        if d.action != 'new':
            old = prior.get(d.target_id)
            if not old or old['kind'] != proposal.proposal_type or d.target_id in targets:
                raise ValueError('Invalid or multiply claimed canon reconciliation target')
            targets.add(d.target_id)
            payload['reuse_artifact_id' if d.action == 'reuse' else 'supersedes_id'] = d.target_id
            payload['reconciliation_reason'] = d.reason
        elif d.target_id:
            raise ValueError('New occurrence cannot reference an existing artifact')
        mapped[d.proposal_id] = replace(proposal, payload=payload)
    output = [mapped.get(p.proposal_id, p) for p in proposals]
    for target in result.removed_ids:
        if target not in prior or target in targets:
            raise ValueError('Invalid retirement target')
        targets.add(target)
        old = prior[target]
        quotes = [e.get('quote', '') for e in old['payload'].get('evidence', [])]
        if not any(quotes):
            raise ValueError('Cannot automatically retire canon without original source evidence')
        if any(q and q in content for q in quotes):
            raise ValueError('Cannot retire an occurrence whose original evidence remains in the source')
        # Retirement is an explicit author-reviewable tombstone, retaining original history.
        from domain.models import NarrativeProposal
        import uuid
        source = source_proposal or (proposals[0] if proposals else None)
        if source is None:
            raise ValueError('Retirement requires an evidenced revision analysis')
        payload = {**old['payload'], 'supersedes_id': target, 'is_retired': True,
                   'chapter_number': chapter_number, 'chapter': chapter_number}
        payload.pop('event_id', None)
        output.append(NarrativeProposal(str(uuid.uuid5(uuid.NAMESPACE_URL, f'{source.analysis_run_id}:retire:{target}')),
            old['kind'], payload, analysis_run_id=source.analysis_run_id,
            dependency_group_id=source.dependency_group_id, materialization_order=len(output),
            evidence=source.evidence, expected_brain_version=source.expected_brain_version))
    return [replace(p, materialization_order=i, payload={**p.payload, 'reconciliation_base_ids': sorted(prior)})
            if p.proposal_type in {'event', 'fact'} else replace(p, materialization_order=i)
            for i, p in enumerate(output)]
