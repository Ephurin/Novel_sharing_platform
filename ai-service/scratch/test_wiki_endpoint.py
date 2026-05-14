import requests
import json

url = "http://localhost:8000/v1/enhanced/process-interactions"
payload = {
    "story_id": "test_debug",
    "text": "Kael drew his sword and charged at Elara in the Blackspire Citadel."
}

r = requests.post(url, json=payload)
print("STATUS:", r.status_code)

if r.status_code == 200:
    data = r.json()
    print("ENTITIES:", data.get("entities_extracted", 0))
    print("RESOLVED:", data.get("entities_resolved", 0))
    print("EVENTS:", data.get("events_extracted", 0))
    print("STATES:", data.get("states_extracted", 0))
    print()
    for e in data.get("entities", [])[:10]:
        name = e.get("resolved_name", e.get("word", "?"))
        etype = e.get("entity_type", "?")
        print(f"  - {name}: {etype}")
    print()
    print("APPLIED RELATIONS:", len(data.get("applied_relations", [])))
    print("SUGGESTED RELATIONS:", len(data.get("suggested_relations", [])))
    print("PROCESSING MS:", data.get("processing_ms"))
else:
    print("ERROR:", r.text[:500])
