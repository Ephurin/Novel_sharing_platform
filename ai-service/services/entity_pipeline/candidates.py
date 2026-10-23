"""High-recall *occurrence* collection. Candidates are never canonical entities."""
from dataclasses import asdict, dataclass, replace
import hashlib
import re
import unicodedata

from domain.errors import AnalysisOutputError

POLICY = 'entity-candidates-v1'
MAX_CANDIDATES = 1024
MAX_CHUNKS = 32


def same_name(left, right):
    return unicodedata.normalize('NFC', left).casefold() == unicodedata.normalize('NFC', right).casefold()


@dataclass(frozen=True)
class TextChunk:
    start: int
    end: int
    text: str


@dataclass(frozen=True)
class EntityCandidate:
    candidate_id: str
    surface: str
    start: int
    end: int
    context_start: int
    context_end: int
    context: str
    origins: tuple[str, ...]

    def to_dict(self):
        return asdict(self)


def chunks(text: str, *, size=4000, overlap=256) -> list[TextChunk]:
    if size < 64 or not 0 <= overlap < size // 2:
        raise ValueError('Invalid candidate chunk size/overlap')
    result = []
    start = 0
    while start < len(text):
        end = min(len(text), start + size)
        if end < len(text):
            # Prefer a complete paragraph/sentence; never rewrite the original text.
            cut = max(text.rfind('\n', start + size // 2, end),
                      text.rfind(' ', start + size // 2, end))
            if cut > start:
                end = cut
        result.append(TextChunk(start, end, text[start:end]))
        if len(result) > MAX_CHUNKS:
            raise AnalysisOutputError('ENTITY_CANDIDATE_LIMIT',
                'Too many discovery chunks; split the chapter explicitly.', attempts=0)
        if end == len(text):
            break
        following = max(start + 1, end - overlap)
        # Back up to include a whole token in the overlap.
        lower = max(start + 1, following - 64)
        while following > lower and text[following - 1].isalnum():
            following -= 1
        start = following
    return result


def occurrences(text: str, name: str, *, offset=0):
    if not name.strip():
        return
    for m in re.finditer(r'(?<![\w\u0300-\u036f])' + re.escape(name.strip()) + r'(?![\w\u0300-\u036f])', text, re.IGNORECASE):
        yield offset + m.start(), offset + m.end()


class CandidateInventory:
    def __init__(self, text: str, *, maximum=MAX_CANDIDATES):
        self.text = text
        self.maximum = maximum
        self.digest = hashlib.sha256(text.encode('utf-8')).hexdigest()
        self._items = {}

    def add(self, start, end, origin):
        if not (0 <= start < end <= len(self.text)):
            raise ValueError('Candidate offset outside original text')
        key = (start, end)
        if key in self._items:
            old = self._items[key]
            self._items[key] = replace(old, origins=tuple(sorted(set(old.origins) | {origin})))
            return
        if len(self._items) >= self.maximum:
            raise AnalysisOutputError('ENTITY_CANDIDATE_LIMIT',
                'Candidate limit exceeded; no candidates were silently discarded.', attempts=0)
        context_start, context_end = max(0, start - 200), min(len(self.text), end + 200)
        identity = f'{self.digest}:{start}:{end}'
        self._items[key] = EntityCandidate(
            hashlib.sha256(identity.encode()).hexdigest()[:24], self.text[start:end], start, end,
            context_start, context_end, self.text[context_start:context_end], (origin,))

    def add_name(self, name, origin, *, chunk=None):
        source = self.text if chunk is None else chunk.text
        offset = 0 if chunk is None else chunk.start
        for start, end in occurrences(source, name, offset=offset):
            self.add(start, end, origin)

    def collect(self, known_names=()):
        for name in known_names:
            self.add_name(name, 'approved_name_or_alias')
        word = r'[^\W_]+(?:[\u0300-\u036f]+[^\W_]*)*'
        tokens = list(re.finditer(word + r'(?:[-–]' + word + r')*', self.text, re.UNICODE))
        for i, token in enumerate(tokens):
            name = token.group()
            if name[0].isupper():
                self.add(token.start(), token.end(), 'capitalized_token')
                # Full proper names plus their components. Overgeneration is intentional.
                end = token.end()
                for later in tokens[i + 1:i + 4]:
                    if not self.text[end:later.start()].isspace() or not later.group()[0].isupper():
                        break
                    end = later.end()
                    self.add(token.start(), end, 'capitalized_sequence')
            if any(c.isalpha() for c in name) and any(c.isdigit() for c in name):
                self.add(token.start(), token.end(), 'identifier')
        named = r'(?:[^\W\d_]\w*(?:[-–]\w+)*|\d+)'
        for m in re.finditer(r'(?<!\w)(?:ông|bà|cô|chú|bác|cậu|thầy|cụ|ngài|trạm|kho|bến|chợ|đồi|cổng)\s+',
                             self.text, re.IGNORECASE):
            tail = re.match(named + r'(?:\s+' + named + r'){0,3}', self.text[m.end():])
            if not tail:
                continue
            # Include prefixes only through the first proper name/code/number; not an entire clause.
            parts = list(re.finditer(r'\S+', tail.group()))
            end = None
            for part in parts:
                token = part.group().strip('.,;:!?“”"')
                if token and (token[0].isupper() or any(c.isdigit() for c in token)):
                    end = m.end() + part.start() + len(token)
                elif end is not None:
                    break
            if end:
                self.add(m.start(), end, 'title_or_location')
        return self

    @property
    def items(self):
        return sorted(self._items.values(), key=lambda c: (c.start, c.end))
