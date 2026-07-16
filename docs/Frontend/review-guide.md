# Frontend Mockup Review Guide

Use this checklist before turning mockups into React/React Native screens.

## Step 1: Review Scope

- [ ] Mockups are low-fidelity and do not imply final visual style.
- [ ] Screens match SRS service boundaries.
- [ ] Mockups do not reintroduce SRS use-case details into UI docs.
- [ ] Mobile is primary for Reader experience.
- [ ] Web is primary for Author and Admin workflows.

## Step 2: Review Navigation

- [ ] Reader can reach Home, Search, Library, Reader, Wallet, Profile.
- [ ] Author can reach Dashboard, My Novels, Editor, Context, Wallet, Stats.
- [ ] Admin can reach Dashboard, Moderation Queue, Users, Taxonomy, Withdraws.
- [ ] Critical actions are no more than 2-3 steps from the relevant dashboard.

## Step 3: Review API Mapping

- [ ] Every screen has at least one primary API or documented static/demo source.
- [ ] Content Control screens use `content-control-api.md`.
- [ ] AI/Copilot screens use `ai-copilot-api.md`.
- [ ] Consistency checking uses `POST /ai/copilot/consistency-check` and remains non-blocking.
- [ ] Wallet screens clearly use mock payment APIs only.
- [ ] No frontend screen expects hidden/internal fields.

## Step 4: Review User States

- [ ] Empty states exist for lists.
- [ ] Loading states exist for slow API calls.
- [ ] Error states show actionable messages.
- [ ] Pending moderation status is visible to the owner/Admin.
- [ ] Unauthorized users are redirected or shown a clear permission message.

## Step 5: Review MVP Priority

Recommended implementation order:

1. Auth shell and navigation.
2. Mobile Home, Novel Detail, Reader.
3. Author My Novels, Novel Editor, Chapter Editor.
4. Content Control moderation queue.
5. Wallet mock.
6. Writing Copilot panel.
7. Dashboard/stats polish.

## Suggested Comment Format

- `BLOCKER`: Screen cannot support an MVP use case.
- `QUESTION`: UX decision needed before implementation.
- `NIT`: Wording/layout improvement.

Examples:

- `BLOCKER: Chapter Editor has no visible submit publish action.`
- `QUESTION: Should pending comments be visible to their author only?`
- `NIT: Rename Library tab to Bookshelf if the team prefers novel-platform wording.`
