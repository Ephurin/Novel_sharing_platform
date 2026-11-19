# P2 defense demo runbook

A step-by-step script for presenting P2 at the defense (around 2026-12-01). It uses the test novel "Kiếm Ấn Lôi Sơn" on the local live stack. Most of the demo needs **no model calls**. Only the optional AI segment (section 4) needs the live model, and turning it on needs the owner's approval each time.

Checked on 2026-11-19 against `main` @ `04b26100` (after #196), live model off. The results of that check are in section 7.

## 1. Before the demo

### Start the stack (live off)

```bash
export P1_SAFETY_PROJECT=ephurin-p2live LIVE_FREE_TIER_ENABLED=false LIVE_UPSTREAM_FORWARDING=false
C="docker-compose --env-file .eval-private/p2-live/runtime.env -f Pipeline_test/tools/compose.p1-live-safety.yml -f .eval-private/p2-live/compose.p2-live.yml"
$C up -d --build ai-service backend web
docker exec ephurin-p2live-ai-service-1 printenv LIVE_FREE_TIER_ENABLED   # must print false
```

- The web app runs at `http://127.0.0.1:18180`.
- Docker Desktop must be running first.
- The test author's sign-in is in `.eval-private/p2-live/eval-author.json`. Never show that file on screen.

### Snapshot the data before every rehearsal

Rehearsing changes the canon: accepting a proposal, removing a fact or retiring an entity cannot be undone from the UI. Take a snapshot first, and restore it after each rehearsal.

```bash
D=.eval-private/p2-live/snapshots/demo-$(date +%Y%m%d-%H%M); mkdir -p $D
MSYS_NO_PATHCONV=1 docker exec ephurin-p2live-postgres-1 sh -c 'pg_dumpall --clean --if-exists -U "$POSTGRES_USER"' > $D/postgres.sql
MSYS_NO_PATHCONV=1 docker exec ephurin-p2live-mongodb-1 sh -c 'mongodump --quiet --archive ${MONGO_INITDB_ROOT_USERNAME:+-u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin}' > $D/mongo.archive
```

To restore, stop the services that hold connections first:

```bash
$C stop ai-service backend web
MSYS_NO_PATHCONV=1 docker exec -i ephurin-p2live-postgres-1 sh -c 'psql -q -U "$POSTGRES_USER" -d postgres' < $D/postgres.sql
MSYS_NO_PATHCONV=1 docker exec -i ephurin-p2live-mongodb-1 sh -c 'mongorestore --quiet --drop --archive ${MONGO_INITDB_ROOT_USERNAME:+-u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin}' < $D/mongo.archive
$C start ai-service backend web
```

Two errors from `psql` are expected and harmless: "current user cannot be dropped" and "role … already exists".

A snapshot of the clean demo state (memory v29) was taken on 2026-11-19 in `.eval-private/p2-live/snapshots/demo-20261119-2252/`.

### Checklist

| Item | State on 2026-11-19 | Action |
|---|---|---|
| Demo novel title | "Kiếm Ấn Lôi Sơn — kiểm thử live 2026-11-15" | Rename it to "Kiếm Ấn Lôi Sơn" under "Quản lý" before the defense (owner decision) |
| Other novels on the account | 16 test novels ("PT-CV-001 live …", "Kịch bản A …", "Hạm Đội Sao Băng …") | Hide or delete them, or say they are test runs. Deleting cannot be undone, so take a snapshot first |
| Chapter 1 title | The draft reads "Chương 1", but the published copy and the chapter list still read "Chương 1: Bản thảo mới" | Republishing runs AI analysis, so it needs the live model. Otherwise leave it as is |
| Memory state | v29, nothing pending; 5 characters, 32 facts, 47 events | Nothing to do |
| Browser | Use a window at least 1440 px wide; the Story Brain drawer is cramped below that | Zoom to 100% |
| Pre-sign-in | Optional | Sign in before the session starts, so the password is never typed on screen |

## 2. Demo script without the model (about 10 minutes)

Each step lists what to click, what should appear, and the point to make.

| # | Click | What appears | Point to make |
|---|---|---|---|
| 1 | Sign in, press Enter | The "Tác phẩm" page | The UI is in Vietnamese, and Enter signs in |
| 2 | "Viết tiếp" on "Kiếm Ấn Lôi Sơn" | The writing IDE opens on the chapter edited last (ch. 18). On the left is the chapter list (18 chapters); at the top is "Đã lưu · hh:mm" | Autosave, chapter list, published and draft badges |
| 3 | "Story Brain" (top bar) | The "Bộ nhớ và định hướng tiểu thuyết" drawer, with the badge "Bộ nhớ chính thức v29" and the tabs Chờ duyệt (0), Nhân vật (5), Quan hệ, Dữ kiện (32), Sự kiện (47) … | The AI only writes from memory the author has approved. The version goes up with each approved change |
| 4 | Tab "Nhân vật" | Trần Vũ, Lam Yên, Mạc Độc …, each with status and last-seen place, for example "Còn sống · … (xuất hiện gần nhất, chương …)" | Character state is tracked chapter by chapter |
| 5 | Tab "Sự kiện" | 47 events by chapter, with the event type in Vietnamese and "Liên quan:" entities | The event timeline that feeds consistency checks |
| 6 | Tab "Dữ kiện" | World rules from the setup, then per-character facts such as "Sống/chết: Còn sống · Chương 9 · Trần Vũ" | Facts come from approved chapters, with the source chapter |
| 7 | Tab "Hồ sơ Codex" | Entity profiles and "Gộp hai tên trùng" | The author can edit profiles and merge duplicate names |
| 8 | Author control after approval (show, then cancel):<br>• "Dữ kiện" → "Sửa" on a status fact: a list Còn sống / Đã chết / Bất tỉnh … → "Hủy"<br>• "Nhân vật" → "Gỡ khỏi bộ nhớ" on a character: the dialog says how many events name it (Trần Vũ: 33) → "Hủy"<br>• "Sự kiện" → "Đề xuất chỉnh sửa" on an event: the summary, the participants and the status updates can be edited → "Hủy" | The author stays in control even after approval. Nothing is deleted: a correction replaces the old record and keeps the history. Events that name a removed entity are kept and flagged in red |
| 9 | Close the drawer, then "Lập kế hoạch" | Planning Studio: setup, story plan, and the "AI gợi ý sự kiện tương lai" button | The future plan is kept apart from the written canon |

Do not press the confirm buttons in step 8 during the defense unless you will restore a snapshot afterwards.

## 3. Points to make

- **The author approves everything.** The model proposes, and memory changes only after the author approves ("Chờ duyệt").
- **Name review comes first.** For each chapter, new names are reviewed before events and facts are extracted, so one wrong name does not spread.
- **Free-tier safety.** Every model call goes through the quota gateway. Live is off by default and needs an explicit enable step.
- **Corrections keep history.** Correcting a fact, removing an entity and correcting an event all keep the old record. The version check (`BRAIN_VERSION_CONFLICT`) stops two windows from overwriting each other.

## 4. Optional: the AI writing loop (live model)

This segment needs the live model. Turn it on only after the owner approves, following `P2_LIVE_RUNBOOK.md` section 3, and turn it off right after (section 5). The walkthrough of 2026-11-17 used **9 model calls** for this loop.

| # | Click | What appears |
|---|---|---|
| 1 | Open the latest chapter, then "AI Hỗ trợ viết" → "Viết tiếp" | A draft that continues the chapter |
| 2 | "Chấp nhận bản thảo" | The draft is added and saved. A message says Story Brain will analyse the chapter |
| 3 | "Kiểm tra nhất quán chương đang mở" (Story Brain → Sự kiện) | A consistency result, for example "Không tìm thấy mâu thuẫn trong lần kiểm tra này." |
| 4 | Wait for the Story Brain badge to show "mục chờ bạn duyệt" (about 1 minute) | The name review for the new chapter |
| 5 | Accept the names, then continue the extraction | A group of proposals (events, facts) |
| 6 | Approve the group | Memory goes up one version, and nothing is left pending |

If the model is slow or returns 503, say that the free tier is rate-limited, and continue with section 2. The analysis resumes by itself or from the import page ("Thử lại từ chương còn dở").

Restore the snapshot after a rehearsal of this segment, since it changes the chapter and the canon.

## 5. Avoid during the demo

| Avoid | Why |
|---|---|
| The "Full auto" tab | It is P3 and out of scope for this defense |
| "Trích xuất" → "Bổ sung dữ liệu" | An advanced form that still shows raw keys ("status, hearing …") |
| The world-rule amendment screen | Still shows "Brain v" and "Mã Fact" |
| The merge dialog in "Hồ sơ Codex" | Still shows a short raw ID after a name (for example `· e04b6672`) |
| Confirming "Gỡ khỏi bộ nhớ" on a main character | 33 events would turn red, and the UI cannot undo it |
| The browser console | A 404 on `/story-plans/by-novel/…/active` is normal ("no active plan"), but it looks like an error |

In the "Đề xuất chỉnh sửa" form for an event, the participant list opens upwards and covers the field label above it. It still works; close it with Esc.

## 6. If something goes wrong

| Symptom | Fix |
|---|---|
| "Xung đột phiên bản" (409) | Another window changed memory. Close the drawer, reopen it, and repeat the action |
| The page does not load | Check `docker ps`, then `$C up -d ai-service backend web` |
| Sign-in fails after a database restore | The restore did not finish. Run it again with the services stopped |
| A live AI call is refused (`BUDGET_GUARD_DENIED`) | Live is off, or the operator enable step is missing. Continue without the model |

## 7. Check on 2026-11-19

The stack was rebuilt from `main` @ `04b26100` with live off (no model calls). A headless browser script went through section 2 on the real app as the test author. It opened each dialog and closed it with "Hủy", and changed no data.

| Step | Result |
|---|---|
| Sign in with Enter, projects page (17 novels), IDE, Story Brain and all its tabs | OK |
| Events | No English event types left; no red warning (no event names a removed entity) |
| "Gỡ khỏi bộ nhớ" dialog | OK. For Trần Vũ it says 33 events name him |
| Fact "Sửa" / "Gỡ" | OK, after the fix below |
| Event "Đề xuất chỉnh sửa": add and remove participants | OK on live data |
| AI panel | Opens with "Viết tiếp", "Gọt giũa văn phong", "Mô tả ngoại cảnh", "Viết hội thoại" |
| Page errors | None. The only HTTP error was the expected 404 for "no active story plan" |

**Fixed in this change.** In #196, the "Sửa" field of a status fact was prefilled with the label ("Còn sống") instead of the stored value (`Alive`). Saving it unchanged would have stored the label as the status. A place given as an entity ID had the same problem: it was prefilled with the place name instead of its ID. Now a status is chosen from a list of stored values shown in Vietnamese, a place is chosen from the entity list, and other values are edited as text. The mocked browser test now covers the status case.

**Seen, not fixed (pre-existing on `main`).** `tests/p1-hitl-interactions.browser.test.mjs` fails 2 of 13 on `main` itself, in the participant-picker step (`Element is not visible` when picking a second option). The same picker works on live data. This suite is not in CI, and it passed on the #196 branch before the merge with the UI-polish changes.
