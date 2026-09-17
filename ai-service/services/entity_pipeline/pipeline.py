import json
import logging
import re
from typing import Any

from pydantic import ValidationError

from core.exceptions import EntityExtractionError
from core.structured_outputs import EntityExtractionOutput, ExtractedEntity, PipelineMetadata


logger = logging.getLogger("ai-service")


class EntityPipeline:
    """LLM-backed entity extraction with a versioned, validated output contract."""

    def __init__(
        self,
        ml_enabled: bool = False,
        pipeline_version: str = "entity-v1",
        prompt_version: str = "entity-extraction-v1",
    ) -> None:
        self.ml_enabled = False
        self.pipeline_version = pipeline_version
        self.prompt_version = prompt_version

    def run(self, text: str, threshold: float = 0.0, llm_service: Any = None) -> list[dict[str, Any]]:
        result = self.run_with_metadata(text=text, threshold=threshold, llm_service=llm_service)
        return [
            {
                **entity.model_dump(),
                "label": entity.entity,
            }
            for entity in result.entities
        ]

    def run_with_metadata(
        self,
        text: str,
        threshold: float = 0.0,
        llm_service: Any = None,
    ) -> EntityExtractionOutput:
        normalized_text = text.strip()
        metadata = PipelineMetadata(
            pipeline_version=self.pipeline_version,
            model_name=str(getattr(llm_service, "model", "disabled") or "disabled"),
            prompt_version=self.prompt_version,
        )
        if not normalized_text:
            return EntityExtractionOutput(entities=[], metadata=metadata)
        if llm_service is None:
            raise EntityExtractionError("LLM provider is unavailable")

        system_prompt = (
            "You are an expert fantasy novel analyst. Extract all named entities from the text. "
            "Classify each entity strictly as PER, LOC, ORG, ITEM, or SKILL. "
            "Return only a JSON array using this schema: "
            '[{"phrase":"Tiêu Viêm","entity":"PER","score":9.5}]. '
            "Score must be between 0 and 10. Do not include surrounding conjunctions or stopwords."
        )
        user_prompt = f"Text to analyze:\n\n{normalized_text}"

        try:
            raw_output = llm_service._call_llm(system_prompt=system_prompt, user_prompt=user_prompt)
        except Exception as exc:
            raise EntityExtractionError(f"provider call failed: {exc}") from exc

        parsed = self._parse_output(raw_output)
        normalized_items = self._normalize_items(parsed)

        try:
            entities = [ExtractedEntity.model_validate(item) for item in normalized_items]
        except ValidationError as exc:
            raise EntityExtractionError(f"model output failed schema validation: {exc}") from exc

        filtered_entities = [entity for entity in entities if entity.score >= threshold]
        filtered_entities.sort(key=lambda entity: entity.score, reverse=True)
        return EntityExtractionOutput(entities=filtered_entities, metadata=metadata)

    @staticmethod
    def _parse_output(raw_output: Any) -> list[Any]:
        if raw_output is None or not str(raw_output).strip():
            raise EntityExtractionError("provider returned empty output")

        cleaned = str(raw_output).strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
            cleaned = re.sub(r"\s*```$", "", cleaned)

        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            raise EntityExtractionError("model output is not valid JSON") from exc

        if isinstance(parsed, list):
            return parsed
        if isinstance(parsed, dict) and isinstance(parsed.get("entities"), list):
            return parsed["entities"]
        raise EntityExtractionError("model output must be an entity array or an object containing 'entities'")

    @staticmethod
    def _normalize_items(items: list[Any]) -> list[dict[str, Any]]:
        normalized: list[dict[str, Any]] = []
        for index, item in enumerate(items):
            if not isinstance(item, dict):
                raise EntityExtractionError(f"entity at index {index} must be an object")

            phrase = str(
                item.get("phrase")
                or item.get("word")
                or item.get("name")
                or item.get("entity_name")
                or ""
            ).strip()
            entity_type = str(item.get("type") or item.get("label") or item.get("entity") or "").upper().strip()
            raw_score = item.get("score", item.get("confidence", item.get("Score", 9.5)))
            try:
                score = float(raw_score)
            except (TypeError, ValueError) as exc:
                raise EntityExtractionError(f"entity score at index {index} must be numeric") from exc

            normalized.append({"phrase": phrase, "entity": entity_type, "score": score})
        return normalized
