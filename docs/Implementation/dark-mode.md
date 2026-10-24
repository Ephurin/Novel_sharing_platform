# StoryCraft shared color modes

The application uses the existing React 19/Mantine 7 stack and StoryCraft tokens.
No packages, backend endpoints, database columns or layouts were introduced.
The shared shell header can grow when its controls wrap on narrow screens.

## Preference and startup

- A compact `ThemeControl` in the existing author navbar, writing toolbar,
  reader/admin shell, public reader headers and login card exposes Sáng / Tối /
  Theo hệ thống. Authenticated reader headers do not duplicate the shell control.
- `web/public/theme-init.js` runs synchronously from the document head before
  application rendering. It applies resolved `data-theme`, Mantine scheme,
  Tailwind dark class and native `color-scheme` to the root element.
- One MantineProvider uses a shared color-scheme manager. The stable preference
  key is `storycraft-theme`; an existing `mantine-color-scheme-value` choice
  is honored as a migration fallback. New visitors default to system preference.
- System changes and cross-tab updates propagate. Storage failures fall back
  to the system or an in-memory manual choice. Signing out removes auth data
  without clearing the appearance preference.

## Semantic colors and coverage

- Central light/dark values in `storycraft.css` follow the supplied dark-mode
  skill: warm charcoal layers, warm off-white text, terracotta actions and
  readable mint/amber/coral status colors. Small adjustments to light success
  and warning foregrounds meet the tested 4.5:1 text contrast target.
- Existing Tailwind color aliases now derive from these tokens, including
  translucent surfaces and status colors. Light-only white panels were replaced
  with existing semantic surface classes. Cover placeholders remain dark ink;
  images are not inverted or recolored.
- `color-mode.css` handles native inputs, Mantine inputs, tables, menus,
  tooltips, portal dialogs, loading/disabled buttons and editor controls.
- The reader/admin shell and login page no longer contain fixed night colors.
  The existing author-only forced-light provider and review-only dark palette
  were replaced by the single application-wide preference.
- Reader background/font/size settings still take priority inside chapter prose.
  An explicit LIGHT, DARK or SEPIA reading preference is preserved; unset reading
  backgrounds follow the application theme.

## Verification

- Frontend TypeScript and Docker/Vite production build pass.
- Twelve frontend tests pass, including preference/bootstrap/system/storage/
  cross-tab behavior and semantic text/control contrast in both modes.
- Chrome checks used real demo accounts for AUTHOR, READER and ADMIN and guest
  pages: projects, manager, reviews, Story Bible, import, writing studio, author
  profile, wallet, profile/settings, notifications, reader home/detail/chapter/
  library/history, admin overview/users/novels/detail/taxonomy/moderation/withdraws,
  and public home/detail/chapter, plus login.
- Tested desktop at 1440px and representative mobile routes at 390px, switching
  both directions, refresh persistence, OS emulation, manual overrides, blocked
  storage, popup surfaces and AI panel. No application exceptions occurred.
- Confirmed that switching preserves login input, open novel-edit fields,
  manuscript text and editor scroll position. No test edits were saved to novels.
- This is representative route/state coverage; it does not claim exhaustive
  verification of every hover/error combination or every user-uploaded image.
