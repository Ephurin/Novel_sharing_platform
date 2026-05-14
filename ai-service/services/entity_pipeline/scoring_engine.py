class ScoringEngine:
    """
    Applies rule-based scoring to entity candidates.
    Heuristics:
    - -Points if at sentence start and is a common pronoun/article.
    - +Points if has multiple words (e.g. "Kael Draven").
    - +Points if seen multiple times in the text.
    """

    COMMON_JUNK = {
        "I", "Me", "My", "He", "His", "Him", "She", "Her", "It", "Its", 
        "They", "Them", "Their", "We", "Us", "Our", "You", "Your",
        "The", "A", "An", "This", "That", "These", "Those",
        "Then", "There", "When", "Where", "But", "And", "Or", "So", "If", "Because"
    }
    
    VN_JUNK = {
        "Tôi", "Hắn", "Nàng", "Nó", "Họ", "Ta", "Chúng", "Khi", "Nhưng", "Nếu", "Và", "Của", "Với",
        "Thay", "Tiếng", "Gương", "Nhìn", "Ngươi", "Chạy", "Thành", "Đứng", "Nói", "Hỏi", "Đáp",
        "Lại", "Vừa", "Đang", "Đã", "Sẽ", "Thế", "Vì", "Nên", "Tuy", "Mặc", "Dù", "Trong", "Ngoài",
        "Trên", "Dưới", "Trước", "Sau", "Giữa", "Cùng", "Cả", "Cũng", "Để", "Cho", "Từ", "Đến"
    }

    def __init__(self):
        pass

    def score(self, candidates):
        # First, count frequencies for global score
        counts = {}
        for c in candidates:
            phrase_low = c["phrase"].lower()
            counts[phrase_low] = counts.get(phrase_low, 0) + 1

        scored_candidates = []
        for c in candidates:
            phrase = c["phrase"]
            features = c["features"]
            score = 2.0 # Baseline
            
            # 1. Start of sentence penalty
            if features["is_sentence_start"]:
                if phrase in self.COMMON_JUNK or phrase in self.VN_JUNK:
                    score -= 5.0 # High penalty for sentence-starting junk
                else:
                    score -= 1.0 # Standard penalty for sentence-starting words
            
            # 2. Length bonus
            if features["word_count"] > 1:
                score += 1.5
            
            # 3. Frequency bonus
            phrase_low = phrase.lower()
            if counts[phrase_low] > 1:
                score += 1.0
                
            # 4. Content filter
            if len(phrase) <= 1:
                score -= 10.0
                
            c["score"] = score
            scored_candidates.append(c)
            
        return scored_candidates
