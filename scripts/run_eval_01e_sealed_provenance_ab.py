#!/usr/bin/env python3
"""EVAL-01E sealed provenance generation A/B.

Stage dry-run:
  Validate fixture, neutralization, A/B isolation, and packing. No provider call.

Stage capture:
  Run live A/B and write only reviewer-safe blind evidence to git-visible paths.
  Condition mapping, condition-labelled raw generations, prompt hashes, and
  latency-by-condition are stored in .eval-private/ and committed only after a
  blind review exists.

Stage reveal:
  Verify the private-state SHA256 against the earlier public commitment, then
  materialize the condition key and raw audit artifacts without provider calls.

Frozen benchmark files are read-only. Neutralization is a derived experimental
view from benchmarks/eval01e_neutral_context.json.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import os
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
from application.context_budget import ContextBudgetPacker
from core.llm_client import LLMClient
from domain.models import WritingContextPackage

FIXTURE_PATH = ROOT / "benchmarks" / "eval01e_neutral_context.json"
EVIDENCE_DIR = ROOT / "docs" / "development" / "EVAL-01E-SEALED-PROVENANCE-AB"
DEFAULT_PRIVATE_PATH = ROOT / ".eval-private" / "eval01e-private.json"

CASE_IDS = (
    "core_gold:rq-0011",
    "challenge:rq-0023",
    "challenge:rq-0025",
    "challenge:rq-0020",
    "challenge:rq-0032",
    "core_gold:rq-0038",
    "core_gold:rq-0010",
)

RUBRIC = {
    "core_gold:rq-0011": {
        "role": "origin_without_query_leak",
        "must_support": [
            "Chapter 27 is the established origin of Alan's personal Than Tinh sword.",
            "The chapter-32 first-forging account must not replace the chapter-27 origin.",
        ],
        "must_avoid": [
            "Choosing chapter 32 as the canonical origin.",
            "Silently merging the two first-forging accounts as one event.",
        ],
    },
    "challenge:rq-0023": {
        "role": "repeated_event_history",
        "must_support": [
            "Chapter 40 is the earliest on-page destruction of Pressure Pillar No. 2.",
            "Chapters 42 and 45 are later conflicting/repeated destruction accounts.",
        ],
        "must_avoid": [
            "Treating chapter 42 or 45 as the first destruction.",
            "Pretending the repeated destructions are a clean single chronology.",
        ],
    },
    "challenge:rq-0025": {
        "role": "repeated_force_state",
        "must_support": [
            "Chapter 45 is the earliest on-page burial of the three-thousand cavalry in this sequence.",
            "Chapter 47 repeats the burial and later memories show incompatible force-state continuation.",
        ],
        "must_avoid": [
            "Calling chapter 47 the first burial.",
            "Silently treating all cavalry-state memories as a clean progression.",
        ],
    },
    "challenge:rq-0020": {
        "role": "conflicting_attributed_history",
        "must_support": [
            "The source contains competing character accounts of the old battle.",
            "Responsibility is not established as one uncontested canonical fact by the supplied evidence.",
        ],
        "must_avoid": [
            "Promoting either side's accusation to settled history.",
        ],
    },
    "challenge:rq-0032": {
        "role": "source_status_supersession",
        "must_support": [
            "Later evidence establishes the artificial sky/ecological crisis.",
            "Later evidence establishes Alistair's extreme utilitarian sacrifice motive.",
            "The earlier divine-ascent interpretation remains an earlier reported interpretation, not a later confirmed fact.",
        ],
        "must_avoid": [
            "Promoting becoming-divine language to canonical motive.",
        ],
    },
    "core_gold:rq-0038": {
        "role": "physical_identity_provenance",
        "must_support": [
            "The evidence does not establish that the chapter-17 reserve seeds and later red-maple seeds are the same physical cache.",
            "Thematic continuity may be noted without inventing physical identity.",
        ],
        "must_avoid": [
            "Claiming the later seeds are definitely the same physical seeds evacuated in chapter 17.",
        ],
    },
    "core_gold:rq-0010": {
        "role": "negative_control_causal_history",
        "must_support": [
            "Trust develops across rescue/contact, alliance formation, and later battlefield cooperation.",
            "The chapter-31 alliance/commitment precedes the chapter-33 battlefield payoff.",
        ],
        "must_avoid": [
            "Claiming the chapter-33 victory caused an already-earlier chapter-31 commitment.",
        ],
    },
}


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


def neutral_memory(
    memory: dict[str, Any],
    fixture: dict[str, Any],
) -> tuple[dict[str, Any], bool]:
    result = copy.deepcopy(memory)
    override = fixture.get("content_overrides", {}).get(str(memory["memory_id"]))
    if override is None:
        return result, False
    result["content"] = str(override)
    return result, True


def build_instruction(
    *,
    task_prompt: str,
    chapter_cutoff: int,
) -> str:
    return (
        "This is a narrative-continuity evaluation, not free-form fiction. "
        "Answer in English in 2-5 sentences using only the supplied Story Brain "
        f"and no information after chapter {chapter_cutoff}. "
        "If provenance metadata such as status, review_status, tags, "
        "confirmation_status, or supersedes_id is present, use it as source-status "
        "evidence. If those fields are absent, do not invent them. Preserve "
        "uncertainty when supplied memories conflict. "
        f"Task: {task_prompt}"
    )


def build_prompt(
    *,
    task_prompt: str,
    chapter_cutoff: int,
    payloads: list[dict[str, Any]],
    model: str,
    temperature: float,
    max_tokens: int,
) -> dict[str, Any]:
    packer = ContextBudgetPacker()
    package = WritingContextPackage(
        brain_version=1,
        semantic_memories=tuple(payloads),
    )
    packed = packer.pack(package, maximum=12_000)
    context = packer.prompt_context(packed)

    capture = eval01d.PromptCaptureLLMService(
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    capture.generate_writing_draft(
        operation="continue",
        selected_text="",
        cursor_offset=0,
        instruction=build_instruction(
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
        "selected_memory_ids": list(
            packed.context_summary.get("semantic_memory_ids", [])
        ),
        "dropped_memory_ids": list(
            packed.context_summary.get("dropped_semantic_memory_ids", [])
        ),
        "tokens_used": packed.token_budget.get("used"),
        "token_budget": packed.token_budget.get("maximum"),
    }


def blind_mapping(case_id: str, repeat: int) -> dict[str, str]:
    digest = hashlib.sha256(
        f"eval01e:blind:{case_id}:{repeat}".encode("utf-8")
    ).digest()
    if digest[0] % 2 == 0:
        return {"X": "pre_provenance", "Y": "post_provenance"}
    return {"X": "post_provenance", "Y": "pre_provenance"}


def call_order(case_id: str, repeat: int) -> list[str]:
    digest = hashlib.sha256(
        f"eval01e:order:{case_id}:{repeat}".encode("utf-8")
    ).digest()
    if digest[0] % 2 == 0:
        return ["pre_provenance", "post_provenance"]
    return ["post_provenance", "pre_provenance"]


def render_rubric() -> str:
    lines = [
        "# EVAL-01E Reviewer Rubric",
        "",
        "Review reviewer-blind.json only.",
        "Do not inspect git history, workflow logs, private state, prompt hashes, or reveal artifacts.",
        "",
        "For each X/Y output score:",
        "- canonical/source-status correctness: PASS | PARTIAL | FAIL",
        "- chronology/causality: PASS | PARTIAL | FAIL",
        "- ambiguity handling: PASS | PARTIAL | FAIL",
        "- future leakage: NONE | PRESENT",
        "- unsupported claim: NONE | PRESENT",
        "- completeness: PASS | PARTIAL | FAIL",
        "",
        "Record one short evidence-based reason per X and Y.",
        "",
    ]
    for case_id in CASE_IDS:
        rubric = RUBRIC[case_id]
        lines.extend(
            [
                f"## {case_id} - {rubric['role']}",
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


def build_cases(
    *,
    model: str,
    temperature: float,
    max_tokens: int,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    fixture = load_json(FIXTURE_PATH)
    retrieval_rows = load_json(
        ROOT
        / "docs"
        / "development"
        / "EVAL-01-AETHELGARD-RUNTIME-BASELINE"
        / "retrieval-raw.json"
    )
    frozen = load_json(ROOT / ".data" / "Frozen_v1" / "retrieval_queries.json")
    canonical = load_json(
        ROOT / ".data" / "Frozen_v1" / "memory_chunks_canonical.json"
    )["memories"]
    audit = load_json(
        ROOT / ".data" / "Frozen_v1" / "memory_chunks.json"
    )["memories"]

    query_map = {
        f"{query['split']}:{query['query_id']}": query
        for query in frozen["queries"]
    }
    canonical_map = {str(m["memory_id"]): m for m in canonical}
    audit_map = {str(m["memory_id"]): m for m in audit}

    cases: list[dict[str, Any]] = []
    prompt_audit: list[dict[str, Any]] = []
    neutralization_rows: list[dict[str, Any]] = []

    for case_id in CASE_IDS:
        if case_id not in fixture["cases"]:
            raise RuntimeError(f"Missing fixture case: {case_id}")
        query = query_map[case_id]
        row = next(
            item for item in retrieval_rows if item["case_id"] == case_id
        )
        memory_map = (
            audit_map if row["corpus"] == "audit_232" else canonical_map
        )
        top10 = row["hybrid_top20"][:10]

        prompts: dict[str, Any] = {}
        condition_payloads: dict[str, list[dict[str, Any]]] = {
            "pre_provenance": [],
            "post_provenance": [],
        }
        for hit in top10:
            original = memory_map[str(hit["memory_id"])]
            neutral, changed = neutral_memory(original, fixture)
            if changed:
                neutralization_rows.append(
                    {
                        "case_id": case_id,
                        "memory_id": original["memory_id"],
                        "chapter_number": int(original["chapter_number"]),
                        "original_content_sha256": sha256_text(str(original["content"])),
                        "neutral_content_sha256": sha256_text(str(neutral["content"])),
                    }
                )
            for condition in condition_payloads:
                condition_payloads[condition].append(
                    eval01d.semantic_payload(
                        neutral,
                        hit,
                        condition=condition,
                    )
                )

        task_prompt = str(fixture["cases"][case_id]["prompt"])
        for condition, payloads in condition_payloads.items():
            prompts[condition] = build_prompt(
                task_prompt=task_prompt,
                chapter_cutoff=int(query["chapter_cutoff"]),
                payloads=payloads,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
            )

        pre = prompts["pre_provenance"]
        post = prompts["post_provenance"]
        normalized_post = eval01d.strip_new_provenance(post["context"])

        isolation = {
            "case_id": case_id,
            "only_new_provenance_fields_differ": (
                sha256_value(pre["context"]) == sha256_value(normalized_post)
            ),
            "same_selected_memory_ids": (
                pre["selected_memory_ids"] == post["selected_memory_ids"]
            ),
            "same_dropped_memory_ids": (
                pre["dropped_memory_ids"] == post["dropped_memory_ids"]
            ),
            "same_system_prompt": (
                pre["system_prompt"] == post["system_prompt"]
            ),
            "pre_tokens_used": pre["tokens_used"],
            "post_tokens_used": post["tokens_used"],
            "token_overhead": (
                int(post["tokens_used"] or 0)
                - int(pre["tokens_used"] or 0)
            ),
            "selected_memory_ids": pre["selected_memory_ids"],
        }
        if not all(
            isolation[key]
            for key in (
                "only_new_provenance_fields_differ",
                "same_selected_memory_ids",
                "same_dropped_memory_ids",
                "same_system_prompt",
            )
        ):
            raise RuntimeError(f"A/B isolation failed for {case_id}")
        prompt_audit.append(isolation)

        cases.append(
            {
                "case_id": case_id,
                "chapter_cutoff": int(query["chapter_cutoff"]),
                "task_prompt": task_prompt,
                "rubric_role": fixture["cases"][case_id]["rubric_role"],
                "corpus": row["corpus"],
                "prompts": prompts,
            }
        )

    neutralization_audit = {
        "fixture_version": fixture["version"],
        "fixture_sha256": sha256_value(fixture),
        "frozen_files_mutated": False,
        "override_count_in_selected_top10": len(
            {
                (row["case_id"], row["memory_id"])
                for row in neutralization_rows
            }
        ),
        "rows": neutralization_rows,
    }
    return cases, prompt_audit, neutralization_audit


def dry_run(args: argparse.Namespace) -> int:
    cases, audit, neutral = build_cases(
        model=args.model,
        temperature=args.temperature,
        max_tokens=args.max_tokens,
    )
    result = {
        "experiment_id": "EVAL-01E",
        "stage": "dry-run",
        "case_count": len(cases),
        "repeats": args.repeats,
        "planned_live_calls": len(cases) * 2 * args.repeats,
        "model": args.model,
        "temperature": args.temperature,
        "isolation_pass": all(
            item["only_new_provenance_fields_differ"]
            and item["same_selected_memory_ids"]
            and item["same_dropped_memory_ids"]
            and item["same_system_prompt"]
            for item in audit
        ),
        "neutralization": neutral,
        "prompt_audit": audit,
    }
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


def capture(args: argparse.Namespace) -> int:
    cases, prompt_audit, neutral = build_cases(
        model=args.model,
        temperature=args.temperature,
        max_tokens=args.max_tokens,
    )
    slot_label, api_key = eval01d.load_fixed_key_slot(args.key_slot)
    llm = LLMClient(
        provider="gemini",
        model=args.model,
        api_key=api_key,
        timeout_seconds=60,
    )

    raw_records: list[dict[str, Any]] = []
    condition_key: list[dict[str, Any]] = []
    reviewer_rows: list[dict[str, Any]] = []
    backoff_events = 0

    for case in cases:
        case_id = case["case_id"]
        for repeat in range(1, args.repeats + 1):
            mapping = blind_mapping(case_id, repeat)
            order = call_order(case_id, repeat)
            outputs: dict[str, dict[str, Any]] = {}
            for condition in order:
                prompt = case["prompts"][condition]
                record = {
                    "case_id": case_id,
                    "repeat": repeat,
                    "condition": condition,
                    "call_order_index": order.index(condition),
                    "model_requested": args.model,
                    "temperature": args.temperature,
                    "chapter_cutoff": case["chapter_cutoff"],
                    "task_prompt": case["task_prompt"],
                    "prompt_hash": prompt["prompt_hash"],
                    "context_hash": prompt["context_hash"],
                    "selected_memory_ids": prompt["selected_memory_ids"],
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

            blind_outputs: dict[str, Any] = {}
            for blind_label, condition in mapping.items():
                source = outputs[condition]
                blind_outputs[blind_label] = {
                    "execution_status": source["execution_status"],
                    "draft_text": source["draft_text"],
                }
            reviewer_rows.append(
                {
                    "case_id": case_id,
                    "repeat": repeat,
                    "task_prompt": case["task_prompt"],
                    "chapter_cutoff": case["chapter_cutoff"],
                    "rubric_role": case["rubric_role"],
                    "outputs": blind_outputs,
                }
            )
            condition_key.append(
                {
                    "case_id": case_id,
                    "repeat": repeat,
                    "mapping": mapping,
                    "call_order": order,
                }
            )

    success_count = sum(
        item["execution_status"] == "SUCCESS"
        for item in raw_records
    )
    expected_count = len(cases) * 2 * args.repeats

    latency_by_condition: dict[str, dict[str, Any]] = {}
    for condition in ("pre_provenance", "post_provenance"):
        values = sorted(
            float(item["latency_ms"])
            for item in raw_records
            if item["condition"] == condition
            and item["execution_status"] == "SUCCESS"
            and item["latency_ms"] is not None
        )
        latency_by_condition[condition] = {
            "sample_count": len(values),
            "mean_ms": (
                sum(values) / len(values) if values else None
            ),
            "p50_ms": (
                values[len(values) // 2] if values else None
            ),
            "max_ms": max(values) if values else None,
        }

    private_state = {
        "experiment_id": "EVAL-01E",
        "state_version": "eval01e-private-v1",
        "runtime": {
            "model": args.model,
            "temperature": args.temperature,
            "max_tokens": args.max_tokens,
            "fixed_key_slot": slot_label,
            "key_rotation": False,
            "repeats": args.repeats,
            "case_ids": list(CASE_IDS),
            "provider_backoff_events": backoff_events,
        },
        "condition_key": condition_key,
        "raw_generations": raw_records,
        "prompt_diff_audit": prompt_audit,
        "latency_by_condition": latency_by_condition,
        "neutralization_audit": neutral,
    }
    sealed_sha = sha256_value(private_state)

    args.private_path.parent.mkdir(parents=True, exist_ok=True)
    args.private_path.write_text(
        json.dumps(private_state, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    reviewer_runtime = {
        "experiment_id": "EVAL-01E",
        "stage": "capture",
        "model": args.model,
        "temperature": args.temperature,
        "max_tokens": args.max_tokens,
        "fixed_key_slot": slot_label,
        "key_rotation": False,
        "repeats": args.repeats,
        "case_ids": list(CASE_IDS),
        "successful_calls": success_count,
        "expected_calls": expected_count,
        "provider_backoff_events": backoff_events,
        "quality_scoring": "BLIND_REVIEW_REQUIRED",
        "condition_mapping_committed": False,
        "raw_condition_labels_committed": False,
    }
    (EVIDENCE_DIR / "runtime-config.json").write_text(
        json.dumps(reviewer_runtime, indent=2, ensure_ascii=False) + "\n",
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
    (EVIDENCE_DIR / "neutralization-audit.json").write_text(
        json.dumps(neutral, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    (EVIDENCE_DIR / "sealed-state.json").write_text(
        json.dumps(
            {
                "experiment_id": "EVAL-01E",
                "private_state_sha256": sealed_sha,
                "private_state_version": private_state["state_version"],
                "expected_calls": expected_count,
                "successful_calls": success_count,
                "condition_mapping_committed": False,
                "raw_condition_labels_committed": False,
                "note": (
                    "Keep .eval-private/eval01e-private.json local until "
                    "Astra commits blind review."
                ),
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    summary = "\n".join(
        [
            "# EVAL-01E Capture Summary",
            "",
            f"Model: {args.model}",
            f"Fixed key slot: {slot_label}",
            f"Successful calls: {success_count} / {expected_count}",
            f"Backoff events: {backoff_events}",
            "Prompt isolation: PASS",
            "Condition mapping committed: NO",
            "Condition-labelled raw generations committed: NO",
            "",
            "Reviewer must inspect only reviewer-blind.json and review-rubric.md.",
            "Do not inspect private state before blind review is committed.",
            "",
        ]
    )
    (EVIDENCE_DIR / "summary.md").write_text(
        summary,
        encoding="utf-8",
    )

    print(
        json.dumps(
            {
                "experiment_id": "EVAL-01E",
                "stage": "capture",
                "successful_calls": success_count,
                "expected_calls": expected_count,
                "fixed_key_slot": slot_label,
                "sealed_state_sha256": sealed_sha,
                "private_state_path": str(args.private_path.relative_to(ROOT)),
                "reviewer_evidence_dir": str(EVIDENCE_DIR.relative_to(ROOT)),
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0 if success_count == expected_count else 2


def reveal(args: argparse.Namespace) -> int:
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
                "by_condition": private_state["latency_by_condition"],
                "backoff_events": private_state["runtime"][
                    "provider_backoff_events"
                ],
                "provider_token_usage": "not_measured",
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
                "experiment_id": "EVAL-01E",
                "commitment_match": True,
                "private_state_sha256": actual_sha,
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
                "experiment_id": "EVAL-01E",
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
        default=int(os.getenv("EVAL01E_REPEATS", "3")),
    )
    parser.add_argument(
        "--model",
        default=os.getenv(
            "EVAL01E_MODEL",
            "gemini-3.5-flash-lite",
        ),
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=float(os.getenv("EVAL01E_TEMPERATURE", "0.0")),
    )
    parser.add_argument(
        "--max-tokens",
        type=int,
        default=int(os.getenv("EVAL01E_MAX_TOKENS", "512")),
    )
    parser.add_argument(
        "--key-slot",
        type=int,
        default=int(os.getenv("EVAL_GEMINI_KEY_SLOT", "1")),
    )
    parser.add_argument(
        "--inter-call-seconds",
        type=float,
        default=float(os.getenv("EVAL01E_INTER_CALL_SECONDS", "1.2")),
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
