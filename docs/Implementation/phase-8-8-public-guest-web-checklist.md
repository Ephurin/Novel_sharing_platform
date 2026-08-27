# Phase 8.8 - Public and Guest Web Checklist

Goal: add a public-facing web entry point before mobile and final polish.

## Checklist

- [x] Add public landing route.
- [x] Add public browse/latest novels section using `GET /reading/search`.
- [x] Allow guest novel detail for published novels.
- [x] Allow guest free-chapter reading where backend permits optional auth.
- [x] Gate protected actions with clear login prompt.
- [x] Preserve authenticated role-home redirect behavior.
- [x] Keep OAuth callback clearly placeholder unless OAuth is implemented.
- [x] Run `npm.cmd --prefix web run typecheck`.
- [x] Run `npm.cmd --prefix web run build`.

Note: public entry uses `/public`, `/public/novels/:novelId`, and `/public/chapters/:chapterId` so existing authenticated `/` role-home redirect remains unchanged.

Note: guest users can call public reading/search/detail/free-chapter APIs, but library/history/preferences/comment create/edit/delete/report/like/follow/VIP unlock remain protected and point to `/login`.

## Review

1. Logout.
2. Open public landing page.
3. Browse/search published sample novels.
4. Open a free chapter as guest.
5. Try library/comment/like/follow/report and confirm login prompt.
6. Login and confirm role redirect still works.
