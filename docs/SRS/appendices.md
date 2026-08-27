# APPENDICES - TECHNICAL SPECIFICATIONS

This document contains supportive technical details, standard codes, and background information for the Ephurin Novel Platform development.

---

## Appendix A: System Error Codes

These codes must be returned by backend APIs in case of validation or processing failures, allowing standard error handling at client-side applications.

| Code | Message | Cause | Resolution |
| :--- | :--- | :--- | :--- |
| **AUTH_001** | Invalid Email format | Email does not match regex | Check and re-enter email |
| **AUTH_003** | Invalid Credentials | Wrong username/password | Try again or reset password |
| **AUTH_004** | Account Locked | Banned by Admin | Contact support |
| **AUTH_008** | Unauthorized Action | Role has insufficient permissions | Use an account with appropriate role |
| **USER_004** | Username already exists | Duplicate username in DB | Choose another username |
| **AI_001** | AI Service Unavailable | Timeout or service down | Continue without AI suggestions or retry later |
| **SYS_001** | Internal Server Error | Unhandled exception | Contact system admin |
| **CONTENT_001** | Content not found | Story/Chapter deleted | Refresh or check ID |

---

## Appendix B: Data Dictionary Summary

Below is the summary of database models. The physical mapping will be implemented in SQL PostgreSQL and MongoDB collections.

### Relational Database (PostgreSQL)
-   **USER**: Stores identification, profile metadata, and role information. Wallet balance is owned by Payment & Wallet Service.
-   **NOVEL**: Overview of the novel works, author references, status tags, and metadata (title, synopsis).
-   **CHAPTER**: Detailed metadata of chapters (title, ordering, VIP pricing coins).
-   **WALLET**: Stores available and locked mock Coin balance for each user.
-   **TRANSACTION**: Ledger tracking payment transactions (deposits, withdraws, unlocks, donations).
-   **BOOKMARK**: Many-to-Many join table tracking users' bookmarked novels (Library).
-   **LIKE**: Many-to-Many join table tracking users' liked novels.
-   **FOLLOW**: Many-to-Many join table tracking user-to-author follow relations.
-   **CHARACTER_PROFILE**: Structured information about characters, relationships, roles, and development notes. Created manually by Authors or updated from Author-approved Writing Copilot proposals.
-   **STORY_TIMELINE**: Ordered story events used to maintain plot consistency and provide context for Writing Copilot. Created manually by Authors or updated from Author-approved Writing Copilot proposals.
-   **PLOT_SUMMARY**: Chapter/arc/novel-level summaries used as compressed context for LLM-assisted writing. Written by Authors or generated as AI suggestions after Author confirmation.
-   **CONTEXT_CHANGE_PROPOSAL**: Pending AI-generated proposal to update Character Profile, Story Timeline, or Plot Summary before Author approval/rejection.

### Document Database (MongoDB)
-   **DRAFT_CHAPTER**: Saved auto-save draft states of authors' chapters.
-   **COMMENT**: Rich text interactions, inline offset coordinates (paragraphs), and moderation status.
-   **CONTENT_FILTER_RULE**: Keyword/rule definitions used by Content Control Service for non-LLM content filtering.
-   **USER_REPORT**: User-submitted report against Novel, Chapter, Comment, or User.
-   **MODERATION_REVIEW**: Admin review queue item created from rule/filter hit or user report.
-   **NOTIFICATION**: System notifications and alerts for users (Push notification payload logs).
-   **ACTIVITY_LOG**: Internal audit trails for security monitoring.

---

## Appendix C: AI Provider & Prompting Methodology

*(Reserved for LLM provider configuration, prompt templates, evaluation notes, and safety boundaries. MVP uses an LLM-only AI approach.)*

## Appendix D: Documentation Consolidation Notes

- `Final_SRS_v1.md` and `SRA_novel_platform_plan (1).md` are reference baselines for the fragmented SRS.
- `techstack.md` is the current source of truth for implementation technology choices.
- Traceability matrices will be added after the detailed use cases are finalized.
- Payment workflows are mock/demo-only and are not designed as production financial requirements.
