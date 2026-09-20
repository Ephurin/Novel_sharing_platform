"""
Re-export FakeDeterministicLLMService for test harnesses.
Implementation lives in core.fake_llm as part of composition root.
"""

from core.fake_llm import FakeDeterministicLLMService

__all__ = ["FakeDeterministicLLMService"]
