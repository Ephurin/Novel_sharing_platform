"""Offsets are always computed on the original Unicode source, never a folded copy."""
import json
import logging
import re
from typing import Any

from core.structured_call import call_structured
from domain.errors import AnalysisOutputError

logger = logging.getLogger(__name__)


def find_mention(text: str, name: str):
    match = re.search(r"(?<!\w)" + re.escape(name) + r"(?!\w)", text, re.IGNORECASE)
    return (match.start(), match.end()) if match else None


def quote_span(text: str, quote: str):
    if not quote or not quote.strip():
        raise ValueError("An exact source quote is required")
    start = text.find(quote)
    if start < 0:
        raise ValueError("Evidence quote is not present in the source revision")
    if text.find(quote, start + 1) >= 0:
        raise ValueError("Evidence quote is ambiguous; include more surrounding text")
    return start, start + len(quote)


def resolve_grounded_quote(
    text: str,
    quote: str,
    *,
    context_hint: str = "",
    llm_service: Any = None,
    max_retries: int = 2,
) -> tuple[int, int, str]:
    """
    Validates quote against text using quote_span.
    If the quote fails (e.g. contains omissions '[...]', altered punctuation, or non-contiguous spans),
    performs bounded retry asking the LLM for the exact verbatim contiguous substring,
    followed by heuristic subsegment matching if needed.
    Raises ValueError if the quote cannot be grounded in text.
    """
    if not quote or not str(quote).strip():
        raise ValueError("An exact source quote is required")

    quote_str = str(quote).strip()

    # 1. Fast path: direct exact match
    try:
        start, end = quote_span(text, quote_str)
        return start, end, quote_str
    except ValueError:
        pass

    # 2. Fast heuristic: trimmed outer quotation marks / whitespace
    cleaned = quote_str.strip(" \t\r\n\"'“”‘’`")
    if cleaned and cleaned != quote_str:
        try:
            start, end = quote_span(text, cleaned)
            return start, end, cleaned
        except ValueError:
            pass

    # 2b. Whitespace-tolerant verbatim matching (handles collapsed newlines/spaces from LLMs)
    words = cleaned.split() if cleaned else quote_str.split()
    if words and len(words) >= 3:
        pattern = r"\s+".join(re.escape(w) for w in words)
        try:
            matches = list(re.finditer(pattern, text))
            if len(matches) == 1:
                m = matches[0]
                start, end = m.span()
                verbatim = text[start:end]
                logger.info(
                    "Quote grounded via whitespace-tolerant match: '%s' -> '%s'",
                    quote_str[:40],
                    verbatim[:40],
                )
                return start, end, verbatim
        except Exception:
            pass

    # 3. Bounded LLM retry if LLM service is available
    if llm_service is not None and max_retries > 0:
        system_prompt = (
            "You are a narrative grounding repair specialist. An evidence quote generated for a narrative element "
            "failed verbatim verification against the source text. Your task is to locate the exact contiguous "
            "verbatim quote in the passage that directly supports the narrative element.\n"
            "CRITICAL RULES:\n"
            '1. Return ONLY valid JSON with format: {"exact_quote": "..."}.\n'
            "2. The quote MUST be an exact, continuous verbatim substring from the passage. Copy and paste it character for character.\n"
            "3. NEVER use ellipses, brackets, or omission markers (no '...', no '[...]').\n"
            "4. Do NOT add or remove quotation marks unless they exist verbatim in the passage.\n"
            "5. The quote must be sufficiently specific and unique in the text."
        )
        user_prompt = (
            f"Passage:\n\"\"\"\n{text.strip()}\n\"\"\"\n\n"
            + (f"Context / Event Summary: {context_hint}\n" if context_hint else "")
            + f"Invalid Quote with omissions: {quote_str}\n\n"
            "Return the single exact contiguous verbatim quote from the passage supporting this."
        )
        for attempt in range(max_retries):
            try:
                raw = call_structured(
                    llm_service,
                    operation="quote_repair",
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                )
                data = json.loads(raw)
                candidate = str(data.get("exact_quote", "")).strip()
                if candidate:
                    try:
                        start, end = quote_span(text, candidate)
                        logger.info(
                            "Quote repaired successfully on attempt %d: '%s' -> '%s'",
                            attempt + 1,
                            quote_str[:40],
                            candidate[:40],
                        )
                        return start, end, candidate
                    except ValueError:
                        cand_clean = candidate.strip(" \t\r\n\"'“”‘’`")
                        if cand_clean and cand_clean != candidate:
                            start, end = quote_span(text, cand_clean)
                            return start, end, cand_clean
            except Exception as exc:
                logger.warning("Quote repair attempt %d failed: %s", attempt + 1, exc)
                if "budget_guard_denied" in str(exc).lower():
                    break

    # 4. Heuristic segment fallback (e.g. if quote contained '[...]', '...', or multiple sentences)
    split_patterns = r"\[\.\.\.\]|\.\.\.|\n\n"
    segments = [
        s.strip(" \t\r\n\"'“”‘’`.,")
        for s in re.split(split_patterns, quote_str)
        if len(s.strip(" \t\r\n\"'“”‘’`.,")) >= 20
    ]
    for seg in sorted(segments, key=len, reverse=True):
        try:
            start, end = quote_span(text, seg)
            logger.info(
                "Quote grounded via heuristic segment fallback: '%s' -> '%s'",
                quote_str[:40],
                seg[:40],
            )
            return start, end, seg
        except ValueError:
            seg_words = seg.split()
            if len(seg_words) >= 3:
                try:
                    pat = r"\s+".join(re.escape(w) for w in seg_words)
                    matches = list(re.finditer(pat, text))
                    if len(matches) == 1:
                        m = matches[0]
                        start, end = m.span()
                        verbatim = text[start:end]
                        logger.info(
                            "Quote grounded via heuristic segment whitespace match: '%s' -> '%s'",
                            quote_str[:40],
                            verbatim[:40],
                        )
                        return start, end, verbatim
                except Exception:
                    pass
            continue

    # 5. If everything failed, raise original ValueError
    raise AnalysisOutputError('EXTRACTION_GROUNDING_UNRESOLVED',
        'Evidence quote is not present or is ambiguous after bounded repair; reanalyse the saved revision.',
        attempts=max_retries if llm_service is not None else 0)

