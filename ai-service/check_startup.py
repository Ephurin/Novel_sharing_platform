import argparse
import importlib
import os
import sys
from pathlib import Path


def load_env(base_dir: Path) -> None:
    try:
        from dotenv import load_dotenv
    except Exception:
        return

    env_path = base_dir / ".env"
    evn_path = base_dir / ".evn"
    if env_path.exists():
        load_dotenv(dotenv_path=env_path, override=False)
    elif evn_path.exists():
        load_dotenv(dotenv_path=evn_path, override=False)


def normalize_path(value: str, default_path: Path) -> Path:
    raw = (value or "").strip()
    if not raw or raw.startswith("<"):
        return default_path.resolve()
    return Path(raw).expanduser().resolve()


def check_python_deps(errors: list[str]) -> None:
    required_modules = {
        "fastapi": "fastapi",
        "uvicorn": "uvicorn",
        "transformers": "transformers",
        "torch": "torch",
        "neo4j": "neo4j",
        "dotenv": "python-dotenv",
        "google.genai": "google-genai",
        "openai": "openai",
    }

    for module_name, package_name in required_modules.items():
        if importlib.util.find_spec(module_name) is None:
            errors.append(f"Missing dependency: {package_name} (import: {module_name})")


def check_model_files(base_dir: Path, errors: list[str]) -> None:
    model_dir = normalize_path(
        os.getenv("PHOBERT_MODEL_DIR", ""),
        base_dir / "models" / "phobert_ner_tienhiep",
    )

    if not model_dir.exists():
        errors.append(f"Model directory not found: {model_dir}")
        return

    required = ["config.json", "model.safetensors"]
    for file_name in required:
        if not (model_dir / file_name).exists():
            errors.append(f"Missing model file: {model_dir / file_name}")

    tokenizer_candidates = ["tokenizer.json", "tokenizer_config.json", "vocab.txt", "bpe.codes"]
    if not any((model_dir / name).exists() for name in tokenizer_candidates):
        errors.append("Tokenizer files are missing in model directory")


def check_llm_config(errors: list[str], warnings: list[str]) -> None:
    provider = os.getenv("LLM_PROVIDER", "gemini").strip().lower()
    gemini_key = (os.getenv("GEMINI_API_KEY", "") or os.getenv("GOOGLE_API_KEY", "")).strip()
    openai_key = (os.getenv("OPENAI_API_KEY", "") or os.getenv("LLM_API_KEY", "")).strip()

    if provider == "gemini":
        if not gemini_key or gemini_key.startswith("<"):
            errors.append("LLM_PROVIDER=gemini but GEMINI_API_KEY/GOOGLE_API_KEY is missing")
        if not openai_key or openai_key.startswith("<"):
            warnings.append("OpenAI fallback key is missing. Gemini quota errors cannot fallback to OpenAI.")
    elif provider == "openai":
        if not openai_key or openai_key.startswith("<"):
            errors.append("LLM_PROVIDER=openai but OPENAI_API_KEY/LLM_API_KEY is missing")
    elif provider == "none":
        warnings.append("LLM provider is disabled (LLM_PROVIDER=none)")
    else:
        errors.append(f"Unsupported LLM_PROVIDER value: {provider}")


def check_graph_connectivity_and_schema(base_dir: Path, errors: list[str], warnings: list[str]) -> None:
    uri = (os.getenv("NEO4J_URI", "") or "").strip()
    user = (os.getenv("NEO4J_USER", "") or os.getenv("NEO4J_USERNAME", "") or "").strip()
    password = (os.getenv("NEO4J_PASSWORD", "") or "").strip()
    database = (os.getenv("NEO4J_DATABASE", "") or "").strip()

    if not uri or not user or not password or uri.startswith("<") or user.startswith("<") or password.startswith("<"):
        graph_json = normalize_path(
            os.getenv("GRAPH_JSON_PATH", ""),
            base_dir / "models" / "knowledge_graph.json",
        )
        if graph_json.exists():
            warnings.append("Neo4j credentials missing; using JSON graph fallback for basic graph features")
            return
        errors.append("Neo4j credentials are missing and no JSON graph fallback file was found")
        return

    try:
        from neo4j import GraphDatabase
    except Exception:
        errors.append("neo4j package is unavailable for graph schema checks")
        return

    driver = None
    try:
        driver = GraphDatabase.driver(uri, auth=(user, password))
        driver.verify_connectivity()

        with (driver.session(database=database) if database else driver.session()) as session:
            labels_result = session.run("CALL db.labels() YIELD label RETURN collect(label) AS labels").single()
            rels_result = session.run(
                "CALL db.relationshipTypes() YIELD relationshipType RETURN collect(relationshipType) AS rels"
            ).single()
            props_result = session.run("CALL db.propertyKeys() YIELD propertyKey RETURN collect(propertyKey) AS props").single()

        labels = set(labels_result["labels"] if labels_result and labels_result.get("labels") else [])
        rels = set(rels_result["rels"] if rels_result and rels_result.get("rels") else [])
        props = set(props_result["props"] if props_result and props_result.get("props") else [])

        # Core graph features required by sync-story.
        required_labels = {"Entity", "Story"}
        required_rels = {"MENTIONED_IN"}

        # Consistency engine critical schema.
        consistency_labels = {"Location"}
        consistency_rels = {"LOCATED_AT"}
        consistency_props = {"status"}

        missing_required_labels = sorted(required_labels - labels)
        missing_required_rels = sorted(required_rels - rels)
        missing_consistency_labels = sorted(consistency_labels - labels)
        missing_consistency_rels = sorted(consistency_rels - rels)
        missing_consistency_props = sorted(consistency_props - props)

        if missing_required_labels:
            errors.append(f"Missing required Neo4j labels: {', '.join(missing_required_labels)}")
        if missing_required_rels:
            errors.append(f"Missing required Neo4j relationship types: {', '.join(missing_required_rels)}")

        if missing_consistency_labels or missing_consistency_rels or missing_consistency_props:
            errors.append(
                "Missing consistency schema in Neo4j: "
                + "; ".join(
                    part
                    for part in [
                        f"labels={','.join(missing_consistency_labels)}" if missing_consistency_labels else "",
                        f"rels={','.join(missing_consistency_rels)}" if missing_consistency_rels else "",
                        f"props={','.join(missing_consistency_props)}" if missing_consistency_props else "",
                    ]
                    if part
                )
            )

    except Exception as exc:
        errors.append(f"Neo4j connectivity/schema check failed: {exc}")
    finally:
        if driver is not None:
            driver.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Fail-fast startup checker for AI service")
    parser.add_argument(
        "--base-dir",
        default=str(Path(__file__).resolve().parent),
        help="Path to ai-service directory",
    )
    args = parser.parse_args()

    base_dir = Path(args.base_dir).resolve()
    load_env(base_dir)

    errors: list[str] = []
    warnings: list[str] = []

    check_python_deps(errors)
    check_model_files(base_dir, errors)
    check_llm_config(errors, warnings)
    check_graph_connectivity_and_schema(base_dir, errors, warnings)

    print("== AI Service Startup Check ==")
    print(f"Base dir: {base_dir}")

    if warnings:
        print("Warnings:")
        for item in warnings:
            print(f"- {item}")

    if errors:
        print("Errors:")
        for item in errors:
            print(f"- {item}")
        print("Result: FAIL")
        return 1

    print("Result: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
