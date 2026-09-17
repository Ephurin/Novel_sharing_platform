
import os
import sys
import time
import json
import logging
from pathlib import Path
from fastapi.testclient import TestClient

# Add ai-service to sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(BASE_DIR))

from main import app

# Configure logging to be quiet
logging.getLogger("ai-service").setLevel(logging.WARNING)

client = TestClient(app)

STORY_DIR = BASE_DIR / "scratch" / "test_data" / "stories" / "set1"

def test_chapter(file_path):
    with open(file_path, "r", encoding="utf-8") as f:
        text = f.read()
    
    max_retries = 5
    retry_delay = 35 # Initial delay based on Gemini 429 response earlier
    
    for attempt in range(max_retries):
        try:
            response = client.post("/v1/ai/extract-entities", json={"text": text})
            
            if response.status_code == 200:
                data = response.json()
                entities = data.get("entities", [])
                entity_list = [{"name": e["Entity"], "label": e["Label"]} for e in entities]
                return {
                    "status": "success",
                    "entity_count": len(entities),
                    "entities": entity_list
                }
            elif response.status_code == 429:
                print(f"  [429] Rate limit hit for {file_path.name}. Retrying in {retry_delay}s... (Attempt {attempt+1}/{max_retries})")
                time.sleep(retry_delay)
                retry_delay += 10 # Increase delay
            else:
                return {
                    "status": "fail",
                    "error": f"HTTP {response.status_code}: {response.text[:100]}"
                }
        except Exception as e:
            return {
                "status": "fail",
                "error": str(e)
            }
    
    return {"status": "fail", "error": "Max retries exceeded (429)"}

def main():
    chapter_files = sorted(list(STORY_DIR.glob("*.md")))
    results = []
    
    print(f"Final Verification: Testing {len(chapter_files)} chapters...")
    
    for cf in chapter_files:
        print(f"Processing {cf.name}...")
        res = test_chapter(cf)
        res["filename"] = cf.name
        results.append(res)
    
    # Calculate metrics
    total = len(results)
    passed = sum(1 for r in results if r["status"] == "success")
    failed = total - passed
    missing = sum(1 for r in results if r["status"] == "success" and r["entity_count"] == 0)
    
    # Generate Markdown Report
    report = []
    report.append("# Final API Test Report: Entity Extraction")
    report.append(f"\n**Summary Metrics:**")
    report.append(f"- Total Chapters: {total}")
    report.append(f"- Pass Rate: {passed/total*100:.1f}% ({passed}/{total})")
    report.append(f"- Fail Rate: {failed/total*100:.1f}% ({failed}/{total})")
    report.append(f"- Missing Rate: {missing/total*100:.1f}% ({missing}/{total})")
    
    report.append("\n## Detailed Results per Chapter")
    
    for r in results:
        report.append(f"\n### {r['filename']}")
        if r["status"] == "success":
            report.append(f"- **Status**: ✅ Success")
            report.append(f"- **Entities Found**: {r['entity_count']}")
            if r["entities"]:
                report.append("| Entity | Label |")
                report.append("| :--- | :--- |")
                for e in r["entities"][:20]: # Limit to top 20 to keep report readable
                    report.append(f"| {e['name']} | {e['label']} |")
                if len(r["entities"]) > 20:
                    report.append(f"| ... | (+{len(r['entities'])-20} more) |")
            else:
                report.append("- *No entities extracted.*")
        else:
            report.append(f"- **Status**: ❌ Failed")
            report.append(f"- **Error**: {r['error']}")
            
    # Save report to artifacts directory (path passed via env or just use absolute for this machine)
    # Since I don't have the artifact dir path directly in python easily, I'll print it to stdout with a marker
    
    sys.stdout.reconfigure(encoding='utf-8')
    print("\n" + "\n".join(report))

if __name__ == "__main__":
    main()
