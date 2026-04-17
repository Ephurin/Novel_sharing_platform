from google import genai

# 1. Khởi tạo Client
client = genai.Client(api_key="AIzaSyB9ECaIaRPV_Is1Fl30YyWE9v-oGky8TCc")

# 2. Gọi API (Sử dụng model Gemini 2.5 Flash-Lite để tiết kiệm quota Free)
try:
    response = client.models.generate_content(
        model="gemini-2.5-flash-lite",
        contents="Hãy viết một đoạn giới thiệu ngắn (2 câu) cho một bộ web novel thể loại fantasy."
    )

    # 3. In kết quả
    print("--- Phản hồi từ Gemini (SDK Mới) ---")
    print(response.text)

except Exception as e:
    print(f"Lỗi: {e}")