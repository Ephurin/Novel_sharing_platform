import os
import unittest
from unittest.mock import patch

from core.settings import Settings


class SettingsTests(unittest.TestCase):
    def test_defaults_disable_provider_and_keep_local_cors(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            settings = Settings.from_env()

        self.assertEqual(settings.llm_provider, "none")
        self.assertFalse(settings.llm_enabled)
        self.assertEqual(settings.llm_model, "disabled")
        self.assertIn("http://localhost:5173", settings.cors_origins)
        self.assertEqual(settings.llm_timeout_seconds, 30)
        self.assertEqual(settings.narrative_repository, "json")

    def test_environment_values_are_parsed(self) -> None:
        environment = {
            "LLM_PROVIDER": "openai",
            "LLM_MODEL": "local-model",
            "LLM_BASE_URL": "http://127.0.0.1:8001/v1",
            "LLM_TIMEOUT_SECONDS": "45",
            "CORS_ORIGINS": "https://author.example, https://admin.example",
            "ENTITY_PIPELINE_VERSION": "entity-v2",
            "ENTITY_PROMPT_VERSION": "entity-prompt-v3",
            "NARRATIVE_REPOSITORY": "postgres",
            "DATABASE_URL": "postgresql+psycopg://localhost/test",
        }

        with patch.dict(os.environ, environment, clear=True):
            settings = Settings.from_env()

        self.assertTrue(settings.llm_enabled)
        self.assertEqual(settings.llm_model, "local-model")
        self.assertEqual(settings.llm_timeout_seconds, 45)
        self.assertEqual(
            settings.cors_origins,
            ("https://author.example", "https://admin.example"),
        )
        self.assertEqual(settings.pipeline_version, "entity-v2")
        self.assertEqual(settings.entity_prompt_version, "entity-prompt-v3")
        self.assertEqual(settings.narrative_repository, "postgres")

    def test_invalid_provider_is_rejected(self) -> None:
        with patch.dict(os.environ, {"LLM_PROVIDER": "unknown"}, clear=True):
            with self.assertRaisesRegex(ValueError, "LLM_PROVIDER"):
                Settings.from_env()

    def test_postgres_repository_requires_database_url(self) -> None:
        with patch.dict(
            os.environ,
            {"LLM_PROVIDER": "none", "NARRATIVE_REPOSITORY": "postgres"},
            clear=True,
        ):
            with self.assertRaisesRegex(ValueError, "DATABASE_URL"):
                Settings.from_env()


if __name__ == "__main__":
    unittest.main()
