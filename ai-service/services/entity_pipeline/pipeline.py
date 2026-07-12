import json
import re
import logging

logger = logging.getLogger("ai-service")

class EntityPipeline:
    """
    Pure LLM Entity Extraction Pipeline.
    Bypasses ML and Regex completely to rely entirely on the LLM's understanding of context.
    """

    def __init__(self, ml_enabled=False):
        # We keep ml_enabled argument for backward compatibility with main.py
        # but we do not use it since this is a pure LLM pipeline.
        self.ml_enabled = False

    def run(self, text: str, threshold=0.0, llm_service=None):
        if not text.strip():
            return []
            
        if not llm_service:
            logger.warning("No LLM service provided for pure LLM extraction.")
            return []

        system_prompt = (
            "You are an expert fantasy novel analyst. Your task is to extract ALL named entities from the given text. "
            "Classify them STRICTLY into these categories: PER (Person), LOC (Location), ORG (Organization), ITEM (Object/Weapon/Artifact), SKILL (Magic/Technique/Ability). "
            "Guidelines:\n"
            "- Extract full entity names (e.g., 'Tiêu Viêm', 'Huyết Ma Trảm', 'Order of the Black Sun').\n"
            "- Do not include preceding/succeeding conjunctions or stopwords like 'Khi', 'Và', 'Của'.\n"
            "- Return a JSON array of objects. Example: [{\"phrase\": \"Tiêu Viêm\", \"entity\": \"PER\", \"score\": 9.5}]\n"
            "- Ensure the JSON is flat and valid. Output NOTHING ELSE but the JSON array."
        )
        
        user_prompt = f"Text to analyze:\n\n{text}"
        
        try:
            logger.info("DEBUG: Calling Pure LLM for entity extraction...")
            response = llm_service._call_llm(system_prompt=system_prompt, user_prompt=user_prompt)
            logger.info(f"DEBUG: LLM Raw Output: {response}")
            
            # Clean response from markdown blocks if any
            clean_json = response.strip()
            if clean_json.startswith("```"):
                clean_json = re.sub(r"^```(?:json)?\s*", "", clean_json, flags=re.IGNORECASE)
                clean_json = re.sub(r"\s*```$", "", clean_json)
            
            # Robust parsing using the LLM Service parser or fallback search
            parsed = None
            if hasattr(llm_service, "_parse_json_like_output"):
                parsed = llm_service._parse_json_like_output(clean_json)
            
            if parsed is None:
                json_match = re.search(r'\[.*\]', clean_json, re.DOTALL)
                if json_match:
                    try:
                        parsed = json.loads(json_match.group(0))
                    except Exception:
                        pass
            
            if parsed is None:
                json_match = re.search(r'\{.*\}', clean_json, re.DOTALL)
                if json_match:
                    try:
                        parsed = json.loads(json_match.group(0))
                    except Exception:
                        pass

            entities_list = []
            if isinstance(parsed, list):
                entities_list = parsed
            elif isinstance(parsed, dict):
                # Search for lists inside the object (e.g. {"entities": [...]})
                for key in ["entities", "phrases", "data", "results"]:
                    if isinstance(parsed.get(key), list):
                        entities_list = parsed[key]
                        break
                if not entities_list:
                    for val in parsed.values():
                        if isinstance(val, list):
                            entities_list = val
                            break

            if entities_list:
                valid_entities = []
                # Normalization
                for e in entities_list:
                    if not isinstance(e, dict):
                        continue
                    phrase = str(e.get("phrase") or e.get("word") or e.get("name") or e.get("entity_name") or "").strip()
                    entity = str(e.get("entity") or e.get("type") or e.get("label") or "UNKNOWN").upper().strip()
                    
                    if not phrase:
                        continue
                        
                    # Standardize score logic (default 9.5 if LLM forgets)
                    raw_score = e.get("score") or e.get("confidence") or e.get("Score") or 9.5
                    try:
                        score = float(raw_score)
                    except Exception:
                        score = 9.5
                        
                    valid_entities.append({
                        "phrase": phrase,
                        "entity": entity,
                        "label": entity, # Add label for backward compatibility
                        "score": score
                    })
                
                # Sort by score descending
                valid_entities.sort(key=lambda x: x["score"], reverse=True)
                return valid_entities
            else:
                logger.warning("DEBUG: No valid JSON array or object structure found in LLM response.")
                return []
                
        except Exception as exc:
            logger.error(f"DEBUG: Pure LLM Extraction Error: {exc}")
            return []
