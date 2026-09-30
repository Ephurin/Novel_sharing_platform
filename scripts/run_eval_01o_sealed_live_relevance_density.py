#!/usr/bin/env python3
"""EVAL-01O sealed live relevance-density micro-validation.

Compares:
- CONTROL: broad source_1x package at 20k
- CANDIDATE: balanced scope-first package at minimum full-fit tier

Offline dry-run makes zero provider calls.
Capture uses one fixed Gemini key slot and seals X/Y mapping privately.
Reveal requires a committed Astra blind review and makes zero provider calls.

Production code is never changed by this harness.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import secrets
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
AI_SERVICE_ROOT = ROOT / "ai-service"
sys.path.insert(0, str(SCRIPTS))
sys.path.insert(0, str(AI_SERVICE_ROOT))

import run_eval_01d_provenance_ab as eval01d
import run_eval_01e_sealed_provenance_ab as eval01e
import run_eval_01g_full_context_pressure as eval01g
import run_eval_01h_prod8_context_scope as eval01h
import run_eval_01m_sealed_live_adaptive_context as eval01m
from application.context_budget import ContextBudgetPacker
from core.llm_client import LLMClient

EVIDENCE_DIR = ROOT / "docs" / "development" / "EVAL-01O-SEALED-LIVE-RELEVANCE-DENSITY"
DEFAULT_PRIVATE_PATH = ROOT / ".eval-private" / "eval01o-private.json"

CONTROL = "broad_20k_current"
CANDIDATE = "balanced_scope_first_min_tier"
CONDITIONS = (CONTROL, CANDIDATE)
CASE_IDS = eval01g.CASE_IDS
BUDGET_TIERS = (12_000, 16_000, 20_000, 24_000)
EXPECTED_ROWS = 7
KNOWN_REGRESSION_CASE = "challenge:rq-0025"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )


def sha256_value(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def package_view(package: Any) -> dict[str, Any]:
    return {
        "brain_version": package.brain_version,
        "entities": list(package.entities),
        "current_states": list(package.current_states),
        "recent_events": list(package.recent_events),
        "semantic_memories": list(package.semantic_memories),
        "world_rules": list(package.world_rules),
        "author_constraints": list(package.author_constraints),
    }


def artifact_ids(rows: Any, keys: tuple[str, ...]) -> list[str]:
    out: list[str] = []
    for row in rows:
        value = None
        for key in keys:
            if row.get(key) is not None:
                value = row.get(key)
                break
        if value is not None:
            out.append(str(value))
    return out


def full_fit(package: Any, budget: int) -> tuple[bool, Any]:
    """Return whether every input artifact survives packing.

    ContextBudgetPacker intentionally reorders locked/unlocked world rules and
    restores recent events to canonical chronological order. Full-fit therefore
    means artifact identity/count preservation, not byte-for-byte tuple order.
    Prompt-level isolation is checked separately after both conditions are
    packed, where semantic/recent/rule ID order must match exactly.
    """

    packer = ContextBudgetPacker()
    packed = packer.pack(package, maximum=budget)

    input_entities = set(artifact_ids(package.entities, ("entity_id", "id", "name")))
    packed_entities = set(artifact_ids(packed.entities, ("entity_id", "id", "name")))
    input_states = artifact_ids(package.current_states, ("entity_id", "id", "name"))
    packed_states = artifact_ids(packed.current_states, ("entity_id", "id", "name"))
    input_rules = set(artifact_ids(package.world_rules, ("id", "fact_id", "fact_key")))
    packed_rules = set(artifact_ids(packed.world_rules, ("id", "fact_id", "fact_key")))
    input_recent = set(artifact_ids(package.recent_events, ("event_id",)))
    packed_recent = set(artifact_ids(packed.recent_events, ("event_id",)))
    input_semantic = set(
        artifact_ids(package.semantic_memories, ("memory_chunk_id", "source_key", "event_id"))
    )
    packed_semantic = set(
        artifact_ids(packed.semantic_memories, ("memory_chunk_id", "source_key", "event_id"))
    )

    fit = (
        input_entities == packed_entities
        and len(packed.entities) == len(package.entities)
        and set(input_states) == set(packed_states)
        and len(packed.current_states) == len(package.current_states)
        and input_rules == packed_rules
        and len(packed.world_rules) == len(package.world_rules)
        and input_recent == packed_recent
        and len(packed.recent_events) == len(package.recent_events)
        and input_semantic == packed_semantic
        and len(packed.semantic_memories) == len(package.semantic_memories)
        and list(packed.author_constraints) == list(package.author_constraints)
        and not bool(packed.token_budget.get("protected_overflow"))
        and int(packed.token_budget.get("dropped_artifact_count") or 0) == 0
    )
    return fit, packed


def min_full_fit_budget(package: Any) -> tuple[int, Any]:
    for budget in BUDGET_TIERS:
        fit, packed = full_fit(package, budget)
        if fit:
            return budget, packed
    raise RuntimeError("Balanced scope-first package does not fit <=24k")


def build_prompt(
    *,
    package: Any,
    budget: int,
    task_prompt: str,
    chapter_cutoff: int,
    model: str,
    temperature: float,
    max_tokens: int,
) -> dict[str, Any]:
    packer = ContextBudgetPacker()
    first = packer.pack(package, maximum=budget)
    second = packer.pack(package, maximum=budget)
    if first != second:
        raise RuntimeError("Context packing is not deterministic")

    context = packer.prompt_context(first)
    capture = eval01d.PromptCaptureLLMService(
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    capture.generate_writing_draft(
        operation="continue",
        selected_text="",
        cursor_offset=0,
        instruction=eval01e.build_instruction(
            task_prompt=task_prompt,
            chapter_cutoff=chapter_cutoff,
        ),
        context_package=context,
        style={},
        constraints=(
            "Use only supplied Story Brain evidence.",
            "Do not invent missing provenance or missing physical identity.",
            "Preserve chronology and uncertainty instead of silently reconciling conflicts.",
        ),
    )

    return {
        "system_prompt": capture.captured_system_prompt,
        "user_prompt": capture.captured_user_prompt,
        "context_hash": sha256_value(context),
        "prompt_hash": hashlib.sha256(
            (
                capture.captured_system_prompt
                + "\n\n"
                + capture.captured_user_prompt
            ).encode("utf-8")
        ).hexdigest(),
        "budget": budget,
        "estimated_before": int(first.token_budget.get("estimated_before") or 0),
        "tokens_used": int(first.token_budget.get("used") or 0),
        "prompt_chars": len(capture.captured_system_prompt) + len(capture.captured_user_prompt),
        "selected_counts": {
            "entities": len(first.entities),
            "states": len(first.current_states),
            "rules": len(first.world_rules),
            "recent": len(first.recent_events),
            "semantic": len(first.semantic_memories),
        },
        "protected_overflow": bool(first.token_budget.get("protected_overflow")),
        "semantic_ids": artifact_ids(first.semantic_memories, ("memory_chunk_id", "source_key", "event_id")),
        "recent_ids": artifact_ids(first.recent_events, ("event_id",)),
        "rule_ids": artifact_ids(first.world_rules, ("id", "fact_id", "fact_key")),
        "entity_ids": artifact_ids(first.entities, ("entity_id", "id", "name")),
    }


def blind_mapping(row_id: str, repeat: int, *, salt: str) -> dict[str, str]:
    digest = hashlib.sha256(
        f"eval01o:blind:{salt}:{row_id}:{repeat}".encode("utf-8")
    ).digest()
    if digest[0] % 2 == 0:
        return {"X": CONTROL, "Y": CANDIDATE}
    return {"X": CANDIDATE, "Y": CONTROL}


def call_order(row_id: str, repeat: int, *, salt: str) -> list[str]:
    digest = hashlib.sha256(
        f"eval01o:order:{salt}:{row_id}:{repeat}".encode("utf-8")
    ).digest()
    if digest[0] % 2 == 0:
        return [CONTROL, CANDIDATE]
    return [CANDIDATE, CONTROL]


def render_rubric() -> str:
    lines = [
        "# EVAL-01O Blind Review Rubric",
        "",
        "Review reviewer-blind.json only.",
        "Do not inspect condition mapping, private state, prompt hashes, packing audit, or latency before the blind review is committed.",
        "",
        "Primary question:",
        "Does the denser scope-first condition repair the known NORMAL cavalry regression without creating new regressions?",
        "",
        "For each X/Y output score:",
        "- canonical/source-status correctness: PASS | PARTIAL | FAIL",
        "- chronology/causality: PASS | PARTIAL | FAIL",
        "- ambiguity handling: PASS | PARTIAL | FAIL",
        "- future leakage: NONE | PRESENT",
        "- unsupported claim: NONE | PRESENT",
        "- completeness: PASS | PARTIAL | FAIL",
        "",
        "Do not reward verbosity or guess which hidden condition has more context.",
        "",
        "Special attention: challenge:rq-0025 is the prior broad@20k regression case.",
        "",
        "## Case criteria",
        "",
    ]
    for case_id in CASE_IDS:
        rubric = eval01e.RUBRIC[case_id]
        lines.extend(
            [
                f"### {case_id} - {rubric['role']}",
                "",
                "Must support:",
                *[f"- {item}" for item in rubric["must_support"]],
                "",
                "Must avoid:",
                *[f"- {item}" for item in rubric["must_avoid"]],
                "",
            ]
        )
    return "\n".join(lines)


def build_rows(
    *,
    model: str,
    temperature: float,
    max_tokens: int,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    fixture = load_json(ROOT / "benchmarks" / "eval01e_neutral_context.json")
    retrieval = load_json(
        ROOT
        / "docs"
        / "development"
        / "EVAL-01-AETHELGARD-RUNTIME-BASELINE"
        / "retrieval-raw.json"
    )
    queries = load_json(
        ROOT / ".data" / "Frozen_v1" / "retrieval_queries.json"
    )["queries"]
    canonical = load_json(
        ROOT / ".data" / "Frozen_v1" / "memory_chunks_canonical.json"
    )["memories"]
    audit = load_json(
        ROOT / ".data" / "Frozen_v1" / "memory_chunks.json"
    )["memories"]
    entities = load_json(ROOT / ".data" / "Batch_7" / "entities.json")["entities"]

    query_map = {
        f"{q['split']}:{q['query_id']}": q
        for q in queries
    }
    canonical_map = {
        str(memory["memory_id"]): memory
        for memory in canonical
    }
    audit_map = {
        str(memory["memory_id"]): memory
        for memory in audit
    }

    rows: list[dict[str, Any]] = []
    audits: list[dict[str, Any]] = []
    budget_distribution: dict[str, int] = {}

    for case_id in CASE_IDS:
        query = query_map[case_id]
        retrieval_row = next(row for row in retrieval if row["case_id"] == case_id)
        memory_map = (
            audit_map
            if retrieval_row["corpus"] == "audit_232"
            else canonical_map
        )

        base_package, _ = eval01g.build_package(
            condition="compact_provenance",
            case_id=case_id,
            cutoff=int(query["chapter_cutoff"]),
            retrieval_row=retrieval_row,
            fixture=fixture,
            source_entities=entities,
            canonical_memories=canonical,
            canonical_map=canonical_map,
            audit_map=audit_map,
        )
        base_package = eval01m.strip_evaluation_entity_locks(base_package)

        named_ids = eval01h.query_named_entity_ids(str(query["query"]), entities)
        semantic_scope_ids = eval01h.semantic_entity_ids(retrieval_row, memory_map)
        retrieval_scope_ids = named_ids | semantic_scope_ids
        recent_participant_ids = eval01h.recent_participant_ids(base_package)

        broad = eval01h.scope_package(
            base_package,
            policy="baseline_prod8",
            base_scope_ids=retrieval_scope_ids,
            balanced_ids=set(),
        )
        balanced = eval01h.scope_package(
            base_package,
            policy="balanced_scoped_entities",
            base_scope_ids=retrieval_scope_ids,
            balanced_ids=recent_participant_ids,
        )

        candidate_budget, _ = min_full_fit_budget(balanced)
        budget_distribution[str(candidate_budget)] = (
            budget_distribution.get(str(candidate_budget), 0) + 1
        )

        task_prompt = str(fixture["cases"][case_id]["prompt"])
        chapter_cutoff = int(query["chapter_cutoff"])

        control_prompt = build_prompt(
            package=broad,
            budget=20_000,
            task_prompt=task_prompt,
            chapter_cutoff=chapter_cutoff,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        candidate_prompt = build_prompt(
            package=balanced,
            budget=candidate_budget,
            task_prompt=task_prompt,
            chapter_cutoff=chapter_cutoff,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )

        exact_semantic = control_prompt["semantic_ids"] == candidate_prompt["semantic_ids"]
        exact_recent = control_prompt["recent_ids"] == candidate_prompt["recent_ids"]
        exact_rules = control_prompt["rule_ids"] == candidate_prompt["rule_ids"]
        same_system = control_prompt["system_prompt"] == candidate_prompt["system_prompt"]

        if not (exact_semantic and exact_recent and exact_rules and same_system):
            raise RuntimeError(
                f"EVAL-01O isolation drift for {case_id}: "
                f"semantic={exact_semantic} recent={exact_recent} "
                f"rules={exact_rules} system={same_system}"
            )
        if control_prompt["protected_overflow"] or candidate_prompt["protected_overflow"]:
            raise RuntimeError(f"Protected overflow for {case_id}")

        if not set(candidate_prompt["entity_ids"]).issubset(set(control_prompt["entity_ids"])):
            raise RuntimeError(f"Candidate entity scope is not a subset for {case_id}")

        audit = {
            "row_id": case_id,
            "case_id": case_id,
            "same_prepolicy_source_package": True,
            "prepolicy_source_package_hash": sha256_value(package_view(broad)),
            "same_query": True,
            "same_chapter_cutoff": True,
            "same_model": True,
            "same_temperature": True,
            "same_system_prompt": same_system,
            "routing_uses_gold": False,
            "query_gold_used_for_scope": False,
            "evaluation_entity_locks_removed": True,
            "exact_semantic_ids": exact_semantic,
            "exact_recent_ids": exact_recent,
            "exact_rule_ids": exact_rules,
            "candidate_entities_subset_of_control": True,
            "control": {
                "policy": CONTROL,
                **{
                    key: value
                    for key, value in control_prompt.items()
                    if key not in ("system_prompt", "user_prompt")
                },
            },
            "candidate": {
                "policy": CANDIDATE,
                "selected_budget": candidate_budget,
                "scope": "query-named + semantic-top8 + newest-five recent participants",
                **{
                    key: value
                    for key, value in candidate_prompt.items()
                    if key not in ("system_prompt", "user_prompt")
                },
            },
            "token_reduction": control_prompt["tokens_used"] - candidate_prompt["tokens_used"],
            "token_reduction_pct": (
                (control_prompt["tokens_used"] - candidate_prompt["tokens_used"])
                / control_prompt["tokens_used"]
                if control_prompt["tokens_used"]
                else 0.0
            ),
            "entity_reduction": (
                control_prompt["selected_counts"]["entities"]
                - candidate_prompt["selected_counts"]["entities"]
            ),
        }
        audits.append(audit)
        rows.append(
            {
                "row_id": case_id,
                "case_id": case_id,
                "chapter_cutoff": chapter_cutoff,
                "task_prompt": task_prompt,
                "rubric_role": fixture["cases"][case_id]["rubric_role"],
                "prompts": {
                    CONTROL: control_prompt,
                    CANDIDATE: candidate_prompt,
                },
            }
        )

    if len(rows) != EXPECTED_ROWS:
        raise RuntimeError(f"Expected {EXPECTED_ROWS} rows, got {len(rows)}")

    known = next(item for item in audits if item["case_id"] == KNOWN_REGRESSION_CASE)
    contract = {
        "experiment_id": "EVAL-01O",
        "provider_calls_dry_run": 0,
        "row_count": len(rows),
        "routing_uses_gold": False,
        "query_gold_used_for_scope": False,
        "all_exact_semantic_ids": all(x["exact_semantic_ids"] for x in audits),
        "all_exact_recent_ids": all(x["exact_recent_ids"] for x in audits),
        "all_exact_rule_ids": all(x["exact_rule_ids"] for x in audits),
        "all_same_system_prompt": all(x["same_system_prompt"] for x in audits),
        "all_candidate_entities_subset": all(
            x["candidate_entities_subset_of_control"] for x in audits
        ),
        "candidate_budget_distribution": budget_distribution,
        "mean_control_tokens": sum(x["control"]["tokens_used"] for x in audits) / len(audits),
        "mean_candidate_tokens": sum(x["candidate"]["tokens_used"] for x in audits) / len(audits),
        "mean_token_reduction_pct": sum(x["token_reduction_pct"] for x in audits) / len(audits),
        "known_regression_case": {
            "case_id": KNOWN_REGRESSION_CASE,
            "control_tokens": known["control"]["tokens_used"],
            "candidate_tokens": known["candidate"]["tokens_used"],
            "control_entities": known["control"]["selected_counts"]["entities"],
            "candidate_entities": known["candidate"]["selected_counts"]["entities"],
            "token_reduction_pct": known["token_reduction_pct"],
        },
        "detailed_audit": audits,
    }
    return rows, contract


def dry_run(args: argparse.Namespace) -> int:
    rows, contract = build_rows(
        model=args.model,
        temperature=args.temperature,
        max_tokens=args.max_tokens,
    )
    print(
        json.dumps(
            {
                "experiment_id": "EVAL-01O",
                "stage": "dry-run",
                "provider_calls": 0,
                "model": args.model,
                "temperature": args.temperature,
                "repeats": args.repeats,
                "row_count": len(rows),
                "planned_live_calls": len(rows) * 2 * args.repeats,
                "contract": {
                    key: value
                    for key, value in contract.items()
                    if key != "detailed_audit"
                },
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0


def latency_summary(records: list[dict[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for condition in CONDITIONS:
        values = sorted(
            float(row["latency_ms"])
            for row in records
            if row["condition"] == condition
            and row["execution_status"] == "SUCCESS"
            and row["latency_ms"] is not None
        )
        result[condition] = {
            "sample_count": len(values),
            "mean_ms": sum(values) / len(values) if values else None,
            "p50_ms": values[len(values) // 2] if values else None,
            "max_ms": max(values) if values else None,
        }
    return result


def capture(args: argparse.Namespace) -> int:
    rows, contract = build_rows(
        model=args.model,
        temperature=args.temperature,
        max_tokens=args.max_tokens,
    )
    slot_label, api_key = eval01d.load_fixed_key_slot(args.key_slot)
    llm = LLMClient(
        provider="gemini",
        model=args.model,
        api_key=api_key,
        timeout_seconds=90,
    )

    blind_salt = secrets.token_hex(32)
    order_salt = secrets.token_hex(32)
    raw_records: list[dict[str, Any]] = []
    reviewer_rows: list[dict[str, Any]] = []
    condition_key: list[dict[str, Any]] = []
    backoff_events = 0

    for row in rows:
        for repeat in range(1, args.repeats + 1):
            mapping = blind_mapping(row["row_id"], repeat, salt=blind_salt)
            order = call_order(row["row_id"], repeat, salt=order_salt)
            outputs: dict[str, dict[str, Any]] = {}

            for condition in order:
                prompt = row["prompts"][condition]
                record = {
                    "row_id": row["row_id"],
                    "case_id": row["case_id"],
                    "repeat": repeat,
                    "condition": condition,
                    "call_order_index": order.index(condition),
                    "model_requested": args.model,
                    "temperature": args.temperature,
                    "context_budget": prompt["budget"],
                    "estimated_story_brain_before": prompt["estimated_before"],
                    "story_brain_tokens_used": prompt["tokens_used"],
                    "prompt_chars": prompt["prompt_chars"],
                    "execution_status": "ERROR",
                    "latency_ms": None,
                    "backoff_count": 0,
                    "raw_output": "",
                    "draft_text": "",
                }
                try:
                    raw_output, latency_ms, backoffs = eval01d.call_exact_model(
                        llm,
                        system_prompt=prompt["system_prompt"],
                        user_prompt=prompt["user_prompt"],
                        temperature=args.temperature,
                        max_tokens=args.max_tokens,
                    )
                    record["execution_status"] = "SUCCESS"
                    record["latency_ms"] = latency_ms
                    record["backoff_count"] = backoffs
                    record["raw_output"] = raw_output
                    record["draft_text"] = eval01d.parse_draft_text(raw_output)
                    backoff_events += backoffs
                except Exception as exc:
                    record["error"] = str(exc)

                outputs[condition] = record
                raw_records.append(record)
                time.sleep(max(0.0, args.inter_call_seconds))

            reviewer_rows.append(
                {
                    "row_id": row["row_id"],
                    "case_id": row["case_id"],
                    "repeat": repeat,
                    "task_prompt": row["task_prompt"],
                    "chapter_cutoff": row["chapter_cutoff"],
                    "rubric_role": row["rubric_role"],
                    "outputs": {
                        label: {
                            "execution_status": outputs[condition]["execution_status"],
                            "draft_text": outputs[condition]["draft_text"],
                        }
                        for label, condition in mapping.items()
                    },
                }
            )
            condition_key.append(
                {
                    "row_id": row["row_id"],
                    "case_id": row["case_id"],
                    "repeat": repeat,
                    "mapping": mapping,
                    "call_order": order,
                }
            )

    expected_calls = len(rows) * 2 * args.repeats
    successful_calls = sum(
        row["execution_status"] == "SUCCESS"
        for row in raw_records
    )
    private_state = {
        "experiment_id": "EVAL-01O",
        "state_version": "eval01o-private-v1",
        "blind_salt": blind_salt,
        "order_salt": order_salt,
        "runtime": {
            "model": args.model,
            "temperature": args.temperature,
            "max_tokens": args.max_tokens,
            "fixed_key_slot": slot_label,
            "repeats": args.repeats,
            "backoff_events": backoff_events,
        },
        "condition_key": condition_key,
        "raw_generations": raw_records,
        "prompt_diff_audit": contract["detailed_audit"],
        "latency_by_condition": latency_summary(raw_records),
    }
    sealed_sha = sha256_value(private_state)

    args.private_path.parent.mkdir(parents=True, exist_ok=True)
    args.private_path.write_text(
        json.dumps(private_state, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    (EVIDENCE_DIR / "reviewer-blind.json").write_text(
        json.dumps(reviewer_rows, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    (EVIDENCE_DIR / "review-rubric.md").write_text(
        render_rubric() + "\n",
        encoding="utf-8",
    )
    (EVIDENCE_DIR / "capture-contract.json").write_text(
        json.dumps(
            {
                key: value
                for key, value in contract.items()
                if key != "detailed_audit"
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    (EVIDENCE_DIR / "runtime-config.json").write_text(
        json.dumps(
            {
                "experiment_id": "EVAL-01O",
                "stage": "capture",
                "model": args.model,
                "temperature": args.temperature,
                "max_tokens": args.max_tokens,
                "fixed_key_slot": slot_label,
                "key_rotation": False,
                "repeats": args.repeats,
                "row_count": len(rows),
                "expected_calls": expected_calls,
                "successful_calls": successful_calls,
                "backoff_events": backoff_events,
                "quality_scoring": "BLIND_REVIEW_REQUIRED",
                "condition_mapping_committed": False,
                "raw_condition_labels_committed": False,
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    (EVIDENCE_DIR / "sealed-state.json").write_text(
        json.dumps(
            {
                "experiment_id": "EVAL-01O",
                "private_state_sha256": sealed_sha,
                "private_state_version": private_state["state_version"],
                "expected_calls": expected_calls,
                "successful_calls": successful_calls,
                "condition_mapping_committed": False,
                "raw_condition_labels_committed": False,
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    (EVIDENCE_DIR / "summary.md").write_text(
        "\n".join(
            [
                "# EVAL-01O Capture Summary",
                "",
                f"Model: {args.model}",
                f"Rows: {len(rows)}",
                f"Successful calls: {successful_calls} / {expected_calls}",
                f"Backoff events: {backoff_events}",
                "Condition mapping committed: NO",
                "Raw condition-labelled outputs committed: NO",
                "Quality: BLIND_REVIEW_REQUIRED",
                "",
            ]
        ),
        encoding="utf-8",
    )

    print(
        json.dumps(
            {
                "experiment_id": "EVAL-01O",
                "stage": "capture",
                "successful_calls": successful_calls,
                "expected_calls": expected_calls,
                "sealed_state_sha256": sealed_sha,
                "fixed_key_slot": slot_label,
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0 if successful_calls == expected_calls else 2


def reveal(args: argparse.Namespace) -> int:
    blind_review = EVIDENCE_DIR / "ASTRA-BLIND-REVIEW.md"
    if not blind_review.exists():
        raise RuntimeError("ASTRA-BLIND-REVIEW.md is required before reveal")
    if not args.private_path.exists():
        raise RuntimeError(f"Private state not found: {args.private_path}")

    private_state = load_json(args.private_path)
    sealed = load_json(EVIDENCE_DIR / "sealed-state.json")
    actual_sha = sha256_value(private_state)
    expected_sha = str(sealed["private_state_sha256"])
    if actual_sha != expected_sha:
        raise RuntimeError(
            f"Private state commitment mismatch: expected={expected_sha} actual={actual_sha}"
        )

    outputs = {
        "condition-key.json": private_state["condition_key"],
        "raw-generations.json": private_state["raw_generations"],
        "prompt-diff-audit.json": private_state["prompt_diff_audit"],
        "latency-cost.json": {
            "status": "measured",
            "by_condition": private_state["latency_by_condition"],
            "backoff_events": private_state["runtime"]["backoff_events"],
            "provider_token_usage": "not_exposed_by_current_client",
            "provider_cost": "not_measured",
        },
        "reveal-verification.json": {
            "experiment_id": "EVAL-01O",
            "commitment_match": True,
            "private_state_sha256": actual_sha,
            "blind_review_present": True,
            "condition_mapping_committed": True,
            "raw_condition_labels_committed": True,
            "provider_calls_during_reveal": 0,
        },
    }
    for name, value in outputs.items():
        (EVIDENCE_DIR / name).write_text(
            json.dumps(value, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

    print(
        json.dumps(
            {
                "experiment_id": "EVAL-01O",
                "stage": "reveal",
                "commitment_match": True,
                "provider_calls": 0,
                "private_state_sha256": actual_sha,
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--stage",
        choices=("dry-run", "capture", "reveal"),
        default="dry-run",
    )
    parser.add_argument(
        "--repeats",
        type=int,
        default=int(os.getenv("EVAL01O_REPEATS", "3")),
    )
    parser.add_argument(
        "--model",
        default=os.getenv("EVAL01O_MODEL", "gemini-3.5-flash-lite"),
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=float(os.getenv("EVAL01O_TEMPERATURE", "0.0")),
    )
    parser.add_argument(
        "--max-tokens",
        type=int,
        default=int(os.getenv("EVAL01O_MAX_TOKENS", "512")),
    )
    parser.add_argument(
        "--key-slot",
        type=int,
        default=int(os.getenv("EVAL_GEMINI_KEY_SLOT", "1")),
    )
    parser.add_argument(
        "--inter-call-seconds",
        type=float,
        default=float(os.getenv("EVAL01O_INTER_CALL_SECONDS", "5.0")),
    )
    parser.add_argument(
        "--private-path",
        type=Path,
        default=DEFAULT_PRIVATE_PATH,
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.stage == "dry-run":
        return dry_run(args)
    if args.stage == "capture":
        return capture(args)
    return reveal(args)


if __name__ == "__main__":
    raise SystemExit(main())
