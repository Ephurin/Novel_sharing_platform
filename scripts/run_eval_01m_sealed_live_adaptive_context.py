#!/usr/bin/env python3
"""EVAL-01M sealed live adaptive-context validation.

Dry-run:
- reconstruct the same source-grounded production-shaped packages used by EVAL-01L;
- compare current fixed broad@12k control with the EVAL-01L two-stage adaptive candidate;
- validate deterministic routing/packing and the prompt contract;
- make zero provider calls.

Capture:
- run a fixed-slot Gemini A/B;
- commit reviewer-safe X/Y outputs only;
- keep condition mapping, labelled raw outputs, prompt hashes, detailed packing
  audit, and latency-by-condition in .eval-private/.

Reveal:
- require a committed blind review;
- verify the private-state SHA256 commitment;
- materialize condition mapping and raw audit with zero provider calls.

Production policy is never changed by this harness.
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
import run_eval_01k_multilane_growth_stress as eval01k
import run_eval_01l_secondary_scoped_frontier as eval01l
from application.context_budget import ContextBudgetPacker
from core.llm_client import LLMClient

EVIDENCE_DIR = ROOT / "docs" / "development" / "EVAL-01M-SEALED-LIVE-ADAPTIVE-CONTEXT"
DEFAULT_PRIVATE_PATH = ROOT / ".eval-private" / "eval01m-private.json"

CONTROL = "fixed_broad_12k"
CANDIDATE = "adaptive_eval01l"
CONDITIONS = (CONTROL, CANDIDATE)

SOURCE_SCENARIO = "source_1x"
STRESS_SCENARIO = "combined_4x"
EXPECTED_NORMAL_ROWS = 7
EXPECTED_SCOPED_STRESS_ROWS = 5

CASE_IDS = eval01g.CASE_IDS


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


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def package_view(package: Any) -> dict[str, Any]:
    return {
        "brain_version": package.brain_version,
        "entities": list(package.entities),
        "current_states": list(package.current_states),
        "recent_events": list(package.recent_events),
        "semantic_memories": list(package.semantic_memories),
        "world_rules": list(package.world_rules),
        "author_constraints": list(package.author_constraints),
        "context_summary": dict(package.context_summary),
    }


def selected_counts(packed: Any) -> dict[str, int]:
    return {
        "entities": len(packed.entities),
        "states": len(packed.current_states),
        "rules": len(packed.world_rules),
        "recent": len(packed.recent_events),
        "semantic": len(packed.semantic_memories),
    }


def dropped_counts(packed: Any) -> dict[str, int]:
    summary = packed.context_summary
    return {
        "entities": len(summary.get("dropped_entity_ids", [])),
        "rules": len(summary.get("dropped_fact_ids", [])),
        "recent": len(summary.get("dropped_event_ids", [])),
        "semantic": len(summary.get("dropped_semantic_memory_ids", [])),
    }


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
        "context": context,
        "system_prompt": capture.captured_system_prompt,
        "user_prompt": capture.captured_user_prompt,
        "context_hash": sha256_value(context),
        "prompt_hash": sha256_text(
            capture.captured_system_prompt
            + "\n\n"
            + capture.captured_user_prompt
        ),
        "budget": budget,
        "estimated_before": first.token_budget.get("estimated_before"),
        "tokens_used": first.token_budget.get("used"),
        "protected_overflow": bool(first.token_budget.get("protected_overflow")),
        "selected_counts": selected_counts(first),
        "dropped_counts": dropped_counts(first),
        "selected_memory_ids": list(
            first.context_summary.get("semantic_memory_ids", [])
        ),
        "dropped_memory_ids": list(
            first.context_summary.get("dropped_semantic_memory_ids", [])
        ),
        "prompt_chars": (
            len(capture.captured_system_prompt)
            + len(capture.captured_user_prompt)
        ),
    }


def adaptive_choice(
    *,
    stressed_broad: Any,
    stressed_scoped: Any,
) -> tuple[str, int, Any, int, int]:
    packer = ContextBudgetPacker()
    broad_estimated = packer.estimate_prompt_tokens(stressed_broad)
    scoped_estimated = packer.estimate_prompt_tokens(stressed_scoped)

    branch, budget = eval01l.broad_stage(broad_estimated)
    if branch != "scope_required":
        if budget is None:
            raise RuntimeError("Broad route returned no budget")
        return branch, budget, stressed_broad, broad_estimated, scoped_estimated

    branch, budget = eval01l.scoped_tier(scoped_estimated)
    if budget is None:
        raise RuntimeError(
            "EVAL-01M candidate reached unresolved scoped >24k: "
            f"broad={broad_estimated} scoped={scoped_estimated}"
        )
    return branch, budget, stressed_scoped, broad_estimated, scoped_estimated


def blind_mapping(
    row_id: str,
    repeat: int,
    *,
    private_salt: str,
) -> dict[str, str]:
    digest = hashlib.sha256(
        f"eval01m:blind:{private_salt}:{row_id}:{repeat}".encode("utf-8")
    ).digest()
    if digest[0] % 2 == 0:
        return {"X": CONTROL, "Y": CANDIDATE}
    return {"X": CANDIDATE, "Y": CONTROL}


def call_order(
    row_id: str,
    repeat: int,
    *,
    private_salt: str,
) -> list[str]:
    digest = hashlib.sha256(
        f"eval01m:order:{private_salt}:{row_id}:{repeat}".encode("utf-8")
    ).digest()
    if digest[0] % 2 == 0:
        return [CONTROL, CANDIDATE]
    return [CANDIDATE, CONTROL]


def render_rubric() -> str:
    lines = [
        "# EVAL-01M Blind Review Rubric",
        "",
        "Review reviewer-blind.json only.",
        "Do not inspect git history, private state, prompt hashes, packing audit,",
        "condition mapping, or reveal artifacts until the blind review is committed.",
        "",
        "The NORMAL and STRESS_RESILIENCE strata must be summarized separately.",
        "Do not pool them into a single winner rate.",
        "",
        "For each X/Y output score:",
        "- canonical/source-status correctness: PASS | PARTIAL | FAIL",
        "- chronology/causality: PASS | PARTIAL | FAIL",
        "- ambiguity handling: PASS | PARTIAL | FAIL",
        "- future leakage: NONE | PRESENT",
        "- unsupported claim: NONE | PRESENT",
        "- completeness: PASS | PARTIAL | FAIL",
        "",
        "Do not reward verbosity or infer which hidden condition used more context.",
        "Stress rows intentionally contain repeated structural payload. Score only",
        "whether the answer handles the supplied story evidence correctly.",
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
            ]
        )
        lines.extend(f"- {item}" for item in rubric["must_support"])
        lines.append("")
        lines.append("Must avoid:")
        lines.extend(f"- {item}" for item in rubric["must_avoid"])
        lines.append("")
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
    entities = load_json(ROOT / ".data" / "Batch_7" / "entities.json")[
        "entities"
    ]

    query_map = {
        f"{query['split']}:{query['query_id']}": query
        for query in queries
    }
    canonical_map = {
        str(memory["memory_id"]): memory for memory in canonical
    }
    audit_map = {
        str(memory["memory_id"]): memory for memory in audit
    }

    rows: list[dict[str, Any]] = []
    audits: list[dict[str, Any]] = []
    candidate_branches: dict[str, int] = {}

    for case_id in CASE_IDS:
        query = query_map[case_id]
        retrieval_row = next(
            row for row in retrieval if row["case_id"] == case_id
        )
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

        locked_ids = {
            str(row.get("entity_id"))
            for row in base_package.entities
            if bool(row.get("is_locked")) and row.get("entity_id")
        }
        named_ids = eval01h.query_named_entity_ids(
            str(query["query"]),
            entities,
        )
        semantic_ids = eval01h.semantic_entity_ids(
            retrieval_row,
            memory_map,
        )
        retrieval_scope = locked_ids | named_ids | semantic_ids

        broad = eval01h.scope_package(
            base_package,
            policy="baseline_prod8",
            base_scope_ids=retrieval_scope,
            balanced_ids=set(),
        )
        scoped = eval01h.scope_package(
            base_package,
            policy="retrieval_scoped_entities",
            base_scope_ids=retrieval_scope,
            balanced_ids=set(),
        )

        for scenario_name in (SOURCE_SCENARIO, STRESS_SCENARIO):
            scenario = eval01k.SCENARIOS[scenario_name]
            stressed_broad = eval01k.stress_package(broad, scenario)
            stressed_scoped = eval01k.stress_package(scoped, scenario)

            (
                candidate_branch,
                candidate_budget,
                candidate_package,
                broad_estimated,
                scoped_estimated,
            ) = adaptive_choice(
                stressed_broad=stressed_broad,
                stressed_scoped=stressed_scoped,
            )

            if (
                scenario_name == STRESS_SCENARIO
                and not candidate_branch.startswith("scoped_")
            ):
                continue

            stratum = (
                "NORMAL"
                if scenario_name == SOURCE_SCENARIO
                else "STRESS_RESILIENCE"
            )
            row_id = f"{case_id}|{scenario_name}"
            task_prompt = str(fixture["cases"][case_id]["prompt"])
            chapter_cutoff = int(query["chapter_cutoff"])

            source_package_hash = sha256_value(
                package_view(stressed_broad)
            )
            control_prompt = build_prompt(
                package=stressed_broad,
                budget=12_000,
                task_prompt=task_prompt,
                chapter_cutoff=chapter_cutoff,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            candidate_prompt = build_prompt(
                package=candidate_package,
                budget=candidate_budget,
                task_prompt=task_prompt,
                chapter_cutoff=chapter_cutoff,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
            )

            same_system_prompt = (
                control_prompt["system_prompt"]
                == candidate_prompt["system_prompt"]
            )
            if not same_system_prompt:
                raise RuntimeError(
                    f"System prompt drift for {row_id}"
                )
            if control_prompt["protected_overflow"]:
                raise RuntimeError(
                    f"Control protected overflow for {row_id}"
                )
            if candidate_prompt["protected_overflow"]:
                raise RuntimeError(
                    f"Candidate protected overflow for {row_id}"
                )

            candidate_branches[candidate_branch] = (
                candidate_branches.get(candidate_branch, 0) + 1
            )
            audit = {
                "row_id": row_id,
                "case_id": case_id,
                "scenario": scenario_name,
                "stratum": stratum,
                "same_prepolicy_source_package": True,
                "prepolicy_source_package_hash": source_package_hash,
                "same_query": True,
                "same_chapter_cutoff": True,
                "same_compact_provenance": True,
                "same_semantic_top8_order_before_packing": True,
                "same_recent_limit_20_before_packing": True,
                "same_model": True,
                "same_temperature": True,
                "same_system_prompt": same_system_prompt,
                "routing_uses_gold": False,
                "control": {
                    "policy": CONTROL,
                    "budget": control_prompt["budget"],
                    "estimated_before": control_prompt["estimated_before"],
                    "tokens_used": control_prompt["tokens_used"],
                    "selected_counts": control_prompt["selected_counts"],
                    "dropped_counts": control_prompt["dropped_counts"],
                    "selected_memory_ids": control_prompt["selected_memory_ids"],
                    "dropped_memory_ids": control_prompt["dropped_memory_ids"],
                    "context_hash": control_prompt["context_hash"],
                    "prompt_hash": control_prompt["prompt_hash"],
                    "prompt_chars": control_prompt["prompt_chars"],
                },
                "candidate": {
                    "policy": CANDIDATE,
                    "branch": candidate_branch,
                    "budget": candidate_budget,
                    "broad_estimated": broad_estimated,
                    "scoped_estimated": scoped_estimated,
                    "estimated_before": candidate_prompt["estimated_before"],
                    "tokens_used": candidate_prompt["tokens_used"],
                    "selected_counts": candidate_prompt["selected_counts"],
                    "dropped_counts": candidate_prompt["dropped_counts"],
                    "selected_memory_ids": candidate_prompt["selected_memory_ids"],
                    "dropped_memory_ids": candidate_prompt["dropped_memory_ids"],
                    "context_hash": candidate_prompt["context_hash"],
                    "prompt_hash": candidate_prompt["prompt_hash"],
                    "prompt_chars": candidate_prompt["prompt_chars"],
                },
            }
            audits.append(audit)
            rows.append(
                {
                    "row_id": row_id,
                    "case_id": case_id,
                    "scenario": scenario_name,
                    "stratum": stratum,
                    "chapter_cutoff": chapter_cutoff,
                    "task_prompt": task_prompt,
                    "rubric_role": fixture["cases"][case_id][
                        "rubric_role"
                    ],
                    "candidate_branch": candidate_branch,
                    "prompts": {
                        CONTROL: control_prompt,
                        CANDIDATE: candidate_prompt,
                    },
                }
            )

    normal_count = sum(row["stratum"] == "NORMAL" for row in rows)
    stress_count = sum(
        row["stratum"] == "STRESS_RESILIENCE" for row in rows
    )
    if normal_count != EXPECTED_NORMAL_ROWS:
        raise RuntimeError(
            f"Expected {EXPECTED_NORMAL_ROWS} normal rows, got {normal_count}"
        )
    if stress_count != EXPECTED_SCOPED_STRESS_ROWS:
        raise RuntimeError(
            "EVAL-01L route coverage drift: expected "
            f"{EXPECTED_SCOPED_STRESS_ROWS} scoped combined_4x rows, "
            f"got {stress_count}"
        )

    public_contract = {
        "experiment_id": "EVAL-01M",
        "routing_uses_gold": False,
        "normal_rows": normal_count,
        "stress_resilience_rows": stress_count,
        "total_rows": len(rows),
        "candidate_branch_counts": candidate_branches,
        "all_same_system_prompt": all(
            item["same_system_prompt"] for item in audits
        ),
        "all_same_source_package_hash": all(
            item["same_prepolicy_source_package"] for item in audits
        ),
        "all_control_protected_overflow_false": all(
            not row["prompts"][CONTROL]["protected_overflow"]
            for row in rows
        ),
        "all_candidate_protected_overflow_false": all(
            not row["prompts"][CANDIDATE]["protected_overflow"]
            for row in rows
        ),
        "detailed_audit": audits,
    }
    return rows, public_contract


def dry_run(args: argparse.Namespace) -> int:
    rows, contract = build_rows(
        model=args.model,
        temperature=args.temperature,
        max_tokens=args.max_tokens,
    )
    result = {
        "experiment_id": "EVAL-01M",
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
    }
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


def latency_summary(
    raw_records: list[dict[str, Any]],
) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for stratum in ("NORMAL", "STRESS_RESILIENCE"):
        result[stratum] = {}
        for condition in CONDITIONS:
            values = sorted(
                float(item["latency_ms"])
                for item in raw_records
                if item["stratum"] == stratum
                and item["condition"] == condition
                and item["execution_status"] == "SUCCESS"
                and item["latency_ms"] is not None
            )
            result[stratum][condition] = {
                "sample_count": len(values),
                "mean_ms": (
                    sum(values) / len(values) if values else None
                ),
                "p50_ms": (
                    values[len(values) // 2] if values else None
                ),
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

    raw_records: list[dict[str, Any]] = []
    reviewer_rows: list[dict[str, Any]] = []
    condition_key: list[dict[str, Any]] = []
    backoff_events = 0
    blind_salt = secrets.token_hex(32)
    order_salt = secrets.token_hex(32)

    for row in rows:
        row_id = row["row_id"]
        for repeat in range(1, args.repeats + 1):
            mapping = blind_mapping(
                row_id,
                repeat,
                private_salt=blind_salt,
            )
            order = call_order(
                row_id,
                repeat,
                private_salt=order_salt,
            )
            outputs: dict[str, dict[str, Any]] = {}

            for condition in order:
                prompt = row["prompts"][condition]
                record = {
                    "row_id": row_id,
                    "case_id": row["case_id"],
                    "scenario": row["scenario"],
                    "stratum": row["stratum"],
                    "repeat": repeat,
                    "condition": condition,
                    "call_order_index": order.index(condition),
                    "model_requested": args.model,
                    "temperature": args.temperature,
                    "chapter_cutoff": row["chapter_cutoff"],
                    "task_prompt": row["task_prompt"],
                    "prompt_hash": prompt["prompt_hash"],
                    "context_hash": prompt["context_hash"],
                    "context_budget": prompt["budget"],
                    "estimated_story_brain_before": prompt[
                        "estimated_before"
                    ],
                    "story_brain_tokens_used": prompt["tokens_used"],
                    "prompt_chars": prompt["prompt_chars"],
                    "execution_status": "ERROR",
                    "latency_ms": None,
                    "backoff_count": 0,
                    "raw_output": "",
                    "draft_text": "",
                }
                try:
                    raw_output, latency_ms, backoffs = (
                        eval01d.call_exact_model(
                            llm,
                            system_prompt=prompt["system_prompt"],
                            user_prompt=prompt["user_prompt"],
                            temperature=args.temperature,
                            max_tokens=args.max_tokens,
                        )
                    )
                    record["execution_status"] = "SUCCESS"
                    record["latency_ms"] = latency_ms
                    record["backoff_count"] = backoffs
                    record["raw_output"] = raw_output
                    record["draft_text"] = eval01d.parse_draft_text(
                        raw_output
                    )
                    backoff_events += backoffs
                except Exception as exc:
                    record["error"] = str(exc)

                outputs[condition] = record
                raw_records.append(record)
                time.sleep(max(0.0, args.inter_call_seconds))

            blind_outputs: dict[str, Any] = {}
            for label, condition in mapping.items():
                source = outputs[condition]
                blind_outputs[label] = {
                    "execution_status": source["execution_status"],
                    "draft_text": source["draft_text"],
                }

            reviewer_rows.append(
                {
                    "row_id": row_id,
                    "case_id": row["case_id"],
                    "scenario": row["scenario"],
                    "stratum": row["stratum"],
                    "repeat": repeat,
                    "task_prompt": row["task_prompt"],
                    "chapter_cutoff": row["chapter_cutoff"],
                    "rubric_role": row["rubric_role"],
                    "outputs": blind_outputs,
                }
            )
            condition_key.append(
                {
                    "row_id": row_id,
                    "case_id": row["case_id"],
                    "scenario": row["scenario"],
                    "stratum": row["stratum"],
                    "repeat": repeat,
                    "mapping": mapping,
                    "call_order": order,
                }
            )

    expected_count = len(rows) * 2 * args.repeats
    success_count = sum(
        item["execution_status"] == "SUCCESS"
        for item in raw_records
    )

    private_state = {
        "experiment_id": "EVAL-01M",
        "state_version": "eval01m-private-v1",
        "runtime": {
            "model": args.model,
            "temperature": args.temperature,
            "max_tokens": args.max_tokens,
            "fixed_key_slot": slot_label,
            "key_rotation": False,
            "repeats": args.repeats,
            "inter_call_seconds": args.inter_call_seconds,
            "provider_backoff_events": backoff_events,
        },
        "blind_salt": blind_salt,
        "order_salt": order_salt,
        "condition_key": condition_key,
        "raw_generations": raw_records,
        "prompt_diff_audit": contract["detailed_audit"],
        "latency_by_stratum_condition": latency_summary(raw_records),
    }
    sealed_sha = sha256_value(private_state)

    args.private_path.parent.mkdir(parents=True, exist_ok=True)
    args.private_path.write_text(
        json.dumps(private_state, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    runtime_config = {
        "experiment_id": "EVAL-01M",
        "stage": "capture",
        "model": args.model,
        "temperature": args.temperature,
        "max_tokens": args.max_tokens,
        "fixed_key_slot": slot_label,
        "key_rotation": False,
        "repeats": args.repeats,
        "row_count": len(rows),
        "normal_rows": contract["normal_rows"],
        "stress_resilience_rows": contract[
            "stress_resilience_rows"
        ],
        "expected_calls": expected_count,
        "successful_calls": success_count,
        "provider_backoff_events": backoff_events,
        "quality_scoring": "BLIND_REVIEW_REQUIRED",
        "condition_mapping_committed": False,
        "raw_condition_labels_committed": False,
        "provider_token_usage": "not_exposed_by_current_client",
        "provider_cost": "not_measured",
    }
    (EVIDENCE_DIR / "runtime-config.json").write_text(
        json.dumps(runtime_config, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
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
    (EVIDENCE_DIR / "sealed-state.json").write_text(
        json.dumps(
            {
                "experiment_id": "EVAL-01M",
                "private_state_sha256": sealed_sha,
                "private_state_version": private_state["state_version"],
                "expected_calls": expected_count,
                "successful_calls": success_count,
                "condition_mapping_committed": False,
                "raw_condition_labels_committed": False,
                "note": (
                    "Keep .eval-private/eval01m-private.json local until "
                    "Astra commits blind review."
                ),
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
                "# EVAL-01M Capture Summary",
                "",
                f"Model: {args.model}",
                f"Fixed key slot: {slot_label}",
                f"Rows: {len(rows)} "
                f"({contract['normal_rows']} normal + "
                f"{contract['stress_resilience_rows']} stress-resilience)",
                f"Successful calls: {success_count} / {expected_count}",
                f"Backoff events: {backoff_events}",
                "Condition mapping committed: NO",
                "Condition-labelled raw generations committed: NO",
                "Quality: BLIND_REVIEW_REQUIRED",
                "",
                "Review NORMAL and STRESS_RESILIENCE separately.",
                "Do not inspect private state before blind review is committed.",
                "",
            ]
        ),
        encoding="utf-8",
    )

    print(
        json.dumps(
            {
                "experiment_id": "EVAL-01M",
                "stage": "capture",
                "successful_calls": success_count,
                "expected_calls": expected_count,
                "fixed_key_slot": slot_label,
                "sealed_state_sha256": sealed_sha,
                "private_state_path": str(
                    args.private_path.relative_to(ROOT)
                ),
                "reviewer_evidence_dir": str(
                    EVIDENCE_DIR.relative_to(ROOT)
                ),
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0 if success_count == expected_count else 2


def reveal(args: argparse.Namespace) -> int:
    blind_review = EVIDENCE_DIR / "ASTRA-BLIND-REVIEW.md"
    if not blind_review.exists():
        raise RuntimeError(
            "ASTRA-BLIND-REVIEW.md is required before reveal"
        )
    if not args.private_path.exists():
        raise RuntimeError(
            f"Private state not found: {args.private_path}"
        )

    private_state = load_json(args.private_path)
    sealed_path = EVIDENCE_DIR / "sealed-state.json"
    if not sealed_path.exists():
        raise RuntimeError("sealed-state.json not found")
    sealed = load_json(sealed_path)

    actual_sha = sha256_value(private_state)
    expected_sha = str(sealed["private_state_sha256"])
    if actual_sha != expected_sha:
        raise RuntimeError(
            "Private state commitment mismatch: "
            f"expected={expected_sha} actual={actual_sha}"
        )

    (EVIDENCE_DIR / "condition-key.json").write_text(
        json.dumps(
            private_state["condition_key"],
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    (EVIDENCE_DIR / "raw-generations.json").write_text(
        json.dumps(
            private_state["raw_generations"],
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    (EVIDENCE_DIR / "prompt-diff-audit.json").write_text(
        json.dumps(
            private_state["prompt_diff_audit"],
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    (EVIDENCE_DIR / "latency-cost.json").write_text(
        json.dumps(
            {
                "status": "measured",
                "by_stratum_condition": private_state[
                    "latency_by_stratum_condition"
                ],
                "backoff_events": private_state["runtime"][
                    "provider_backoff_events"
                ],
                "story_brain_estimate_and_prompt_chars": (
                    "available in raw-generations.json"
                ),
                "provider_token_usage": "not_exposed_by_current_client",
                "provider_cost": "not_measured",
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    (EVIDENCE_DIR / "reveal-verification.json").write_text(
        json.dumps(
            {
                "experiment_id": "EVAL-01M",
                "commitment_match": True,
                "private_state_sha256": actual_sha,
                "blind_review_present": True,
                "condition_mapping_committed": True,
                "raw_condition_labels_committed": True,
                "provider_calls_during_reveal": 0,
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )

    print(
        json.dumps(
            {
                "experiment_id": "EVAL-01M",
                "stage": "reveal",
                "commitment_match": True,
                "private_state_sha256": actual_sha,
                "provider_calls": 0,
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
        default=int(os.getenv("EVAL01M_REPEATS", "3")),
    )
    parser.add_argument(
        "--model",
        default=os.getenv(
            "EVAL01M_MODEL",
            "gemini-3.5-flash-lite",
        ),
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=float(os.getenv("EVAL01M_TEMPERATURE", "0.0")),
    )
    parser.add_argument(
        "--max-tokens",
        type=int,
        default=int(os.getenv("EVAL01M_MAX_TOKENS", "512")),
    )
    parser.add_argument(
        "--key-slot",
        type=int,
        default=int(os.getenv("EVAL_GEMINI_KEY_SLOT", "1")),
    )
    parser.add_argument(
        "--inter-call-seconds",
        type=float,
        default=float(os.getenv("EVAL01M_INTER_CALL_SECONDS", "5.0")),
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
