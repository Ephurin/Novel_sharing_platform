import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import logging

current_dir = Path(__file__).parent.parent
sys.path.append(str(current_dir))
load_dotenv(current_dir / ".env")

logging.basicConfig(level=logging.INFO)

from services.entity_pipeline.pipeline import EntityPipeline
from core.llm_service import LLMService, LLMServiceError

def fake_call_gemini(self, system_prompt, user_prompt):
    print("\n❌ SIMULATING GEMINI 429 QUOTA EXCEEDED ERROR...")
    raise LLMServiceError("Gemini request failed: 429 Quota Exceeded")

# Monkey patch to force a 429 error
LLMService._call_gemini = fake_call_gemini

def main():
    print("🚀 Khởi chạy NER Pipeline (Gemini Primary -> Colab Fallback)")
    
    llm_service = LLMService(
        provider=os.getenv("LLM_PROVIDER"),
        model=os.getenv("LLM_MODEL"),
        fallback_provider=os.getenv("LLM_FALLBACK_PROVIDER")
    )
    pipeline = EntityPipeline(ml_enabled=True)
    
    text = "Tiêu Viêm lôi ra Huyền Trọng Xước, tung một chiêu Diệm Phân Phệ Lãng Xích đánh bay gia chủ Nạp Lan gia tộc."
    print(f"\n📖 Văn bản đầu vào: {text}\n")
    
    print("⏳ Đang chạy NER Pipeline (đã tắt Heuristics)...")
    results = pipeline.run(text=text, llm_service=llm_service)
    
    print("\n✅ KẾT QUẢ TRÍCH XUẤT:")
    for r in results:
        print(f" - {r['phrase']}: {r.get('entity', 'UNKNOWN')} (Score: {r['score']})")

if __name__ == "__main__":
    main()
