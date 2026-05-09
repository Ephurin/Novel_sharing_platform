# System Overview

## Goal
AI Writing Co-pilot giúp:
- Trích xuất entity
- Theo dõi logic truyện
- Gợi ý viết dựa trên context

## Core idea
System không chỉ generate text, mà:
→ quản lý trạng thái của story world

## Main flow
User viết → AI phân tích → cập nhật KB → gợi ý tiếp

## Tech stack
- Backend: FastAPI
- AI: PhoBERT (NER) + LLM API
- Storage: JSON KB + Vector DB

## Key constraints
- Không overwrite KB trực tiếp
- Luôn có human-in-the-loop