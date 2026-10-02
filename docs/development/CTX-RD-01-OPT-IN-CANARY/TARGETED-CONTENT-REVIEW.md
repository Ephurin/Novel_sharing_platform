# CTX-RD-01 — Targeted Content Review: Source-Grounded Canary Cases

This document provides the independent, source-grounded content review requested by Astra in `ASTRA-FROZEN-SOURCE-REPAIR-FINAL-REVIEW.md` for the two canonical replayed cases:
1. `core_gold:rq-0011` (Alan Than Tinh Sword Origin, Cutoff Ch 32)
2. `challenge:rq-0025` (Roland 3,000 Cavalry Chronology Contradiction, Cutoff Ch 49)

---

## 1. Case `core_gold:rq-0011` — Alan Than Tinh Sword Origin

### A. Context & Frozen Ground Truth
- **Task Prompt**: `"For a continuity note, state the established origin of Alan's personal Than Tinh sword based only on the supplied Story Brain evidence."`
- **Chapter Cutoff**: `32`
- **Frozen Canonical Evidence in Story Brain**:
  - **`mem-000089` (Chapter 27)**:
    > *"Bram, Alan, Elena, and Brand forge Alan's first Than Tinh short sword at Frostspine forge from anti-mana ore using mechanical heat/pressure and Elena's purification; the blade naturally dispels magic and resists mana."*
  - **`mem-000110` (Chapter 32)**:
    > *"At Frostspine forge, Brand and Alan forge the resistance's first Than Tinh weapon, an anti-mana short sword, but the unrefined ore cracks under high stress."*
- **Frozen Benchmark Rubric (`eval01e.RUBRIC`)**:
  - `must_support`:
    1. Chapter 27 is the established initial origin of Alan's personal Than Tinh sword.
    2. Chapter 32 first-forging does not replace Chapter 27 as the initial canonical origin.
  - `must_avoid`:
    1. Choosing Chapter 32 as the initial canonical origin.
    2. Merging Chapter 27 and Chapter 32 into a single unified event.

### B. Generated Model Output Analysis
The genuine draft produced by `gemini-3.8-flash` under `balanced-scope-v1` (selected tier 12k, entities pruned 63 -> 21):
> `[Ghi chú tính nhất quán / Continuity Note]: Theo ghi chép xác thực từ Chương 27 (mem-000089), thanh đoản kiếm Thần Tinh đầu tiên của Alan được rèn nên từ sự hợp tác giữa Bram, Alan, Elena và Brand. Kiếm được chế tác từ quặng kháng mana (anti-mana ore) bằng áp suất và nhiệt cơ học kết hợp với liệu pháp thanh tẩy của Elena; bản thân thanh kiếm có đặc tính tự nhiên là triệt tiêu ma thuật và kháng mana...`

### C. Forensic Scoring & Why `chronology_causality` is PARTIAL
1. **Canonical Source-Status Correctness (`PASS`)**:
   - The model correctly identified Chapter 27 (`mem-000089`) as the establishing origin of Alan's personal short sword.
   - It correctly cited the four participants (Bram, Alan, Elena, Brand), the Frostspine forge location, the anti-mana ore material, and Elena's purification technique.
   - It avoided falsely declaring Chapter 32 as the origin.
2. **Chronology / Causality (`PARTIAL`)**:
   - The generated note focused solely on affirming Chapter 27 as the canonical origin.
   - It did **not** explicitly reference Chapter 32 (`mem-000110`) or explain why Chapter 32's later claim of a "first Than Tinh weapon forged by Brand and Alan that cracked under high stress" is secondary/conflicting and does not overwrite Chapter 27.
   - Because `must_support` item #2 requires demonstrating that Chapter 32 does not replace Chapter 27, scoring this dimension as **`PARTIAL`** is strictly correct under the rubric.
3. **Ambiguity Handling (`PASS`)**:
   - The model avoided conflating the two distinct forging events into one hybrid narrative.
4. **Conclusion on `rq-0011`**:
   - Retaining `PARTIAL` on `chronology_causality` reflects truthful, unvarnished reporting. The model is factually accurate regarding the primary origin, but does not provide complete causal disambiguation between the two competing chapter claims.

---

## 2. Case `challenge:rq-0025` — Roland 3,000 Cavalry Chronology

### A. Context & Frozen Ground Truth
- **Task Prompt**: `"Summarize what happens to Roland's three-thousand heavy cavalry through chapter 49. Preserve chronology when the supplied memories disagree."`
- **Chapter Cutoff**: `49`
- **Frozen Canonical Evidence in Story Brain**:
  - **`mem-000167` (Chapter 45)**:
    > *"Explosive charges destroy Pressure Column #2, triggering a massive landslide that buries Roland's 3,000 heavy cavalry and breaches the approach to Hem Vuc Tro Tan."*
  - **`mem-000174` (Chapter 47)**:
    > *"Landslide buries Roland's 3,000 cavalry at the pass, repeating earlier tactical reports despite contradictory force tallies."*
  - **`mem-000177` (Chapter 49)**:
    > *"Roland commands 3,000 cavalry in a field engagement near Hem Vuc Tro Tan, contradicting previous burial reports."*
- **Frozen Benchmark Rubric (`eval01e.RUBRIC`)**:
  - `must_support`:
    1. Chapter 45 is the earliest on-page burial/destruction.
    2. Chapter 47 repeats burial with incompatible force continuation.
    3. Chapter 49 continuation is preserved without silent harmonization.
  - `must_avoid`:
    1. Calling Chapter 47 the first burial.
    2. Treating all memories as a clean single progression without contradiction.

### B. Generated Model Output Analysis
The genuine draft produced by `gemini-3.8-flash` under `balanced-scope-v1` (selected tier 12k, entities pruned 68 -> 20):
> `Theo các diễn biến được ghi nhận theo dòng thời gian tới chương 49, tình trạng lực lượng 3.000 kỵ binh thiết giáp của Roland xuất hiện nhiều ghi chép mâu thuẫn chưa được đồng nhất:`
> `- Tại Chương 45: Khi Cột Trụ Điều Áp số 2 bị phá hủy, vụ nổ mồi kích hoạt một trận lở đất được ghi nhận là đã chôn vùi quân đoàn 3.000 kỵ binh thiết giáp của Roland, khai thông lộ trình hướng về Hẻm Vực Tro Tàn.`
> `- Tại Chương 47: Một trận lở đất lại được ghi chép là chôn vùi 3.000 kỵ binh của Roland tại hẻm núi, lặp lại các báo cáo chiến thuật trước đó bất chấp việc số liệu quân số mâu thuẫn.`
> `- Tại Chương 49: Roland lại trực tiếp chỉ huy 3.000 kỵ binh trong một trận giao chiến thực địa gần Hẻm Vực Tro Tàn, mâu thuẫn trực tiếp với các báo cáo về vụ chôn vùi trước đó.`

### C. Forensic Scoring Against the Three-Point Chronological Chain
1. **Three-Point Chronology Chain (`PASS`)**:
   - **Point 1 (Ch 45)**: Identified as the initial on-page burial resulting from the demolition of Pressure Column #2.
   - **Point 2 (Ch 47)**: Identified as a repeat report of landslide burial with conflicting force tallies.
   - **Point 3 (Ch 49)**: Explicitly identified as Roland actively fielding the 3,000 cavalry near Hem Vuc Tro Tan.
   - Sequence preserved: Chapter 45 $\to$ Chapter 47 $\to$ Chapter 49.
2. **Ambiguity Handling (`PASS`)**:
   - The model explicitly identified the narrative as containing unresolved contradictions (*"xuất hiện nhiều ghi chép mâu thuẫn chưa được đồng nhất"*).
   - It did not invent a narrative excuse (e.g. "they dug themselves out" or "these were different cavalry").
   - It did not designate Chapter 47 as the initial burial.
3. **Conclusion on `rq-0025`**:
   - The generated draft fully meets the three-point chronology chain and contradiction preservation criteria. `PASS` is justified by source fact inspection beyond mere lexical occurrence.

---

## 3. Summary Assessment for Governance Gates

```text
core_gold:rq-0011 content evaluation    PARTIAL (factually correct on Ch 27; Ch 32 tension omitted)
challenge:rq-0025 content evaluation    PASS (full 45 -> 47 -> 49 chain and contradiction preserved)
aggregate content verdict               PARTIAL
canary gate status                      PARTIAL / REVIEW_REQUIRED
production default                      legacy-v1 (UNCHANGED)
global default switch                   NOT AUTHORIZED
P8-05 destructive cleanup               BLOCKED_PENDING_STABILITY
```
