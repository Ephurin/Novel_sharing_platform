"""Full CI fixture schema/data readback; never connects to a shared database."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path

import psycopg
from psycopg import sql


def readback(url: str) -> tuple[str, dict]:
    with psycopg.connect(url.replace("postgresql+psycopg://", "postgresql://")) as conn:
        with conn.transaction():
            conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
            database = conn.execute("SELECT current_database()").fetchone()[0]
            if database not in {"p8_rehearsal", "p8_restore_verify"}:
                raise ValueError("Readback requires the disposable rollback-rehearsal databases")
            vector_distance = conn.execute("SELECT '[1,2,3]'::vector(3) <-> '[1,2,3]'::vector(3)").fetchone()[0]
            assert vector_distance == 0, "pgvector distance probe failed"
            names = conn.execute("SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN ('public','narrative') ORDER BY 1,2").fetchall()
            tables = {}
            for schema, table in names:
                columns = conn.execute("""
                    SELECT a.attname, format_type(a.atttypid,a.atttypmod), a.attnotnull,
                           pg_get_expr(d.adbin,d.adrelid), a.attidentity, a.attgenerated
                    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
                    JOIN pg_namespace n ON n.oid=c.relnamespace
                    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
                    WHERE n.nspname=%s AND c.relname=%s AND a.attnum>0 AND NOT a.attisdropped
                    ORDER BY a.attnum
                """, (schema, table)).fetchall()
                constraints = conn.execute("""
                    SELECT con.conname, pg_get_constraintdef(con.oid)
                    FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
                    JOIN pg_namespace n ON n.oid=c.relnamespace
                    WHERE n.nspname=%s AND c.relname=%s ORDER BY con.conname
                """, (schema, table)).fetchall()
                indexes = conn.execute("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname=%s AND tablename=%s ORDER BY indexname", (schema, table)).fetchall()
                rows = conn.execute(sql.SQL("SELECT to_jsonb(t) FROM {}.{} t ORDER BY to_jsonb(t)::text").format(sql.Identifier(schema), sql.Identifier(table))).fetchall()
                tables[f"{schema}.{table}"] = dict(columns=columns, constraints=constraints,
                    indexes=indexes, rows=[row[0] for row in rows])
            assert "public.alembic_version" in tables and "narrative.story_brains" in tables
            return database, {"tables": tables, "vector_distance": vector_distance}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-env", required=True, choices=["SOURCE_DATABASE_URL", "RESTORE_DATABASE_URL"])
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--expected", type=Path)
    args = parser.parse_args()
    database, data = readback(os.environ[args.database_env])
    canonical = json.dumps(data, sort_keys=True, separators=(",", ":"))
    data = json.loads(canonical)  # Compare JSON arrays, not driver tuples, after reload.
    digest = hashlib.sha256(canonical.encode()).hexdigest()
    args.output.write_text(json.dumps(data, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    if args.expected:
        assert data == json.loads(args.expected.read_text(encoding="utf-8")), "rollback schema/data parity mismatch"
    print(json.dumps(dict(database=database, sha256=digest, tables=len(data["tables"]),
        rows={key:len(value["rows"]) for key,value in data["tables"].items()},
        pgvector_distance=data["vector_distance"], comparison="PASS" if args.expected else "CAPTURED"), sort_keys=True))


if __name__ == "__main__":
    main()
