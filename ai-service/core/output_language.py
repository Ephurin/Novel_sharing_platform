VIETNAMESE_EVENT_OUTPUT = (
    "Ngôn ngữ đầu ra: viết summary và từng mục consequences bằng tiếng Việt tự nhiên, có dấu. "
    "Không viết các phần diễn giải này bằng tiếng Anh, kể cả khi văn bản nguồn dùng ngôn ngữ khác. "
    "Giữ nguyên tên riêng, mã định danh, trích dẫn nguyên văn và các khóa JSON. "
    "event_type là mã phân loại; không dịch mã hoặc tên trường trong cấu trúc JSON. "
)

# Long-run live test (2026-11-15), issue 10: brainstorm and setup suggestions came back sometimes in
# English, sometimes in Vietnamese; their prompts were English and named no output language.
VIETNAMESE_TEXT_OUTPUT = (
    "Ngôn ngữ đầu ra: viết mọi nội dung dành cho tác giả (tên gọi mới, mô tả, luật thế giới, tiêu đề, "
    "sự kiện, văn bản truyện) bằng tiếng Việt tự nhiên, có dấu. Không trả lời bằng tiếng Anh, kể cả khi "
    "hướng dẫn hệ thống viết bằng tiếng Anh. Giữ nguyên các khóa JSON, mã phân loại, ID và tên riêng đã có. "
    # Live retest N1: brainstorm invented "Kaelen Vane", "Lyra Dawnseeker" for a Vietnamese story.
    "Tên riêng mới (nhân vật, địa danh, tổ chức, vật phẩm) đặt theo phong cách tiếng Việt, thuần Việt hoặc "
    "Hán-Việt, hợp với bối cảnh truyện; chỉ dùng tên nước ngoài khi tác giả yêu cầu hoặc bối cảnh đòi hỏi. "
)


def output_language_rule(locale: str | None = "vi-VN") -> str:
    """The output-language sentence for a system prompt. The platform writes Vietnamese by default."""
    if not locale or locale.lower().startswith("vi"):
        return VIETNAMESE_TEXT_OUTPUT
    return (f"Output language: write every human-readable text field in the language of locale {locale}. "
            "Keep JSON keys, enum codes, IDs and existing proper names unchanged. ")
