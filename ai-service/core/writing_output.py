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
