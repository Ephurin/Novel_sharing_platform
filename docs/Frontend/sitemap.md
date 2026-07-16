# Frontend Sitemap

## 1. Web Application - Author & Admin

```mermaid
flowchart TD
    Web[Web App] --> Public[Public Landing]
    Web --> Auth[Auth]
    Web --> Author[Author Workspace]
    Web --> Admin[Admin Dashboard]

    Public --> Home[Home / Featured Novels]
    Public --> NovelPublic[Novel Detail Public View]
    Public --> Login[Login / Register]

    Auth --> Login
    Auth --> OAuth[OAuth Callback]

    Author --> AuthorHome[Author Dashboard]
    Author --> MyNovels[My Novels]
    Author --> NovelEditor[Novel Editor]
    Author --> ChapterEditor[Chapter Editor]
    Author --> Context[Character / Timeline / Plot Summary]
    Author --> Copilot[Writing Copilot Panel]
    Author --> AuthorStats[Author Stats]
    Author --> WalletAuthor[Author Wallet / Withdraw Mock]

    MyNovels --> NovelEditor
    NovelEditor --> ChapterEditor
    NovelEditor --> Context
    ChapterEditor --> Copilot

    Admin --> AdminHome[Dashboard Overview]
    Admin --> Moderation[Moderation Queue]
    Admin --> Reports[User Reports]
    Admin --> Users[User Management]
    Admin --> Taxonomy[Genres / Tags]
    Admin --> Withdraws[Withdraw Review]
```

## 2. Mobile Application - Reader

```mermaid
flowchart TD
    Mobile[Mobile App] --> Splash[Splash]
    Mobile --> Auth[Login / Register]
    Mobile --> Home[Home Feed]
    Mobile --> Search[Search / Filter]
    Mobile --> Library[Library / Bookmarks]
    Mobile --> Novel[Novel Detail]
    Mobile --> Reader[Reader Screen]
    Mobile --> Wallet[Wallet Mock]
    Mobile --> Profile[Profile / Settings]
    Mobile --> Notifications[Notifications]

    Home --> Novel
    Search --> Novel
    Library --> Novel
    Novel --> Reader
    Novel --> Comments[Chapter Comments]
    Reader --> InlineComments[Inline Comments]
    Reader --> Report[Report Content]
    Wallet --> Deposit[Mock Deposit]
    Wallet --> Transactions[Transaction History]
```

## 3. Main Navigation Groups

| Client | Navigation |
| :--- | :--- |
| Web Author | Dashboard, My Novels, Editor, Context, Wallet, Stats |
| Web Admin | Overview, Moderation, Reports, Users, Taxonomy, Withdraws |
| Mobile Reader | Home, Search, Library, Notifications, Profile |

## 4. MVP Screen Priority

| Priority | Screens |
| :--- | :--- |
| P0 | Login/Register, Home, Novel Detail, Reader, My Novels, Chapter Editor |
| P1 | Comments, Library, Wallet Mock, Writing Copilot, Moderation Queue |
| P2 | Author Stats, Taxonomy, Withdraw Review, Notifications |
