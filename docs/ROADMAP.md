# Roadmap — AI Writing Copilot

## Nguyên tắc sắp thứ tự

Story knowledge đúng và có provenance phải hoàn thành trước generation nâng cao. Không ưu tiên multi-agent hoặc fine-tuning khi data structure, retrieval và consistency chưa ổn định.

## Phase 0 — Stabilize foundation

- Đồng bộ code, README, API docs và dependency với pure-LLM implementation.
- Chuẩn hóa settings, error taxonomy và structured logging.
- Không biến provider failure thành “không có kết quả”.
- Chuyển scratch checks quan trọng thành unit/API tests có fake LLM.
- Định nghĩa schema version và migration policy.

**Exit criteria:** build/lint/test lặp lại được; failure có status rõ; tài liệu không mâu thuẫn.

## Phase 1 — Entity quality

- Entity normalization và alias handling.
- KB-anchored entity resolution.
- Entity validation, type repair và author confirmation.
- Tách AI inference khỏi author-confirmed/locked facts.

**Exit criteria:** có evaluation set; canonical entity ổn định khi phân tích lại cùng revision.

## Phase 2 — Story state and timeline

- Chuẩn hóa append-only event history.
- Gắn event với chapter, scene, revision và raw evidence.
- Xây world-state projector có thể replay.
- Lưu relation history và state transitions.

**Exit criteria:** replay event tái dựng cùng state; không tạo duplicate khi retry.

## Phase 3 — Consistency engine

- Deterministic checks: dead character, location jump, injury/action, ownership, timeline và relation conflict.
- LLM reasoning cho personality, causality và world-rule khi rule engine không đủ.
- Finding trả severity, reason, evidence và suggested action.

**Exit criteria:** đo được precision/false-positive rate; mọi warning có provenance.

## Phase 4 — Retrieval

- Tạo chapter/scene/event summaries và embeddings.
- Hybrid retrieval: semantic + entity + temporal + relation filters.
- Context budget và relevance evaluation.
- Không retrieve raw chapter mặc định.

**Exit criteria:** context liên quan hơn baseline recent-chapters trên bộ truyện dài thử nghiệm.

## Phase 5 — Context builder

- Structured current scene, entity states, relations và recent events.
- Retrieved historical memory và author instructions.
- Prompt assembly có version, token budget và trace.

**Exit criteria:** generation request có thể giải thích chính xác context đã dùng.

## Phase 6 — Writing

- Continue, expand, rewrite, dialogue, brainstorm và scene generation.
- Trả suggestion dưới dạng preview/diff; hỗ trợ accept/reject/undo.
- Đo acceptance rate, edit distance, latency và cost.

**Exit criteria:** workflow hoàn chỉnh không làm mất nội dung hoặc tự ghi đè quyết định tác giả.

## Phase 7 — Planning

- Premise, character, world, plot, act, chapter và scene objects.
- Required events và expected state transitions.
- Liên kết planning objects với Story Brain.

## Phase 8 — Editing

- Grammar, wording, tone, voice và pacing.
- Beta reader: weak scene, repetition, emotional impact và unresolved thread.
- Tách editing finding khỏi canonical story facts.

## Phase 9 — Visualization

- Character network, faction, relationship changes và event timeline.
- Unresolved conflicts và evidence navigation.
- Graph chỉ là view của Story Brain, không phải core storage mặc định.

## Production integration

Khi Novel Platform sẵn sàng tích hợp:

- Nhận canonical IDs và JWT/service token.
- Bổ sung revision, content hash, idempotency và analysis job.
- Chuyển dữ liệu bền vững sang PostgreSQL; dùng queue cho tác vụ dài.
- Thêm audit cho accept/reject/override.
- Xây metadata, classification và moderation thành pipeline riêng, không trộn prompt sáng tác.
