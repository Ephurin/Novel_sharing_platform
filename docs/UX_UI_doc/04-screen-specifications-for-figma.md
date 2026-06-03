# 04-screen-specifications-for-figma.md

# AI Writing IDE - Screen Specifications

Version: 1.0

Audience:

* Figma AI
* Figma Make
* Claude
* v0
* Lovable
* Frontend Agents

Purpose:

Define all primary screens, layouts, states, interactions, and UI requirements for AI Writing IDE.

---

# Design Goals

The application should feel like:

* Cursor
* VSCode
* Antigravity IDE
* Obsidian
* Notion

The application is optimized for:

* Long-form fiction writing
* Story knowledge management
* AI-assisted writing
* Timeline analysis
* Entity management

Primary principle:

Minimize context switching.

Users should never need to leave the main workspace while writing.

---

# SCREEN 01 — Main Workspace

## Purpose

Primary working environment.

Users spend more than 90% of their time here.

---

## Layout

```text
+------------------------------------------------------------+
| Toolbar                                                    |
+------------------------------------------------------------+

| Activity | Sidebar | Editor | AI Assistant Panel          |
| Bar      |         |        |                             |
|          |         |        |                             |
|          |         |        |                             |

+------------------------------------------------------------+
| Status Bar                                                 |
+------------------------------------------------------------+
```

---

## Regions

### Toolbar

Height:

56px

Position:

Fixed top

---

### Activity Bar

Width:

56px

Position:

Fixed left

---

### Sidebar

Default Width:

320px

Resizable

Collapsible

---

### Editor

Flexible width

Minimum:

700px

---

### AI Panel

Default Width:

400px

Resizable

Collapsible

---

### Status Bar

Height:

28px

Position:

Fixed bottom

---

# SCREEN 02 — Story View

## Purpose

Manage story structure.

---

## Sidebar

Display hierarchical story tree.

Structure:

Novel

├── Arc

│ ├── Chapter

│ ├── Chapter

│ └── Chapter

├── Arc

│ ├── Chapter

│ └── Chapter

---

## User Actions

Create Arc

Create Chapter

Rename

Delete

Move

Drag & Drop

Duplicate

---

## Main Area

Display chapter content.

---

## Empty State

No chapter selected.

Display:

"Select a chapter to begin writing."

---

## AI Panel

Display:

* Chapter Summary
* Story Progress
* Suggested Next Scene
* Narrative Analysis

---

# SCREEN 03 — Rich Text Editor

## Purpose

Write and edit story content.

---

## Features

Rich Text Editing

Infinite Scroll

Auto Save

Undo / Redo

Comments

Annotations

---

## Supported Elements

Paragraph

Heading 1

Heading 2

Heading 3

Bullet List

Number List

Quote

Table

Image

Code Block

Horizontal Rule

Hyperlink

---

## Writing Experience

Inspired by:

Google Docs

Notion

Word Online

---

## Editor States

Normal

Focused

Selection Active

Comment Mode

Read Only

---

# SCREEN 04 — Entity View

## Purpose

Story Wiki

---

## Sidebar

Categories:

Characters

Locations

Organizations

Items

Concepts

Events

---

## Main Area

Entity Detail Page

---

## Sections

Basic Information

Aliases

Description

Attributes

Relationships

Timeline

Recent Mentions

Notes

---

## Empty State

"No entities found."

Button:

Extract Entities

---

## AI Panel

Display:

Missing Information

Relationship Suggestions

Consistency Warnings

---

# SCREEN 05 — Entity Detail Page

## Purpose

Single entity inspection.

---

## Layout

Header

Entity Metadata

Relationship Section

Event History

Knowledge References

---

## Actions

Edit

Delete

Merge

Create Alias

Link Relationship

---

# SCREEN 06 — Timeline View

## Purpose

Chronological story tracking.

---

## Sidebar

Filters:

Chapter

Arc

Character

Location

Date

---

## Main Area

Timeline Visualization

---

## View Modes

Vertical Timeline

Chapter Timeline

Character Timeline

---

## Timeline Event Card

Title

Timestamp

Related Characters

Related Locations

Related Entities

---

## AI Panel

Display:

Timeline Gaps

Chronology Warnings

Suggested Fixes

---

# SCREEN 07 — Knowledge Graph View

## Purpose

Visualize story relationships.

---

## Main Area

Interactive Graph Canvas

---

## Node Types

Character

Location

Organization

Item

Concept

Event

---

## Edge Types

Friendship

Enemy

Family

Ownership

Membership

Participation

Travel

---

## User Actions

Zoom

Pan

Select Node

Expand Node

Filter Graph

---

## AI Panel

Explain Connections

Detect Clusters

Suggest Missing Links

---

# SCREEN 08 — Search View

## Purpose

Global project search.

---

## Layout

Search Bar

Results Panel

Preview Panel

AI Explanation Panel

---

## Search Types

Keyword Search

Semantic Search

Entity Search

Event Search

Relationship Search

---

## Search Result Card

Title

Type

Preview

Source

Last Updated

---

# SCREEN 09 — Tasks View

## Purpose

Agent execution center.

---

## Sidebar

Task Categories

---

## Available Tasks

Extract Entities

Update Timeline

Generate Summary

Check Consistency

Detect Plot Holes

Generate Character Sheet

Analyze Relationships

---

## Main Area

Task Queue

Running Tasks

Completed Tasks

Failed Tasks

---

## AI Panel

Execution Logs

Reasoning

Recommendations

---

# SCREEN 10 — Projects View

## Purpose

Project Management

---

## Layout

Project Grid

---

## Project Card

Project Name

Genre

Word Count

Last Modified

Progress

---

## Actions

Open

Duplicate

Archive

Delete

Export

---

# SCREEN 11 — AI Assistant Panel

## Purpose

Unified AI Interaction Hub

---

## Tabs

Chat

Suggestions

Context

Tasks

---

## Chat Tab

Conversation

Prompt Input

History

---

## Suggestions Tab

Plot Suggestions

Dialogue Suggestions

Foreshadowing Opportunities

Worldbuilding Suggestions

---

## Context Tab

Current Chapter

Active Characters

Active Locations

Recent Events

Relevant Knowledge

---

## Tasks Tab

Quick Actions

Agent Actions

Workflow Execution

---

# SCREEN 12 — Consistency Review

## Purpose

Plot-hole Detection

---

## Layout

Issue List

Issue Details

Recommended Fixes

---

## Severity Levels

Info

Warning

Critical

---

## Actions

Ignore

Accept Fix

Mark Resolved

---

# SCREEN 13 — Focus Mode

## Purpose

Distraction-Free Writing

---

## Visible Components

Editor

AI Panel

---

## Hidden Components

Activity Bar

Sidebar

Status Bar

---

## Optional

Fullscreen Writing

Typewriter Mode

---

# SCREEN 14 — Toolbar

## Purpose

Global Editing Actions

---

## Groups

File

Edit

Insert

Format

View

AI

---

## AI Actions

Rewrite

Expand

Shorten

Summarize

Extract Entities

Update Timeline

Check Consistency

---

# SCREEN 15 — Status Bar

## Purpose

System Status

---

## Display

Project Name

Current Chapter

Word Count

Character Count

Auto Save Status

AI Context Usage

Sync Status

Current Mode

---

# Responsive Rules

Primary Target:

Desktop

Minimum Width:

1440px

Preferred Width:

1920px

---

Mobile:

Not Supported

---

Tablet:

Optional Future Version

---

# Initial Prototype Scope

Must Include

* Main Workspace
* Story View
* Editor
* AI Panel
* Entity View
* Timeline View

Can Exclude

* Knowledge Graph
* Multi-Agent
* Collaboration
* Version History

Version 1 Only
