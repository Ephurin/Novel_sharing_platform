import os
import sys
import json
from pathlib import Path

# Add current directory to path
sys.path.append(os.getcwd())

from services.entity_pipeline.pipeline import EntityPipeline

def test():
    pipeline = EntityPipeline()
    chapter_path = Path(__file__).resolve().parent / "test_data" / "stories" / "set1" / "chapter_1.md"

    with open(chapter_path, "r", encoding="utf-8") as f:
        text = f.read()

    print(f"Testing Pipeline on Chapter 1 ({len(text)} chars)...")
    results = pipeline.run(text)

    # Filter out entities that are clearly valid to see if any junk remains
    print(f"\nFound {len(results)} potential entities (Threshold=2.0):")
    
    output_file = "scratch/test_pipeline_results.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    print(f"Detailed results saved to {output_file}")
    
    # Print first 20 for quick check
    for r in results[:20]:
        try:
            print(f"  [{r['score']:.1f}] {r['phrase']} ({r.get('label', 'UNKNOWN')})")
        except:
            pass

if __name__ == "__main__":
    test()
