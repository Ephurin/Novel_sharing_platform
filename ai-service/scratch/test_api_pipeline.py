import requests
import json

url = "http://127.0.0.1:8000/v1/enhanced/process-interactions"
payload = {
    "story_id": "writing_session_740",
    "text": """
Bầu trời phía trên Ashenhold không còn mang sắc xanh của hy vọng. Order of the Black Sun đã đến.
Kael Draven đứng trên tường thành. Elara Windrider đang chuẩn bị ma thuật.
""",
    "use_existing_entities": True
}

response = requests.post(url, json=payload)
print(f"Status: {response.status_code}")
try:
    data = response.json()
    print(f"Entities found: {len(data.get('entities', []))}")
    for ent in data.get('entities', []):
        print(f"  - {ent.get('word')} (Score: {ent.get('score')})")
except Exception as e:
    print(f"Error: {e}")
    print(response.text)
