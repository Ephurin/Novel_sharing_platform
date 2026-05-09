import requests
import json

url = "http://127.0.0.1:8000/v1/enhanced/process-interactions"
payload = {
    "story_id": "writing_session_740",
    "text": """
Bầu trời phía trên Ashenhold không còn mang sắc xanh của hy vọng. Thay vào đó, nó là một tấm màn xám xịt của khói và tàn tro, bị xé toạc bởi những tia chớp tím ngắt của ma thuật hắc ám. Order of the Black Sun đã đến. Chúng không mang theo lời cảnh báo, chỉ mang theo cái chết.

Kael Draven, người đời vẫn gọi là the Ashen Knight, đứng trên tường thành đổ nát, thanh kiếm Cinderbound của hắn cắm sâu vào lớp đá vôi đang nứt vỡ. Máu – cả của hắn và của kẻ thù – nhuộm đen lớp giáp bạc đã từng sáng chói. Hắn thở dốc, từng luồng hơi lạnh buốt của Frostmere Valley tràn vào lồng ngực đang rát bỏng.

"Kael! Chúng ta phải rút lui!"

Tiếng hét của Elara Windrider vang lên giữa tiếng gầm rú của những con rồng bóng tối. Cô vừa phóng một mũi tên bọc trong ma thuật gió, tạo ra một cơn lốc xoáy đẩy lùi hàng loạt chiến binh của Crimson Covenant đang cố gắng leo lên. Gương mặt của Elara lấm lem bùn đất, đôi mắt sắc sảo của một cung thủ vùng biên giới giờ đây chỉ còn sự kinh hoàng.
"""
}

def test_api():
    print("Testing Integrated Entity Pipeline API...")
    try:
        response = requests.post(url, json=payload)
        response.raise_for_status()
        data = response.json()
        
        entities = data.get("entities", [])
        print(f"\nExtracted Entities ({len(entities)}):")
        for e in entities:
            word = e.get('word', '')
            # Safe print for Windows console
            safe_word = word.encode('ascii', 'ignore').decode('ascii')
            print(f"  - {safe_word} (Type: {e.get('entity_type')}, Source: {e.get('source')})")
            
        print(f"\nApplied Relations ({len(data.get('applied_relations', []))}):")
        for r in data.get("applied_relations", []):
            rel = r["relation"]
            print(f"  - {rel['subject']} --[{rel['relation']}]--> {rel['object']}")
            
    except Exception as e:
        print(f"API Test failed: {e}")
        if hasattr(e, 'response') and e.response:
            print(f"Response: {e.response.text}")

if __name__ == "__main__":
    test_api()
