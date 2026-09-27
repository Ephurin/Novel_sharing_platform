#!/usr/bin/env python3
"""EVAL-01D provenance-aware generation A/B.

Keeps query, candidates, order, content, production prompt renderer, model,
temperature and instructions identical. The only A/B difference is the compact
provenance metadata added by EVAL-01C-PROV.

The harness never self-scores quality. It writes blind X/Y outputs for later
Astra/Supervisor review.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
AI_SERVICE_ROOT = ROOT / "ai-service"
sys.path.insert(0, str(AI_SERVICE_ROOT))

from application.context_budget import ContextBudgetPacker
from core.llm_client import LLMClient, LLMClientError
from core.llm_service import LLMService
from domain.models import WritingContextPackage

EVIDENCE_DIR = ROOT / "docs" / "development" / "EVAL-01D-PROVENANCE-GENERATION-AB"

CASE_IDS = (
    "core_gold:rq-0011",
    "challenge:rq-0023",
    "challenge:rq-0025",
    "core_gold:rq-0036",
    "core_gold:rq-0010",
)

NEW_PROVENANCE_KEYS = (
    "confirmation_status",
    "memory_id",
    "chapter_title",
    "tags",
    "status",
    "review_status",
    "supersedes_id",
)

RUBRIC = {
    "core_gold:rq-0011": {
        "role": "replay_origin",
        "must_support": [
            "Treat chapter 27 / mem-000089 as the canonical sword origin.",
            "Treat chapter 32 / mem-000110 as a later replay, not a replacement origin.",
            "May use chapters 28-29 as corroborating later use of the already-forged sword.",
        ],
        "must_avoid": [
            "Calling chapter 32 the canonical first forging.",
            "Collapsing the two first-forging scenes without qualification.",
        ],
    },
    "challenge:rq-0023": {
        "role": "replay_first_occurrence",
        "must_support": [
            "Treat chapter 40 / mem-000149 as the first on-page destruction of Pillar No. 2.",
            "Treat chapter 42 / mem-000155 and chapter 45 / mem-000164 as later replay matches.",
            "Preserve uncertainty or ambiguity where supported.",
        ],
        "must_avoid": [
            "Promoting chapter 42 or 45 above chapter 40 as the first occurrence.",
        ],
    },
    "challenge:rq-0025": {
        "role": "replay_first_occurrence",
        "must_support": [
            "Treat chapter 45 / mem-000164 as the earliest on-page burial in this sequence.",
            "Treat chapter 47 / mem-000172 as a later replay.",
            "Do not let later revived-force references redefine the first burial.",
        ],
        "must_avoid": [
            "Calling chapter 47 the first burial.",
        ],
    },
    "core_gold:rq-0036": {
        "role": "lifecycle_with_replay",
        "must_support": [
            "Start the personal sword lifecycle at chapter 27 / mem-000089.",
            "Exclude chapter 32 / mem-000110 as a replayed first-forging scene.",
            "Preserve later anti-mana and combat uses including the final duel.",
            "Recognize chapter 60 does not melt Alan's personal sword.",
            "End with retirement at Gregor's memorial in chapter 61 / mem-000229.",
        ],
        "must_avoid": [
            "Starting the lifecycle at chapter 32.",
            "Claiming the personal sword is melted into farming tools.",
        ],
    },
    "core_gold:rq-0010": {
        "role": "negative_control_non_provenance_causality",
        "must_support": [
            "Explain trust formation across rescue, proof, negotiation and joint combat.",
            "Keep chronology intact: resource and forge commitment precedes the chapter-33 joint-victory belief update.",
        ],
        "must_avoid": [
            "Claiming the chapter-33 joint victory caused an earlier chapter-31 commitment.",
        ],
    },
}


class PromptCaptureLLMService(LLMService):
    def __init__(self, *, model: str, temperature: float, max_tokens: int) -> None:
        super().__init__(
            provider="gemini",
            model=model,
            api_key="prompt-capture-only",
            fallback_provider="",
            temperature=temperature,
            max_tokens=max_tokens,
        )
        self.captured_system_prompt = ""
        self.captured_user_prompt = ""

    def _call_llm(self, system_prompt: str, user_prompt: str) -> str:
        self.captured_system_prompt = system_prompt
        self.captured_user_prompt = user_prompt
        return '{"draft_text":"__PROMPT_CAPTURE__","explanation":"capture"}'


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256_json(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            default=str,
        ).encode("utf-8")
    ).hexdigest()


def load_fixed_key_slot(slot_number: int) -> tuple[str, str]:
    if slot_number not in {1, 2, 3, 4}:
        raise RuntimeError("EVAL_GEMINI_KEY_SLOT must be 1, 2, 3, or 4")
    key_name = f"GEMINI_API_KEY_SLOT_{slot_number}"
    env_path = ROOT / ".env.eval.local"
    if not env_path.exists():
        raise RuntimeError(".env.eval.local not found")
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        if name.strip() == key_name and value.strip():
            return f"slot-{slot_number}", value.strip()
    raise RuntimeError(f"{key_name} not found in .env.eval.local")


def memory_metadata(memory: dict[str, Any], *, condition: str) -> dict[str, Any]:
    base = {
        "event_type": memory.get("memory_type", "event_summary"),
        "chapter_number": int(memory.get("chapter_number", 1)),
        "source_type": "legacy",
        "importance_score": float(memory.get("importance", 0.5)),
    }
    if condition == "pre_provenance":
        return base
    if condition != "post_provenance":
        raise ValueError(condition)

    enriched = dict(base)
    enriched.update(
        {
            "confirmation_status": "confirmed",
            "memory_id": memory["memory_id"],
            "chapter_title": memory.get("chapter_title", ""),
            "tags": list(memory.get("tags", [])),
            "status": memory.get("status"),
            "review_status": memory.get("review_status"),
        }
    )
    if memory.get("supersedes_id") is not None:
        enriched["supersedes_id"] = memory["supersedes_id"]
    return enriched


def semantic_payload(
    memory: dict[str, Any],
    hit: dict[str, Any],
    *,
    condition: str,
) -> dict[str, Any]:
    rank = int(hit["rank"])
    semantic_score = 1.0 / math.log2(float(rank) + 1.0)
    return {
        "memory_chunk_id": memory["memory_id"],
        "memory_type": memory.get("memory_type", "event_summary"),
        "content": memory["content"],
        "chapter_number": int(memory["chapter_number"]),
        "importance_score": float(memory.get("importance", 0.5)),
        "semantic_score": semantic_score,
        "entity_overlap_score": float(hit.get("entity_overlap_score", 0.0)),
        "temporal_score": float(hit.get("temporal_score", 0.0)),
        "relationship_score": float(hit.get("relationship_score", 0.0)),
        "hybrid_score": float(hit.get("hybrid_score", 0.0)),
        "source_key": f"corpus:{memory['memory_id']}",
        "metadata": memory_metadata(memory, condition=condition),
    }


def strip_new_provenance(context: dict[str, Any]) -> dict[str, Any]:
    cloned = json.loads(json.dumps(context, ensure_ascii=False, default=str))
    for memory in cloned.get("semantic_memories", []):
        metadata = memory.get("metadata", {})
        for key in NEW_PROVENANCE_KEYS:
            metadata.pop(key, None)
    return cloned


def build_instruction(query: dict[str, Any]) -> str:
    return (
        "Day la evaluation QA ve tinh nhat quan truyen, khong phai yeu cau sang tac tu do. "
        "Tra loi bang tieng Anh trong 2-5 cau, chi dua tren Story Brain duoc cung cap va "
        f"khong dung thong tin sau chapter cutoff {int(query['chapter_cutoff'])}. "
        "Neu semantic-memory metadata co provenance nhu tags, review_status, status hoac "
        "supersedes_id thi dung chung nhu bang chung ve replay/ambiguity; neu metadata "
        "khong co cac truong do thi khong duoc tu bia provenance. Neu cau hoi yeu cau "
        "first/origin, neu canonical/earliest answer truoc roi moi neu replay/variant. "
        f"Question: {query['query']}"
    )


def build_prompt(
    *,
    query: dict[str, Any],
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
    prompt_context = packer.prompt_context(packed)

    capture = PromptCaptureLLMService(
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    capture.generate_writing_draft(
        operation="continue",
        selected_text="",
        cursor_offset=0,
        instruction=build_instruction(query),
        context_package=prompt_context,
        style={},
        constraints=(
            "Use only Story Brain evidence at or before the supplied chapter cutoff.",
            "Do not invent provenance fields that are absent from the context.",
            "When evidence conflicts or repeats, distinguish chronology instead of silently merging it.",
        ),
    )
    return {
        "context": prompt_context,
        "system_prompt": capture.captured_system_prompt,
        "user_prompt": capture.captured_user_prompt,
        "context_hash": sha256_json(prompt_context),
        "prompt_hash": hashlib.sha256(
            (
                capture.captured_system_prompt
                + "\n\n"
                + capture.captured_user_prompt
            ).encode("utf-8")
        ).hexdigest(),
        "selected_memory_ids": list(
            packed.context_summary.get("semantic_memory_ids", [])
        ),
        "dropped_memory_ids": list(
            packed.context_summary.get("dropped_semantic_memory_ids", [])
        ),
        "tokens_used": packed.token_budget.get("used"),
        "token_budget": packed.token_budget.get("maximum"),
    }


def parse_draft_text(raw_output: str) -> str:
    cleaned = raw_output.strip()
    fence = chr(96) * 3
    if cleaned.startswith(fence):
        lines = cleaned.splitlines()
        if lines and lines[0].strip().startswith(fence):
            lines = lines[1:]
        if lines and lines[-1].strip() == fence:
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()
    try:
        value = json.loads(cleaned)
        if isinstance(value, dict):
            return str(
                value.get("draft_text")
                or value.get("draft")
                or value.get("answer")
                or cleaned
            ).strip()
    except Exception:
        pass
    return cleaned


def call_exact_model(
    llm: LLMClient,
    *,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int,
    max_attempts: int = 3,
) -> tuple[str, float, int]:
    backoff_count = 0
    last_error: Exception | None = None
    for attempt in range(max_attempts):
        started = time.perf_counter()
        try:
            output = llm.generate(
                prompt=user_prompt,
                system_prompt=system_prompt,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            latency_ms = (time.perf_counter() - started) * 1000.0
            return output, latency_ms, backoff_count
        except LLMClientError as exc:
            last_error = exc
            message = str(exc).lower()
            retryable = any(
                token in message
                for token in ("429", "quota", "rate limit", "temporar")
            )
            if not retryable or attempt + 1 >= max_attempts:
                raise
            delay = float(2 ** (attempt + 1))
            backoff_count += 1
            time.sleep(delay)
    raise RuntimeError(str(last_error))


def blind_labels(case_id: str, repeat: int) -> dict[str, str]:
    digest = hashlib.sha256(f"{case_id}:{repeat}".encode("utf-8")).digest()
    if digest[0] % 2 == 0:
        return {"X": "pre_provenance", "Y": "post_provenance"}
    return {"X": "post_provenance", "Y": "pre_provenance"}


def render_rubric() -> str:
    lines = [
        "# EVAL-01D Blind Review Rubric",
        "",
        "Review review-blind.json before opening condition-key.json.",
        "",
        "Do not score stylistic preference. Score narrative evidence handling.",
        "",
        "For each X/Y output record:",
        "",
        "- canonical/earliest answer correct: PASS | PARTIAL | FAIL;",
        "- replay/ambiguous evidence handled correctly: PASS | PARTIAL | FAIL;",
        "- chronology/causality correct: PASS | PARTIAL | FAIL;",
        "- future leakage: NONE | PRESENT;",
        "- unsupported claim: NONE | PRESENT;",
        "- answer completeness: PASS | PARTIAL | FAIL.",
        "",
        "Record a short evidence-based reason. Do not infer the hidden condition.",
        "",
        "## Case criteria",
        "",
    ]
    for case_id, rubric in RUBRIC.items():
        lines.append(f"### {case_id} - {rubric['role']}")
        lines.append("")
        lines.append("Must support:")
        for item in rubric["must_support"]:
            lines.append(f"- {item}")
        lines.append("")
        lines.append("Must avoid:")
        for item in rubric["must_avoid"]:
            lines.append(f"- {item}")
        lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--stdout-only", action="store_true")
    parser.add_argument("--repeats", type=int, default=int(os.getenv("EVAL01D_REPEATS", "3")))
    parser.add_argument("--model", default=os.getenv("EVAL01D_MODEL", "gemini-3.5-flash-lite"))
    parser.add_argument("--temperature", type=float, default=float(os.getenv("EVAL01D_TEMPERATURE", "0.0")))
    parser.add_argument("--max-tokens", type=int, default=int(os.getenv("EVAL01D_MAX_TOKENS", "512")))
    parser.add_argument("--key-slot", type=int, default=int(os.getenv("EVAL_GEMINI_KEY_SLOT", "1")))
    parser.add_argument("--inter-call-seconds", type=float, default=float(os.getenv("EVAL01D_INTER_CALL_SECONDS", "1.2")))
    args = parser.parse_args()

    retrieval_rows = load_json(
        ROOT / "docs" / "development"
        / "EVAL-01-AETHELGARD-RUNTIME-BASELINE"
        / "retrieval-raw.json"
    )
    frozen = load_json(ROOT / ".data" / "Frozen_v1" / "retrieval_queries.json")
    canonical = load_json(
        ROOT / ".data" / "Frozen_v1" / "memory_chunks_canonical.json"
    )["memories"]
    audit = load_json(ROOT / ".data" / "Frozen_v1" / "memory_chunks.json")["memories"]

    query_map = {
        f"{query['split']}:{query['query_id']}": query
        for query in frozen["queries"]
    }
    canonical_map = {memory["memory_id"]: memory for memory in canonical}
    audit_map = {memory["memory_id"]: memory for memory in audit}

    built_cases: list[dict[str, Any]] = []
    prompt_diff_cases: list[dict[str, Any]] = []

    for case_id in CASE_IDS:
        row = next(item for item in retrieval_rows if item["case_id"] == case_id)
        query = query_map[case_id]
        memory_map = audit_map if row["corpus"] == "audit_232" else canonical_map
        top10 = row["hybrid_top20"][:10]

        prompts: dict[str, Any] = {}
        for condition in ("pre_provenance", "post_provenance"):
            payloads = [
                semantic_payload(
                    memory_map[hit["memory_id"]],
                    hit,
                    condition=condition,
                )
                for hit in top10
            ]
            prompts[condition] = build_prompt(
                query=query,
                payloads=payloads,
                model=args.model,
                temperature=args.temperature,
                max_tokens=args.max_tokens,
            )

        pre = prompts["pre_provenance"]
        post = prompts["post_provenance"]
        normalized_post = strip_new_provenance(post["context"])
        only_provenance_diff = sha256_json(pre["context"]) == sha256_json(normalized_post)
        same_selected_ids = pre["selected_memory_ids"] == post["selected_memory_ids"]
        same_dropped_ids = pre["dropped_memory_ids"] == post["dropped_memory_ids"]
        same_system_prompt = pre["system_prompt"] == post["system_prompt"]

        prompt_diff_cases.append(
            {
                "case_id": case_id,
                "only_new_provenance_fields_differ": only_provenance_diff,
                "same_selected_memory_ids": same_selected_ids,
                "same_dropped_memory_ids": same_dropped_ids,
                "same_system_prompt": same_system_prompt,
                "pre_context_hash": pre["context_hash"],
                "post_context_hash": post["context_hash"],
                "pre_prompt_hash": pre["prompt_hash"],
                "post_prompt_hash": post["prompt_hash"],
                "pre_tokens_used": pre["tokens_used"],
                "post_tokens_used": post["tokens_used"],
                "token_overhead": int(post["tokens_used"] or 0) - int(pre["tokens_used"] or 0),
                "selected_memory_ids": pre["selected_memory_ids"],
            }
        )
        if not all((only_provenance_diff, same_selected_ids, same_dropped_ids, same_system_prompt)):
            raise RuntimeError(f"A/B isolation contract failed for {case_id}")

        built_cases.append(
            {
                "case_id": case_id,
                "query": query,
                "corpus": row["corpus"],
                "prompts": prompts,
            }
        )

    dry_summary = {
        "experiment_id": "EVAL-01D",
        "mode": "dry_run" if args.dry_run else "live",
        "case_count": len(built_cases),
        "conditions": ["pre_provenance", "post_provenance"],
        "repeats": args.repeats,
        "planned_live_calls": 0 if args.dry_run else len(built_cases) * 2 * args.repeats,
        "model": args.model,
        "temperature": args.temperature,
        "prompt_isolation_pass": all(
            item["only_new_provenance_fields_differ"]
            and item["same_selected_memory_ids"]
            and item["same_dropped_memory_ids"]
            and item["same_system_prompt"]
            for item in prompt_diff_cases
        ),
        "quality_scoring": "REVIEW_REQUIRED",
    }

    if args.dry_run:
        print(json.dumps(
            {
                **dry_summary,
                "prompt_diff_cases": prompt_diff_cases,
            },
            indent=2,
            ensure_ascii=False,
        ))
        return 0

    slot_label, api_key = load_fixed_key_slot(args.key_slot)
    llm = LLMClient(
        provider="gemini",
        model=args.model,
        api_key=api_key,
        timeout_seconds=60,
    )

    raw_generations: list[dict[str, Any]] = []
    blind_records: list[dict[str, Any]] = []
    condition_key: list[dict[str, Any]] = []
    backoff_events = 0

    for case in built_cases:
        case_id = case["case_id"]
        for repeat in range(1, args.repeats + 1):
            mapping = blind_labels(case_id, repeat)
            outputs_by_condition: dict[str, dict[str, Any]] = {}
            for condition in ("pre_provenance", "post_provenance"):
                prompt = case["prompts"][condition]
                record = {
                    "case_id": case_id,
                    "repeat": repeat,
                    "condition": condition,
                    "model_requested": args.model,
                    "temperature": args.temperature,
                    "chapter_cutoff": int(case["query"]["chapter_cutoff"]),
                    "query": case["query"]["query"],
                    "prompt_hash": prompt["prompt_hash"],
                    "context_hash": prompt["context_hash"],
                    "selected_memory_ids": prompt["selected_memory_ids"],
                    "execution_status": "ERROR",
                    "latency_ms": None,
                    "backoff_count": 0,
                    "raw_output": "",
                    "draft_text": "",
                    "quality_evaluation": {
                        "status": "REVIEW_REQUIRED",
                        "reason": "Harness never self-scores generation quality.",
                    },
                }
                try:
                    raw_output, latency_ms, backoffs = call_exact_model(
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
                    record["draft_text"] = parse_draft_text(raw_output)
                    backoff_events += backoffs
                except Exception as exc:
                    record["error"] = str(exc)
                raw_generations.append(record)
                outputs_by_condition[condition] = record
                time.sleep(max(0.0, args.inter_call_seconds))

            blind_pair: dict[str, Any] = {
                "case_id": case_id,
                "repeat": repeat,
                "query": case["query"]["query"],
                "chapter_cutoff": int(case["query"]["chapter_cutoff"]),
                "rubric_role": RUBRIC[case_id]["role"],
                "outputs": {},
            }
            key_record = {
                "case_id": case_id,
                "repeat": repeat,
                "mapping": mapping,
            }
            for blind_label, condition in mapping.items():
                source = outputs_by_condition[condition]
                blind_pair["outputs"][blind_label] = {
                    "execution_status": source["execution_status"],
                    "draft_text": source["draft_text"],
                    "latency_ms": source["latency_ms"],
                }
            blind_records.append(blind_pair)
            condition_key.append(key_record)

    success_count = sum(
        item["execution_status"] == "SUCCESS"
        for item in raw_generations
    )
    condition_latency: dict[str, dict[str, Any]] = {}
    for condition in ("pre_provenance", "post_provenance"):
        values = sorted(
            float(item["latency_ms"])
            for item in raw_generations
            if item["condition"] == condition
            and item["execution_status"] == "SUCCESS"
            and item["latency_ms"] is not None
        )
        condition_latency[condition] = {
            "sample_count": len(values),
            "mean_ms": sum(values) / len(values) if values else None,
            "p50_ms": values[len(values) // 2] if values else None,
            "max_ms": max(values) if values else None,
        }

    runtime_config = {
        "experiment_id": "EVAL-01D",
        "name": "Provenance-Aware Generation A/B",
        "live_provider": "gemini",
        "model": args.model,
        "temperature": args.temperature,
        "max_tokens": args.max_tokens,
        "fixed_key_slot": slot_label,
        "key_rotation": False,
        "repeats": args.repeats,
        "case_ids": list(CASE_IDS),
        "production_prompt_renderer": "core.llm_service.LLMService.generate_writing_draft",
        "provider_call_path": "core.llm_client.LLMClient exact-model REST",
        "fallback_model": None,
        "token_cost_status": "not_measured",
        "quality_scoring": "REVIEW_REQUIRED",
    }

    latency = {
        "status": "measured",
        "by_condition": condition_latency,
        "backoff_events": backoff_events,
        "provider_token_usage": "not_measured",
        "provider_cost": "not_measured",
    }

    summary_lines = [
        "# EVAL-01D Provenance-Aware Generation A/B",
        "",
        f"- Model: {args.model}",
        f"- Fixed key slot: {slot_label}",
        f"- Temperature: {args.temperature}",
        f"- Repeats per condition/case: {args.repeats}",
        f"- Planned calls: {len(built_cases) * 2 * args.repeats}",
        f"- Successful calls: {success_count}",
        f"- Prompt isolation: {'PASS' if dry_summary['prompt_isolation_pass'] else 'FAIL'}",
        f"- Provider backoff events: {backoff_events}",
        "",
        "## Interpretation boundary",
        "",
        "This harness does not score which condition is better.",
        "Review review-blind.json using review-rubric.md before opening condition-key.json.",
        "The A/B branches keep query, cutoff, top-10 candidate IDs/order/content, system prompt,",
        "model, temperature and constraints identical. Post-provenance adds only the compact",
        "metadata fields introduced by EVAL-01C-PROV.",
        "",
        "## Out of scope",
        "",
        "- No retrieval reranking.",
        "- No hybrid-weight change.",
        "- No embedding/model change.",
        "- No frozen-label change.",
        "- No automatic dual-lane prompt implementation.",
        "- No self-awarded generation score.",
        "",
    ]

    if not args.stdout_only:
        EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
        (EVIDENCE_DIR / "runtime-config.json").write_text(
            json.dumps(runtime_config, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        (EVIDENCE_DIR / "prompt-diff-audit.json").write_text(
            json.dumps(prompt_diff_cases, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        (EVIDENCE_DIR / "raw-generations.json").write_text(
            json.dumps(raw_generations, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        (EVIDENCE_DIR / "review-blind.json").write_text(
            json.dumps(blind_records, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        (EVIDENCE_DIR / "condition-key.json").write_text(
            json.dumps(condition_key, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        (EVIDENCE_DIR / "review-rubric.md").write_text(
            render_rubric() + "\n",
            encoding="utf-8",
        )
        (EVIDENCE_DIR / "latency-cost.json").write_text(
            json.dumps(latency, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        (EVIDENCE_DIR / "summary.md").write_text(
            "\n".join(summary_lines),
            encoding="utf-8",
        )

    print(json.dumps(
        {
            **dry_summary,
            "fixed_key_slot": slot_label,
            "success_count": success_count,
            "backoff_events": backoff_events,
            "evidence_dir": str(EVIDENCE_DIR.relative_to(ROOT)),
        },
        indent=2,
        ensure_ascii=False,
    ))
    return 0 if success_count == len(raw_generations) else 2


if __name__ == "__main__":
    raise SystemExit(main())
