"""
Test Harness Entrypoint for Phase 4 Docker/Integration testing.
Injects FakeDeterministicLLMService without modifying production main.py or falling back silently.
"""

from __future__ import annotations

import logging
import os

from main import app
from tests.harness.fake_llm import FakeDeterministicLLMService

logger = logging.getLogger("test-harness")

use_fake = os.getenv("USE_FAKE_LLM", "true").lower() in {"1", "true", "yes"}
if use_fake:
    logger.info("Initializing Test Harness with FakeDeterministicLLMService")
    fake_service = FakeDeterministicLLMService()
    app.state.llm_service = fake_service
    if hasattr(app.state, "revision_analysis_service"):
        app.state.revision_analysis_service._llm_service = fake_service
else:
    logger.info("Test Harness running with production LLM configuration")
