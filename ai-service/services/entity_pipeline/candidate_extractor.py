import re
import string

class CandidateExtractor:
    """
    Extracts capitalized phrases from raw text as entity candidates.
    Matches sequences of words starting with an uppercase letter.
    """

    def __init__(self):
        # Explicit list of Vietnamese uppercase characters to avoid matching lowercase in range À-Ỹ
        vn_upper = "ÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴ"
        # Match words starting with an uppercase letter
        self.pattern = re.compile(rf'\b([A-Z{vn_upper}][\w{vn_upper}a-zà-ỹ]*)', re.UNICODE)
        
        # Stopwords that should never be the start of a candidate (even if capitalized)
        self.stop_starts = {
            "Của", "Và", "Là", "Một", "Các", "Có", "Được", "Trong", "Với",
            "Này", "Đã", "Cho", "Từ", "Về", "Đến", "Theo", "Tại", "Nếu", "Nhưng",
            "The", "A", "An", "In", "On", "At", "From", "With", "By"
        }

    def extract(self, text: str):
        if not text:
            return []

        # Split text into sentences for context, including double newlines
        sentences = re.split(r'(?:(?<=[.!?])\s+|\n\n+)', text)
        candidates = []

        for sent in sentences:
            if not sent.strip():
                continue
                
            # Find all capitalized words in the sentence
            matches = list(self.pattern.finditer(sent))
            
            i = 0
            while i < len(matches):
                match = matches[i]
                start_idx = match.start()
                first_word = match.group(0)
                
                # Filter out obvious stopwords at start
                if first_word in self.stop_starts:
                    i += 1
                    continue
                    
                phrase_parts = [first_word]
                end_idx = match.end()
                
                # Check for contiguous capitalized words (Phrase Builder)
                j = i + 1
                while j < len(matches):
                    next_match = matches[j]
                    # Check gap between current end and next start
                    gap = sent[end_idx:next_match.start()]
                    
                    # Group if gap only contains whitespace and allowed connectors
                    allowed_connectors = {"of", "the", "de", "and", "của", "và", "những", "các", "tại"}
                    gap_clean = gap.strip(string.punctuation + " ").lower()
                    
                    # If gap contains newline, don't group
                    if "\n" in gap:
                        break
                        
                    gap_words = [w.strip(string.punctuation).lower() for w in gap.split()]
                    
                    # If gap is just space, it's allowed. If it has words, they must be connectors.
                    if not gap_words:
                        # Just whitespace/punctuation
                        phrase_parts.append(gap + next_match.group(0))
                        end_idx = next_match.end()
                        j += 1
                    elif all(w in allowed_connectors for w in gap_words):
                        phrase_parts.append(gap + next_match.group(0))
                        end_idx = next_match.end()
                        j += 1
                    else:
                        break
                
                full_phrase = "".join(phrase_parts).strip(string.punctuation + " ")
                
                # Final validation: ignore single-char or very short phrases if they are common words
                if len(full_phrase) < 2:
                    i = j
                    continue
                
                # Basic features for scoring/ML
                # Improved: check if preceding text in sentence is only punctuation/quotes
                preceding = sent[:start_idx].strip()
                is_sentence_start = (not preceding or all(c in (string.punctuation + '"\'«»') for c in preceding))
                
                candidates.append({
                    "phrase": full_phrase,
                    "start": start_idx,
                    "end": end_idx,
                    "sentence": sent,
                    "features": {
                        "is_sentence_start": is_sentence_start,
                        "length": len(full_phrase.split()),
                        "has_digit": any(char.isdigit() for char in full_phrase),
                        "word_count": len(full_phrase.split()),
                        "char_count": len(full_phrase) # Added for ML consistency
                    }
                })
                
                i = j

        return candidates
