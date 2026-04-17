import logging
import re
from typing import Any


logger = logging.getLogger(__name__)


class ConsistencyChecker:
    def __init__(self, low_confidence_threshold: float = 0.60) -> None:
        self.low_confidence_threshold = low_confidence_threshold

    def check_entities(self, text: str, entities: list[dict]) -> list[dict[str, str]]:
        warnings: list[dict[str, str]] = []

        normalized_labels: dict[str, str] = {}
        for entity in entities:
            name = str(entity.get("Entity", "")).strip()
            label = str(entity.get("Label", "")).strip()
            score = float(entity.get("Score", 0.0))

            if not name:
                warnings.append(
                    {
                        "code": "EMPTY_ENTITY",
                        "message": "One predicted entity is empty.",
                    }
                )
                continue

            if score < self.low_confidence_threshold:
                warnings.append(
                    {
                        "code": "LOW_CONFIDENCE",
                        "message": f"Entity '{name}' has low confidence score ({score:.3f}).",
                    }
                )

            lower_name = name.casefold()
            if text and lower_name not in text.casefold():
                warnings.append(
                    {
                        "code": "OUT_OF_TEXT",
                        "message": f"Entity '{name}' not found in source text.",
                    }
                )

            if lower_name in normalized_labels and normalized_labels[lower_name] != label:
                warnings.append(
                    {
                        "code": "LABEL_CONFLICT",
                        "message": (
                            f"Entity '{name}' has conflicting labels: "
                            f"{normalized_labels[lower_name]} vs {label}."
                        ),
                    }
                )
            else:
                normalized_labels[lower_name] = label

        return warnings


class ConsistencyEngine:
    """Validate story suggestions against graph-based character constraints."""

    def __init__(self) -> None:
        # Match common Vietnamese and English location prepositions near a character mention.
        self._location_patterns = [
            re.compile(r"\b(?:o|ở|tai|tại|in|at)\s+([\w\s\-]+)", re.IGNORECASE),
            re.compile(r"\b(?:den|đến|toi|tới)\s+([\w\s\-]+)", re.IGNORECASE),
        ]

    def validate_suggestion(self, suggestion: str, graph_data: dict[str, Any] | list[dict[str, Any]]) -> dict[str, Any]:
        if not suggestion or not suggestion.strip():
            return {
                "is_consistent": False,
                "action": "Regenerate",
                "errors": [
                    {
                        "code": "EMPTY_SUGGESTION",
                        "message": "Suggestion is empty.",
                    }
                ],
                "message": "Suggestion is empty. Ask LLMService to regenerate.",
                "regenerate_required": True,
            }

        records = self._normalize_graph_data(graph_data)
        suggestion_text = suggestion.strip()
        suggestion_lower = suggestion_text.casefold()

        errors: list[dict[str, str]] = []

        for item in records:
            name = item["name"]
            status = item["status"]
            location = item["location"]

            if name.casefold() not in suggestion_lower:
                continue

            if status.casefold() == "dead":
                errors.append(
                    {
                        "code": "CHARACTER_DEAD_CONFLICT",
                        "message": f"Character '{name}' appears in suggestion but graph status is Dead.",
                    }
                )

            location_conflict = self._detect_location_conflict(
                suggestion_text=suggestion_text,
                character_name=name,
                expected_location=location,
            )
            if location_conflict:
                errors.append(location_conflict)

        if errors:
            logger.info("Consistency conflict detected. regenerate_required=True errors=%s", errors)
            return {
                "is_consistent": False,
                "action": "Regenerate",
                "errors": errors,
                "message": "Detected conflicts with graph data. Ask LLMService to regenerate.",
                "regenerate_required": True,
            }

        logger.info("Consistency validated successfully. regenerate_required=False")
        return {
            "is_consistent": True,
            "action": "Accept",
            "errors": [],
            "message": "No conflicts detected.",
            "regenerate_required": False,
        }

    def _normalize_graph_data(self, graph_data: dict[str, Any] | list[dict[str, Any]]) -> list[dict[str, str]]:
        records: list[dict[str, str]] = []

        if isinstance(graph_data, dict):
            if isinstance(graph_data.get("characters"), list):
                source = graph_data.get("characters", [])
                for row in source:
                    records.extend(self._normalize_row(row))
                return records

            # Support map-style graph data: {"Tieu Viem": {"status": "Alive", "location": "Van Lam Tong"}}
            for key, value in graph_data.items():
                if isinstance(value, dict):
                    row = {
                        "name": key,
                        "status": value.get("status"),
                        "location": value.get("location"),
                    }
                    records.extend(self._normalize_row(row))
            return records

        if isinstance(graph_data, list):
            for row in graph_data:
                records.extend(self._normalize_row(row))

        return records

    def _normalize_row(self, row: Any) -> list[dict[str, str]]:
        if not isinstance(row, dict):
            return []

        name = str(row.get("name") or row.get("character") or row.get("entity") or "").strip()
        if not name:
            return []

        status = str(row.get("status") or "Unknown").strip()
        location = str(row.get("location") or row.get("current_location") or "").strip()

        return [
            {
                "name": name,
                "status": status,
                "location": location,
            }
        ]

    def _detect_location_conflict(
        self,
        suggestion_text: str,
        character_name: str,
        expected_location: str,
    ) -> dict[str, str] | None:
        if not expected_location:
            return None

        windows = self._character_windows(suggestion_text, character_name)
        for window in windows:
            detected_location = self._extract_location(window)
            if not detected_location:
                continue

            if detected_location.casefold() != expected_location.casefold():
                return {
                    "code": "LOCATION_CONFLICT",
                    "message": (
                        f"Character '{character_name}' expected at '{expected_location}' "
                        f"but suggestion indicates '{detected_location}'."
                    ),
                }

        return None

    def _character_windows(self, text: str, character_name: str) -> list[str]:
        text_lower = text.casefold()
        name_lower = character_name.casefold()
        windows: list[str] = []

        start = 0
        while True:
            idx = text_lower.find(name_lower, start)
            if idx < 0:
                break
            left = max(0, idx - 40)
            right = min(len(text), idx + len(character_name) + 80)
            windows.append(text[left:right])
            start = idx + len(character_name)

        return windows

    def _extract_location(self, text_window: str) -> str | None:
        for pattern in self._location_patterns:
            match = pattern.search(text_window)
            if not match:
                continue
            value = match.group(1).strip(" .,:;!?\n\t")
            if value:
                return value
        return None