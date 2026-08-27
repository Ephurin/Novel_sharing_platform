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
- [ ] AI/Copilot screens are disabled/placeheld until Phase 10 and do not call AI APIs during Phase 8.x.
- [ ] Consistency checking is documented as Phase 10 work using `POST /ai/copilot/consistency-check`.
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
2. Phase 8.1 web foundation: session restore, guards, shared loading/error/empty states.
3. Phase 8.2 Author IDE official UI.
4. Phase 8.3 Reader web completion.
5. Phase 8.4 Wallet, notifications, profile, admin UI.
6. Phase 8.5 Author workspace deepening.
7. Phase 8.6 Reader experience deepening.
8. Phase 8.7 Admin/moderation deepening.
9. Phase 8.8 Public/guest web surface.
10. Phase 8.9 final web QA/polish.
11. Phase 9 Mobile Reader App.
12. Phase 10 Writing Copilot panel and consistency checking.

## Suggested Comment Format

- `BLOCKER`: Screen cannot support an MVP use case.
- `QUESTION`: UX decision needed before implementation.
- `NIT`: Wording/layout improvement.

Examples:

- `BLOCKER: Chapter Editor has no visible submit publish action.`
- `QUESTION: Should pending comments be visible to their author only?`
- `NIT: Rename Library tab to Bookshelf if the team prefers novel-platform wording.`
