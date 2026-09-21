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


## Batch B05

- Processed chapters: 37–45
- New entities: 3
- New memory chunks: 32
- New relationship record: 1; 3 existing relationship histories expanded
- New ambiguities: 5; auxiliary-pillar ambiguity expanded
- Retrieval queries added: 8 (rq-0017..rq-0024)
- Next range: chapters 46–55

## B05 high-value long-range dependencies

1. **Korgan/civilian aid → troop-level trust:** Elena’s ch30 rescue of Korgan and ch36 treatment of Demon civilians are explicitly cited in ch37 as reasons Demon troops now respect and cooperate with Alan/Elena.
2. **Thần Tinh sword → nullification charges → infrastructure sabotage:** the anti-mana principle becomes a forge-made sabotage device in ch37 and is operationally used against siphoning infrastructure from ch38 onward.
3. **Life Core old-but-important state:** the Mảnh Lõi Sinh Mệnh is not recovered or even mentioned in ch37–45, so a correct cutoff-45 retrieval must reach back to ch34–36 rather than prefer recent combat memories.
4. **Human–Demon alliance under historical strain:** ch41 and ch44 surface conflicting accounts of the old Hẻm Vực/Tro Tàn battle. The modern alliance survives because practical trust and shared survival repeatedly override unresolved historical blame.
5. **False-sky revelation:** ch42 directly shows natural stars through a local breach, creating a strong future-leak negative for cutoffs ≤41. Ch45 repeats a near-identical reveal and is flagged as a narrative echo.
6. **Pressure Pillar No. 2 replay:** the same numbered pillar is destroyed in ch40, ch42 and ch45, with ch44 planning it as still intact. This is now one of the corpus’s strongest temporal/hard-negative cases.
7. **Environmental consequence of siphoning:** ch43’s stone-ice beetle swarm connects geological corruption to a non-human hazard, broadening retrieval beyond direct Temple-vs-resistance combat.

## B05 ground-truth discipline

- The exact number and survival state of auxiliary Pressure Pillars is not frozen: ch38 says twelve collapse, ch39 says eight remain, and later chapters continue attacking numbered pillars.
- Ch40/ch42/ch45 Pillar-No.2 destructions are retained as source events but tagged `narrative_echo` / `do_not_use_as_clean_ground_truth`; no silent reconciliation is attempted.
- The old Hẻm Vực battle is stored only as attributed testimony because Garrick, Valora and Gargas give conflicting blame accounts.
- Gargas’s ch44 medical-debt scene is locally canonical, but it is not treated as his first contact with Alan/Elena because he already appears in ch31.
- The Mảnh Lõi Sinh Mệnh remains unrecovered by the last explicit state available; absence from ch37–45 is not converted into a new canonical object event.
- The natural-star reveal is explicit in ch42, while ch45 is treated as a repeated reveal pending human review.

## Retrieval evaluation status after B05

The frozen query set now contains 24 queries. B05 adds a strong recency trap for the Life Core, a true-sky future-leak test, contested-history multi-memory retrieval, setup/payoff trust retrieval for Elena and the Demon forces, and explicit semantic hard negatives built from the repeated destruction of Pressure Pillar No. 2.


## Batch B06

- Processed chapters: 46–55
- New entities: 9
- New memory chunks: 35
- New relationship records: 2; 4 existing relationship histories expanded
- New ambiguities: 2; 5 earlier ambiguity records expanded
- Retrieval queries added: 8 (rq-0025..rq-0032)
- Next range: chapters 56–61

## B06 high-value long-range dependencies

1. **Alistair source-status supersession:** the chapter-17 Varian account about the false sky remains attributed for most of the book; chapter 54 narrator exposition directly confirms Alistair discovered the artificial sky/ecological crisis and adopted an extreme utilitarian sacrifice logic. The “divine ascent” interpretation is still not confirmed.
2. **Sewer No. 7 setup → execution:** Garrick identifies the old sewer route in ch50 → the route is shown to be a chemical/magical blind spot in ch51 → the coalition silently enters the Solaria slums through it.
3. **Sael network setup → uprising → armament → Inner Gate:** Sael commits the hidden slum network in ch52 → destruction of the commercial-crossroads pillar triggers the uprising in ch53 → the arsenal falls and the fighters are armed in ch54 → the same force participates in the Inner Gate breach in ch55.
4. **Elena’s non-mana sensor countermeasure:** chemical disruption of Vespera optics in ch46 generalizes into the attic concealment trick in ch52, creating a strong low-lexical-overlap world-rule case.
5. **Human–Demon alliance maturity:** Korgan rescue/civilian medicine from earlier batches pays off in routine mixed-force cooperation at Hẻm Vực and the buffer-stream camp, then in the joint Solaria assault.
6. **Life Core recency trap:** the Mảnh Lõi Sinh Mệnh still has no acquisition/payoff through ch55; retrieval must reach back to ch34–36 and avoid confusing the newer Earth Vein Core with the target object.
7. **Hẻm Vực force-state replay:** Roland’s three-thousand cavalry are buried in ch45, buried again in ch47, then reappear as an active force in ch48–49. This is a high-value temporal hard-negative cluster.

## B06 ground-truth discipline

- Chapter 54 upgrades the false-sky/ecological-crisis and utilitarian-sacrifice parts of Alistair’s backstory to canonical narrator-supported facts; it does **not** confirm the earlier divine-ascent interpretation.
- Alistair’s right-arm anatomy remains ambiguous: ch54 reinforces that a prosthetic already existed from the old Demon King battle, while ch21 depicts a fresh severing/damage event.
- Exact Roland cavalry strength is not frozen after ch45 because ch47–49 repeatedly destroy and revive the same nominal three-thousand force.
- Exact Pressure Pillar count/state remains unfrozen. Ch46 again collapses twelve, ch49 refers to Pillar No.4 as active, ch50 says all twelve are disabled, and ch53 destroys an active numbered pillar in Solaria.
- Repeated natural-star reveals in ch47, ch49 and ch53 are retained as local source events but are not treated as the first reveal; chapter 42 remains the provisional first on-page reveal.
- The patrol statement in ch52 that it acts under “Alistair’s order” is stored as an attributed claim, not independently verified authorship.
- “Pillar No.1” in ch34 and ch53 is not automatically merged into one physical object because the sites differ and the source does not clarify numbering scope.

## Retrieval evaluation status after B06

The frozen query set now contains 32 queries. B06 adds an Alistair-motive future-leak test, a source-status supersession query, Hẻm Vực force-replay hard negatives, Sewer-No.7 location/world-rule retrieval, the Sael uprising setup→payoff chain, a non-mana sensor-disruption semantic relation, and a strong old-but-important Life Core query with the newer Earth Vein Core as a similar-entity hard negative.
