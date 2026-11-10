"""
Deterministic Fake LLM Service for local orchestration, Docker demo, and testing without real API keys or network latency.
Conforms to the LLMService interface expected by EntityPipeline, EventSummarizer, WritingService, and StateTransitionProposals.
"""

from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger("fake-llm")


class FakeDeterministicLLMService:
    def extract_setup_text(self, *, text, locale):
        """Offline fixture grammar only; unsupported natural prose fails visibly.

        This is not an NLP quality implementation or a paid-provider fallback.
        """
        import re
        entities = []
        for match in re.finditer(r"\[(character|location):([^\]\n]+)\]", text):
            name = match.group(2)
            entities.append(dict(entity_type=match.group(1), display_name=name,
                source_ref=dict(kind='setup_span', field_path='/setup/text',
                    offset_kind='unicode_codepoints', start=match.start(2), end=match.end(2), quote=name)))
        if not entities:
            raise ValueError('Fake fixture grammar unavailable for this prose')
        return dict(entities=entities, world_rules=[])

    def suggest_setup_blueprint(self, *, setup, outline, preferences, locale):
        """Use the existing explicitly fake generator, with no private settings."""
        value = self.generate_story_blueprint(idea=setup['text'], outline=outline,
                                             preferences=preferences, author_constraints=[])
        return dict(entities=[dict(entity_type=e.get('entity_type', e.get('type')),
                                  display_name=e['name']) for e in value['entities']],
                    world_rules=value['world_rules'])

    def _call_structured(self, *, operation, system_prompt, user_prompt):
        if operation == 'entity_candidate_verification':
            data = json.loads(user_prompt)
            known = {e['name']: e for e in data['known_entities']}
            return json.dumps({'decisions': [dict(candidate_id=c['candidate_id'],
                verdict='entity', entity_type=known.get(c['surface'], {}).get('entity_type', 'PER'),
                canonical_name=c['surface'], canonical_entity_id=known.get(c['surface'], {}).get('entity_id', ''),
                reason='Deterministic fake occurrence for human review') for c in data['candidates']]})
        if operation == 'hitl_event_extraction':
            data = json.loads(user_prompt)
            refs = [e['entity_id'] if isinstance(e, dict) else e for e in data['known_entities']]
            return json.dumps({'events': [{'event_type': 'observation',
                'summary': data['source_text'], 'participants': refs,
                'locations': [], 'consequences': [], 'quote': data['source_text']}]})
        if operation == 'hitl_state_extraction':
            data = json.loads(user_prompt)
            participants = data['participants']
            transitions = [{'entity':participants[0], 'attribute_key':'health', 'new_value':60, 'confidence':1}] if participants else []
            if len(participants) > 1:
                transitions.append({'entity':participants[0], 'attribute_key':'active_relationships',
                    'new_value':{participants[1]:'knows'}, 'confidence':1})
            return json.dumps({'transitions':transitions})
        if operation == 'prose_fact_extraction':
            data = json.loads(user_prompt)
            return json.dumps({'facts': [{'fact_key': 'source_observation',
                'fact_value': data['source_text'], 'subject': '', 'certainty': 'confirmed',
                'quote': data['source_text'], 'confidence': 1.0}]})
        if operation == 'brainstorm_suggestions':
            data = json.loads(user_prompt)
            instruction = data.get("instruction", "")
            known = data.get("known_entities", [])
            rules = data.get("world_rules", [])
            curr_ch = data.get("current_chapter", 1)
            target_ch = data.get("target_chapter") or (curr_ch + 1)
            target = data.get("target", "all")
            res = self.suggest_brainstorm(
                instruction=instruction,
                known_entities=known,
                world_rules=rules,
                current_chapter=curr_ch,
                target_chapter=target_ch,
                target=target,
            )
            return json.dumps(res) if isinstance(res, (dict, list)) else str(res)
        return self._call_llm(system_prompt=system_prompt, user_prompt=user_prompt)

    def __init__(self, model: str = "fake-p4-model") -> None:
        self.model = model
        self.provider = "fake"
        self.last_call: dict[str, Any] = {}
        self.call_count: int = 0

    def _call_llm(self, *, system_prompt: str, user_prompt: str) -> str:
        prompt_lower = (system_prompt + " " + user_prompt).lower()

        # 1. State Transitions extraction
        if "transitions array" in prompt_lower or "attribute_key" in prompt_lower:
            logger.info("Fake LLM returning deterministic state transitions")
            if "mạc gia" in prompt_lower or "trận pháp" in prompt_lower:
                return json.dumps(
                    {
                        "transitions": [
                            {
                                "entity": "Hải Ba Đông",
                                "attribute_key": "health",
                                "new_value": 40,
                                "confidence": 0.95,
                            }
                        ]
                    }
                )
            return json.dumps(
                {
                    "transitions": [
                        {
                            "entity": "Hải Ba Đông",
                            "attribute_key": "health",
                            "new_value": 60,
                            "confidence": 0.95,
                        },
                        {
                            "entity": "Hải Ba Đông",
                            "attribute_key": "active_relationships",
                            "new_value": {"Tiêu Viêm": "rival"},
                            "confidence": 0.90,
                        },
                    ]
                }
            )

        # 2. Event extraction
        if "narrative event" in prompt_lower or "events array" in prompt_lower:
            logger.info("Fake LLM returning deterministic narrative events")
            if "mạc gia" in prompt_lower or "mac gia" in prompt_lower:
                return json.dumps(
                    {
                        "events": [
                            {
                                "event_type": "injury",
                                "participants": ["Tiêu Viêm", "Hải Ba Đông"],
                                "summary": "Hải Ba Đông bị thương nhẹ khi phá trận pháp tại Mạc Gia",
                                "locations": ["Mạc Gia"],
                                "consequences": ["Hải Ba Đông hao tổn sinh lực"],
                                "emotion_tags": ["thận trọng"],
                                "importance_score": 0.80,
                            }
                        ]
                    }
                )
            return json.dumps(
                {
                    "events": [
                        {
                            "event_type": "battle",
                            "participants": ["Tiêu Viêm", "Hải Ba Đông"],
                            "summary": "Tiêu Viêm kịch chiến Hải Ba Đông tại sa mạc Tháp Qua Nhĩ",
                            "locations": ["Sa mạc Tháp Qua Nhĩ"],
                            "consequences": ["Hải Ba Đông bị thương nặng"],
                            "emotion_tags": ["căng thẳng"],
                            "importance_score": 0.85,
                        }
                    ]
                }
            )

        # 3. Entity extraction
        if "named entities" in prompt_lower or "fantasy novel analyst" in prompt_lower:
            logger.info("Fake LLM returning deterministic entities")
            entities = []
            if "tiêu viêm" in prompt_lower:
                entities.append({"phrase": "Tiêu Viêm", "entity": "PER", "score": 9.5})
            if "hải ba đông" in prompt_lower:
                entities.append({"phrase": "Hải Ba Đông", "entity": "PER", "score": 9.0})
            if "tháp qua nhĩ" in prompt_lower:
                entities.append({"phrase": "Tháp Qua Nhĩ", "entity": "LOC", "score": 8.5})
            if "mạc gia" in prompt_lower:
                entities.append({"phrase": "Mạc Gia", "entity": "LOC", "score": 8.0})
            if not entities:
                entities.append({"phrase": "Tiêu Viêm", "entity": "PER", "score": 9.5})
            return json.dumps(entities)

        # 4. Story Blueprint / Idea Bootstrap
        if "story blueprint" in prompt_lower or "idea bootstrap" in prompt_lower or "blueprint" in prompt_lower:
            logger.info("Fake LLM returning deterministic story blueprint")
            return json.dumps(
                {
                    "premise": "Một pháp sư mất trí nhớ điều tra cái chết của chính mình.",
                    "world_rules": [
                        "Ma pháp tiêu hao sinh mệnh lực, cấm kỵ thuật sẽ bị nguyền rủa vĩnh viễn.",
                        "Linh hồn không thể rời khỏi thể xác quá ba ngày mà không tiêu tán.",
                    ],
                    "entities": [
                        {"name": "Arthur", "entity_type": "character", "score": 9.5},
                        {"name": "Elena", "entity_type": "character", "score": 9.0},
                        {"name": "Học Viện Tháp Cổ", "entity_type": "location", "score": 8.5},
                    ],
                    "author_constraints": [
                        "Không có du hành thời gian",
                    ],
                }
            )

        logger.warning("Unrecognized prompt in Fake LLM, returning empty object")
        return json.dumps({})

    def generate_story_blueprint(
        self,
        *,
        idea: str,
        outline: str | None = None,
        preferences: dict[str, Any] | None = None,
        author_constraints: list[str] | None = None,
    ) -> dict[str, Any]:
        self.last_call = {
            "operation": "generate_story_blueprint",
            "idea": idea,
            "outline": outline,
            "preferences": preferences,
            "author_constraints": author_constraints,
        }
        entities = [
            {"name": "Arthur", "entity_type": "character", "score": 9.5},
            {"name": "Elena", "entity_type": "character", "score": 9.0},
            {"name": "Học Viện Tháp Cổ", "entity_type": "location", "score": 8.5},
        ]
        world_rules = [
            "Ma pháp tiêu hao sinh mệnh lực, cấm kỵ thuật sẽ bị nguyền rủa vĩnh viễn.",
            "Linh hồn không thể rời khỏi thể xác quá ba ngày mà không tiêu tán.",
        ]
        return {
            "premise": idea,
            "world_rules": world_rules,
            "entities": entities,
            "author_constraints": author_constraints or ["Không có du hành thời gian"],
            "model_info": {"model": self.model, "provider": "fake"},
        }

    def generate_writing_draft(
        self,
        *,
        operation: str,
        selected_text: str = "",
        cursor_offset: int = 0,
        instruction: str = "",
        context_package: dict[str, Any] | None = None,
        start_offset: int | None = None,
        end_offset: int | None = None,
        style: dict[str, Any] | None = None,
        constraints: list[str] | tuple[str, ...] | None = None,
    ) -> dict[str, Any]:
        self.last_call = {
            "operation": operation,
            "selected_text": selected_text,
            "cursor_offset": cursor_offset,
            "instruction": instruction,
            "context_package": context_package,
            "start_offset": start_offset,
            "end_offset": end_offset,
            "style": style,
            "constraints": constraints,
        }

        instruction_lower = (instruction or "").lower()
        if "dead character test" in instruction_lower or "hải ba đông sống lại" in instruction_lower:
            draft_text = "Hải Ba Đông đứng dậy cười lớn: 'Ta vẫn chưa chết đâu!'"
            patch_start = cursor_offset
            patch_end = cursor_offset
        elif "dịch chuyển kết giới" in instruction_lower or "teleport" in instruction_lower:
            draft_text = "Tiêu Viêm lập tức kích hoạt dịch chuyển tức thời xuyên qua kết giới phong tỏa."
            patch_start = cursor_offset
            patch_end = cursor_offset
        elif operation == "continue":
            draft_text = "Tiêu Viêm thở dài một hơi, chậm rãi thu hồi Dị Hỏa, ánh mắt nhìn về phía chân trời xa xăm."
            patch_start = cursor_offset
            patch_end = cursor_offset
        elif operation == "rewrite":
            draft_text = f"Đoạn văn được viết lại một cách hoa mỹ: {selected_text.strip()}"
            patch_start = start_offset if start_offset is not None else 0
            patch_end = end_offset if end_offset is not None else len(selected_text)
        elif operation == "describe":
            draft_text = "Không gian xung quanh tràn ngập hàn khí lạnh buốt, từng bông tuyết khổng lồ bay lượn giữa không trung."
            patch_start = cursor_offset
            patch_end = cursor_offset
        elif operation == "dialogue":
            draft_text = '"Ngươi rốt cuộc là ai?" Tiêu Viêm trầm giọng hỏi, bàn tay khẽ siết chặt huyền trọng xích.'
            patch_start = cursor_offset
            patch_end = cursor_offset
        else:
            draft_text = f"Bản thảo sinh tự động: {instruction}"
            patch_start = cursor_offset
            patch_end = cursor_offset

        return {
            "draft_text": draft_text,
            "patch": {
                "start": patch_start,
                "end": patch_end,
                "replacement": draft_text,
            },
            "model_info": {"model": self.model, "provider": "fake"},
        }

    def suggest_brainstorm(
        self,
        *,
        instruction: str = "",
        known_entities: list[dict[str, Any]] | None = None,
        world_rules: list[str] | None = None,
        current_chapter: int = 1,
        target_chapter: int | None = None,
        target: str = "all",
    ) -> dict[str, Any]:
        self.call_count += 1
        self.last_call = {
            "operation": "suggest_brainstorm",
            "instruction": instruction,
            "known_entities": known_entities,
            "world_rules": world_rules,
            "current_chapter": current_chapter,
            "target_chapter": target_chapter,
            "target": target,
        }
        inst_lower = (instruction or "").lower()

        # Simulated provider quota exhaustion (429 / resource exhausted)
        if "test_quota_exhausted" in inst_lower or "test_429" in inst_lower:
            raise RuntimeError("429 Resource exhausted: Quota exceeded for model fake-model")

        # Simulated malformed JSON / corrupted output
        if "test_malformed_json" in inst_lower:
            return "MALFORMED_OUTPUT_{invalid_json"  # type: ignore

        # Simulated empty output
        if "test_empty_output" in inst_lower:
            return {"world_rules": [], "characters": [], "future_events": []}

        # Simulated adversarial: item is string not dict
        if "test_adversarial_string_item" in inst_lower:
            return {"world_rules": ["just a string instead of dict"], "characters": [], "future_events": []}

        # Simulated adversarial: oversized array (>20 items)
        if "test_adversarial_oversized_array" in inst_lower:
            return {
                "world_rules": [{"text": f"Quy tắc {i}", "fact_key": f"rule_{i}"} for i in range(50)],
                "characters": [],
                "future_events": [],
            }

        # Simulated adversarial: invalid target_chapter (string/malformed)
        if "test_adversarial_bad_chapter" in inst_lower:
            return {
                "world_rules": [],
                "characters": [],
                "future_events": [{"title": "Future Event", "target_chapter": "not-an-int"}],
            }

        # Simulated adversarial: returns mixed categories when requested target is specific
        if "test_adversarial_mixed_targets" in inst_lower:
            return {
                "world_rules": [{"text": "Leaked rule", "fact_key": "world_rule_leaked"}],
                "characters": [{"name": "Leaked character", "canonical_name": "Leaked character"}],
                "future_events": [{"title": "Leaked event", "target_chapter": 2, "participants": []}],
            }

        # Simulated fabricated identity: model invents an ungrounded entity_id
        if "test_fabricated_identity" in inst_lower:
            return {
                "world_rules": [],
                "characters": [],
                "future_events": [
                    {
                        "title": "Bí mật phản bội",
                        "description": "Một kẻ bí ẩn mang thân phận giả mạo xuất hiện.",
                        "target_chapter": target_chapter or (current_chapter + 1),
                        "ending": False,
                        "min_words": 1500,
                        "participants": [
                            {"entity_id": "00000000-0000-0000-0000-ffffffffffff", "name_hint": None}
                        ],
                    }
                ],
            }

        # Standard deterministic suggestions
        rules = [
            {
                "fact_key": "world_rule_tinh_than_luc",
                "text": "Tinh Thần Lực đạt tới Cảnh giới Linh Cảnh mới có thể luyện chế đan dược Lục Phẩm.",
                "category": "magic_system",
            },
            {
                "fact_key": "world_rule_dia_ma_lac",
                "text": "Địa Ma Lạc là cấm địa cổ xưa thuộc Hắc Giác Vực, nơi không gian thường xuyên vặn vẹo.",
                "category": "geography",
            },
        ]

        chars = [
            {
                "name": "Mộc Lan Tam Trưởng Lão",
                "canonical_name": "Mộc Lan Tam Trưởng Lão",
                "entity_type": "character",
                "role": "antagonist",
                "description": "Ba vị trưởng lão của Mộc Lan Cốc, tu luyện Tam Thú Đao Pháp phối hợp hoàn hảo.",
                "archetype": "Tam vị nhất thể",
                "aliases": ["Mộc Lan Trưởng Lão"],
            },
            {
                "name": "Bạch Vân Tiên Tử",
                "canonical_name": "Bạch Vân Tiên Tử",
                "entity_type": "character",
                "role": "ally",
                "description": "Luyện dược sư ngũ phẩm thanh nhã, quen biết Hải Ba Đông từ thời trẻ.",
                "archetype": "Ẩn sĩ",
                "aliases": ["Bạch Vân"],
            },
        ]

        first_entity_id = None
        if known_entities:
            first_entity_id = known_entities[0].get("entity_id")

        events = [
            {
                "title": "Hội ngộ tại Hắc Giác Vực",
                "description": "Tiêu Viêm bí mật thâm nhập Hắc Giác Vực để tìm kiếm Dược liệu quý hiếm.",
                "target_chapter": target_chapter or (current_chapter + 1),
                "ending": False,
                "min_words": 2000,
                "participants": [
                    {"entity_id": first_entity_id, "name_hint": None}
                    if first_entity_id
                    else {"entity_id": None, "name_hint": "Tiêu Viêm"},
                    {"entity_id": None, "name_hint": "Mộc Lan Tam Trưởng Lão"},
                ],
            },
            {
                "title": "Đại chiến tại Địa Ma Lạc",
                "description": "Cuộc chạm trán bất ngờ giữa các phe phái tranh đoạt bí bảo.",
                "target_chapter": (target_chapter or (current_chapter + 1)) + 1,
                "ending": False,
                "min_words": 2500,
                "participants": [
                    {"entity_id": None, "name_hint": "Bạch Vân Tiên Tử"},
                ],
            },
        ]

        result: dict[str, Any] = {}
        if target in ("all", "world_rules"):
            result["world_rules"] = rules
        if target in ("all", "characters"):
            result["characters"] = chars
            result["character_seeds"] = chars
        if target in ("all", "future_events"):
            result["future_events"] = events
            result["events"] = events

        return result

