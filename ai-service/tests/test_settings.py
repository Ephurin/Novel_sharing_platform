import os
import unittest
from unittest.mock import patch

from core.settings import Settings


class SettingsTests(unittest.TestCase):
    def test_structured_output_budget_is_configurable_and_positive(self) -> None:
        with patch.dict(os.environ, {"LLM_STRUCTURED_MAX_TOKENS": "4096"}, clear=True):
            self.assertEqual(Settings.from_env().llm_structured_max_tokens, 4096)
        with patch.dict(os.environ, {"LLM_STRUCTURED_MAX_TOKENS": "0"}, clear=True):
            with self.assertRaises(ValueError):
                Settings.from_env()

    def test_defaults_disable_provider_and_keep_local_cors(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            settings = Settings.from_env()

        self.assertEqual(settings.llm_provider, "none")
        self.assertFalse(settings.llm_enabled)
        self.assertEqual(settings.llm_model, "disabled")
        self.assertIn("http://localhost:5173", settings.cors_origins)
        self.assertEqual(settings.llm_timeout_seconds, 30)
        self.assertEqual(settings.narrative_repository, "json")
        self.assertEqual(settings.app_env, "development")
        self.assertEqual(settings.json_repository_mode, "read-write")
        self.assertEqual(settings.context_routing_policy, "legacy-v1")

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
            "CONTEXT_ROUTING_POLICY": "balanced-scope-v1",
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
        self.assertEqual(settings.context_routing_policy, "balanced-scope-v1")

    def test_production_forces_json_read_only_mode(self) -> None:
        with patch.dict(
            os.environ,
            {"APP_ENV": "production", "NARRATIVE_REPOSITORY": "postgres", "DATABASE_URL": "postgresql+psycopg://localhost/test"},
            clear=True,
        ):
            settings = Settings.from_env()

        self.assertEqual(settings.app_env, "production")
        self.assertEqual(settings.json_repository_mode, "read-only")

    def test_production_requires_postgres_repository(self) -> None:
        with patch.dict(
            os.environ,
            {"APP_ENV": "production", "NARRATIVE_REPOSITORY": "json"},
            clear=True,
        ):
            with self.assertRaisesRegex(ValueError, "NARRATIVE_REPOSITORY"):
                Settings.from_env()

    def test_production_rejects_json_read_write_mode(self) -> None:
        with patch.dict(
            os.environ,
            {
                "APP_ENV": "production",
                "NARRATIVE_REPOSITORY": "postgres",
                "DATABASE_URL": "postgresql+psycopg://localhost/test",
                "JSON_REPOSITORY_MODE": "read-write",
            },
            clear=True,
        ):
            with self.assertRaisesRegex(ValueError, "JSON_REPOSITORY_MODE"):
                Settings.from_env()


    def test_invalid_context_routing_policy_is_rejected(self) -> None:
        with patch.dict(
            os.environ,
            {"CONTEXT_ROUTING_POLICY": "experimental-unbounded"},
            clear=True,
        ):
            with self.assertRaisesRegex(ValueError, "CONTEXT_ROUTING_POLICY"):
                Settings.from_env()

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
