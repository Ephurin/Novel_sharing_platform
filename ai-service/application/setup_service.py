"""Setup-v1 foundation over existing bootstrap jobs and proposal store.

Setup review uses the existing PostgreSQL entity/fact/decision authority.
"""
import hashlib
import json
import uuid
from dataclasses import replace
from pydantic import ValidationError
from api.setup_schemas import SetupRequest, ExtractOutput, BlueprintOutput
from domain.errors import BootstrapConflictError, OptimisticLockError, IdempotencyConflictError
from domain.models import BootstrapJob, NarrativeProposal, AnalysisRun


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                     separators=(',', ':'), allow_nan=False).encode('utf-8')).hexdigest()


class SetupFailure(Exception):
    def __init__(self, code, status=422):
        self.code, self.status = code, status
        super().__init__(code)


class SetupService:
    def __init__(self, bootstrap):
        self.bootstrap = bootstrap
        self.repository = bootstrap._repository

    def require_adapter(self):
        if not getattr(self.repository, 'supports_setup_v1', False):
            raise SetupFailure('SETUP_REQUIRES_POSTGRES', 503)

    def principal(self, tenant_id, actor_id):
        if not tenant_id or not actor_id:
            raise SetupFailure('SETUP_IDENTITY_REQUIRED', 401)
        try:
            tenant_id, actor_id = str(uuid.UUID(tenant_id)), str(uuid.UUID(actor_id))
        except (ValueError, TypeError, AttributeError):
            raise SetupFailure('INVALID_SCOPE_HEADER', 422) from None
        self.bootstrap._scope(tenant_id)
        self.require_adapter()
        return tenant_id, actor_id

    def start(self, request: SetupRequest, *, tenant_id, actor_id):
        tenant_id, actor_id = self.principal(tenant_id, actor_id)
        data = request.model_dump(exclude_none=True)
        # Preserve the exact structured setup object: absent aliases stay absent,
        # and explicit null initial values stay null. Optional envelope defaults
        # are normalized separately for operation-key hashing.
        data['setup'] = request.setup.model_dump(exclude_unset=True)
        job_id = self.bootstrap._key(tenant_id, request.novel_id, 'setup-v1', request.idempotency_key)
        input_hash = digest({'request': data, 'actor_id': actor_id, 'tenant_id': tenant_id})
        try:
            replay = self.repository.get_setup_job(job_id, actor_id=actor_id, novel_id=request.novel_id)
        except KeyError:
            replay = None
        if replay:
            if replay.result.get('bootstrap_input_hash') != input_hash:
                raise IdempotencyConflictError(job_id)
            return replay
        token = str(uuid.uuid4())
        setup = data['setup']
        snapshot = dict(contract_version='setup-v1', setup_source=data, author_id=actor_id,
                        bootstrap_input_hash=input_hash, setup_hash=digest(setup),
                        text_hash=hashlib.sha256(setup['text'].encode('utf-8')).hexdigest(),
                        reservation_token=token, expected_setup_version=request.expected_setup_version,
                        review_version=0, mode=request.mode)
        job = BootstrapJob(job_id=job_id, tenant_id=tenant_id, novel_id=request.novel_id,
            revisions=(), locale=request.locale, options={'from_idea': True, 'require_review_for_all': True},
            status='running', stage='setup_'+request.mode, result=snapshot)
        reserved = self.repository.create_bootstrap_job(job)
        if (reserved.result or {}).get('reservation_token') != token:
            return reserved
        try:
            cards, raw = self.candidates(data)
            result = dict(reserved.result)
            scope = digest(['setup-v1', tenant_id, request.novel_id, job_id,
                            result['setup_hash'], result['setup_version']])
            run_id = str(uuid.uuid5(uuid.UUID(job_id), 'setup-analysis'))
            group = str(uuid.uuid5(uuid.UUID(job_id), 'setup-group'))
            proposals = []
            for index, card in enumerate(cards):
                pid = str(uuid.uuid5(uuid.UUID(job_id), 'setup-card:'+str(index)))
                payload = dict(card['payload'])
                if card['card_type'] == 'entity':
                    # Opaque candidate reservation, not a Canon identity decision.
                    # Human provisional/canonical selection belongs to P2-02B.
                    payload['entity_id'] = str(uuid.uuid4())
                card.update(proposal_id=pid, dependency_group_id=group, status='pending',
                            expected_brain_version=result['brain_version'], payload=payload)
                if card['card_type'] != 'initial_condition':
                    proposals.append(NarrativeProposal(proposal_id=pid,
                        proposal_type='entity' if card['card_type']=='entity' else 'fact',
                        payload=payload, analysis_run_id=run_id, dependency_group_id=group,
                        materialization_order=index, expected_brain_version=result['brain_version'],
                        evidence=({'setup_snapshot_id': job_id, 'setup_version': result['setup_version'],
                                   'setup_hash': result['setup_hash'], 'source_kind':card['source_kind'],
                                   'origin':card['origin'], 'source_refs':card['source_refs']},)))
            result.update(setup_cards=cards, original_model_output=raw, provisional_scope=scope,
                          proposal_count=len(proposals), required_proposal_ids=[p.proposal_id for p in proposals])
            finished = replace(reserved, status='waiting_review', stage='setup_review_pending', result=result)
            run = AnalysisRun(run_id=run_id, idempotency_key=f'{tenant_id}:setup-v1:{job_id}',
                input_hash=input_hash, operation='bootstrap_setup', status='pending', pipeline_version='setup-v1')
            return self.repository.finalize_idea_bootstrap(finished, proposals, run)
        except Exception as exc:
            code = exc.code if isinstance(exc, SetupFailure) else 'SETUP_OUTPUT_INVALID'
            self.repository.fail_bootstrap_job(replace(reserved, error={'code':code}))
            if isinstance(exc, (SetupFailure, BootstrapConflictError, OptimisticLockError, IdempotencyConflictError)):
                raise
            # No provider/source/private content in HTTP errors or log messages.
            raise SetupFailure(code) from None

    @staticmethod
    def card(kind, payload, origin, ref):
        return dict(card_type=kind, payload=payload, origin=origin,
                    source_kind='model_suggestion' if origin=='model_proposed' else 'author_setup',
                    source_refs=[ref])

    def candidates(self, data):
        source = data['setup']
        cards = []
        for field in ['declarations', 'world_rules', 'initial_conditions']:
            for index, item in enumerate(source[field]):
                ref = dict(kind='setup_declaration', field_path=f'/setup/{field}/{index}',
                           declaration_id=item['declaration_id'])
                if field == 'declarations':
                    cards.append(self.card('entity', dict(canonical_name=item['display_name'],
                        normalized_name=item['display_name'].casefold(), entity_type=item['entity_type'],
                        aliases=item.get('aliases', [])), 'author_declared', ref))
                elif field == 'world_rules':
                    cards.append(self.card('world_rule', dict(fact_type='world_rule',
                        fact_key='setup_rule_'+item['declaration_id'], fact_value=item['text']), 'author_declared', ref))
                else:
                    cards.append(self.card('initial_condition', dict(item), 'author_declared', ref))
        provider = self.bootstrap._llm_service
        if data['mode'] == 'extract':
            if not source['text'].strip():
                return cards, None
            method = getattr(provider, 'extract_setup_text', None)
            if not callable(method):
                raise SetupFailure('SETUP_EXTRACT_PROVIDER_UNAVAILABLE', 503)
            # Strict outbound allowlist. No outline/hints/notes/constraints/settings.
            try:
                raw = method(text=source['text'], locale=data['locale'])
            except Exception:
                raise SetupFailure('SETUP_EXTRACT_PROVIDER_UNAVAILABLE', 503) from None
            parsed = ExtractOutput.model_validate(raw)
            # An unsupported/nonempty source cannot become an empty success.
            if not parsed.entities and not parsed.world_rules:
                raise SetupFailure('SETUP_EXTRACT_NO_GROUNDED_CANDIDATES')
            for item in parsed.entities:
                ref = item.source_ref.model_dump()
                self.validate_span(source['text'], ref)
                if item.display_name != ref['quote']:
                    raise SetupFailure('SETUP_ENTITY_NAME_NOT_GROUNDED')
                cards.append(self.card('entity', dict(canonical_name=item.display_name,
                    normalized_name=item.display_name.casefold(), entity_type=item.entity_type),
                    'extracted_explicit', ref))
            for index, item in enumerate(parsed.world_rules):
                ref = item.source_ref.model_dump()
                self.validate_span(source['text'], ref)
                if item.text != ref['quote']:
                    raise SetupFailure('SETUP_RULE_NOT_GROUNDED')
                cards.append(self.card('world_rule', dict(fact_type='world_rule',
                    fact_key='setup_text_rule_'+str(index), fact_value=item.text), 'extracted_explicit', ref))
            return cards, parsed.model_dump()
        method = getattr(provider, 'suggest_setup_blueprint', None)
        if not callable(method):
            raise SetupFailure('SETUP_BLUEPRINT_PROVIDER_UNAVAILABLE', 503)
        try:
            raw = method(setup=source, outline=data['outline'], preferences=data['preferences'], locale=data['locale'])
        except Exception:
            raise SetupFailure('SETUP_BLUEPRINT_PROVIDER_UNAVAILABLE', 503) from None
        parsed = BlueprintOutput.model_validate(raw)
        if not parsed.entities and not parsed.world_rules:
            raise SetupFailure('SETUP_BLUEPRINT_EMPTY')
        for item in parsed.entities:
            cards.append(self.card('entity', dict(canonical_name=item.display_name,
                normalized_name=item.display_name.casefold(), entity_type=item.entity_type),
                'model_proposed', {'kind':'model_suggestion'}))
        for index, rule in enumerate(parsed.world_rules):
            cards.append(self.card('world_rule', dict(fact_type='world_rule',
                fact_key='setup_suggested_rule_'+str(index), fact_value=rule),
                'model_proposed', {'kind':'model_suggestion'}))
        return cards, parsed.model_dump()

    @staticmethod
    def validate_span(text, ref):
        if not (0 <= ref['start'] < ref['end'] <= len(text)) or text[ref['start']:ref['end']] != ref['quote']:
            raise SetupFailure('SETUP_INVALID_SOURCE_SPAN')

    def review(self, novel_id, snapshot_id, request, *, tenant_id, actor_id):
        tenant_id, actor_id = self.principal(tenant_id, actor_id)
        try:
            return self.repository.review_setup(novel_id, snapshot_id, request, actor_id=actor_id)
        except ValidationError:
            raise SetupFailure('SETUP_REVIEW_INVALID_PAYLOAD') from None

    def get_job(self, job_id, *, tenant_id, actor_id=None):
        tenant_id, actor_id = self.principal(tenant_id, actor_id)
        return self.repository.get_setup_job(job_id, actor_id=actor_id)

    def activate(self, novel_id, snapshot_id, request, *, tenant_id, actor_id):
        self.principal(tenant_id, actor_id)
        from infrastructure.setup_activation import activate
        return activate(self.repository,novel_id,snapshot_id,actor_id,request)

    def readback(self, novel_id, *, tenant_id, actor_id=None, snapshot_id=None):
        tenant_id, actor_id = self.principal(tenant_id, actor_id)
        return self.repository.get_setup_snapshot(novel_id, actor_id=actor_id, snapshot_id=snapshot_id)

    def propose_amendment(self, novel_id, fact_id, request, *, tenant_id, actor_id):
        tenant_id, actor_id = self.principal(tenant_id, actor_id)
        from infrastructure.setup_amendment import propose_amendment
        return propose_amendment(self.repository, novel_id, fact_id, actor_id, request)

    def decide_amendment(self, novel_id, proposal_id, request, *, tenant_id, actor_id):
        tenant_id, actor_id = self.principal(tenant_id, actor_id)
        from infrastructure.setup_amendment import decide_amendment
        return decide_amendment(self.repository, novel_id, proposal_id, actor_id, request)

    def get_amendment_history(self, novel_id, fact_id, *, tenant_id, actor_id):
        tenant_id, actor_id = self.principal(tenant_id, actor_id)
        from infrastructure.setup_amendment import get_amendment_history
        return get_amendment_history(self.repository, novel_id, fact_id, actor_id)


def public_job(job):
    """Generic job endpoints must not expose private setup notes or constraints."""
    if (job.result or {}).get('contract_version') != 'setup-v1':
        return job
    allowed = {'contract_version','mode','setup_version','setup_hash','text_hash','review_version','proposal_count'}
    result = {k:v for k,v in job.result.items() if k in allowed}
    return replace(job, result=result)
