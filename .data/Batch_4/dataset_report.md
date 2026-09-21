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

## Batch B03

- Processed chapters: 20–28
- New entities: 14 (including one late-registered earlier location, Vùng Đệm)
- New memory chunks: 34
- New/expanded relationship histories: 4 relationship records affected; 1 new alliance relation
- New ambiguities: 8; 2 earlier ambiguity records updated with direct Alistair evidence
- Retrieval queries frozen: 8
- Next range: chapters 29–36

## B03 high-value long-range dependencies

1. **Alistair motive supersession:** pre-ch20 evidence is indirect; in ch20–21 Alistair directly states that sacrifice is necessary to maintain the Vòm Trời / stabilize Solaria. This creates a strong future-leak trap for cutoffs ≤19.
2. **Corrupted-root countermeasure:** Elena collects the root material in ch14 → prepares anti-Temple chemistry → uses the retained countermeasure against Alistair in ch21.
3. **Ordinary sword → Thần Tinh sword:** Alistair destroys Alan’s ordinary sword in ch20 → Bram proposes anti-mana Thần Tinh in ch26 → the sword is forged in ch27 → its anti-mana property is observed against Garen in ch28.
4. **Gregor’s sacrifice remains motivationally active:** ch18 sacrifice/entrustment → explicitly invoked by Alan/Elena in the underground resistance in ch23–25.
5. **Alan–Elena separation/reunion:** tower separation in ch21 → parallel survival/search in ch23–24 → reunion and restored joint operation in ch25.
6. **Oakhaven–Frostspine alliance:** a reciprocal shelter/water-detoxification pact is established in ch22, but ch26 replays the same establishment scene and is therefore tagged as a chronology conflict rather than silently merged.
7. **Thần Tinh as a world-rule retrieval target:** ch27 states its anti-mana behavior; ch28 provides an observed combat payoff, enabling claim-vs-demonstration queries.

## B03 ground-truth discipline

- Alistair’s **spoken acceptance of sacrifice** is now canonical; the earlier void/false-sky/divine-ascent account remains only Varian-attributed and unconfirmed.
- Exact Alistair right-arm anatomy is not frozen because ch20 and ch21 conflict.
- Exact Oakhaven survivor counts are excluded from global ground truth because ch20 (19) conflicts with ch22/ch26 (300–400+).
- Chapter 22→26 chronology contains separation and alliance replays. Local chapter events are retained, but replayed “first establishment” states are marked ambiguous.
- Alan’s ordinary sword is canonically destroyed in ch20; its unexplained reappearance in ch23–25 is not treated as the same surviving object.
- Exact Thần Tinh sword length is excluded because ch27 and ch28 give different measurements.

## Retrieval evaluation status after B03

The corpus now contains enough temporal distance to freeze an initial 8-query set covering future leakage, relationship history, setup/payoff, low lexical overlap, old-but-important memory, world rules, important-object history, and multiple-memory reasoning. Query IDs are append-only and will be expanded after later batches.



## Batch B04

- Processed chapters: 29–36
- New entities: 11
- New memory chunks: 38
- New relationship records: 3; 3 existing relationship histories expanded
- New ambiguities: 3; 2 earlier ambiguity records expanded
- Retrieval queries added: 8 (rq-0009..rq-0016)
- Next range: chapters 37–45

## B04 high-value long-range dependencies

1. **Korgan rescue → alliance access:** Elena saves Korgan in ch30 → Korgan gives a recognition token → Gargas accepts it in ch31 → Valora negotiates an alliance → the alliance pays off in joint battle in ch33 and civilian trust in ch36.
2. **Thần Tinh object-history replay:** the sword is forged in ch27 and used in ch28–29, but ch31–32 repeats the ore-acquisition/“first forging” setup. The later scene is retained as source evidence but excluded from clean origin chronology and used as a hard negative.
3. **Anti-mana principle scales upward:** individual combat nullification → siphoning-lens disruption → nullification-charge planning → auxiliary-pillar sabotage → powered gate-cable cutting. This is a strong low-lexical-overlap/multi-memory benchmark chain.
4. **Valora relationship evolution:** suspicion at the tomb entrance → reciprocal alliance → observed joint victory → explicit respect for Oakhaven capability.
5. **Mảnh Lõi Sinh Mệnh objective state:** introduced as a lower-tomb target in ch34; by ch36 it remains unseen/unrecovered, creating a clean temporal-state guard against hallucinated completion.
6. **Demon civilian trust:** alliance expands beyond leaders when Elena treats a Demon child in ch36 and civilians explicitly offer Thần Tinh ore.

## B04 ground-truth discipline

- Exact auxiliary Pressure Pillar totals are excluded from cross-chapter ground truth because the source alternates between twelve and six.
- Chapter 32’s “first” Thần Tinh forging is marked as a narrative replay, not silently reconciled with chapter 27.
- The Mảnh Lõi Sinh Mệnh is stored as an inferred/target object until it is directly observed; no acquisition is recorded by chapter 36.
- Brand/Bram’s transition from the collapsed fourth forge to the ancient-tomb forge is left unresolved rather than invented.
- Lăng Mộ Thượng Cổ and Lăng Mộ Quỷ Tộc are consolidated as one location because chapters 30–36 use the names continuously for the same gate/base/lower levels.

## Retrieval evaluation status after B04

The frozen query set now contains 16 queries. B04 adds a clean future-leak trap around Korgan’s token, a narrative-replay negative for the Thần Tinh origin, relationship-history queries for the Human–Demon alliance, infrastructure-sabotage multi-memory reasoning, and a temporal-state query that requires distinguishing “search target” from “object already acquired.”
