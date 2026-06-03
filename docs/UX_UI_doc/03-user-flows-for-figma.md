# AI Writing IDE - User Flows (FOR FIGMA)

## Purpose

This document describes the primary user journeys inside the AI Writing IDE.

The goal is to generate wireframes and clickable prototypes from user behavior rather than static layouts.

---

# FLOW 1 — Open Project

Goal:

Open an existing writing project.

Steps:

1. User launches application
2. User enters Projects View
3. User sees project list
4. User selects a project
5. System loads project metadata
6. Story View becomes active

Success Criteria:

* Story tree is displayed
* Latest chapter is selected

---

# FLOW 2 — Create New Project

Goal:

Create a new novel project.

Steps:

1. User opens Projects View

2. Clicks New Project

3. Enters:

   * Project Name
   * Genre
   * Description

4. Click Create

5. System generates empty project structure

Success Criteria:

* Project appears in project list
* Story View opens automatically

---

# FLOW 3 — Open Chapter

Goal:

Open a chapter for editing.

Steps:

1. User selects Story View
2. Sidebar displays chapter tree
3. User clicks chapter
4. Editor loads chapter content

Success Criteria:

* Chapter content visible
* Cursor focused inside editor

---

# FLOW 4 — Write Chapter

Goal:

Write new story content.

Steps:

1. User places cursor
2. User writes text
3. Auto-save activates
4. AI Context updates automatically

Success Criteria:

* No manual save required
* AI context reflects latest content

---

# FLOW 5 — Ask AI For Help

Goal:

Request writing assistance.

Steps:

1. User opens AI Chat tab
2. User enters prompt
3. AI processes current chapter context
4. AI returns response

Examples:

* Continue scene
* Rewrite paragraph
* Generate dialogue
* Describe battle

Success Criteria:

* Response appears in chat
* User can insert response into editor

---

# FLOW 6 — Apply AI Suggestion

Goal:

Accept proactive AI recommendation.

Steps:

1. AI generates suggestion
2. Suggestion appears in Suggestions tab
3. User clicks suggestion
4. Preview modal opens
5. User clicks Apply

Success Criteria:

* Content inserted correctly
* Change tracked

---

# FLOW 7 — Detect Plot Hole

Goal:

Review consistency issues.

Steps:

1. User clicks Check Consistency
2. Analysis starts
3. Issues detected
4. Warning list appears
5. User selects warning

System:

* Highlights relevant text
* Displays explanation

Success Criteria:

* User understands issue location
* User can fix immediately

---

# FLOW 8 — Browse Entities

Goal:

Review story knowledge.

Steps:

1. User selects Entities View
2. Entity categories appear
3. User selects character
4. Character profile loads

Displayed Information:

* Description
* Relationships
* Timeline
* Recent Events

Success Criteria:

* Full entity information available

---

# FLOW 9 — Edit Entity

Goal:

Correct story metadata.

Steps:

1. User opens entity profile
2. Clicks Edit
3. Updates information
4. Saves changes

Success Criteria:

* Knowledge base updated

---

# FLOW 10 — Review Timeline

Goal:

Inspect story chronology.

Steps:

1. User opens Timeline View
2. Event list loads
3. User selects event
4. Event detail opens

Success Criteria:

* User understands story sequence

---

# FLOW 11 — Investigate Character Relationship

Goal:

Understand relationship changes.

Steps:

1. User opens Knowledge Graph
2. Selects character node
3. Connected nodes highlight
4. Relationship panel opens

Success Criteria:

* Relationship evolution visible

---

# FLOW 12 — Run AI Task

Goal:

Execute autonomous workflow.

Steps:

1. User opens Tasks View
2. Selects task

Examples:

* Extract Entities
* Update Timeline
* Generate Summary
* Detect Plot Holes

3. Task starts
4. Progress visible
5. Results displayed

Success Criteria:

* User sees execution result

---

# FLOW 13 — Focus Writing Mode

Goal:

Remove distractions.

Steps:

1. User clicks Focus Mode
2. Activity Bar hides
3. Sidebar hides
4. Editor expands

Success Criteria:

* Maximum writing space available

---

# FLOW 14 — Search Story Knowledge

Goal:

Find information quickly.

Steps:

1. User opens Search View
2. Enters query
3. System performs semantic search
4. Results grouped

Possible Targets:

* Chapters
* Characters
* Locations
* Events

Success Criteria:

* Relevant results returned

---

# FLOW 15 — Switch Between Activities

Goal:

Navigate efficiently.

Steps:

1. User clicks activity icon
2. Sidebar changes
3. Main view updates

Example:

Story
→ Entities
→ Timeline
→ Graph

Success Criteria:

* Transition under 200ms
* Context preserved

---

# FLOW 16 — Recover Previous Version

Future Feature

Goal:

Restore previous chapter version.

Steps:

1. Open chapter history
2. Select snapshot
3. Compare versions
4. Restore

Success Criteria:

* No content loss

---

# FLOW 17 — Multi-Agent Collaboration

Future Feature

Goal:

Use specialized agents.

Agents:

* Plot Planner
* Dialogue Writer
* Consistency Checker
* Lore Keeper

Success Criteria:

* Agents cooperate on same chapter

---

# Prototype Priority

For first clickable prototype:

Must Include:

* Open Project
* Open Chapter
* Write Chapter
* Ask AI
* Browse Entities
* Review Timeline
* Switch Activities

Can Exclude:

* Multi-Agent
* Version History
* Collaboration
