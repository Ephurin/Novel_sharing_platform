import os
import sys
from pathlib import Path

# Add the current directory to sys.path to import core modules
sys.path.append(str(Path.cwd() / "ai-service"))

from core.ner_engine import NEREngine
from core.entity_resolver import resolve_entities
from core.story_kb_manager import StoryKBManager

# Mock data
MODEL_DIR = Path("ai-service/models/phobert_ner_tienhiep")
text = """
Bầu trời phía trên Ashenhold không còn mang sắc xanh của hy vọng. Thay vào đó, nó là một tấm màn xám xịt của khói và tàn tro, bị xé toạc bởi những tia chớp tím ngắt của ma thuật hắc ám. Order of the Black Sun đã đến. Chúng không mang theo lời cảnh báo, chỉ mang theo cái chết.

Kael Draven, người đời vẫn gọi là the Ashen Knight, đứng trên tường thành đổ nát, thanh kiếm Cinderbound của hắn cắm sâu vào lớp đá vôi đang nứt vỡ. Máu – cả của hắn và của kẻ thù – nhuộm đen lớp giáp bạc đã từng sáng chói. Hắn thở dốc, từng luồng hơi lạnh buốt của Frostmere Valley tràn vào lồng ngực đang rát bỏng.

"Kael! Chúng ta phải rút lui!"

Tiếng hét của Elara Windrider vang lên giữa tiếng gầm rú của những con rồng bóng tối. Cô vừa phóng một mũi tên bọc trong ma thuật gió, tạo ra một cơn lốc xoáy đẩy lùi hàng loạt chiến binh của Crimson Covenant đang cố gắng leo lên. Gương mặt của Elara lấm lem bùn đất, đôi mắt sắc sảo của một cung thủ vùng biên giới giờ đây chỉ còn sự kinh hoàng.
"""

def main():
    engine = NEREngine(model_dir=MODEL_DIR)
    engine.load()
    
    entities = engine.predict(text)
    print(f"Raw NER predictions ({len(entities)}):")
    for e in entities:
        print(f"  {e}")
        
    kb_manager = StoryKBManager()
    kb = kb_manager.load_kb("test_session")
    
    resolved = resolve_entities(entities, kb)
    print(f"\nResolved entities ({len(resolved)}):")
    for r in resolved:
        print(f"  {r}")

if __name__ == "__main__":
    main()
