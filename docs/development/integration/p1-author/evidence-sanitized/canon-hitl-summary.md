# Canon / HITL — Curated before-and-after evidence

All mutations below were performed through the real Author UI using fictional QA data. Database checks were read-only. Manual proposals were used because the follow-up acceptance budget was zero provider calls. This is not evidence of a new AI extraction run.

| Sequence | UI action / checkpoint | Brain | Canon result |
|---|---|---:|---|
| T0 | Before any proposal | 1 | No entities or events |
| T1 | Lâm Phong and Tô Mặc candidates pending | 1 | Still no Canon entities/events |
| T2 | Reject Tô Mặc | 1 | Canon counts and comparison hashes unchanged |
| T3 | Approve only Lâm Phong | 2 | One PER entity; rejected Tô Mặc absent |
| T4 | Save description/appearance | 3 | Profile version 1 |
| T5 | Add personality | 4 | Profile version 2; appearance preserved |
| T6 | Save fictional QA note | 4 | Profile version 3; note-only save did not increment Brain |
| T7 | Manual event pending, then edit its summary | 4 | No Canon event until approval |
| T8 | Approve edited event | 5 | One current event with the edited summary |
| T9 | Create correction of approved event | 5 | Original event/hash unchanged while correction pending |
| T10 | Approve correction with explicit participant mapping | 6 | New current event; old version retained as history |
| T11 | Logout/login; reopen profile/event | 6 | Profile fields and corrected event survived; before/after comparison hashes matched |
| T12 | Huyết Ngọc Bội ITEM pending then approved | 7 | Two Canon entities: Lâm Phong PER and Huyết Ngọc Bội ITEM |

Final storage contained two event rows: the original and its correction, with the correction referencing its predecessor. The UI displayed one current event, not two conflicting current events. Proposal decisions were four accepted and one rejected; the rejected one was Tô Mặc.

The profile audit retained three saves by the QA author: profile versions 0→1, 1→2, 2→3; corresponding Brain transitions 2→3, 3→4, 4→4. Audit history was checked in storage; a full profile-history UI was not claimed.

After reload/login, the UI still showed the saved appearance and personality. The separate private-notes field contained only a synthetic QA note; its content and identifiers are omitted here. Readback and persistence passed. Manuscript text was never overwritten by the unaccepted AI draft.

[Approved ITEM capture](canon-approved-item.png) shows the successful-approval message, Brain v7, pending count 0 and Huyết Ngọc Bội in the Items tab. Earlier pending screenshots did not clearly show the candidate card and were excluded rather than relabeled as proof.

Results: A01–A07 and B01–B07 passed within this manual-proposal/profile/event-correction scope. Historical state transitions, AI entity-occurrence checkpoints and draft acceptance/rejection were not established by these checks.
