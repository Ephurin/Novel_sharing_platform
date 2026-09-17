"""
Deterministic Fake LLM Service for testing without real API keys or network latency.
Conforms to the LLMService interface expected by EntityPipeline, EventSummarizer, and StateTransitionProposals.
"""

from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger("fake-llm")


class FakeDeterministicLLMService:
    def __init__(self, model: str = "fake-p4-model") -> None:
        self.model = model

    def _call_llm(self, *, system_prompt: str, user_prompt: str) -> str:
        prompt_lower = (system_prompt + " " + user_prompt).lower()

        # 1. State Transitions extraction
        if "transitions array" in prompt_lower or "attribute_key" in prompt_lower:
            logger.info("Fake LLM returning deterministic state transitions")
            # Check participants in event payload
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
            if "mạc gia" in prompt_lower:
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
                # Default generic PER
                entities.append({"phrase": "Tiêu Viêm", "entity": "PER", "score": 9.5})
            return json.dumps(entities)

        # Default fallback
        logger.warning("Unrecognized prompt in Fake LLM, returning empty object")
        return json.dumps({})
