# Project Tech Stack

This file is the current source of truth for implementation technology choices. SRS documents should reference this file when describing the planned stack.

## Current Stack

- **Frontend Web:** React + Vite.
- **Mobile App:** React Native for the Reader application.
- **UI Library:** Mantine.
- **Backend:** Node.js.
- **Databases:** PostgreSQL and MongoDB.
- **Development Tools:** Docker, GitHub, GitHub Desktop.

## Rationale

- React + Vite is selected because the team is familiar with React and can iterate quickly with modern frontend tooling.
- Mantine is selected to speed up UI development with reusable components.
- Node.js is selected because it is easier for the team to read, maintain, and demo in the graduation-project scope.
- PostgreSQL is used for relational data such as users, novels, chapters, wallets, transactions, likes, follows, and bookmarks.
- MongoDB is used for flexible document data such as drafts, comments, notifications, activity logs, and AI/copilot context where schema flexibility is useful.

## Future Considerations

- **Next.js** may be reconsidered later if SEO, SSR, or production landing pages become a stronger requirement.
- **Go** may be considered for selected backend services if performance and concurrency become more important than team familiarity.
- **Redis** may be added for caching, reading-history synchronization, ranking caches, and rate-limit counters.
- **Vector database** may be added for AI search, plagiarism checks, writing-style comparison, and Writing Copilot context retrieval.
