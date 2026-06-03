import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Ensure we can import from core
current_dir = Path(__file__).parent.parent
sys.path.append(str(current_dir))

# Load .env file
load_dotenv(current_dir / ".env")

from core.llm_client import LLMClient

def main():
    provider = os.getenv("LLM_PROVIDER", "openai")
    model = os.getenv("LLM_MODEL", "qwen2.5:7b")
    
    print("🚀 Testing Colab LLM connection via Ngrok...")
    print(f"Provider: {provider}")
    print(f"Model: {model}")
    print(f"Custom URL: {os.getenv('CUSTOM_LLM_URL')}")
    
    client = LLMClient(
        provider=provider,
        model=model,
        timeout_seconds=120
    )
    
    system_prompt = "Bạn là AI phân tích thực thể Tiên hiệp. Chỉ xuất JSON."
    prompt = "{\"phrase\": \"Băng Lam Kiếm\", \"label\": \"ITEM\"}, {\"phrase\": \"Lâm Nguyệt Nhi\", \"label\": \"PER\"}" # Mocking a realistic input if needed, or just plain text.
    
    prompt = "Phân tích câu: Lâm Nguyệt Nhi rút Băng Lam Kiếm ra chém một đòn Huyết Ma Trảm."
    
    print("\n⏳ Sending request to Colab (Please wait a few seconds)...")
    try:
        result = client.generate(
            prompt=prompt,
            system_prompt=system_prompt,
            temperature=0.0
        )
        print("\n✅ Success! Response from Colab LLM:")
        print("-" * 50)
        print(result)
        print("-" * 50)
    except Exception as e:
        print(f"\n❌ Error: {e}")

if __name__ == "__main__":
    main()
