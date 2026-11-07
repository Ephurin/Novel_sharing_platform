"""Full CI fixture schema/data readback; never connects to a shared database."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from pathlib import Path

import psycopg
from psycopg import sql



# PG16 deparses an array-level varchar->text cast differently after pg_dump's
# DDL is parsed on restore. These casts are equivalent because each source
# element is explicitly varchar; never normalize arbitrary casts or row data.
_VARCHAR = r"'(?:[^']|'')*'::character varying"
_ARRAY_TEXT_CAST = re.compile(r"\(ARRAY\[(" + _VARCHAR + r"(?:, " + _VARCHAR + r")*)\]\)::text\[\]")


def comparable(data: dict) -> dict:
    result = json.loads(json.dumps(data))
    for table in result["tables"].values():
        for kind in ("constraints", "indexes"):
            for member in table[kind]:
                member[1] = _ARRAY_TEXT_CAST.sub(
                    lambda match: "ARRAY[" + ", ".join(
                        f"({value})::text" for value in re.findall(_VARCHAR, match[1])
                    ) + "]", member[1],
                )
    return result


def verify_readback(data: dict, expected: dict, *, require_raw: bool = False) -> None:
    assert comparable(data) == comparable(expected), "rollback schema/data parity mismatch"
    if require_raw:
        assert data == expected, "raw source schema/data changed during restore rehearsal"


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
    parser.add_argument("--require-raw-equality", action="store_true")
    args = parser.parse_args()
    if args.require_raw_equality and (not args.expected or args.database_env != "SOURCE_DATABASE_URL"):
        parser.error("raw equality requires the source database and --expected")
    database, data = readback(os.environ[args.database_env])
    canonical = json.dumps(comparable(data), sort_keys=True, separators=(",", ":"))
    data = json.loads(json.dumps(data))  # Preserve raw definitions in the artifact.
    digest = hashlib.sha256(canonical.encode()).hexdigest()
    args.output.write_text(json.dumps(data, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    if args.expected:
        expected = json.loads(args.expected.read_text(encoding="utf-8"))
        verify_readback(data, expected, require_raw=args.require_raw_equality)
    print(json.dumps(dict(database=database, sha256=digest, tables=len(data["tables"]),
        rows={key:len(value["rows"]) for key,value in data["tables"].items()},
        raw_sha256=hashlib.sha256(json.dumps(data, sort_keys=True, separators=(",", ":")).encode()).hexdigest(),
        schema_normalization="explicit varchar array to text element casts only",
        raw_comparison="PASS" if args.require_raw_equality else "NOT_REQUESTED",
        pgvector_distance=data["vector_distance"], comparison="PASS" if args.expected else "CAPTURED"), sort_keys=True))


if __name__ == "__main__":
    main()
