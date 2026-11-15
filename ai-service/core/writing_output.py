"""Keep transport JSON out of manuscript prose, including malformed envelopes."""
import json
import re


def is_writing_envelope(value: str) -> bool:
    return bool(re.match(r'^\s*(?:```(?:json)?\s*)?\{\s*"(?:draft_text|draft|explanation)"\s*:', value, re.I))


def parse_writing_output(raw: str) -> str:
    cleaned = raw.strip()
    if cleaned.startswith('```'):
        cleaned = re.sub(r'^```(?:json)?\s*', '', cleaned, flags=re.I)
        cleaned = re.sub(r'\s*```$', '', cleaned)
    try:
        result = json.loads(cleaned)
    except (ValueError, TypeError) as exc:
        raise ValueError('AI trả bản thảo sai định dạng hoặc chưa đầy đủ. Vui lòng tạo lại đề xuất.') from exc
    draft = result.get('draft_text', result.get('draft')) if isinstance(result, dict) else None
    if not isinstance(draft, str) or not draft.strip() or is_writing_envelope(draft):
        raise ValueError('AI chưa trả về đoạn văn hợp lệ. Vui lòng tạo lại đề xuất.')
    return draft


# Long-run live test (2026-11-15): an accepted draft was glued to the sentence before it
# ("nhịp đồng hồ.Linh"); the model's text is inserted verbatim at the cursor.
# Straight quotes are left out: they open dialogue as often as they close it.
_CLOSING = set('.,;:!?…)]}”’»')
_OPENING = set('([{“‘«')


def fit_spacing(before: str, replacement: str, after: str) -> str:
    """Add the single space a patch needs to read as separate words at both ends.

    Only a missing space is added: never when either side already has whitespace, before closing
    punctuation, or after opening punctuation. The model's own whitespace is kept."""
    if not replacement or replacement.isspace():
        return replacement
    if (before and not before[-1].isspace() and before[-1] not in _OPENING
            and not replacement[0].isspace() and replacement[0] not in _CLOSING):
        replacement = ' ' + replacement
    if (after and not after[0].isspace() and after[0] not in _CLOSING
            and not replacement[-1].isspace() and replacement[-1] not in _OPENING):
        replacement = replacement + ' '
    return replacement
