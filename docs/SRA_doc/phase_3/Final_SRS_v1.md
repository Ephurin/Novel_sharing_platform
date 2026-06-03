# SOFTWARE REQUIREMENTS SPECIFICATION (SRS) - EPHURIN NOVEL PLATFORM

## CHAPTER I: INTRODUCTION

### 1.1. Purpose of the Document
This Software Requirements Specification (SRS) describes the core requirements, actors, business flows, and operational scope of the **Ephurin Novel Platform**. It serves as a common foundation for analysts, designers, developers, testers, and supervisors to:
- Define goals, scope, and system boundaries.
- Describe key functions for Readers, Authors, Admins, and AI services.
- Clarify business workflows (Registration, Publishing, Moderation).
- Establish a basis for architectural design, UI design, and acceptance testing.

### 1.2. Project Scope
Ephurin is a platform for sharing and composing online novels, integrating Web, Mobile, and AI services.
- **Web Application:** For Authors (creation, stats) and Admins (management, moderation).
- **Mobile Application:** For Readers (search, read, interact).
- **Backend API:** Authentication, data management, and access control.
- **AI Service:** Metadata suggestion, classification, and automated moderation support.
- **Admin Dashboard:** Content review, report handling, and operational metrics.

### 1.3. Intended Audience
| Audience | Purpose |
| :--- | :--- |
| Supervisors | To evaluate the completeness, logic, and suitability of the requirements analysis. |
| Analysts | To unify scope, actors, functions, and business workflows. |
| Designers | To build architecture, database, and UI based on requirements. |
| Developers | To understand features, processing conditions, and business rules. |
| Testers | To build test cases, acceptance criteria, and functional testing scenarios. |

### 1.4. Terminology and Abbreviations
| Term | Meaning |
| :--- | :--- |
| SRS | Software Requirements Specification. |
| Actor | Entity interacting with the system. |
| Reader | Main user of the Mobile App (Reading, interacting). |
| Author | Creator and manager of stories (Web/Mobile). |
| Admin | System manager and content moderator. |
| AI Service | Service supporting classification, suggestions, and moderation. |
| JWT | JSON Web Token, session authentication mechanism. |
| OAuth 2.0 | Authentication standard for Google/Facebook login. |
| RBAC | Role-Based Access Control. |
| KYC | Know Your Customer - Identity verification for authors. |
| Dashboard | Control panel displaying data and administrative actions. |
| Coin | Internal currency for unlocking chapters or donations. |

### 1.5. Benchmarking and Market Analysis

#### 1.5.1. Online Novel Platform Comparison
| Criteria | Webnovel | Wattpad | Waka | Ephurin (Target) |
| :--- | :--- | :--- | :--- | :--- |
| **Publishing** | Contract model, exclusive content. | Open publishing model. | Conditional publishing (word count). | Authoring tools with AI-assisted metadata and scheduling. |
| **Reading** | Chapter-based, paid content. | Free/Paid with community focus. | Chapter-based, membership. | Mobile-first, UI customization, and synced history. |
| **Interaction** | Comments, reviews, gifts. | Inline comments, votes, follow. | Comments, bug reports. | Inline comments, follow, and transparent reporting. |
| **Moderation** | Keyword scan, manual review. | Community guidelines & reports. | Plagiarism check, manual review. | Hybrid: AI flagging with Admin final decision. |

#### 1.5.2. Content Distribution Reference (Netflix & Spotify)
Netflix and Spotify serve as references for:
- Large-scale library organization by genre and trends.
- AI-driven personalization and recommendation systems.
- Access control based on user rights or subscription status.
- **Competitive Advantage**: The integration of **AI as a creative partner** (not just a filter) helps reduce manual moderation and boosts author productivity through intelligent suggestions.

## CHAPTER II: SYSTEM OVERVIEW

### 2.1. System Architecture
The Ephurin Novel Platform is built on a **Microservices** architecture, ensuring stability, ease of maintenance, and independent scalability for each module (Web, Mobile, AI).

#### 2.1.1. General Architecture Diagram
![General Architecture Diagram](./images/memberA/So_do_kien_truc.png)

#### 2.1.2. Description of Core Components
1.  **Frontend Clients**:
    -   **Web Application (Next.js)**: The primary platform for Authors to write and Admins to manage. Uses Server-Side Rendering (SSR) to optimize SEO for literary works.
    -   **Mobile Application (React Native)**: A dedicated app for Readers, focusing on a smooth reading experience and real-time notifications.
2.  **API Gateway**: Acts as the single entry point for all client requests, handling routing to respective microservices and implementing outer security layers (Rate limiting, SSL).
3.  **Backend Microservices**:
    -   **Auth Service**: Manages authentication (JWT), authorization (RBAC), and user account data.
    -   **Novel & Chapter Service**: Handles business logic for story creation, chapter management, drafts, and publishing schedules.
    -   **Interaction Service**: Manages commenting systems (inline/chapter), likes, follows, and social interactions.
    -   **Reader Service**: Optimizes reading content retrieval, history management, and bookmarks.
    -   **Payment Service**: Processes virtual currency (Coins), chapter unlock transactions, and revenue settlement.
4.  **AI Intelligence Service**: A separate intelligent processing module using a Vector Database to store story knowledge, supporting author assistance and automated content moderation.
5.  **Infrastructure Layers**:
    -   **PostgreSQL**: Primary relational database for data requiring high consistency.
    -   **MongoDB**: Stores unstructured data such as activity logs and draft chapter versions.
    -   **Redis**: Caching layer to speed up access to frequently used data like rankings and login sessions.

### 2.2. Functional Decomposition Diagram (Functional Tree)
Below is the functional decomposition for the platform's core features:

![Functional Tree](./images/memberB/image1.png)

### 2.3. General Use Case Diagram
![General Use Case Diagram](./images/memberA/General_usecase.png)

#### Use Case Descriptions Summary
| Category | Use Case | Description |
| :--- | :--- | :--- |
| **Account Management** | Register / Login / Profile | Allows Guests to create accounts and existing users to authenticate and manage personal profiles. |
| **Novel Management** | Publish / Edit / Manage | Enables Authors to create novels, upload chapters, and manage their portfolio on the Web platform. |
| **AI Intelligence** | AI Assistant / Auto-tagging | AI Service supports authors with genre suggestions, metadata tagging, and content violation checks. |
| **Reading Features** | Search / Read / Customize | Readers can discover novels through filters and personalize their reading experience (Font, Background). |
| **Interaction** | Comment / Like / Follow | Builds community engagement by allowing readers to interact with content and follow favorite authors. |
| **Administration** | Moderation / Stats / Users | Admins manage user accounts, review flagged content, and monitor system performance via dashboards. |

### 2.4. List of Actors
The Ephurin system involves the following primary actors:
*   **Guest**: Unauthenticated users who can browse story lists and read free chapters.
*   **Reader**: Registered users focused on the mobile experience with personalization and social features.
*   **Author**: Content creators focused on the Web platform for writing and work management.
*   **Admin/Editor**: Administrators responsible for operations, moderation, and user management.
*   **AI Service**: A system actor supporting data processing and author assistance.

### 2.5 Permission Matrix
The following matrix defines the level of access and actions (CRUD) each actor can perform on system resources.

| Resource | Guest | Reader | Author | Admin |
| :--- | :---: | :---: | :---: | :---: |
| **User Profile** | Create | R, U | R, U | R, U, D |
| **Novels (Own)** | - | - | C, R, U, D | R, U, D |
| **Novels (Others)** | R | R | R | R, U, D |
| **Chapters** | R (Free) | R | C, R, U, D | R, U, D |
| **Comments** | R | C, R, U, D | C, R, U, D | R, D |
| **Moderation** | - | - | - | C, R, U, D |
| **Statistics** | - | - | R (Own) | R (All) |

*Legend: C = Create, R = Read, U = Update, D = Delete*


## CHAPTER III: DATA REQUIREMENTS & WORKFLOWS

### 3.1 Entity Relationship Diagram (ERD)
The system utilizes a relational database (PostgreSQL) for structured data and MongoDB for non-structured data. Below is the ERD for the core components:

![Entity Relationship Diagram](./images/memberA/ERD.png)

#### Data Dictionary Summary
- **USER**: Stores identification, roles, and wallet balance (Coin).
- **NOVEL**: Overview of the work, author, and moderation status.
- **CHAPTER**: Detailed content of chapters, supporting monetization settings (Premium).
- **TRANSACTION**: Logs of financial transactions (Deposit, Purchase, Donate).

### 3.2 Business Workflows

#### 3.2.1 Registration & Authentication (JWT)
This workflow ensures secure access to the platform using JSON Web Tokens (JWT) for session management.

![Registration & Authentication Workflow](./images/memberA/3.2.1.png)

**Registration & Login Process:**
1.  **Request**: User submits registration/login credentials (Email, Password).
2.  **Validation**: The Auth Service verifies the input format and checks against the User Database.
3.  **Token Generation**: Upon successful authentication, the system generates a pair of tokens:
    *   **Access Token**: Short-lived (e.g., 1 hour) for authorizing API requests.
    *   **Refresh Token**: Long-lived (e.g., 7 days) to obtain new access tokens without re-logging.
4.  **Authorized Access**: The client stores the token and includes it in the `Authorization: Bearer <token>` header for all subsequent requests to microservices.

*(A technical Sequence Diagram will be provided as a supplementary asset)*

#### 3.2.2 Creative & Publishing Workflow

**a. Publish a new novel**
![Process of publish a new novel](./images/memberB/image2.png)
*Figure : Process of author request to publish a new novel*

**Detailed Specification:**
1.  **Initiation**: Author starts by requesting to add a new novel.
2.  **Information Entry**: Author fills in metadata (title, description, genre).
3.  **AI Validation**: 
    *   System checks format: Title must be < 255 chars, description > 500 chars.
    *   AI checks for content violations (sensitive topics, hate speech).
4.  **Chapter Creation**: Author must add and save chapters as drafts.
5.  **Requirement Check**: The AI system ensures the novel has at least 5 chapters before allowing a "Publish Request".
6.  **Human Review**: Once submitted, an Admin reviews the novel content.
7.  **Final Action**: If approved, the novel is published; otherwise, it is sent back for edits.

**b. Publish new chapter**
![Process of publish new chapter](./images/memberB/image3.png)
*Figure : Process of author request to publish a new chapter*

**Detailed Specification:**
1.  **Selection**: Author selects an existing novel to add a new chapter.
2.  **Drafting**: Author enters chapter title and content.
3.  **AI Guardrails**: AI validates content length (> 500 chars) and scans for policy violations.
4.  **Submission**: Author saves the draft and sends a publish request.
5.  **Moderation**: Admin verifies the chapter content. Upon approval, the chapter becomes visible to readers.

#### 3.2.3 AI-assisted Metadata Workflow
This is a unique feature of Ephurin, helping standardize content from the start:

![AI Metadata Workflow](./images/memberA/Screenshot%202026-05-14%20144034.png)

1.  **Request Submission**: When the author finishes a chapter or story description, the text is sent to the AI Service.
2.  **Feature Extraction**: AI uses NLP models (PhoBERT/Transformer) to analyze keywords, context, and writing style.
3.  **Classification & Suggestion**:
    *   AI compares content with the existing Taxonomy (genres/tags) to provide the Top 5 most suitable suggestions.
    *   Detects sensitive topics to warn about mandatory Age Rating tags.
4.  **Feedback & Selection**: The author reviews the suggestions and selects which ones to apply. This improves search accuracy for readers.

#### 3.2.4 Admin Moderation Workflow
This workflow describes how content is reviewed and moderated through a hybrid system involving AI automated scanning and Admin final decision-making.

![Admin Moderation Workflow](./images/memberA/3.2.4.png)

**Moderation Process:**
1.  **Trigger**: A moderation request is triggered when an Author publishes new content or when a Reader reports a violation.
2.  **AI Automated Scan**: The AI Service immediately scans the text for policy violations (hate speech, sensitive topics, spam).
    *   *If safe*: Content remains visible or is approved for publishing.
    *   *If suspicious*: AI flags the content and moves it to the "Pending Review" queue.
3.  **Human Review**: The Admin accesses the Moderation Dashboard to review flagged items and reports.
4.  **Final Action**: Admin makes a final decision (Approve, Reject/Edit Required, or Delete/Ban).
5.  **Notification**: The system notifies the relevant User of the final decision and updates the content status.


## CHAPTER IV: DETAILED FUNCTIONAL REQUIREMENTS

### 4.1 Module 1: Account & Profile Management
This module allows users to register, log in, and manage personal information.

#### 4.1.1. UC: User Registration
**a. Activity diagram**
![Activity diagram - User Registration](./images/memberA/4.1.1.png)

**b. Use case description**
| Attribute | Description |
| :--- | :--- |
| **Objective** | Create a new account to access system features |
| **Actor** | Guest |
| **Trigger** | Guest clicks "Register" |
| **Pre-condition** | Guest is not logged in; Email/Username is unique |
| **Post-condition** | A new account is created with default role "Reader" |

| Step | Basic Flow | Exception Flow |
| :--- | :--- | :--- |
| 1 | Guest accesses the registration screen. | |
| 2 | System displays form (Email, Username, Password). | |
| 3 | Guest enters information and submits. | 3a. User chooses Google/FB (OAuth 2.0). |
| 4 | System validates email format and password strength. | 4a. Duplicate Email: System suggests Login. |
| 5 | System hashes password and creates account. | |
| 6 | System notifies registration success. | |

#### 4.1.2. UC: User Login
**a. Activity diagram**
![Activity diagram - User Login](./images/memberA/4.1.2.png)

**b. Use case description**
| Attribute | Description |
| :--- | :--- |
| **Objective** | Authenticate user and grant access based on role |
| **Actor** | Reader, Author, Admin |
| **Pre-condition** | User has a valid account |
| **Post-condition** | User receives a valid JWT and is redirected to the appropriate dashboard |

### 4.2 Module 2: Novel Management (Web)

#### 4.2.1. UC: Publish a new novel
**a. Activity diagram**
![Activity diagram - Publish new novel](./images/memberB/image4.png)

**b. Use case description**
| Objective | This function allows authors to publish a new novel on the platform |
| :--- | :--- |
| **Actor** | Author, System, AI System, Admin |
| **Trigger** | Author wants to publish a new novel |
| **Pre-condition** | Author has an account in the system and logged in successfully |
| **Post-condition** | - Novel is published on the platform |

| Step | Basic Flow | Exception Flow | Alternative Flow |
| :--- | :--- | :--- | :--- |
| 1 | Author clicks "Truyện của tôi" – System displays author's my story interface. Author clicks "Thêm truyện mới" – System displays add story interface |  |  |
| 2 | Author fills novel's information (title, description, genre, etc.) | 2a. System detects validation errors (Title ≥ 255 characters OR Description < 500 characters) 2a1. System displays message requiring user to fill correctly 2a2. Author re-fills the information |  |
| 3 | System validates information and passes to AI System to check for content violations | 3a. AI System detects violation of information 3a1. System notifies author of the violation 3a2. Author edits and re-submits the information |  |
| 4 | Author clicks "Tiếp theo" – System displays add chapter content interface |  |  |
| 5 | Author fills content for chapters – System implements UC Publish new chapter for each chapter | 5a. Chapter content fails UC Publish new chapter validation 5a1. Author re-edits the chapter content |  |
| 6 | Author clicks "Lưu tạm" – System checks if number of chapters meets requirement (≥ 5) | 6a. Number of chapters does not exceed 5 6a1. System notifies author to add more chapters 6a2. Author continues filling remaining chapters |  |
| 7 | Author sends publish request to Admin |  |  |
| 8 | Admin reviews and approves the novel – System publishes the novel | 8a. Admin does not approve the novel 8a1. System notifies author with the reason for rejection 8a2. Author edits novel and re-submits publish request |  |

#### 4.2.2. UC: Publish new chapter
**a. Activity diagram**
![Activity diagram - Publish new chapter](./images/memberB/image5.png)

**b. Use case description**
| Objective | This function allows authors to publish a new chapter for an existing novel on the platform |
| :--- | :--- |
| **Actor** | Author, System, AI System, Admin |
| **Trigger** | Author wants to add and publish a new chapter to their novel |
| **Pre-condition** | Author has an account in the system, logged in successfully, and has at least one novel created in the system |
| **Post-condition** | - The new chapter is published on the platform - System records the successful chapter publication activity to database |

| Step | Basic Flow | Exception Flow | Alternative Flow |
| :--- | :--- | :--- | :--- |
| 1 | Author clicks "Truyện của tôi" – System displays author's my story interface |  |  |
| 2 | Author clicks on one novel – System displays the novel information |  |  |
| 3 | Author clicks on "Add new chapter" – System displays the interface to write content |  |  |
| 4 | Author fills chapter's data (title, content) |  |  |
| 5 | Author clicks "Lưu tạm" – System checks validation of the data (Content > 500 characters AND Title < 100 characters) | 5a. System detects validation errors 5a1. System displays message requiring user to fill correctly 5a2. Author re-fills chapter's data |  |
| 6 | System passes chapter to AI System to check for content violations | 6a. AI System detects violation of the information 6a1. System displays message requiring user to correct the content 6a2. Author edits and re-submits chapter's data |  |
| 7 | Author sends publish request to Admin |  |  |
| 8 | Admin reviews and approves the chapter – System publishes the chapter | 8a. Admin does not approve the chapter 8a1. System notifies author with the reason why the chapter is not approved 8a2. Author edits the chapter and re-sends the publish request |  |

### 4.3 Module 3: AI Intelligence (AI Story Assistant)
This module represents the core intelligence of Ephurin, supporting content optimization and automated moderation.

#### 4.3.1. UC: Automated Novel Classification
**a. Activity diagram**
![Activity diagram - Automated Novel Classification](./images/memberA/4-3-1.png)

**b. Use case description**

| Attribute | Description |
| :--- | :--- |
| **Objective** | Use PhoBERT model to classify novel genres based on the synopsis |
| **Actor** | Author, AI System |
| **Trigger** | Author completes the synopsis and clicks "Suggest Genre" |
| **Pre-condition** | Author is in the story creation/editing interface and has entered a synopsis |
| **Post-condition** | System displays the most relevant genre suggestions |

| Step | Basic Flow | Exception Flow |
| :--- | :--- | :--- |
| 1 | Author enters or updates the novel's synopsis. | |
| 2 | Author requests genre suggestions. | |
| 3 | AI System processes text and extracts feature vectors. | 3a. Synopsis too short for analysis 3a1. System notifies author to provide more detail. |
| 4 | AI Model returns probability scores for various genres. | |
| 5 | System displays the top genre suggestions for the Author to select. | |

#### 4.3.2. UC: Suggest Tags and Title
**a. Activity diagram**
![Activity diagram - Suggest Tags and Title](./images/memberA/4-3-2.png)

**b. Use case description**

| Attribute | Description |
| :--- | :--- |
| **Objective** | Extract prominent keywords (Tags) and suggest attractive titles based on content |
| **Actor** | Author, AI System |
| **Trigger** | Author completes a chapter or updates the story description |
| **Post-condition** | Author receives a list of suggested tags and titles |

| Step | Basic Flow | Exception Flow |
| :--- | :--- | :--- |
| 1 | Author finishes writing a chapter or updating story description. | |
| 2 | Author requests for Tag or Title suggestions. | |
| 3 | AI System scans the text for key entities, themes, and emotional tone. | 3a. Content is too short for meaningful analysis <br> 3a1. System notifies author to add more content. |
| 4 | AI Model compares the analysis with trending metadata in the database. | |
| 5 | System displays a list of suggested Tags and potential Titles. | |
| 6 | Author selects desired Tags or adopts a suggested Title. | |

#### 4.3.3. UC: Analyze Writing Style and Length
**a. Activity diagram**
![Activity diagram - Analyze Writing Style and Length](./images/memberA/4-3-3.png)

**b. Use case description**

| Attribute | Description |
| :--- | :--- |
| **Objective** | Detect sudden changes in writing style or insufficient chapter length |
| **Actor** | Author, Admin, AI System |
| **Trigger** | Author submits a new chapter for review |

| Step | Basic Flow | Exception Flow |
| :--- | :--- | :--- |
| 1 | Author submits a new chapter for review. | |
| 2 | AI System scans the chapter content and calculates word count. | 2a. Word count is below minimum requirement <br> 2a1. System notifies author to expand the chapter. |
| 3 | AI System compares the writing style (vocabulary, sentence structure) with the author's previous baseline. | |
| 4 | AI System identifies any sudden deviations or potential plagiarism. | 4a. Significant style change detected <br> 4a1. System flags the chapter for Admin manual review. |
| 5 | System displays a style consistency report and length validation. | |
| 6 | Author proceeds to publish or returns to edit based on the report. | |

### 4.4 Module 4: Reading Experience (Mobile App)
This module focuses on optimizing the interface and features to support readers during their enjoyment of the works.

#### 4.4.1. UC: Personalize Reading Interface
**a. Activity diagram**
![Activity diagram - Personalize Reading Interface](./images/uc_reading_customization.png)

**b. Use case description**
- **Objective:** Readers can change fonts, sizes, and background colors (Dark/Light mode) to suit their preferences and environment.
- **Actor:** Reader
- **Trigger:** Clicks on the "Display Settings" icon in the reader screen.
- **Pre-condition:** Currently in the chapter reading screen.
- **Post-condition:** Settings are applied immediately and saved for future sessions.
- **Detailed Scenario:**
  | Step | Basic Flow | Exception Flow |
  | :--- | :--- | :--- |
  | 1 | System displays the customization panel (Font, Size, Background). | |
  | 2 | User adjusts font size via slider or selects a background color. | |
  | 3 | System updates CSS/Theme in real-time on the reader screen. | |
  | 4 | System saves configuration data. | Storage Error: Display a message that settings could not be synced. |

#### 4.4.2. UC: Advanced Search & Filtering
**a. Activity diagram**
```mermaid
graph TD
    Start(( )) --> Access[Access Search/Category page]
    Access --> Input[Enter keywords or Select filters]
    Input --> Submit[System: Send filter request to Backend]
    Submit --> Fetch[Backend: Query stories matching criteria]
    Fetch --> Result{Result found?}
    Result -- Yes --> Display[Display matching stories]
    Result -- No --> Suggest[Display 'No results' & suggest popular novels]
    Display --> End(( ))
    Suggest --> End
```

**b. Use case description**
- **Objective:** Allows searching for works by keyword, genre, status, and combined filters.
- **Actor:** Reader, Guest
- **Trigger:** Accesses the search bar or category page.
- **Post-condition:** Displays a list of matching novels sorted by relevance/views.
- **Detailed Scenario:**
  | Step | Basic Flow | Alternative Flow |
  | :--- | :--- | :--- |
  | 1 | User enters keywords and selects filter criteria (Genre, Status). | |
  | 2 | System sends filtering request to the Backend. | If no keyword, filter only by existing criteria. |
  | 3 | Backend returns the result list. | If not found: Show "No results" and suggest popular novels. |
  | 4 | System displays results (List/Grid format). | |

### 4.5 Module 5: Interaction & Community
This module builds an interactive space between readers and between readers and authors.

#### 4.5.1. UC: Commenting (Chapter/Paragraph)
**a. Activity diagram**
![Activity diagram - Commenting](./images/uc_commenting.png)

**b. Use case description**
- **Objective:** Allows readers to leave comments on a specific chapter or text segment (Inline comment).
- **Actor:** Reader
- **Trigger:** Highlights a text segment or scrolls to the end of the chapter and selects "Comment".
- **Pre-condition:** Logged in.
- **Post-condition:** Comment is displayed publicly or sent for review.

#### 4.5.2. UC: Like and Bookmark
**a. Activity diagram**
![Activity diagram - Like and Bookmark](./images/uc_like_bookmark.png)

**b. Use case description**
- **Objective:** Save stories (Bookmark) or Like to increase popularity.
- **Actor:** Reader
- **Trigger:** Clicks "Add to Library" (Bookmark) or "Like" button.
- **Pre-condition:** Logged in.
- **Post-condition:** Work is added to personal Library; Like count increases.

#### 4.5.3. UC: Follow Author & Push Notifications
**a. Activity diagram**
![Activity diagram - Follow Author](./images/uc_follow_author.png)

**b. Use case description**
- **Objective:** Receive notifications when favorite authors release new chapters.
- **Actor:** Reader
- **Trigger:** Clicks "Follow" on the author profile page.
- **Post-condition:** System automatically sends push notifications to the device when updates are available.

### 4.6 Module 6: Administration & Statistics
This module provides Admins with tools to manage users, moderate content, handle reports, and monitor system performance.

#### 4.6.1. UC: Content Moderation
**a. Activity diagram**
```mermaid
graph TD
    Start(( )) --> Queue[Access Review Queue]
    Queue --> View[View Content & AI Evidence]
    View --> Decision{Decision?}
    Decision -- Approve --> Active[Update Status: Published]
    Decision -- Reject --> Request[Request Edit from Author]
    Decision -- Violate --> Hidden[Hide/Delete Content]
    Active --> Log[Record Audit Log]
    Request --> Log
    Hidden --> Log
    Log --> End(( ))
```

**b. Use case description**
| Attribute | Description |
| :--- | :--- |
| **Objective** | Ensure novels and chapters comply with platform policies |
| **Actor** | Admin, AI System |
| **Pre-condition** | Content is pending or flagged by AI/Users |
| **Post-condition** | Content is approved, hidden, or deleted |

| Step | Basic Flow | Exception Flow |
| :--- | :--- | :--- |
| 1 | AI Service flags suspicious content with evidence. | |
| 2 | Admin accesses the Review Queue. | |
| 3 | Admin reviews content, metadata, and reports. | |
| 4 | Admin makes a decision (Approve/Reject/Hide). | |
| 5 | System updates content status and notifies author. | |
| 6 | System records the action in Audit Log. | |

#### 4.6.2. UC: Operational Dashboard
| Attribute | Description |
| :--- | :--- |
| **Objective** | Monitor growth, traffic, and content quality metrics |
| **Actor** | Admin |
| **Post-condition** | Admin views real-time charts and metrics |

## CHAPTER V: USER INTERFACE DESIGN (UI/UX)

### 5.1 Screen Navigation Flow (Sitemap)
Below is the general sitemap for Ephurin Novel Platform:

```mermaid
graph TD
    Home[Home Page] --> Discover[Discover Stories]
    Home --> Detail[Story Detail]
    Home --> Login[Login]
    Home --> Register[Register]

    Discover --> Search[Search & Filters]
    Search --> Detail
    Detail --> ReaderView[Chapter Reader]
    ReaderView --> Comment[Inline Commenting]
    ReaderView --> Bookmark[History & Bookmark]

    Login --> ReaderPage[Reader Profile]
    Login --> AuthorPage[Author Dashboard]
    Login --> AdminPage[Admin Dashboard]

    AuthorPage --> NovelMgmt[Novel Management]
    AuthorPage --> Editor[Chapter Editor]
    AuthorPage --> Stats[Author Stats]

    AdminPage --> UserMgmt[User Management]
    AdminPage --> ModQueue[Review Queue]
    AdminPage --> Reports[Report Handling]
    AdminPage --> Taxonomy[Tag/Genre Management]
```

### 5.2 Mockups giao diện Web (Author & Admin)
Below are the key interfaces for the Author module on the Web platform:

*   **Author “Truyện của tôi” page:** Displays the list of stories, statistics, and quick actions.
    <br>![Author My Stories](./images/memberB/image6.png)
*   **Filling novel information page:** Form to input story metadata.
    <br>![Fill Novel Info](./images/memberB/image7.png)
*   **Add new chapter page:** Writing interface for chapter content.
    <br>![Add New Chapter](./images/memberB/image8.png)
*   **Check information and send request page:** Final review before submission to Admin.
    <br>![Check and Send Request](./images/memberB/image9.png)

### 5.3 Mobile Interface Mockups (Reader App)
The Mobile interface is optimized for long-term reading experiences with key screens:

*   **Home Screen:** Displays featured banners, top trending works, and a "Continue Reading" list for quick access.
    <br>![Home Screen](./images/ui_home.png)
*   **Discover & Filter Screen:** Provides a smart search bar, diverse genre categories, and advanced filters by status/length.
    <br>![Discover Screen](./images/ui_discover.png)
*   **Story Detail Screen:** Contains overview information, summary, chapter list, and community reviews.
    <br>![Story Detail Screen](./images/ui_story_detail.png)
*   **Reader View Screen:** Chapter content with customizable fonts and backgrounds. Integrates inline commenting features.
    <br>![Reader View Screen](./images/ui_reader_view.png)
*   **Library Screen:** Manages bookmarked stories and personal reading history.
    <br>![Library Screen](./images/ui_library.png)
*   **Author Profile Screen:** Displays author info, list of creative works, and a "Follow" button.
    <br>![Author Profile Screen](./images/ui_author_profile.png)

## CHAPTER VI: NON-FUNCTIONAL REQUIREMENTS

### 6.1 Performance
- **Response Time**: Reading and search tasks must respond in under 2 seconds.
- **Scalability**: The system ensures service for 10,000 concurrent users through Auto-scaling mechanisms.
- **AI Optimization**: AI analysis requests (NLP) must not hang for more than 5 seconds per request.

### 6.2 Security
- **Authentication**: Uses JWT mechanism with short expiration times and Refresh Tokens for security.
- **Encryption**: All user passwords must be hashed using the bcrypt algorithm. Transaction data is AES-256 encrypted.
- **Authorization**: Strictly applies the RBAC model to prevent unauthorized access to the administration site.

### 6.3 Reliability
- **Backup**: Automated daily data backups stored across multiple regions.
- **Uptime**: Commitment to a system uptime of 99.9%.

## APPENDICES

### Appendix A: System Error Codes

| Code | Message | Cause | Resolution |
| :--- | :--- | :--- | :--- |
| **AUTH_001** | Invalid Email format | Email does not match regex | Check and re-enter email |
| **AUTH_003** | Invalid Credentials | Wrong username/password | Try again or reset password |
| **AUTH_004** | Account Locked | Banned by Admin | Contact support |
| **AUTH_008** | Unauthorized Action | Role has insufficient permissions | Use an account with appropriate role |
| **USER_004** | Username already exists | Duplicate username in DB | Choose another username |
| **AI_001** | AI Service Unavailable | Timeout or service down | Switch to manual review |
| **SYS_001** | Internal Server Error | Unhandled exception | Contact system admin |
| **CONTENT_001** | Content not found | Story/Chapter deleted | Refresh or check ID |

### Appendix B: AI Dataset & Training Methodology

