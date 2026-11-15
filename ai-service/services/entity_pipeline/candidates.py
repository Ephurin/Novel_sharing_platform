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
# Long-run live test (2026-11-15): 100-128 candidates per chapter were common words capitalised only
# because they open a sentence ("Tiếng", "Chiếc", "Dưới", "Bọn"). A word is treated as common when it
# is never capitalised mid-sentence in the chapter and is either listed here or also written in
# lowercase in the same chapter.
SENTENCE_STARTERS = LEADING_FUNCTION_WORDS | frozenset({
    'chương', 'phần', 'tiếng', 'chiếc', 'cái', 'con', 'kẻ', 'bọn', 'lũ', 'đám', 'dưới', 'bên', 'phía',
    'giữa', 'cạnh', 'cửa', 'gió', 'mưa', 'nắng', 'trời', 'đất', 'nước', 'lửa', 'hơi', 'sự', 'việc',
    'điều', 'chuyện', 'giọng', 'ánh', 'bóng', 'mặt', 'tay', 'mắt', 'đầu', 'nhìn', 'nghe', 'thấy', 'biết',
    'nghĩ', 'đi', 'đến', 'về', 'ra', 'vào', 'lên', 'xuống', 'đứng', 'ngồi', 'nói', 'hỏi', 'đáp', 'thưa',
    'vâng', 'dạ', 'ừ', 'ồ', 'à', 'ôi', 'chào', 'sao', 'tại', 'thế', 'vậy', 'ai', 'đâu', 'bao', 'mấy',
    'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín', 'mười', 'trăm', 'nghìn', 'ngàn', 'từng',
    'đúng', 'chắc', 'có lẽ', 'thật', 'càng', 'lâu', 'ngày', 'tháng', 'cơn', 'mảnh', 'màn', 'tấm', 'bản',
    'căn', 'hình', 'xung', 'hồi', 'giống', 'đối', 'đem', 'mang', 'ôm', 'cầm', 'kim', 'phố', 'trăng'})
# Titles and location heads that may start a name ("Ông Ba Lắm", "Chùa Cầu").
NAME_HEADS = PRONOUN_TITLE_WORDS | frozenset({'chùa', 'sông', 'núi', 'làng', 'phố', 'chợ', 'bến', 'cầu',
                                              'đền', 'hồ', 'trạm', 'kho', 'đồi', 'cổng', 'thành', 'tháp'})
# Person titles admit no description before the name except "tên" ("Ông tên Hòa"); location heads
# admit one descriptive word ("bến nước Hội An"). A longer tail is a clause ("Ông khẽ vỗ vai Linh").
PERSON_TITLES = frozenset({'ông', 'bà', 'cô', 'chú', 'bác', 'cậu', 'thầy', 'cụ', 'ngài'})
# Honorifics in front of a bare name ("Chị Thu Hà" -> "Thu Hà"). Kinship words used as name parts
# ("Ba" in "Ba Lắm", "Con", "Cháu") are not honorifics here.
HONORIFIC_PREFIXES = frozenset({
    'ông', 'bà', 'anh', 'chị', 'em', 'cô', 'chú', 'bác', 'cậu', 'dì', 'thím', 'mợ', 'cụ', 'lão',
    'thầy', 'ngài', 'nàng', 'chàng', 'bé', 'già', 'bạn', 'tiểu', 'đại'})
STRONG_ORIGINS = frozenset({'approved_name_or_alias', 'author_guidance', 'llm_discovery'})
_OPENERS = set('.!?…:;"“”\'‘’«»()[]—–-*')
_WORD = r'[^\W_]+(?:[̀-ͯ]+[^\W_]*)*'


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


def _keeps_capitals(name: str, found: str) -> bool:
    """A capital letter in the name must be capital in the text: the name "Linh" is not the word "linh"
    (spirit), "L\u1eafm" is not "l\u1eafm" (very). Lowercase letters may be capitalised ("s\u00f4ng Ho\u00e0i" at a
    sentence start is "S\u00f4ng Ho\u00e0i")."""
    if len(name) != len(found):
        return True
    return all(not a.isupper() or b.isupper() for a, b in zip(name, found))


def occurrences(text: str, name: str, *, offset=0):
    name = name.strip()
    if not name:
        return
    for m in re.finditer(r'(?<![\w\u0300-\u036f])' + re.escape(name) + r'(?![\w\u0300-\u036f])', text, re.IGNORECASE):
        if _keeps_capitals(name, m.group()):
            yield offset + m.start(), offset + m.end()


def _sentence_initial(text: str, start: int) -> bool:
    i = start - 1
    while i >= 0 and text[i].isspace():
        if text[i] == '\n':
            return True
        i -= 1
    return i < 0 or text[i] in _OPENERS


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

    def _word_usage(self):
        """Casefolded words seen capitalised mid-sentence, and words seen in lowercase."""
        mid_capital, lowercase = set(), set()
        for m in re.finditer(_WORD, self.text):
            word = unicodedata.normalize('NFC', m.group())
            if word[0].isupper():
                if not _sentence_initial(self.text, m.start()):
                    mid_capital.add(word.casefold())
            elif word[0].islower():
                lowercase.add(word)
        return mid_capital, lowercase

    def prune(self, protected=()):
        """Drop noise candidates; protected exact names are always kept. Returns counts per reason.

        1. noise_reason: pronoun/title words, function-word phrases, lone surnames.
        2. Sentence-initial common words ("Tiếng", "Chiếc") and phrases led by one ("Giọng Ba Lắm").
        3. Occurrences nested inside a longer name at the same place ("Lắm" in "Ba Lắm", "Thu" and
           "Hà" in "Thu Hà", "Cầu" in "Chùa Cầu"): a fragment there is part of the name, not a
           mention of its own. Only an honorific-led name keeps its bare name ("Thu Hà" in "Chị Thu
           Hà"). A protected name inside a run of capitalised words that is not itself a known or
           discovered name is kept, since the run may be two names side by side.
        """
        keep = {unicodedata.normalize('NFC', n).casefold() for n in protected if n}
        longer = {unicodedata.normalize('NFC', c.surface).split()[0].casefold()
                  for c in self._items.values() if len(c.surface.split()) > 1}
        mid_capital, lowercase = self._word_usage()
        removed = {}

        def drop(key, reason):
            del self._items[key]
            removed[reason] = removed.get(reason, 0) + 1

        def is_protected(cand):
            return unicodedata.normalize('NFC', cand.surface).casefold() in keep

        def common(word, cand):
            folded = word.casefold()
            if folded in mid_capital:
                return False
            return folded in SENTENCE_STARTERS or (folded in lowercase and 'llm_discovery' not in cand.origins)

        for key, cand in list(self._items.items()):
            if is_protected(cand):
                continue
            reason = noise_reason(cand.surface, longer)
            if reason:
                drop(key, reason)
                continue
            words = unicodedata.normalize('NFC', cand.surface).split()
            if not words[0][:1].isupper() or 'identifier' in cand.origins:
                continue
            if len(words) == 1 and common(words[0], cand):
                drop(key, 'sentence_initial_common_word')
            elif (len(words) > 1 and words[0].casefold() not in NAME_HEADS
                  and _sentence_initial(self.text, cand.start) and common(words[0], cand)):
                drop(key, 'leading_common_word')

        spans = [c for c in self._items.values()
                 if set(c.origins) & (STRONG_ORIGINS | {'capitalized_sequence'})]
        for key, cand in list(self._items.items()):
            for outer in spans:
                if outer is cand or not (outer.start <= cand.start and cand.end <= outer.end):
                    continue
                if is_protected(cand) and not set(outer.origins) & STRONG_ORIGINS:
                    continue
                head = self.text[outer.start:cand.start].split()
                if (cand.end == outer.end and len(head) == 1
                        and head[0].casefold() in HONORIFIC_PREFIXES):
                    continue
                drop(key, 'nested_in_longer_name')
                break
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
            person = m.group().strip().casefold() in PERSON_TITLES
            end = None
            described = 0
            for part in parts:
                token = part.group().strip('.,;:!?“”"')
                if token and (token[0].isupper() or any(c.isdigit() for c in token)):
                    end = m.end() + part.start() + len(token)
                elif end is not None:
                    break
                else:
                    described += 1
                    if (person and token.casefold() != 'tên') or described > 1:
                        break
            if end:
                self.add(m.start(), end, 'title_or_location')
        return self

    @property
    def items(self):
        return sorted(self._items.values(), key=lambda c: (c.start, c.end))
