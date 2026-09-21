# Aethelgard Real-Novel Evaluation Corpus — Working Report

## Batch B01

- Processed chapters: 1–10
- High-confidence temporal anchor: end of chapter 9 (chapter 10 chronology flagged for review)
- New entities: 30
- New relationship histories: 7
- New memory chunks: 29
- Ambiguities/conflicts: 8
- Official retrieval queries: deferred
- Next range: chapters 11–19

## High-value long-range candidates discovered

1. Alan’s broken mana core and the escalating physical cost of Flash Surge.
2. Elena’s trust in Alistair versus Alan’s conditional skepticism.
3. Gregor’s explicit foster-father relationship to Alan.
4. The overloaded Earth Vein Core fragment and the inferred siphoning mechanism.
5. Hoa Chuông Trầm Tích as a recurring environmental/medical signal.
6. Oakhaven’s ecological collapse as a possible consequence of larger world infrastructure.
7. The chapter-9/chapter-10 temporal replay, useful later as a chronology/negative-label test but not as clean ground truth.

## Ground-truth discipline

- Character statements that explain unobserved system-level causes are stored as `inferred`, not silently promoted to canonical fact.
- Contradictory attributes/events are excluded from benchmark ground truth and logged in `ambiguities.json`.
- No facts from chapters 11+ were used to resolve B01 contradictions.


## Batch B02

- Processed chapters: 11–19
- New entities: 10
- New memory chunks: 33
- New/expanded relationship histories: 5 (including 1 new adversarial relation)
- New ambiguities: 4; existing ambiguities expanded where B02 adds evidence
- Official retrieval queries: still deferred
- Next range: chapters 20–28

## B02 high-value long-range candidates

1. **Elena → Alistair temporal supersession:** admiration/hope (B01) → shock (ch12) → blame (ch14) → explicit rejection of savior dependence (ch15–19).
2. **Gregor → Alan setup/payoff:** foster-father relationship established in ch7 → Gregor protects Alan in ch11 → Gregor dies holding Roland back and entrusts Oakhaven’s future to Alan in ch18.
3. **Anti-Temple chemical countermeasure:** prepared in ch13–15 → operationally validated against Marcus’s force in ch16 → incorporated into mines in ch17 and used during the Roland escape in ch18.
4. **Reserve seeds:** explicitly carried into the underground evacuation in ch17 and framed as Oakhaven’s future; high-value object for later reappearance/payoff tests.
5. **Flash Surge cumulative cost:** repeated use progressively damages Alan; ch19 gives a severe functional warning. This is a strong temporal-state retrieval target.
6. **Siphoning mechanism:** chapter 14 provides direct on-page evidence of local Temple extraction through a root-mounted device, partially upgrading earlier inferred mechanism claims.
7. **Alistair hidden-motive claims:** chapter 17 introduces a Varian-attributed account about the void/false sky and Alistair’s destructive path. Kept `inferred` pending later confirmation.

## B02 ground-truth discipline

- The source now directly confirms **local Temple energy extraction behavior**, but not yet every claimed system-level consequence or Alistair’s knowledge.
- Statements by Roland, Alan, Elena, Brand, or narration filtered through their beliefs are preserved as attributed claims where motive/hidden causality is not directly demonstrated.
- The chapter-9→10 temporal reset remains unresolved. Chapters 10–19 are treated as an internally ordered branch, not as proof that the transition from chapter 9 is clean.
- The scout Miller and blacksmith Miller remain separate IDs pending explicit identity evidence.
- Exact Alan injury side/size measurements remain excluded from benchmark ground truth; the persistent worsening injury itself is canonical.
