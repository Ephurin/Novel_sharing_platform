from .candidate_extractor import CandidateExtractor
from .scoring_engine import ScoringEngine
from .ml_adapter import MLAdapter

class EntityPipeline:
    """
    Main orchestration class for the new Entity Extraction Pipeline.
    """

    def __init__(self, ml_enabled=True):
        self.extractor = CandidateExtractor()
        self.scorer = ScoringEngine()
        self.ml_adapter = MLAdapter() if ml_enabled else None
        self.ml_enabled = ml_enabled

    def run(self, text: str, threshold=2.0, llm_service=None):
        # 1. Extraction
        candidates = self.extractor.extract(text)
        
        # 2. Rule-based Scoring
        scored = self.scorer.score(candidates)
        
        # 3. ML Enhancement
        final_results = []
        for c in scored:
            if self.ml_enabled and self.ml_adapter and self.ml_adapter.model:
                ml_conf = self.ml_adapter.predict(c)
                # Adjust score based on ML
                if ml_conf > 0.8:
                    c["score"] += 3.0
                elif ml_conf > 0.5:
                    c["score"] += 1.0
                elif ml_conf < 0.1:
                    # Penalize if ML is very confident it's NOT an entity
                    # Single-word names might get this penalty, but they can recover
                    # if they appear multiple times (frequency bonus).
                    c["score"] -= 1.0
                    
            # 4. Threshold filtering
            if c["score"] >= threshold:
                # Deduplicate by phrase
                if not any(r["phrase"] == c["phrase"] for r in final_results):
                    final_results.append(c)
        
        # 5. Labeling (LLM + Heuristics Fallback)
        if llm_service and final_results:
            self._label_with_llm(final_results, llm_service)
        
        # Always run heuristics for anything still UNKNOWN
        self._apply_heuristics(final_results)
        
        # Sort by score
        final_results.sort(key=lambda x: x["score"], reverse=True)
        return final_results

    def _label_with_llm(self, entities, llm_service):
        """
        Labels a list of entities in a single LLM call with normalization and logging.
        Uses context (sentence) if available for better accuracy.
        """
        import json
        import re
        import logging
        
        logger = logging.getLogger("ai-service")
        # Format entities with context for the LLM
        payload = []
        for e in entities:
            payload.append({
                "phrase": e["phrase"],
                "context": e.get("sentence", "")[:200] # Limit context size
            })
        
        system_prompt = (
            "You are an expert fantasy novel analyst. Classify these phrases into categories: "
            "PER (Person), LOC (Location), ORG (Organization), ITEM (Object/Weapon/Artifact), SKILL (Magic/Technique/Ability). "
            "Note: Titles like 'Blood Oath' or 'Frostmourne' are usually ITEMs. Names like 'Celestial Collapse' or 'Shadow Rend' are SKILLs. "
            "Consider the provided context sentences to distinguish between people, items, and skills. "
            "Return ONLY a flat JSON object: {\"phrase\": \"TYPE\"}."
        )
        user_prompt = f"Entities to classify with context: {json.dumps(payload, ensure_ascii=False)}"
        
        try:
            logger.info(f"DEBUG: Calling LLM to label {len(payload)} entities...")
            response = llm_service._call_llm(system_prompt=system_prompt, user_prompt=user_prompt)
            logger.info(f"DEBUG: LLM Raw Output: {response}")
            
            # Clean response from markdown blocks if any
            clean_json = response.strip()
            if clean_json.startswith("```"):
                clean_json = re.sub(r"^```(?:json)?\s*", "", clean_json, flags=re.IGNORECASE)
                clean_json = re.sub(r"\s*```$", "", clean_json)
            
            # Extract JSON block
            json_match = re.search(r'\{.*\}', clean_json, re.DOTALL)
            if json_match:
                raw_labels = json.loads(json_match.group(0))
                norm_labels = {str(k).lower().strip(): v for k, v in raw_labels.items()}
                
                for e in entities:
                    phrase_key = e["phrase"].lower().strip()
                    if phrase_key in norm_labels:
                        label = str(norm_labels[phrase_key]).upper()
                        e["label"] = label
                        e["entity"] = label
                        logger.info(f"DEBUG: Matched {e['phrase']} -> {label}")
            else:
                logger.warning("DEBUG: No JSON found in LLM response.")
                
        except Exception as exc:
            logger.error(f"DEBUG: LLM Labeling Error: {exc}")
            
        # Fallback to heuristics for any entities that didn't get a label
        return self._apply_heuristics(entities)

    def _apply_heuristics(self, entities):
        """Fallback labeling using simple rules for fantasy/xianxia names."""
        loc_suffixes = {"hold", "land", "peak", "valley", "citadel", "keep", "wood", "forest", "field", "shore", "bay"}
        loc_prefixes = {"thành", "thị", "đảo", "cung", "vùng", "núi", "sơn", "động", "hồ", "sông"}
        org_keywords = {"order", "covenant", "knights", "knight", "tông", "phái", "hội", "bang", "gia tộc", "guild", "clan"}
        skill_keywords = {"rend", "collapse", "strike", "blast", "palm", "arts", "pháp", "thuật", "công", "chiêu", "kiếm pháp", "đao pháp", "ấn", "quyết", "kiếm ý", "kiếm khí"}
        item_keywords = {"blade", "sword", "staff", "amulet", "ring", "orb", "kiếm", "đao", "trượng", "bảo", "ấn", "giáp", "thuẫn", "oath", "heart", "soul", "bound"}
        
        for e in entities:
            # Skip if already labeled (except UNKNOWN)
            if e.get("label") and e["label"] != "UNKNOWN":
                continue
            
            phrase_low = e["phrase"].lower()
            words = phrase_low.split()
            
            # Rule 1: Check keywords/suffixes
            # Use substring matching for multi-word keywords like 'kiếm pháp'
            has_loc = any(phrase_low.endswith(s) for s in loc_suffixes) or any(w in loc_prefixes for w in words)
            has_org = any(w in org_keywords for w in words)
            has_skill = any(k in phrase_low for k in skill_keywords)
            has_item = any(k in phrase_low for k in item_keywords)
            
            if has_loc: e["label"] = "LOC"
            elif has_org: e["label"] = "ORG"
            elif has_skill: e["label"] = "SKILL"
            elif has_item: e["label"] = "ITEM"
            elif len(words) <= 2: e["label"] = "PER"
            else: e["label"] = "UNKNOWN"
            
            e["entity"] = e.get("label", "UNKNOWN")
            
        return entities
