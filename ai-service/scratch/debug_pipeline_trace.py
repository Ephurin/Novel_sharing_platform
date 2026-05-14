"""Debug: Trace pipeline từng bước để xem entity bị mất ở đâu."""
from services.entity_pipeline.candidate_extractor import CandidateExtractor
from services.entity_pipeline.scoring_engine import ScoringEngine
from services.entity_pipeline.ml_adapter import MLAdapter

text = "Kael drew his sword and charged at Elara in the Blackspire Citadel."

print("=" * 60)
print("INPUT TEXT:", text)
print("=" * 60)

# Step 1: Extract
extractor = CandidateExtractor()
candidates = extractor.extract(text)
print(f"\n[STEP 1] CandidateExtractor => {len(candidates)} candidates:")
for c in candidates:
    print(f"  phrase='{c['phrase']}' | start_of_sent={c['features']['is_sentence_start']} | words={c['features']['word_count']}")

# Step 2: Score
scorer = ScoringEngine()
scored = scorer.score(candidates)
print(f"\n[STEP 2] ScoringEngine => {len(scored)} scored:")
for c in scored:
    print(f"  phrase='{c['phrase']}' | score={c['score']} | {'PASS (>=3)' if c['score'] >= 3 else 'FAIL (<3)'}")

# Step 3: ML
ml = MLAdapter()
print(f"\n[STEP 3] ML model loaded: {ml.model is not None}")
for c in scored:
    if ml.model:
        conf = ml.predict(c)
        adj = "+3" if conf > 0.8 else "-3" if conf < 0.2 else "0"
        print(f"  phrase='{c['phrase']}' | ml_conf={conf:.3f} | adjustment={adj} | final_score={c['score']}")

# Step 4: Filter (threshold=3.0)
print(f"\n[STEP 4] After threshold 3.0:")
for c in scored:
    if c['score'] >= 3.0:
        print(f"  KEPT: '{c['phrase']}' (score={c['score']})")
    else:
        print(f"  DROPPED: '{c['phrase']}' (score={c['score']})")
