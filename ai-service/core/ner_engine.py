import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import torch
from transformers import AutoModelForTokenClassification, AutoTokenizer


logger = logging.getLogger(__name__)


class ModelLoadError(RuntimeError):
    """Raised when model files cannot be loaded."""


class InferenceError(RuntimeError):
    """Raised when NER inference fails."""


@dataclass
class _WordPrediction:
    text: str
    label: str
    score: float


class NEREngine:
    def __init__(self, model_dir: str | Path, max_length: int = 512) -> None:
        self.model_dir = Path(model_dir)
        self.max_length = max_length
        self.inference_max_length = max_length
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model = None
        self.tokenizer = None
        self.id2label: dict[int, str] = {}

    def load(self) -> None:
        if self.model is not None and self.tokenizer is not None:
            return

        if not self.model_dir.exists():
            raise ModelLoadError(f"Model directory does not exist: {self.model_dir}")

        started = time.perf_counter()
        try:
            self.tokenizer = AutoTokenizer.from_pretrained(
                str(self.model_dir),
                local_files_only=True,
                use_fast=True,
            )
            self.model = AutoModelForTokenClassification.from_pretrained(
                str(self.model_dir),
                local_files_only=True,
            )
            self.model.to(self.device)
            self.model.eval()
            raw_id2label = getattr(self.model.config, "id2label", {})
            self.id2label = {int(k): v for k, v in raw_id2label.items()}
            self.inference_max_length = self._resolve_inference_max_length()
        except Exception as exc:
            raise ModelLoadError(f"Failed to load PhoBERT NER from {self.model_dir}: {exc}") from exc

        logger.info(
            "PhoBERT NER loaded from %s on %s in %.2f ms (inference_max_length=%d)",
            self.model_dir,
            self.device,
            (time.perf_counter() - started) * 1000.0,
            self.inference_max_length,
        )

    def extract_entities(self, text: str) -> list[dict[str, Any]]:
        if not text or not text.strip():
            raise ValueError("Input text must not be empty")
        if self.model is None or self.tokenizer is None:
            raise ModelLoadError("NER model has not been loaded")

        try:
            encoded = self.tokenizer(
                text,
                return_tensors="pt",
                truncation=True,
                max_length=self.inference_max_length,
                return_offsets_mapping=True,
            )
            offsets_tensor = encoded.pop("offset_mapping", None)
            encoded = {k: v.to(self.device) for k, v in encoded.items()}

            with torch.no_grad():
                logits = self.model(**encoded).logits

            probabilities = torch.softmax(logits, dim=-1)
            pred_ids = torch.argmax(probabilities, dim=-1)[0].tolist()
            pred_scores = torch.max(probabilities, dim=-1).values[0].tolist()
            input_ids = encoded["input_ids"][0].tolist()
            tokens = self.tokenizer.convert_ids_to_tokens(input_ids)

            if offsets_tensor is not None:
                offsets = offsets_tensor[0].tolist()
            else:
                offsets = []
                cursor = 0
                special_tokens = set(self.tokenizer.all_special_tokens)
                for token in tokens:
                    if token in special_tokens:
                        offsets.append([0, 0])
                        continue
                    token_piece = token.lstrip("▁").replace("@@", "")
                    piece_len = max(len(token_piece), 1)
                    offsets.append([cursor, cursor + piece_len])
                    cursor += piece_len

            words = self._merge_sub_tokens(tokens, pred_ids, pred_scores, offsets)
            return self._collect_entities(words)
        except (ModelLoadError, ValueError):
            raise
        except Exception as exc:
            raise InferenceError(f"Failed to run NER inference: {exc}") from exc

    def _resolve_inference_max_length(self) -> int:
        candidates: list[int] = []

        model_limit = getattr(self.model.config, "max_position_embeddings", None)
        if isinstance(model_limit, int) and model_limit > 2:
            candidates.append(model_limit - 2)

        tokenizer_limit = getattr(self.tokenizer, "model_max_length", None)
        if isinstance(tokenizer_limit, int) and 0 < tokenizer_limit < 1_000_000:
            candidates.append(tokenizer_limit)

        if isinstance(self.max_length, int) and self.max_length > 0:
            candidates.append(self.max_length)

        if not candidates:
            return 256
        return max(8, min(candidates))

    def predict(self, text: str) -> list[dict[str, Any]]:
        """Compatibility method for ner_model.predict(story_content)."""
        entities = self.extract_entities(text)
        normalized: list[dict[str, Any]] = []
        for item in entities:
            normalized.append(
                {
                    "word": str(item.get("Entity", "")),
                    "entity": str(item.get("Label", "")),
                    "score": float(item.get("Score", 0.0)),
                }
            )
        return normalized

    def _merge_sub_tokens(
        self,
        tokens: list[str],
        pred_ids: list[int],
        pred_scores: list[float],
        offsets: list[list[int]],
    ) -> list[_WordPrediction]:
        words: list[_WordPrediction] = []

        pieces: list[str] = []
        labels: list[str] = []
        scores: list[float] = []
        prev_end = -1
        prev_had_concat = False

        def flush() -> None:
            if not pieces:
                return
            best_idx = max(range(len(scores)), key=scores.__getitem__)
            words.append(
                _WordPrediction(
                    text="".join(pieces),
                    label=labels[best_idx],
                    score=float(scores[best_idx]),
                )
            )
            pieces.clear()
            labels.clear()
            scores.clear()

        for token, pred_id, score, offset in zip(tokens, pred_ids, pred_scores, offsets):
            start, end = int(offset[0]), int(offset[1])
            if start == end:
                continue

            label = self.id2label.get(int(pred_id), "O")
            cleaned = token.replace("<unk>", "")
            starts_new_word = cleaned.startswith("▁")
            cleaned = cleaned.lstrip("▁")
            has_concat = cleaned.endswith("@@")
            piece = cleaned[:-2] if has_concat else cleaned
            if not piece:
                continue

            should_flush = False
            if pieces:
                if starts_new_word or start > prev_end:
                    should_flush = True
                elif not prev_had_concat and start == prev_end:
                    should_flush = True
            if should_flush:
                flush()

            pieces.append(piece)
            labels.append(label)
            scores.append(float(score))
            prev_end = end
            prev_had_concat = has_concat

            if not has_concat:
                flush()

        flush()
        return words

    @staticmethod
    def _split_bio(label: str) -> tuple[str, str]:
        if label == "O":
            return "O", ""
        if "-" in label:
            prefix, entity_type = label.split("-", 1)
            return prefix, entity_type
        return "B", label

    def _collect_entities(self, words: list[_WordPrediction]) -> list[dict[str, Any]]:
        entities: list[dict[str, Any]] = []
        current_tokens: list[str] = []
        current_scores: list[float] = []
        current_tag = ""

        def flush_entity() -> None:
            if not current_tokens:
                return
            entities.append(
                {
                    "Entity": " ".join(current_tokens).strip(),
                    "Label": current_tag,
                    "Score": round(sum(current_scores) / len(current_scores), 6),
                }
            )
            current_tokens.clear()
            current_scores.clear()

        for word in words:
            prefix, tag = self._split_bio(word.label)

            if prefix == "O":
                flush_entity()
                current_tag = ""
                continue

            if prefix == "B":
                flush_entity()
                current_tag = tag
                current_tokens.append(word.text)
                current_scores.append(word.score)
                continue

            if prefix == "I":
                if current_tokens and current_tag == tag:
                    current_tokens.append(word.text)
                    current_scores.append(word.score)
                else:
                    flush_entity()
                    current_tag = tag
                    current_tokens.append(word.text)
                    current_scores.append(word.score)
                continue

            flush_entity()
            current_tag = tag
            current_tokens.append(word.text)
            current_scores.append(word.score)

        flush_entity()
        return entities