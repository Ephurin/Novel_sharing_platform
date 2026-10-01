from __future__ import annotations

from dataclasses import replace

from application.context_budget import ContextBudgetPacker
from application.context_scope import ContextScopeResult
from domain.errors import ContextRoutingUnresolvedError
from domain.models import WritingContextPackage


CONTEXT_ROUTING_VERSION = "balanced-scope-v1"
CONTEXT_BUDGET_TIERS = (12_000, 16_000, 20_000, 24_000)


class ContextBudgetRouter:
    """Choose the smallest tier that preserves the entire scoped package."""

    def __init__(
        self,
        context_packer: ContextBudgetPacker | None = None,
        *,
        tiers: tuple[int, ...] = CONTEXT_BUDGET_TIERS,
    ) -> None:
        normalized = tuple(sorted({int(value) for value in tiers if int(value) > 0}))
        if not normalized:
            raise ValueError("At least one positive context budget tier is required")
        self._context_packer = context_packer or ContextBudgetPacker()
        self.tiers = normalized

    def route(self, scope: ContextScopeResult) -> WritingContextPackage:
        for tier in self.tiers:
            packed = self._context_packer.pack(scope.package, maximum=tier)
            budget = dict(packed.token_budget)
            if (
                not bool(budget.get("protected_overflow"))
                and not bool(budget.get("budget_overflow"))
                and int(budget.get("dropped_artifact_count") or 0) == 0
            ):
                return self._with_trace(packed, scope, tier)

        estimated = self._context_packer.estimate_prompt_tokens(scope.package)
        raise ContextRoutingUnresolvedError(
            estimated_tokens=estimated,
            max_tier=self.tiers[-1],
            policy=CONTEXT_ROUTING_VERSION,
        )

    @staticmethod
    def _with_trace(
        packed: WritingContextPackage,
        scope: ContextScopeResult,
        tier: int,
    ) -> WritingContextPackage:
        context_summary = dict(packed.context_summary)
        context_summary["context_routing_version"] = [CONTEXT_ROUTING_VERSION]
        context_summary["context_routing_status"] = ["routed"]
        context_summary["context_routing_reason"] = ["minimum_full_fit_tier"]
        context_summary["context_scope_policy"] = [scope.policy]
        context_summary["scope_query_entity_ids"] = list(scope.query_entity_ids)
        context_summary["scope_semantic_entity_ids"] = list(scope.semantic_entity_ids)
        context_summary["scope_recent_participant_entity_ids"] = list(
            scope.recent_participant_entity_ids
        )
        context_summary["scope_locked_entity_ids"] = list(scope.locked_entity_ids)

        token_budget = dict(packed.token_budget)
        token_budget.update(
            {
                "routing_selected_tier": tier,
                "scope_entity_count_before": scope.entity_count_before,
                "scope_entity_count_after": scope.entity_count_after,
                "scope_state_count_before": scope.state_count_before,
                "scope_state_count_after": scope.state_count_after,
            }
        )
        return replace(
            packed,
            context_summary=context_summary,
            token_budget=token_budget,
        )
