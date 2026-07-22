# Low-Fidelity Wireframes

The combined wireframe document has been split by client surface so implementation review is easier.

## Documents

| File | Scope | Use For |
| :--- | :--- | :--- |
| `docs/Frontend/wireframes-web.md` | PC web / desktop | Public web, reader web, author workspace, Author IDE, admin, wallet/withdraw mock. |
| `docs/Frontend/wireframes-mobile.md` | Mobile app | Splash, mobile reader discovery, novel detail, reader, library/history, wallet, profile, notifications, comments/report. |

## Review Order

1. Review `docs/Frontend/wireframes-web.md` against `docs/Frontend/sitemap.md` for desktop web coverage.
2. Review `docs/Frontend/wireframes-mobile.md` against `docs/Frontend/sitemap.md` for mobile coverage.
3. Cross-check both files with `docs/Frontend/api-screen-matrix.md` before frontend implementation.
4. Update `docs/Frontend/screen-specs.md` if a wireframe introduces a new field, action, state, or route.

## Shared Legend

```txt
[Button]      clickable action
{Card}        grouped content
<Input>       form field
| Panel |     layout area
```
