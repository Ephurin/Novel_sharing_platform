import json
import psycopg
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

v = json.loads(open('C:/tmp/p1-ax-acceptance-out/private-stack.json', encoding='utf-8').read())['values']
pg = f"postgresql://{v['POSTGRES_USER']}:{v['POSTGRES_PASSWORD']}@127.0.0.1:{v['WAVE1D_PG_PORT']}/{v['POSTGRES_DB']}"
print(f"Connecting to database: {v['POSTGRES_DB']}")

with psycopg.connect(pg) as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT version_num FROM alembic_version")
        print("alembic_version:", cur.fetchall())
        cur.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema='narrative' AND table_name='entities'
            ORDER BY ordinal_position
        """)
        print("narrative.entities columns:")
        for col, dt in cur.fetchall():
            print(f"  - {col}: {dt}")
            
        cur.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema='narrative' AND table_name='entity_profile_audits'
            ORDER BY ordinal_position
        """)
        print("narrative.entity_profile_audits columns:")
        for col, dt in cur.fetchall():
            print(f"  - {col}: {dt}")

        print("\n--- Current Narrative Records ---")
        cur.execute("SELECT column_name FROM information_schema.columns WHERE table_schema='narrative' AND table_name='bootstrap_jobs'")
        print("bootstrap_jobs cols:", [c[0] for c in cur.fetchall()])
        cur.execute("SELECT * FROM narrative.bootstrap_jobs")
        print("bootstrap_jobs rows:", cur.fetchall())
        cur.execute("SELECT id, novel_id, status, brain_version FROM narrative.story_brains")
        print("story_brains:", cur.fetchall())
        cur.execute("SELECT column_name FROM information_schema.columns WHERE table_schema='narrative' AND table_name='proposals'")
        print("proposals cols:", [c[0] for c in cur.fetchall()])
        cur.execute("SELECT * FROM narrative.proposals")
        print("proposals rows:", cur.fetchall())
        cur.execute("SELECT column_name FROM information_schema.columns WHERE table_schema='narrative' AND table_name='entity_candidate_audits'")
        print("candidate_audits cols:", [c[0] for c in cur.fetchall()])
        cur.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema='narrative' AND table_name='writing_generations'
            ORDER BY ordinal_position
        """)
        print("writing_generations cols:", [c[0] for c in cur.fetchall()])
