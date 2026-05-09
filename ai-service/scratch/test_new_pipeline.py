import sys
from pathlib import Path

# Add the current directory to sys.path to import modules
sys.path.append(str(Path.cwd() / "ai-service"))

from services.entity_pipeline.pipeline import EntityPipeline

text = """
Kael Draven đứng trên tường thành Ashenhold. Hắn nhìn về phía Crimson Covenant. 
Trong khi đó, Elara Windrider đang chuẩn bị ma thuật gió.
The Obsidian Citadel đang rực cháy.
"""

def test():
    print("Testing New Entity Pipeline (Rule-based)...")
    pipeline = EntityPipeline(ml_enabled=False) # Disable ML for now as we don't have the .pkl
    results = pipeline.run(text)
    
    print(f"\nFound {len(results)} potential entities:")
    for r in results:
        # Use ascii ignore for console printing safety on Windows
        safe_phrase = r['phrase'].encode('ascii', 'ignore').decode('ascii')
        print(f"  [{r['score']}] {safe_phrase} (Start: {r['start']}, Sentence Start: {r['features']['is_sentence_start']})")

if __name__ == "__main__":
    test()
