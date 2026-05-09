# Architecture

## Components

### 1. NER Service
- Input: text
- Output: entities

### 2. Relation Extraction
- LLM-based
- Output: relations

### 3. Knowledge Base (JSON)
- Stores:
  - entities
  - relations
  - events

### 4. Context Retriever
- Retrieve relevant data for LLM

### 5. Consistency Engine
- Rule-based + LLM

---

## Data Flow

Text
→ NER
→ Relation Extraction
→ Event Extraction
→ KB
→ Context Builder
→ LLM