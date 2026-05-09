# ENTITY EXTRACTION PIPELINE (CAPITALIZED-FIRST + COLAB ML)

---

## 1. MỤC TIÊU

Thiết kế pipeline:

> Text → Capitalized Candidates → Phrase → Scoring/ML → User Confirm → KB

**Khác biệt chính:**

* ML (classifier / embedding / similarity) **KHÔNG chạy trong backend**
* ML được:

  * train trên Google Colab
  * export model/artifact
  * backend chỉ **load hoặc gọi API**

---

## 2. KIẾN TRÚC TỔNG THỂ

```id="3c2e4g"
                ┌──────────────────────┐
                │   Google Colab       │
                │----------------------│
                │ - Train classifier   │
                │ - Train embeddings   │
                │ - Export model       │
                └─────────┬────────────┘
                          ↓
                ┌──────────────────────┐
                │   Backend (FastAPI)  │
                │----------------------│
                │ Rule-based pipeline  │
                │ + Load ML artifact   │
                └─────────┬────────────┘
                          ↓
                User Confirmation (UI)
```

---

## 3. PIPELINE FLOW

```id="h9c8u1"
Input Text
  ↓
[1] Tokenize + Sentence Split
  ↓
[2] Capitalized Candidate Extraction
  ↓
[3] Phrase Builder
  ↓
[4] Scoring (Rule-based)
  ↓
[5] ML Classification (OPTIONAL - from Colab)
  ↓
[6] KB Matching (embedding hoặc string match)
  ↓
[7] User Confirmation
  ↓
[8] Persist to KB
```

---

## 4. PHÂN TÁCH RESPONSIBILITY

---

### 4.1 Backend (FastAPI)

CHỊU TRÁCH NHIỆM:

* Tokenization
* Candidate extraction
* Phrase building
* Rule-based scoring
* API phục vụ UI
* Load model từ file (nếu có)
* Gọi ML service (optional)

KHÔNG làm:

* Training model
* Heavy ML compute

---

### 4.2 Google Colab (ML Layer)

CHỊU TRÁCH NHIỆM:

* Train classifier (entity vs non-entity)
* Train embedding model (optional)
* Evaluate model
* Export artifact

---

## 5. ML COMPONENTS (COLAB)

---

### 5.1 Entity Classifier

#### Input:

```json id="m3t8cp"
{
  "phrase": "Blackspire Citadel",
  "features": {
    "length": 2,
    "has_apostrophe": false,
    "is_sentence_start": false
  }
}
```

---

#### Output:

```json id="0f97j9"
{
  "label": "ENTITY",
  "confidence": 0.91
}
```

---

### Model đề xuất:

* Logistic Regression (baseline)
* LightGBM (recommended)
* KHÔNG cần deep learning

---

### Export:

```python id="q4rqz5"
joblib.dump(model, "entity_classifier.pkl")
```

---

---

### 5.2 Embedding Model (OPTIONAL)

Dùng cho:

* KB matching
* alias detection

---

#### Gợi ý:

* sentence-transformers (pretrained)
* không cần train lại nếu MVP

---

#### Export:

* hoặc load trực tiếp model name
* hoặc export embedding cache

---

## 6. BACKEND IMPLEMENTATION

---

### 6.1 File Structure

```id="0a9k2m"
services/
  entity_pipeline/
    candidate_extractor.py
    phrase_builder.py
    scoring_engine.py
    ml_adapter.py        # NEW
    kb_matcher.py
    pipeline.py

ml/
  models/
    entity_classifier.pkl
```

---

## 7. ML ADAPTER (QUAN TRỌNG)

File: `ml_adapter.py`

---

### Mục tiêu:

* load model từ Colab export
* hoặc gọi external API

---

### Option A: Load local model

```python id="i7l1b4"
import joblib

class MLAdapter:
    def __init__(self):
        self.model = joblib.load("ml/models/entity_classifier.pkl")

    def predict(self, features):
        return self.model.predict_proba([features])[0]
```

---

### Option B: Call external API (Colab deployed)

```python id="4ujc6m"
import requests

def predict_remote(features):
    response = requests.post(
        "https://colab-api/predict",
        json=features
    )
    return response.json()
```

---

## 8. SCORING + ML COMBINATION

---

### Hybrid logic:

```python id="p7z1b8"
final_score = rule_score

if ml_enabled:
    ml_conf = ml_adapter.predict(features)

    if ml_conf > 0.8:
        final_score += 3
    elif ml_conf < 0.3:
        final_score -= 2
```

---

### Threshold:

```python id="s0y7km"
if final_score >= 3:
    KEEP
```

---

## 9. KB MATCHING

---

### Basic:

```python id="aq2jmf"
string_similarity(candidate, kb_entity)
```

---

### Advanced (optional):

```python id="wd8u0c"
cosine_similarity(embedding1, embedding2)
```

---

## 10. API DESIGN

---

### 10.1 Suggest

```id="k0r8hc"
POST /v1/entity/suggest
```

---

### 10.2 Confirm

```id="r3h9de"
POST /v1/entity/confirm
```

---

## 11. CONFIGURATION

---

### Feature flags:

```python id="qk8f7z"
USE_ML = True
USE_REMOTE_MODEL = False
```

---

## 12. DEPLOYMENT FLOW

---

### Bước 1 – Colab

* train model
* export `.pkl`

---

### Bước 2 – Backend

* copy model vào:

```id="k5mz2v"
ml/models/
```

---

### Bước 3 – Runtime

* backend load model khi start

---

## 13. FALLBACK STRATEGY

---

Nếu:

* model không load được
* API ML fail

→ fallback:

```id="i1sm0p"
use rule-based scoring only
```

---

## 14. SUCCESS CRITERIA

* Rule-only vẫn hoạt động ổn
* ML giúp:

  * giảm false positive
  * giữ được alias khó

---

## 15. IMPLEMENTATION ORDER

1. Rule-based pipeline
2. API + UI confirm
3. ML training trên Colab
4. ML adapter integration
5. tuning

---

## END
