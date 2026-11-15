"""High-recall *occurrence* collection. Candidates are never canonical entities."""
from dataclasses import asdict, dataclass, replace
import hashlib
import re
import unicodedata

from domain.errors import AnalysisOutputError

POLICY = 'entity-candidates-v1'
MAX_CANDIDATES = 1024
MAX_CHUNKS = 32

# Q-1 (final live acceptance): with "accept all suggestions", noise candidates the model calls
# entities reached canon ("Anh", "Chị", a lone "Nguyễn", the alias "Khi Linh"). These are removed
# before verification unless the exact name is approved, an alias, or declared by the author.
PRONOUN_TITLE_WORDS = frozenset({
    'anh', 'chị', 'em', 'ông', 'bà', 'cô', 'chú', 'bác', 'cậu', 'dì', 'thím', 'mợ', 'cụ', 'cháu', 'con',
    'bố', 'mẹ', 'cha', 'má', 'ba', 'tôi', 'ta', 'mình', 'nó', 'họ', 'hắn', 'thầy', 'ngài', 'nàng',
    'chàng', 'lão', 'bé', 'người', 'ai', 'gì', 'đây', 'kia', 'ấy', 'chúng', 'các', 'những'})
LEADING_FUNCTION_WORDS = frozenset({
    'khi', 'nếu', 'rồi', 'nhưng', 'và', 'còn', 'thì', 'lúc', 'sau', 'trước', 'để', 'vì', 'cho', 'với',
    'từ', 'ở', 'trong', 'ngoài', 'trên', 'dưới', 'tại', 'theo', 'bởi', 'nên', 'mà', 'là', 'có', 'không',
    'chỉ', 'cả', 'mỗi', 'những', 'các', 'một', 'này', 'đó', 'hôm', 'đêm', 'sáng', 'chiều', 'tối', 'giờ',
    'bây', 'vẫn', 'đã', 'đang', 'sẽ', 'cũng', 'lại', 'hãy', 'đừng', 'xin', 'cảm', 'ngay'})
# Surnames rarely used alone as a given name; dropped only when a fuller name with them exists.
SURNAME_ONLY = frozenset({'nguyễn', 'trần', 'lê', 'phạm', 'huỳnh', 'phan', 'võ', 'đặng', 'bùi', 'đỗ',
                          'ngô', 'trịnh', 'đinh'})


def noise_reason(surface: str, longer_first_tokens: set[str]) -> str | None:
    words = unicodedata.normalize('NFC', surface).split()
    if not words:
        return None
    first = words[0].casefold()
    if len(words) == 1 and first in PRONOUN_TITLE_WORDS:
        return 'pronoun_or_title'
    if len(words) > 1 and first in LEADING_FUNCTION_WORDS:
        return 'leading_function_word'
    if len(words) == 1 and first in SURNAME_ONLY and first in longer_first_tokens:
        return 'lone_surname'
    return None


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

    def prune(self, protected=()):
        """Drop noise candidates (see noise_reason); protected exact names are always kept."""
        keep = {unicodedata.normalize('NFC', n).casefold() for n in protected if n}
        longer = {unicodedata.normalize('NFC', c.surface).split()[0].casefold()
                  for c in self._items.values() if len(c.surface.split()) > 1}
        removed = {}
        for key, cand in list(self._items.items()):
            if unicodedata.normalize('NFC', cand.surface).casefold() in keep:
                continue
            reason = noise_reason(cand.surface, longer)
            if reason:
                del self._items[key]
                removed[reason] = removed.get(reason, 0) + 1
        return removed

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
