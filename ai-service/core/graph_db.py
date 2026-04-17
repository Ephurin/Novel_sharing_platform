import json
import logging
import os
from pathlib import Path
from typing import Any


logger = logging.getLogger(__name__)


class GraphDBError(RuntimeError):
    """Raised when graph retrieval fails."""


try:
    from neo4j import GraphDatabase
except Exception:  # pragma: no cover - optional dependency path
    GraphDatabase = None


class GraphManager:
    """Neo4j manager designed for FastAPI integration with resilient fallbacks."""

    def __init__(
        self,
        uri: str | None = None,
        user: str | None = None,
        password: str | None = None,
        database: str | None = None,
        env_file: str | Path = ".env",
    ) -> None:
        self.driver = None
        self.database = database

        self._load_env_file(env_file)
        self.uri = uri or os.getenv("NEO4J_URI", "")
        self.user = user or os.getenv("NEO4J_USER", "") or os.getenv("NEO4J_USERNAME", "")
        self.password = password or os.getenv("NEO4J_PASSWORD", "")
        self.database = self.database or os.getenv("NEO4J_DATABASE", "") or None

        self._connect()

    def _load_env_file(self, env_file: str | Path) -> None:
        env_path = Path(env_file)
        if not env_path.exists():
            return

        try:
            from dotenv import load_dotenv  # type: ignore

            load_dotenv(dotenv_path=env_path, override=False)
            logger.info("Loaded environment from %s using python-dotenv", env_path)
            return
        except Exception:
            pass

        try:
            with env_path.open("r", encoding="utf-8") as fp:
                for raw_line in fp:
                    line = raw_line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, value = line.split("=", 1)
                    key = key.strip()
                    value = value.strip().strip('"').strip("'")
                    if key and key not in os.environ:
                        os.environ[key] = value
            logger.info("Loaded environment from %s using fallback parser", env_path)
        except Exception:
            logger.exception("Failed to load .env file: %s", env_path)

    def _connect(self) -> None:
        if GraphDatabase is None:
            logger.warning("neo4j package is not installed. GraphManager runs in disabled mode.")
            self.driver = None
            return

        if not self.uri or not self.user or not self.password:
            logger.warning("Neo4j credentials are missing. GraphManager runs in disabled mode.")
            self.driver = None
            return

        try:
            self.driver = GraphDatabase.driver(self.uri, auth=(self.user, self.password))
            self.driver.verify_connectivity()
            logger.info("GraphManager connected to Neo4j: uri=%s database=%s", self.uri, self.database or "default")
        except Exception:
            self.driver = None
            logger.exception("GraphManager failed to connect to Neo4j. Continuing without DB connection.")

    def close(self) -> None:
        if self.driver is not None:
            self.driver.close()

    def upsert_entities(self, entities: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """
        entities example:
        [{"word": "Tiêu Viêm", "entity": "PER"}, {"word": "Vân Lam Tông", "entity": "ORG"}]
        """
        if not entities:
            return []

        rows: list[dict[str, str]] = []
        for item in entities:
            if not isinstance(item, dict):
                continue
            name = str(item.get("word") or item.get("Entity") or item.get("name") or "").strip()
            entity_type = str(item.get("entity") or item.get("Label") or "UNKNOWN").strip()
            if name:
                rows.append({"name": name, "entity_type": entity_type or "UNKNOWN"})

        if not rows:
            return []

        query = (
            "UNWIND $rows AS row "
            "WITH trim(row.name) AS name, trim(row.entity_type) AS entity_type "
            "WHERE name <> '' "
            "MERGE (n:Entity {name: name}) "
            "ON CREATE SET n.entity_type = entity_type, n.created_at = datetime() "
            "ON MATCH SET n.updated_at = datetime(), "
            "n.entity_type = CASE "
            "WHEN n.entity_type IS NULL OR n.entity_type = '' THEN entity_type "
            "ELSE n.entity_type END "
            "RETURN n.name AS name, n.entity_type AS entity_type"
        )

        try:
            return self._run_query(query, {"rows": rows})
        except Exception:
            logger.exception("upsert_entities failed")
            return []

    def create_relationship(self, name_a: str, rel_type: str, name_b: str) -> dict[str, Any]:
        if not name_a or not name_a.strip() or not name_b or not name_b.strip() or not rel_type or not rel_type.strip():
            return {}

        safe_relation_type = self._safe_relation_type(rel_type)
        query = (
            "MERGE (a:Entity {name: $name_a}) "
            "MERGE (b:Entity {name: $name_b}) "
            f"MERGE (a)-[r:{safe_relation_type}]->(b) "
            "RETURN a.name AS name_a, type(r) AS relation, b.name AS name_b"
        )

        try:
            rows = self._run_query(query, {"name_a": name_a.strip(), "name_b": name_b.strip()})
            return rows[0] if rows else {}
        except Exception:
            logger.exception("create_relationship failed")
            return {}

    def get_story_context(self, character_name: str, limit: int = 50) -> str:
        if not character_name or not character_name.strip():
            return ""

        query = (
            "MATCH (center:Entity {name: $name}) "
            "OPTIONAL MATCH (center)-[r]-(neighbor) "
            "RETURN center.name AS center, neighbor.name AS neighbor, type(r) AS relation "
            "LIMIT $limit"
        )

        try:
            rows = self._run_query(query, {"name": character_name.strip(), "limit": int(limit)})
            if not rows:
                return f"Character '{character_name.strip()}' has no relationship context in graph."

            lines = [f"Center character: {character_name.strip()}", "One-hop relationships:"]
            for row in rows:
                neighbor = row.get("neighbor")
                relation = row.get("relation")
                if neighbor:
                    lines.append(f"- {character_name.strip()} -[{relation}]- {neighbor}")
            if len(lines) == 2:
                lines.append("- No connected nodes found.")
            return "\n".join(lines)
        except Exception:
            logger.exception("get_story_context failed")
            return "Graph context is currently unavailable due to database connectivity issues."

    def get_consistency_graph_data(self, character_name: str, limit: int = 50) -> list[dict[str, str]]:
        """Return normalized character status/location records for consistency checks."""
        if not character_name or not character_name.strip():
            return []

        query = (
            "MATCH (center:Entity {name: $name}) "
            "OPTIONAL MATCH (center)-[:LOCATED_AT]->(loc:Location) "
            "RETURN center.name AS name, "
            "coalesce(center.status, 'Unknown') AS status, "
            "coalesce(loc.name, '') AS location "
            "UNION "
            "MATCH (center:Entity {name: $name})-[r]-(neighbor:Entity) "
            "OPTIONAL MATCH (neighbor)-[:LOCATED_AT]->(nloc:Location) "
            "RETURN neighbor.name AS name, "
            "coalesce(neighbor.status, 'Unknown') AS status, "
            "coalesce(nloc.name, '') AS location "
            "LIMIT $limit"
        )

        try:
            rows = self._run_query(query, {"name": character_name.strip(), "limit": int(limit)})
            dedup: dict[str, dict[str, str]] = {}
            for row in rows:
                name = str(row.get("name", "")).strip()
                if not name:
                    continue
                dedup[name.casefold()] = {
                    "name": name,
                    "status": str(row.get("status", "Unknown") or "Unknown").strip(),
                    "location": str(row.get("location", "") or "").strip(),
                }
            return list(dedup.values())
        except Exception:
            logger.exception("get_consistency_graph_data failed")
            return []

    def _run_query(self, query: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        params = params or {}
        logger.info("Cypher execute: %s | params=%s", query, params)

        if self.driver is None:
            self._connect()
            if self.driver is None:
                raise GraphDBError("Neo4j connection is not available")

        try:
            if self.database:
                with self.driver.session(database=self.database) as session:
                    result = session.run(query, **params)
                    return [record.data() for record in result]

            with self.driver.session() as session:
                result = session.run(query, **params)
                return [record.data() for record in result]
        except Exception as exc:
            logger.exception("Cypher execution failed")
            self.driver = None
            raise GraphDBError(f"Cypher execution failed: {exc}") from exc

    @staticmethod
    def _safe_relation_type(raw_relation_type: str) -> str:
        relation = raw_relation_type.strip().replace("`", "")
        if not relation:
            raise ValueError("relation_type is invalid")
        return f"`{relation}`"


class KnowledgeGraphManager:
    """Neo4j-backed manager for story character entities and relationships."""

    def __init__(self, uri: str, user: str, password: str, database: str | None = None) -> None:
        if GraphDatabase is None:
            raise GraphDBError("neo4j package is not installed. Run: pip install neo4j")

        self.uri = uri
        self.user = user
        self.database = database
        self.driver = None

        try:
            self.driver = GraphDatabase.driver(uri, auth=(user, password))
            self.driver.verify_connectivity()
            logger.info("Neo4j connection established: uri=%s database=%s", uri, database or "default")
        except Exception as exc:
            raise GraphDBError(f"Failed to connect to Neo4j at {uri}: {exc}") from exc

    def close(self) -> None:
        if self.driver:
            self.driver.close()

    def upsert_character(self, name: str) -> dict[str, Any]:
        if not name or not name.strip():
            raise ValueError("Character name must not be empty")

        query = (
            "MERGE (c:Character {name: $name}) "
            "ON CREATE SET c.created_at = datetime() "
            "ON MATCH SET c.updated_at = datetime() "
            "RETURN c.name AS name"
        )
        rows = self._run_query(query, {"name": name.strip()})
        return rows[0] if rows else {"name": name.strip()}

    def add_relationship(self, node_a: str, node_b: str, relation_type: str) -> dict[str, Any]:
        if not node_a or not node_a.strip():
            raise ValueError("node_a must not be empty")
        if not node_b or not node_b.strip():
            raise ValueError("node_b must not be empty")
        if not relation_type or not relation_type.strip():
            raise ValueError("relation_type must not be empty")

        safe_relation_type = self._safe_relation_type(relation_type)
        query = (
            "MERGE (a:Character {name: $node_a}) "
            "MERGE (b:Character {name: $node_b}) "
            f"MERGE (a)-[r:{safe_relation_type}]->(b) "
            "RETURN a.name AS node_a, type(r) AS relation_type, b.name AS node_b"
        )
        rows = self._run_query(query, {"node_a": node_a.strip(), "node_b": node_b.strip()})
        return rows[0] if rows else {}

    def get_context_for_rag(self, name: str, limit: int = 50) -> dict[str, Any]:
        if not name or not name.strip():
            raise ValueError("Character name must not be empty")

        query = (
            "MATCH (center:Character {name: $name}) "
            "OPTIONAL MATCH (center)-[r]-(neighbor) "
            "RETURN center.name AS center, "
            "neighbor.name AS neighbor, "
            "type(r) AS relation_type, "
            "labels(neighbor) AS neighbor_labels "
            "LIMIT $limit"
        )
        rows = self._run_query(query, {"name": name.strip(), "limit": int(limit)})

        one_hop_nodes: list[dict[str, Any]] = []
        for row in rows:
            if row.get("neighbor") is None:
                continue
            one_hop_nodes.append(
                {
                    "node": str(row.get("neighbor", "")),
                    "relation_type": str(row.get("relation_type", "RELATED_TO")),
                    "labels": row.get("neighbor_labels", []),
                }
            )

        context_lines = [f"Nhân vật trung tâm: {name.strip()}"]
        if one_hop_nodes:
            context_lines.append("Quan hệ một bước:")
            for item in one_hop_nodes:
                context_lines.append(f"- {name.strip()} -[{item['relation_type']}]-> {item['node']}")
        else:
            context_lines.append("Chưa có dữ liệu quan hệ một bước trong KG.")

        return {
            "center": name.strip(),
            "one_hop_nodes": one_hop_nodes,
            "context_text": "\n".join(context_lines),
        }

    def _run_query(self, query: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        if self.driver is None:
            raise GraphDBError("Neo4j driver is not initialized")

        params = params or {}
        logger.info("Cypher execute: %s | params=%s", query, params)
        try:
            if self.database:
                with self.driver.session(database=self.database) as session:
                    result = session.run(query, **params)
                    return [record.data() for record in result]
            with self.driver.session() as session:
                result = session.run(query, **params)
                return [record.data() for record in result]
        except Exception as exc:
            logger.exception("Cypher execution failed")
            raise GraphDBError(f"Cypher execution failed: {exc}") from exc

    @staticmethod
    def _safe_relation_type(raw_relation_type: str) -> str:
        relation = raw_relation_type.strip().replace("`", "")
        if not relation:
            raise ValueError("relation_type is invalid")
        return f"`{relation}`"


class GraphDBClient:
    def __init__(
        self,
        neo4j_uri: str | None = None,
        neo4j_user: str | None = None,
        neo4j_password: str | None = None,
        json_graph_path: str | Path | None = None,
    ) -> None:
        self.neo4j_uri = neo4j_uri
        self.neo4j_user = neo4j_user
        self.neo4j_password = neo4j_password
        self.json_graph_path = Path(json_graph_path) if json_graph_path else None
        self.driver = None
        self._json_cache: dict[str, Any] | None = None

        if self.neo4j_uri and self.neo4j_user and self.neo4j_password and GraphDatabase is not None:
            self.driver = GraphDatabase.driver(
                self.neo4j_uri,
                auth=(self.neo4j_user, self.neo4j_password),
            )
            logger.info("GraphDB initialized with Neo4j: %s", self.neo4j_uri)
        else:
            logger.info("GraphDB initialized with JSON fallback mode")

    def close(self) -> None:
        if self.driver:
            self.driver.close()

    def upsert_entity(self, entity: dict[str, Any], story_id: str) -> dict[str, Any]:
        name = str(entity.get("word") or entity.get("Entity") or entity.get("name") or "").strip()
        label = str(entity.get("entity") or entity.get("Label") or "UNKNOWN").strip()
        score_raw = entity.get("score", entity.get("Score", 0.0))
        try:
            score = float(score_raw)
        except (TypeError, ValueError):
            score = 0.0

        if not name:
            return {
                "entity": name,
                "label": label,
                "story_id": story_id,
                "status": "skipped",
                "reason": "empty_entity_name",
            }

        if not story_id or not story_id.strip():
            return {
                "entity": name,
                "label": label,
                "story_id": story_id,
                "status": "skipped",
                "reason": "empty_story_id",
            }

        if self.driver is None:
            return {
                "entity": name,
                "label": label,
                "story_id": story_id,
                "status": "failed",
                "reason": "neo4j_unavailable",
            }

        query = (
            "MERGE (e:Entity {name: $name}) "
            "ON CREATE SET e.entity_type = $label, e.created_at = datetime() "
            "ON MATCH SET e.updated_at = datetime(), "
            "e.entity_type = CASE "
            "WHEN e.entity_type IS NULL OR e.entity_type = '' THEN $label "
            "ELSE e.entity_type END "
            "MERGE (s:Story {story_id: $story_id}) "
            "ON CREATE SET s.created_at = datetime() "
            "ON MATCH SET s.updated_at = datetime() "
            "MERGE (e)-[r:MENTIONED_IN]->(s) "
            "SET r.score = $score, r.updated_at = datetime() "
            "RETURN e.name AS entity, e.entity_type AS label, s.story_id AS story_id"
        )
        params = {
            "name": name,
            "label": label or "UNKNOWN",
            "story_id": story_id.strip(),
            "score": score,
        }
        logger.info("Cypher execute: %s | params=%s", query, params)

        try:
            with self.driver.session() as session:
                result = session.run(query, **params)
                row = result.single()
                data = row.data() if row else {"entity": name, "label": label, "story_id": story_id.strip()}
                data["status"] = "updated"
                return data
        except Exception as exc:
            logger.exception("upsert_entity failed for entity=%s story_id=%s", name, story_id)
            return {
                "entity": name,
                "label": label,
                "story_id": story_id.strip(),
                "status": "failed",
                "reason": str(exc),
            }

    def get_related_entities(self, entity: str, limit: int = 10) -> list[dict[str, str]]:
        if not entity.strip():
            return []

        if self.driver is not None:
            return self._query_neo4j(entity=entity.strip(), limit=limit)
        return self._query_json(entity=entity.strip(), limit=limit)

    def _query_neo4j(self, entity: str, limit: int) -> list[dict[str, str]]:
        query = (
            "MATCH (n {name: $entity})-[r]-(m) "
            "RETURN m.name AS name, type(r) AS relation "
            "LIMIT $limit"
        )
        try:
            with self.driver.session() as session:
                result = session.run(query, entity=entity, limit=limit)
                rows = []
                for row in result:
                    rows.append(
                        {
                            "name": str(row.get("name", "")),
                            "relation": str(row.get("relation", "RELATED_TO")),
                        }
                    )
                return rows
        except Exception as exc:
            raise GraphDBError(f"Neo4j query failed: {exc}") from exc

    def _query_json(self, entity: str, limit: int) -> list[dict[str, str]]:
        if not self.json_graph_path or not self.json_graph_path.exists():
            return []

        try:
            if self._json_cache is None:
                with self.json_graph_path.open("r", encoding="utf-8") as fp:
                    self._json_cache = json.load(fp)

            graph = self._json_cache
            if not isinstance(graph, dict):
                return []

            entity_map = graph.get("entities", graph)
            values = entity_map.get(entity, []) if isinstance(entity_map, dict) else []
            if not isinstance(values, list):
                return []

            cleaned: list[dict[str, str]] = []
            for item in values[:limit]:
                if isinstance(item, dict):
                    cleaned.append(
                        {
                            "name": str(item.get("name", "")),
                            "relation": str(item.get("relation", "RELATED_TO")),
                        }
                    )
                else:
                    cleaned.append({"name": str(item), "relation": "RELATED_TO"})
            return cleaned
        except Exception as exc:
            raise GraphDBError(f"JSON graph lookup failed: {exc}") from exc