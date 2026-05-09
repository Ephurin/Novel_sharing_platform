import requests
import json

url = "http://127.0.0.1:8000/v1/ai/extract-entities"
payload = {
    "text": "Kael Draven đứng trên tường thành Ashenhold. Order of the Black Sun đã đến. Kael sử dụng chiêu Celestial Collapse và rút ra thanh kiếm Blood Oath."
}

def test_extract_entities():
    print(f"Testing {url}...")
    try:
        response = requests.post(url, json=payload)
        response.raise_for_status()
        data = response.json()
        
        entities = data.get("entities", [])
        print(f"\nResults ({len(entities)} entities):")
        for e in entities:
            print(f"  - Entity: {e.get('Entity')} | Label: {e.get('Label')}")
            
    except Exception as e:
        print(f"Test failed: {e}")
        if hasattr(e, 'response') and e.response:
            print(f"Response: {e.response.text}")

if __name__ == "__main__":
    test_extract_entities()
