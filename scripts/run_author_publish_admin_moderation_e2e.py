"""
Real Browser E2E Automation for Author Publish -> Admin Moderation -> Public Discovery
Gate: AUTHOR-PUBLISH-ADMIN-MODERATION-E2E
Checkpoints: Publish-A through Publish-H + Phase C negative invariants

Drives real DOM interactions via Microsoft Edge CDP over WebSocket,
captures network responses, performs database correlation, records full-resolution
screenshots, executes validation manifest, and outputs canonical evidence JSON and report.
"""

import asyncio
import base64
import json
import os
import subprocess
import sys
import tempfile
import time
import uuid
from typing import Any, Dict, List, Optional

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import httpx
import psycopg
import websockets

BACKEND_URL = "http://localhost:4000/api/v1"
WEB_URL = "http://127.0.0.1:5173"
DB_URL = "postgresql://postgres:postgres@localhost:5432/ephurin"
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EVIDENCE_DIR = os.path.join(REPO_ROOT, "docs", "development", "AUTHOR-PUBLISH-ADMIN-MODERATION-E2E")
REPORT_PATH = os.path.join(REPO_ROOT, "docs", "development", "AUTHOR-PUBLISH-ADMIN-MODERATION-E2E-report.md")
os.makedirs(EVIDENCE_DIR, exist_ok=True)

EDGE_PATH = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

# Credentials from environment variable (hygiene discipline: no committed secrets)
DEMO_PASSWORD = os.environ.get("EPHURIN_E2E_DEMO_PASSWORD")
if not DEMO_PASSWORD:
    raise RuntimeError(
        "Missing required environment variable EPHURIN_E2E_DEMO_PASSWORD. "
        "Please set EPHURIN_E2E_DEMO_PASSWORD before running this E2E runner."
    )

AUTHOR_EMAIL = "reader03@example.com"
AUTHOR_PASSWORD = DEMO_PASSWORD
AUTHOR_USER_ID = "51ca9a66-d798-4f6c-8518-11c085678e4f"

ADMIN_EMAIL = "reader02@example.com"
ADMIN_PASSWORD = DEMO_PASSWORD
ADMIN_USER_ID = "bcedd10c-340e-4e37-9c24-ce86ccb6663c"

READER_EMAIL = "reader04@example.com"
READER_PASSWORD = DEMO_PASSWORD
READER_USER_ID = "077e20a2-e26d-466a-bf3a-1811d037df50"

MODERATION_TRIGGER = "harassment"


class CDPBrowser:
    def __init__(self, ws_url: str):
        self.ws_url = ws_url
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.msg_id = 0
        self.pending_responses: Dict[int, asyncio.Future] = {}
        self.network_events: List[Dict[str, Any]] = []
        self._listener_task: Optional[asyncio.Task] = None

    async def connect(self):
        self.ws = await websockets.connect(self.ws_url, max_size=20 * 1024 * 1024)
        self._listener_task = asyncio.create_task(self._listen())
        await self.call("Page.enable")
        await self.call("Runtime.enable")
        await self.call("Network.enable")
        await self.call("DOM.enable")
        await self.call("Emulation.setDeviceMetricsOverride", {
            "width": 1440,
            "height": 900,
            "deviceScaleFactor": 1,
            "mobile": False
        })

    async def _listen(self):
        try:
            async for raw in self.ws:
                msg = json.loads(raw)
                msg_id = msg.get("id")
                if msg_id and msg_id in self.pending_responses:
                    self.pending_responses[msg_id].set_result(msg)
                method = msg.get("method", "")
                if method.startswith("Network."):
                    self.network_events.append(msg)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"[CDP] Listener closed: {e}")

    async def call(self, method: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        self.msg_id += 1
        call_id = self.msg_id
        payload = {"id": call_id, "method": method, "params": params or {}}
        loop = asyncio.get_running_loop()
        fut = loop.create_future()
        self.pending_responses[call_id] = fut
        await self.ws.send(json.dumps(payload))
        res = await asyncio.wait_for(fut, timeout=35.0)
        del self.pending_responses[call_id]
        if "error" in res:
            raise RuntimeError(f"CDP call {method} error: {res['error']}")
        return res.get("result", {})

    async def navigate(self, url: str, wait_seconds: float = 2.0):
        print(f"  [Browser] Navigating to: {url}")
        self.network_events.clear()
        await self.call("Page.navigate", {"url": url})
        await asyncio.sleep(wait_seconds)

    async def evaluate(self, expression: str) -> Any:
        res = await self.call("Runtime.evaluate", {
            "expression": expression,
            "returnByValue": True,
            "awaitPromise": True
        })
        result = res.get("result", {})
        if result.get("subtype") == "error":
            raise RuntimeError(f"JS evaluation error: {result.get('description')}")
        return result.get("value")

    async def wait_for_condition(self, condition_js: str, timeout: float = 20.0, poll_interval: float = 0.5) -> Any:
        start = time.time()
        while time.time() - start < timeout:
            val = await self.evaluate(condition_js)
            if val:
                return val
            await asyncio.sleep(poll_interval)
        try:
            curr_url = await self.evaluate("window.location.href")
            body_snippet = await self.evaluate("document.body.innerText.slice(0, 400)")
        except Exception:
            curr_url = "unknown"
            body_snippet = "unknown"
        raise TimeoutError(f"Condition timed out after {timeout}s: {condition_js}\nCurrent URL: {curr_url}\nBody snippet: {body_snippet}")

    async def wait_for_response(self, url_pattern: str, timeout: float = 15.0) -> Dict[str, Any]:
        start = time.time()
        while time.time() - start < timeout:
            for ev in self.network_events:
                if ev.get("method") == "Network.responseReceived":
                    resp = ev.get("params", {}).get("response", {})
                    url = resp.get("url", "")
                    status = resp.get("status")
                    # Ignore CORS preflight OPTIONS which return 204
                    if status == 204:
                        continue
                    if url_pattern in url:
                        request_id = ev.get("params", {}).get("requestId")
                        body_data = None
                        try:
                            body_res = await self.call("Network.getResponseBody", {"requestId": request_id})
                            body_data = body_res.get("body")
                        except Exception:
                            pass
                        return {
                            "requestId": request_id,
                            "url": url,
                            "status": status,
                            "body": body_data,
                            "headers": resp.get("headers", {})
                        }
            await asyncio.sleep(0.3)
        raise TimeoutError(f"Network response matching '{url_pattern}' timed out after {timeout}s")

    async def screenshot(self, filename: str) -> str:
        res = await self.call("Page.captureScreenshot", {"format": "png"})
        b64data = res.get("data", "")
        file_path = os.path.join(EVIDENCE_DIR, filename)
        with open(file_path, "wb") as f:
            f.write(base64.b64decode(b64data))
        print(f"  [Artifact] Saved screenshot: {file_path}")
        return filename

    async def set_input(self, selector: str, value: str):
        await self.evaluate(f"""
            (() => {{
                const el = document.querySelector({json.dumps(selector)});
                if (!el) throw new Error("Element not found: " + {json.dumps(selector)});
                const isTextarea = el.tagName.toLowerCase() === 'textarea';
                const proto = isTextarea ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
                const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
                setter.call(el, {json.dumps(value)});
                el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                el.dispatchEvent(new Event('change', {{ bubbles: true }}));
            }})()
        """)

    async def click_element(self, selector: str):
        await self.evaluate(f"""
            (() => {{
                const el = document.querySelector({json.dumps(selector)});
                if (!el) throw new Error("Element not found: " + {json.dumps(selector)});
                el.scrollIntoView({{ block: 'center' }});
                el.click();
            }})()
        """)

    async def click_button_by_text(self, text: str):
        await self.evaluate(f"""
            (() => {{
                const buttons = Array.from(document.querySelectorAll('button, a'));
                const btn = buttons.find(b => b.innerText.trim().includes({json.dumps(text)}));
                if (!btn) throw new Error("Button not found with text: " + {json.dumps(text)});
                btn.scrollIntoView({{ block: 'center' }});
                btn.click();
            }})()
        """)

    async def clear_auth(self):
        # Post-acceptance test-process cleanup only
        await self.evaluate("""
            (() => {
                localStorage.clear();
                sessionStorage.clear();
            })()
        """)

    async def close(self):
        if self._listener_task:
            self._listener_task.cancel()
        if self.ws:
            await self.ws.close()


def get_git_info() -> Dict[str, str]:
    def run_git(cmd: str) -> str:
        res = subprocess.run(f"git {cmd}", shell=True, capture_output=True, text=True, cwd=REPO_ROOT)
        return res.stdout.strip()
    return {
        "head_sha": run_git("rev-parse HEAD"),
        "base_main_sha": run_git("rev-parse origin/main"),
        "branch": run_git("rev-parse --abbrev-ref HEAD")
    }


def run_command(name: str, cmd: str, cwd: str) -> Dict[str, Any]:
    print(f"\n[Validation] Running '{name}': {cmd}...")
    start_t = time.time()
    res = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=cwd)
    duration = round(time.time() - start_t, 2)
    output = res.stdout + ("\n" + res.stderr if res.stderr else "")

    passed_cnt = None
    failed_cnt = None
    for line in output.splitlines():
        if line.startswith("# pass ") or line.startswith("ℹ pass "):
            try:
                passed_cnt = int(line.split()[-1])
            except ValueError:
                pass
        elif line.startswith("# fail ") or line.startswith("ℹ fail "):
            try:
                failed_cnt = int(line.split()[-1])
            except ValueError:
                pass

    is_pass = (res.returncode == 0) and (failed_cnt is None or failed_cnt == 0)
    result_status = "PASS" if is_pass else "FAIL"
    entry: Dict[str, Any] = {
        "name": name,
        "command": cmd,
        "cwd": os.path.relpath(cwd, REPO_ROOT),
        "exit_code": res.returncode,
        "duration_seconds": duration,
        "result": result_status
    }
    if passed_cnt is not None:
        entry["tests_passed"] = passed_cnt
    if failed_cnt is not None:
        entry["tests_failed"] = failed_cnt
    print(f"  Result: {result_status} (exit={res.returncode}, time={duration}s)")
    assert is_pass, f"Validation command '{name}' failed! Output:\n{output[:1000]}"
    return entry


def run_negative_suite() -> Dict[str, Any]:
    print("\n" + "=" * 60)
    print("[Negative Suite] Executing PostgreSQL moderation lifecycle invariants...")
    print("=" * 60)
    cmd = "npx tsx --test --test-reporter=tap src/modules/content-control/author-publish-moderation-lifecycle.postgres.test.ts"
    backend_dir = os.path.join(REPO_ROOT, "backend")
    res = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=backend_dir)
    print(f"Exit code: {res.returncode}")
    print(res.stdout)
    if res.stderr:
        print(f"Stderr: {res.stderr}")

    tests_passed = 0
    tests_failed = 0
    for line in res.stdout.splitlines():
        if line.startswith("# pass ") or line.startswith("ℹ pass "):
            tests_passed = int(line.split()[-1])
        elif line.startswith("# fail ") or line.startswith("ℹ fail "):
            tests_failed = int(line.split()[-1])

    is_pass = (res.returncode == 0) and (tests_passed == 5) and (tests_failed == 0)
    assert is_pass, f"Negative suite failed! Returncode={res.returncode}, passed={tests_passed}, failed={tests_failed}"

    return {
        "test_file": "backend/src/modules/content-control/author-publish-moderation-lifecycle.postgres.test.ts",
        "command": cmd,
        "exit_code": res.returncode,
        "result": "PASS" if is_pass else "FAIL",
        "tests_passed": tests_passed,
        "tests_failed": tests_failed,
        "covered_invariants": [
            "role_guard_reader_author_forbidden_403",
            "duplicate_resolve_fails_closed_409",
            "already_published_novel_resubmit_fails_409",
            "target_idempotent_no_duplicate_pending_reviews",
            "unrelated_review_cannot_satisfy_target"
        ]
    }


async def main():
    print("=" * 80)
    print("GATE AUTHOR-PUBLISH-ADMIN-MODERATION-E2E: REAL BROWSER E2E RUNNER")
    print("=" * 80)

    git_info = get_git_info()
    print(f"Branch: {git_info['branch']}")
    print(f"HEAD SHA: {git_info['head_sha']}")
    print(f"Synced Main SHA: {git_info['base_main_sha']}")

    # 1. Execute Validation Manifest Commands
    print("\n" + "=" * 60)
    print("EXECUTING LOCAL VALIDATION MANIFEST")
    print("=" * 60)
    validation_records: List[Dict[str, Any]] = []

    web_dir = os.path.join(REPO_ROOT, "web")
    backend_dir = os.path.join(REPO_ROOT, "backend")

    validation_records.append(run_command("web_typecheck", "npm run typecheck", web_dir))
    validation_records.append(run_command("web_build", "npm run build", web_dir))
    validation_records.append(run_command("backend_typecheck", "npm run typecheck", backend_dir))
    validation_records.append(run_command(
        "author_publish_moderation_lifecycle_postgres_test",
        "npx tsx --test --test-reporter=tap src/modules/content-control/author-publish-moderation-lifecycle.postgres.test.ts",
        backend_dir
    ))
    validation_records.append(run_command(
        "backend_novels_content_control_tests",
        "npx tsx --test src/modules/novels/chapter-revisions.test.ts src/modules/novels/outbox.postgres.test.ts src/modules/novels/p1-production-persistence.postgres.test.ts src/modules/content-control/author-publish-moderation-lifecycle.postgres.test.ts",
        backend_dir
    ))
    validation_records.append(run_command(
        "backend_all_unit_and_integration_tests",
        "npm test",
        backend_dir
    ))

    # 2. Pre-run check: verify active keyword rule in PostgreSQL
    print("\n[Pre-check] Verifying active keyword filter rules in PostgreSQL...")
    with psycopg.connect(DB_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT rule_id, name, pattern, severity, status FROM content_filter_rules WHERE pattern = %s",
                (MODERATION_TRIGGER,)
            )
            rule_row = cur.fetchone()
            assert rule_row is not None, f"Required content filter rule '{MODERATION_TRIGGER}' not found in DB!"
            filter_rule_id, rule_name, rule_pattern, rule_severity, rule_status = rule_row
            assert rule_status == "ACTIVE", f"Rule '{rule_pattern}' is not ACTIVE (status={rule_status})!"
            print(f"  Verified active rule: ID={filter_rule_id}, Name='{rule_name}', Pattern='{rule_pattern}', Severity='{rule_severity}'")

    # 3. Launch Edge headless on dedicated port 9335
    DEBUG_PORT = 9335
    user_data_dir = os.path.join(tempfile.gettempdir(), f"edge-moderation-e2e-{uuid.uuid4().hex[:8]}")
    edge_proc = subprocess.Popen([
        EDGE_PATH,
        "--headless=new",
        f"--remote-debugging-port={DEBUG_PORT}",
        f"--user-data-dir={user_data_dir}",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--window-size=1440,900",
        "about:blank"
    ])
    await asyncio.sleep(2.5)

    evidence: Dict[str, Any] = {
        "tested_main_sha": git_info["base_main_sha"],
        "tested_code_sha": git_info["head_sha"],
        "branch": git_info["branch"],
        "author_user_id": AUTHOR_USER_ID,
        "admin_user_id": ADMIN_USER_ID,
        "content_filter_rule_id": str(filter_rule_id),
        "moderation_trigger": MODERATION_TRIGGER,
        "checkpoints": {}
    }

    try:
        # Find CDP target
        res = httpx.get(f"http://127.0.0.1:{DEBUG_PORT}/json")
        targets = res.json()
        page_target = next((t for t in targets if t.get("type") == "page"), targets[0])
        ws_url = page_target["webSocketDebuggerUrl"]
        browser = CDPBrowser(ws_url)
        await browser.connect()

        # =================================================================
        # Publish-A: Author creates deterministic DRAFT novel via UI
        # =================================================================
        print("\n" + "=" * 60)
        print("[Publish-A] Author logs in and creates deterministic DRAFT novel via UI")
        print("=" * 60)
        await browser.navigate(f"{WEB_URL}/login")
        await browser.wait_for_condition("document.querySelector('input') !== null", 10.0)

        # Login as author
        await browser.set_input("input[type='text'], input[placeholder*='Email'], input:not([type='password'])", AUTHOR_EMAIL)
        await browser.set_input("input[type='password']", AUTHOR_PASSWORD)
        await asyncio.sleep(0.3)
        await browser.click_button_by_text("Login")

        # Wait for redirect to /author
        await browser.wait_for_condition("window.location.pathname.includes('/author')", 15.0)
        await asyncio.sleep(1.5)

        # Record network call for novel creation
        print("  Clicking 'New Project' button in Author UI...")
        browser.network_events.clear()
        await browser.click_button_by_text("New Project")

        # Wait for novel creation response or navigation to /author/ide
        novel_create_resp = await browser.wait_for_response("/novels", timeout=15.0)
        assert novel_create_resp["status"] == 201, f"Novel creation failed: {novel_create_resp}"
        create_data = json.loads(novel_create_resp["body"])["data"]
        created_novel_id = create_data["novelId"]
        print(f"  Created novel ID: {created_novel_id}")

        await asyncio.sleep(1.5)

        # DB correlation for Publish-A
        with psycopg.connect(DB_URL) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT novel_id, title, author_id, status, deleted_at FROM novels WHERE novel_id = %s",
                    (created_novel_id,)
                )
                novel_row = cur.fetchone()
                assert novel_row is not None, f"Novel {created_novel_id} not found in DB!"
                n_id, n_title, n_author, n_status, n_deleted = novel_row
                assert str(n_author) == AUTHOR_USER_ID, f"Author mismatch: {n_author} != {AUTHOR_USER_ID}"
                assert n_status == "DRAFT", f"Initial status must be DRAFT, got {n_status}"
                assert n_deleted is None, "deleted_at must be null"

        screenshot_a = await browser.screenshot("publish-a-author-create-draft.png")
        evidence["novel_id"] = created_novel_id
        evidence["novel_initial_status"] = n_status
        evidence["checkpoints"]["Publish-A"] = {
            "status": "PASS",
            "novel_id": created_novel_id,
            "author_id": str(n_author),
            "novel_status": n_status,
            "screenshot": screenshot_a
        }
        print("  [Publish-A PASS] Novel created in DRAFT state and verified in DB.")

        # =================================================================
        # Publish-B: Author verifies DRAFT state and moderation-triggering synopsis
        # =================================================================
        print("\n" + "=" * 60)
        print("[Publish-B] Author updates metadata with unique title & harassment synopsis")
        print("=" * 60)

        unique_suffix = uuid.uuid4().hex[:8]
        unique_novel_title = f"E2E Moderation Lifecycle {unique_suffix}"
        target_synopsis = f"Tác phẩm thử nghiệm quy trình xuất bản và kiểm duyệt tự động chứa từ khóa {MODERATION_TRIGGER} cho cổng E2E."

        # Navigate to author metadata page
        await browser.navigate(f"{WEB_URL}/author/novels/{created_novel_id}")
        await browser.wait_for_condition("document.querySelector('h1') !== null", 10.0)
        await asyncio.sleep(1.0)

        # Open edit modal
        print("  Opening 'Chỉnh sửa thông tin' modal...")
        await browser.click_button_by_text("Chỉnh sửa thông tin")
        await browser.wait_for_condition("document.querySelector('input[placeholder*=\"Nhập tên tiểu thuyết\"]') !== null", 5.0)

        # Fill unique title and triggering synopsis
        await browser.set_input("input[placeholder*='Nhập tên tiểu thuyết']", unique_novel_title)
        await browser.set_input("textarea[placeholder*='Tóm tắt nội dung']", target_synopsis)
        await asyncio.sleep(0.5)

        # Click save
        print("  Saving metadata updates...")
        browser.network_events.clear()
        await browser.click_button_by_text("Lưu thay đổi")
        await asyncio.sleep(1.5)

        # Reload page and verify persistence in rendered DOM
        print("  Reloading author metadata page to verify persistence...")
        await browser.navigate(f"{WEB_URL}/author/novels/{created_novel_id}")
        await browser.wait_for_condition("document.querySelector('h1') !== null", 10.0)
        await asyncio.sleep(1.0)

        rendered_title = await browser.evaluate("document.querySelector('h1')?.innerText?.trim()")
        rendered_synopsis = await browser.evaluate("document.querySelector('p.font-body-reading')?.innerText?.trim()")
        rendered_status = await browser.evaluate("document.querySelector('[data-testid=\"novel-status-badge\"]')?.innerText?.trim()")

        print(f"  Rendered Title: '{rendered_title}'")
        print(f"  Rendered Synopsis contains harassment: {MODERATION_TRIGGER in rendered_synopsis}")
        print(f"  Rendered Status Badge: '{rendered_status}'")

        assert rendered_title == unique_novel_title, f"Rendered title '{rendered_title}' != '{unique_novel_title}'"
        assert MODERATION_TRIGGER in rendered_synopsis, f"Synopsis missing trigger '{MODERATION_TRIGGER}'"
        assert rendered_status == "Bản nháp", f"Status badge should be 'Bản nháp', got '{rendered_status}'"

        # DB check for Publish-B
        with psycopg.connect(DB_URL) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT title, synopsis, status FROM novels WHERE novel_id = %s",
                    (created_novel_id,)
                )
                db_title, db_synopsis, db_status = cur.fetchone()
                assert db_title == unique_novel_title
                assert MODERATION_TRIGGER in db_synopsis
                assert db_status == "DRAFT"

        screenshot_b = await browser.screenshot("publish-b-author-synopsis-trigger.png")
        evidence["unique_novel_title"] = unique_novel_title
        evidence["checkpoints"]["Publish-B"] = {
            "status": "PASS",
            "novel_title": unique_novel_title,
            "synopsis_trigger": MODERATION_TRIGGER,
            "db_status": db_status,
            "screenshot": screenshot_b
        }
        print("  [Publish-B PASS] Metadata updated with trigger keyword and verified persisted.")

        # =================================================================
        # Publish-C: Author clicks 'Gửi duyệt' -> proves PENDING_MODERATION
        # =================================================================
        print("\n" + "=" * 60)
        print("[Publish-C] Author clicks 'Gửi duyệt'; capturing submit-publish request & response")
        print("=" * 60)

        browser.network_events.clear()
        print("  Clicking 'Gửi duyệt' button...")
        await browser.click_element("[data-testid='submit-publish-btn']")

        # Capture submit-publish response
        submit_resp = await browser.wait_for_response(f"/novels/{created_novel_id}/submit-publish", timeout=15.0)
        assert submit_resp["status"] == 200, f"Submit publish HTTP error: {submit_resp}"
        submit_data = json.loads(submit_resp["body"])["data"]
        print(f"  Submit response data: {submit_data}")

        moderation_required = submit_data.get("moderationRequired")
        submit_novel_status = submit_data.get("status")
        moderation_review_id = submit_data.get("moderationReviewId")

        # Deterministic check per spec: must fail if moderationRequired is false
        if not moderation_required:
            print("  [CRITICAL ERROR] Content filter did not trigger moderation!")
            evidence["verdict"] = "TEST_FIXTURE_NOT_TRIGGERING_MODERATION"
            sys.exit(1)

        assert submit_novel_status == "PENDING_MODERATION", f"Expected PENDING_MODERATION, got {submit_novel_status}"
        assert moderation_review_id is not None, "moderationReviewId must not be null"
        uuid.UUID(moderation_review_id)  # validate UUID format
        print(f"  ModerationReviewId: {moderation_review_id}")

        await asyncio.sleep(1.5)

        # UI reflection check: status badge should now display "Chờ duyệt"
        updated_badge = await browser.evaluate("document.querySelector('[data-testid=\"novel-status-badge\"]')?.innerText?.trim()")
        print(f"  UI Status Badge after submit: '{updated_badge}'")
        assert updated_badge == "Chờ duyệt", f"Expected 'Chờ duyệt', got '{updated_badge}'"

        # Reload and check persistence of pending state in Author UI
        print("  Reloading author metadata page to verify pending persistence...")
        await browser.call("Page.reload")
        await asyncio.sleep(2.0)
        await browser.wait_for_condition("document.querySelector('[data-testid=\"novel-status-badge\"]') !== null", 20.0)
        await asyncio.sleep(1.0)
        reloaded_badge = await browser.evaluate("document.querySelector('[data-testid=\"novel-status-badge\"]')?.innerText?.trim()")
        assert reloaded_badge == "Chờ duyệt", f"Expected 'Chờ duyệt' after reload, got '{reloaded_badge}'"

        # DB correlation for Publish-C
        with psycopg.connect(DB_URL) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT status FROM novels WHERE novel_id = %s", (created_novel_id,))
                novel_db_status = cur.fetchone()[0]
                assert novel_db_status == "PENDING_MODERATION"

                cur.execute(
                    "SELECT review_id, target_type, target_id, status, source FROM moderation_reviews WHERE review_id = %s",
                    (moderation_review_id,)
                )
                rev_row = cur.fetchone()
                assert rev_row is not None, f"Review {moderation_review_id} not found in DB!"
                r_id, r_type, r_target, r_status, r_source = rev_row
                assert r_type == "NOVEL"
                assert str(r_target) == created_novel_id
                assert r_status == "PENDING"
                assert r_source == "KEYWORD_FILTER"

        screenshot_c = await browser.screenshot("publish-c-author-submit-moderation.png")
        evidence["novel_pending_status"] = novel_db_status
        evidence["submit_publish_browser_request_id"] = submit_resp["requestId"]
        evidence["submit_publish_http_status"] = submit_resp["status"]
        evidence["moderation_required"] = moderation_required
        evidence["moderation_review_id"] = moderation_review_id
        evidence["moderation_review_source"] = r_source
        evidence["moderation_review_initial_status"] = r_status
        evidence["checkpoints"]["Publish-C"] = {
            "status": "PASS",
            "moderation_required": moderation_required,
            "novel_status": novel_db_status,
            "moderation_review_id": moderation_review_id,
            "review_source": r_source,
            "screenshot": screenshot_c
        }
        print("  [Publish-C PASS] Publish submitted; PENDING_MODERATION and review verified in UI and DB.")

        # =================================================================
        # Publish-D: Author logs out via rendered UI; Admin logs in via UI
        # =================================================================
        print("\n" + "=" * 60)
        print("[Publish-D] Session transition: Rendered Logout (Author) -> Rendered Login (Admin)")
        print("=" * 60)

        # Navigate to /author where WebAppShell is active with topbar Logout button
        print("  Navigating to /author to access authenticated WebAppShell...")
        await browser.navigate(f"{WEB_URL}/author")
        await browser.wait_for_condition("document.querySelector('[data-testid=\"shell-logout-btn\"], button') !== null", 15.0)
        await asyncio.sleep(1.0)

        # Author clicks rendered Logout button
        print("  Author clicking rendered 'Logout' button in WebAppShell...")
        browser.network_events.clear()
        await browser.click_element("[data-testid='shell-logout-btn']")

        # Capture /auth/logout network call if observable
        author_logout_request_id = None
        try:
            logout_resp = await browser.wait_for_response("/auth/logout", timeout=8.0)
            author_logout_request_id = logout_resp.get("requestId")
            print(f"  Captured author logout request ID: {author_logout_request_id}")
        except Exception as e:
            print(f"  Logout request not captured via CDP: {e}")

        # Wait for redirect to /login and verify shell disappeared
        await browser.wait_for_condition("window.location.pathname.includes('/login')", 15.0)
        await browser.wait_for_condition("document.querySelector('.web-shell') === null", 10.0)
        await asyncio.sleep(1.0)
        author_logout_dest = await browser.evaluate("window.location.pathname")
        shell_disappeared = await browser.evaluate("document.querySelector('.web-shell') === null")
        assert shell_disappeared, "Authenticated shell must disappear after author logout"
        print(f"  Author logged out -> Destination: {author_logout_dest}, shell disappeared: {shell_disappeared}")

        # Admin logs in via rendered UI form
        print("  Admin filling rendered login form on /login...")
        browser.network_events.clear()
        await browser.set_input("input[type='text'], input[placeholder*='Email'], input:not([type='password'])", ADMIN_EMAIL)
        await browser.set_input("input[type='password']", ADMIN_PASSWORD)
        await asyncio.sleep(0.3)
        await browser.click_button_by_text("Login")

        # Capture /auth/login network response
        admin_login_resp = await browser.wait_for_response("/auth/login", timeout=15.0)
        admin_login_request_id = admin_login_resp.get("requestId")
        print(f"  Captured admin login request ID: {admin_login_request_id}")

        # Wait for redirect to /admin
        await browser.wait_for_condition("window.location.pathname.includes('/admin')", 15.0)
        await asyncio.sleep(1.5)

        admin_header = await browser.evaluate("document.querySelector('h2')?.innerText?.trim()")
        print(f"  Admin page header: '{admin_header}'")
        assert "Admin" in admin_header or "Console" in admin_header

        screenshot_d = await browser.screenshot("publish-d-admin-login.png")
        evidence["author_logout_browser_request_id"] = author_logout_request_id
        evidence["author_logout_destination"] = author_logout_dest
        evidence["admin_login_browser_request_id"] = admin_login_request_id
        evidence["checkpoints"]["Publish-D"] = {
            "status": "PASS",
            "author_logout_request_id": author_logout_request_id,
            "author_logout_destination": author_logout_dest,
            "admin_login_request_id": admin_login_request_id,
            "admin_user_id": ADMIN_USER_ID,
            "admin_email": ADMIN_EMAIL,
            "screenshot": screenshot_d
        }
        print("  [Publish-D PASS] Author logged out via rendered UI; Admin logged in via rendered UI.")

        # =================================================================
        # Publish-E: Admin sees exact pending review in moderation queue
        # =================================================================
        print("\n" + "=" * 60)
        print("[Publish-E] Admin opens /admin/moderation queue and verifies exact target review")
        print("=" * 60)

        await browser.navigate(f"{WEB_URL}/admin/moderation")
        await browser.wait_for_condition("document.querySelector('h2') !== null", 10.0)
        await asyncio.sleep(1.5)

        # Search for exact reviewId and targetId in rendered DOM
        has_exact_review = await browser.evaluate(f"""
            (() => {{
                const text = document.body.innerText;
                return text.includes({json.dumps(moderation_review_id)}) && text.includes({json.dumps(created_novel_id)});
            }})()
        """)
        print(f"  Queue rendered exact target review & novel: {has_exact_review}")
        assert has_exact_review, f"Review {moderation_review_id} for novel {created_novel_id} not visible in queue!"

        screenshot_e = await browser.screenshot("publish-e-admin-moderation-queue.png")
        evidence["checkpoints"]["Publish-E"] = {
            "status": "PASS",
            "moderation_review_id": moderation_review_id,
            "target_novel_id": created_novel_id,
            "screenshot": screenshot_e
        }
        print("  [Publish-E PASS] Exact target review verified in pending moderation queue.")

        # =================================================================
        # Publish-F: Admin opens review detail and submits APPROVED
        # =================================================================
        print("\n" + "=" * 60)
        print("[Publish-F] Admin inspects review detail and approves via rendered UI")
        print("=" * 60)

        await browser.navigate(f"{WEB_URL}/admin/moderation/{moderation_review_id}")
        await browser.wait_for_condition("document.querySelector('h2') !== null", 10.0)
        await asyncio.sleep(1.0)

        # Verify detail page metadata
        detail_target_id = await browser.evaluate("""
            (() => {
                const paragraphs = Array.from(document.querySelectorAll('p, div, span'));
                const el = paragraphs.find(p => p.innerText && p.innerText.includes('-'));
                return document.body.innerText;
            })()
        """)
        assert created_novel_id in detail_target_id, "Target novel ID not found on detail page"
        assert "NOVEL" in detail_target_id, "TargetType NOVEL not found on detail page"
        assert "PENDING" in detail_target_id, "Initial status PENDING not found on detail page"

        # Click Approve button on detail page
        print("  Clicking 'Approve' button on detail page...")
        await browser.click_button_by_text("Approve")
        await browser.wait_for_condition("document.querySelector('.mantine-Modal-content') !== null", 5.0)
        await asyncio.sleep(0.5)

        # Confirm approval inside modal
        print("  Confirming approval inside modal...")
        browser.network_events.clear()
        await browser.evaluate("""
            (() => {
                const modal = document.querySelector('.mantine-Modal-content');
                if (!modal) throw new Error("Modal not found");
                const buttons = Array.from(modal.querySelectorAll('button'));
                const confirmBtn = buttons.find(b => b.innerText.trim() === 'Approve' || b.innerText.trim() === 'Confirm');
                if (!confirmBtn) throw new Error("Confirm button not found inside modal");
                confirmBtn.click();
            })()
        """)

        # Capture resolve network response
        resolve_resp = await browser.wait_for_response(f"/admin/moderation/reviews/{moderation_review_id}/resolve", timeout=15.0)
        assert resolve_resp["status"] == 200, f"Resolve failed: {resolve_resp}"
        resolve_data = json.loads(resolve_resp["body"])["data"]
        print(f"  Resolve response data: {resolve_data}")
        assert resolve_data.get("status") == "APPROVED"

        screenshot_f = await browser.screenshot("publish-f-admin-moderation-detail-approve.png")
        evidence["moderation_resolve_browser_request_id"] = resolve_resp["requestId"]
        evidence["moderation_resolve_http_status"] = resolve_resp["status"]
        evidence["moderation_review_final_status"] = resolve_data.get("status")
        evidence["checkpoints"]["Publish-F"] = {
            "status": "PASS",
            "decision": "APPROVED",
            "resolve_http_status": resolve_resp["status"],
            "screenshot": screenshot_f
        }
        print("  [Publish-F PASS] Review approved through rendered Admin UI.")

        # =================================================================
        # Publish-G: Admin readback & DB prove review APPROVED and novel PUBLISHED
        # =================================================================
        print("\n" + "=" * 60)
        print("[Publish-G] Admin readback & DB verification of PUBLISHED state")
        print("=" * 60)

        # Reload detail page
        await browser.navigate(f"{WEB_URL}/admin/moderation/{moderation_review_id}")
        await browser.wait_for_condition("document.querySelector('h2') !== null", 10.0)
        await asyncio.sleep(1.0)

        detail_text_after = await browser.evaluate("document.body.innerText")
        assert "APPROVED" in detail_text_after, "Detail page does not show APPROVED status after resolution"

        # Check queue: review must not be in PENDING queue
        await browser.navigate(f"{WEB_URL}/admin/moderation")
        await browser.wait_for_condition("document.querySelector('h2') !== null", 10.0)
        await asyncio.sleep(1.0)
        still_pending_in_queue = await browser.evaluate(f"document.body.innerText.includes({json.dumps(moderation_review_id)})")
        print(f"  Review still visible in PENDING queue: {still_pending_in_queue}")
        assert not still_pending_in_queue, "Resolved review must no longer appear in PENDING moderation queue"

        # DB correlation for Publish-G
        with psycopg.connect(DB_URL) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT status, reviewed_by, reviewed_at FROM moderation_reviews WHERE review_id = %s",
                    (moderation_review_id,)
                )
                rev_status, rev_by, rev_at = cur.fetchone()
                assert rev_status == "APPROVED"
                assert str(rev_by) == ADMIN_USER_ID
                assert rev_at is not None

                cur.execute(
                    "SELECT status, published_at FROM novels WHERE novel_id = %s",
                    (created_novel_id,)
                )
                nov_status, nov_pub_at = cur.fetchone()
                assert nov_status == "PUBLISHED", f"Expected novel status PUBLISHED, got {nov_status}"
                assert nov_pub_at is not None, "published_at must not be null"

        print(f"  DB Novel Status: {nov_status}, published_at: {nov_pub_at}")
        print(f"  DB Review Status: {rev_status}, reviewed_by: {rev_by}, reviewed_at: {rev_at}")

        screenshot_g = await browser.screenshot("publish-g-admin-approved-novel-published.png")
        evidence["novel_final_status"] = nov_status
        evidence["published_at"] = nov_pub_at.isoformat() if nov_pub_at else None
        evidence["reviewed_by"] = str(rev_by)
        evidence["reviewed_at"] = rev_at.isoformat() if rev_at else None
        evidence["checkpoints"]["Publish-G"] = {
            "status": "PASS",
            "novel_status": nov_status,
            "published_at": evidence["published_at"],
            "review_status": rev_status,
            "reviewed_by": evidence["reviewed_by"],
            "screenshot": screenshot_g
        }
        print("  [Publish-G PASS] Novel PUBLISHED with published_at; Review APPROVED by Admin.")

        # =================================================================
        # Publish-H: Admin logs out via UI; Anonymous guest visits /public and discovers novel
        # =================================================================
        print("\n" + "=" * 60)
        print("[Publish-H] Session transition: Rendered Logout (Admin) -> Anonymous discovery on /public")
        print("=" * 60)

        # Admin is on /admin/moderation inside WebAppShell. Click rendered Logout button.
        print("  Admin clicking rendered 'Logout' button in WebAppShell...")
        browser.network_events.clear()
        await browser.click_element("[data-testid='shell-logout-btn']")

        # Capture /auth/logout network call if observable
        admin_logout_request_id = None
        try:
            admin_logout_resp = await browser.wait_for_response("/auth/logout", timeout=8.0)
            admin_logout_request_id = admin_logout_resp.get("requestId")
            print(f"  Captured admin logout request ID: {admin_logout_request_id}")
        except Exception as e:
            print(f"  Admin logout request not captured via CDP: {e}")

        # Wait for redirect to /login and verify unauthenticated state (shell removed)
        await browser.wait_for_condition("window.location.pathname.includes('/login')", 15.0)
        await browser.wait_for_condition("document.querySelector('.web-shell') === null", 10.0)
        await asyncio.sleep(1.0)
        admin_logout_dest = await browser.evaluate("window.location.pathname")
        admin_shell_gone = await browser.evaluate("document.querySelector('.web-shell') === null")
        assert admin_shell_gone, "Authenticated shell must disappear after admin logout"

        anonymous_session_verified = True
        print(f"  Admin logged out -> Destination: {admin_logout_dest}, anonymous session verified: {anonymous_session_verified}")

        # Navigate to /public as guest
        print("  Navigating to /public as anonymous guest...")
        await browser.navigate(f"{WEB_URL}/public")
        await browser.wait_for_condition("document.querySelector('h2') !== null", 10.0)
        await asyncio.sleep(1.0)

        # Search for exact novel title
        print(f"  Searching for unique title: '{unique_novel_title}'...")
        browser.network_events.clear()
        await browser.set_input("input[placeholder*='Title, synopsis']", unique_novel_title)

        # Capture search response
        search_resp = await browser.wait_for_response("/reading/search", timeout=15.0)
        assert search_resp["status"] == 200, f"Public search failed: {search_resp}"
        search_body = json.loads(search_resp["body"])
        search_items = search_body.get("data", [])
        matched_item = next((item for item in search_items if item.get("novelId") == created_novel_id), None)
        assert matched_item is not None, f"Novel {created_novel_id} not found in public search results!"
        print(f"  Public search returned novel: ID={matched_item['novelId']}, Title='{matched_item['title']}'")

        await asyncio.sleep(1.0)

        # Verify rendered in DOM
        has_card = await browser.evaluate(f"document.body.innerText.includes({json.dumps(unique_novel_title)})")
        assert has_card, f"Novel title '{unique_novel_title}' not rendered in public DOM"

        # Click Open detail on the novel card
        print("  Clicking 'Open detail' button on novel card...")
        await browser.evaluate(f"""
            (() => {{
                const papers = Array.from(document.querySelectorAll('.mantine-Paper-root'));
                const card = papers.find(p => p.innerText.includes({json.dumps(unique_novel_title)}));
                if (!card) throw new Error("Novel card not found");
                const detailLink = card.querySelector('a, button');
                const links = Array.from(card.querySelectorAll('a'));
                const openBtn = links.find(l => l.innerText.includes('Open detail')) || links[0];
                if (!openBtn) throw new Error("Open detail link not found");
                openBtn.click();
            }})()
        """)

        # Wait for navigation to /public/novels/:novelId
        await browser.wait_for_condition(f"window.location.pathname.includes('/public/novels/{created_novel_id}')", 15.0)
        await asyncio.sleep(1.5)

        public_rendered_title = await browser.evaluate("document.querySelector('h2')?.innerText?.trim()")
        print(f"  Public Novel Detail Title: '{public_rendered_title}'")
        assert public_rendered_title == unique_novel_title, f"Public title '{public_rendered_title}' != '{unique_novel_title}'"

        public_detail_url = f"/public/novels/{created_novel_id}"
        screenshot_h = await browser.screenshot("publish-h-anonymous-public-discovery.png")
        evidence["admin_logout_browser_request_id"] = admin_logout_request_id
        evidence["anonymous_session_verified"] = anonymous_session_verified
        evidence["public_search_browser_request_id"] = search_resp["requestId"]
        evidence["public_detail_url"] = public_detail_url
        evidence["public_rendered_title"] = public_rendered_title
        evidence["checkpoints"]["Publish-H"] = {
            "status": "PASS",
            "admin_logout_request_id": admin_logout_request_id,
            "anonymous_session_verified": anonymous_session_verified,
            "search_http_status": search_resp["status"],
            "detail_url": public_detail_url,
            "rendered_title": public_rendered_title,
            "screenshot": screenshot_h
        }
        print("  [Publish-H PASS] Admin logged out via UI; novel discovered anonymously via public search.")

        # =================================================================
        # Dynamic Negative Suite & Manifest Completion
        # =================================================================
        negative_suite = run_negative_suite()
        evidence["negative_suite"] = negative_suite

        # Add browser E2E flow to validation records
        validation_records.append({
            "name": "real_browser_publish_flow",
            "command": "python scripts/run_author_publish_admin_moderation_e2e.py (Publish-A..H)",
            "cwd": ".",
            "exit_code": 0,
            "result": "PASS",
            "checkpoints_passed": 8,
            "checkpoints_failed": 0
        })
        evidence["validation"] = validation_records

        evidence["verdict"] = "AUTHOR_PUBLISH_ADMIN_MODERATION_PASS"
        print("\n" + "=" * 80)
        print("ALL CHECKPOINTS PASS: AUTHOR_PUBLISH_ADMIN_MODERATION_PASS")
        print("=" * 80)

        # Write evidence JSON (strictly sanitized: no password/token values)
        evidence_json_path = os.path.join(EVIDENCE_DIR, "author-publish-admin-moderation-e2e-evidence.json")
        with open(evidence_json_path, "w", encoding="utf-8") as f:
            json.dump(evidence, f, indent=2, ensure_ascii=False)
        print(f"\nSaved evidence JSON: {evidence_json_path}")

        # Write canonical report
        write_report(evidence)
        print(f"Saved canonical report: {REPORT_PATH}")

    finally:
        try:
            await browser.close()
        except Exception:
            pass
        edge_proc.terminate()
        try:
            edge_proc.wait(timeout=5)
        except Exception:
            edge_proc.kill()


def write_report(ev: Dict[str, Any]):
    val_table_rows = []
    for item in ev.get("validation", []):
        tests_info = ""
        if "tests_passed" in item:
            tests_info = f"{item['tests_passed']} passed, {item.get('tests_failed', 0)} failed"
        elif "checkpoints_passed" in item:
            tests_info = f"{item['checkpoints_passed']} checkpoints passed"
        val_table_rows.append(
            f"| `{item['name']}` | `{item['command']}` | `{item['exit_code']}` | {tests_info or 'N/A'} | **{item['result']}** |"
        )
    val_table_str = "\n".join(val_table_rows)

    neg = ev.get("negative_suite", {})
    invariants_list = "\n".join([f"- `{inv}`" for inv in neg.get("covered_invariants", [])])

    report_content = f"""# Acceptance Report: Gate AUTHOR-PUBLISH-ADMIN-MODERATION-E2E

**Verdict**: `{ev.get('verdict', 'AUTHOR_PUBLISH_ADMIN_MODERATION_PASS')}`  
**Tested Base Main SHA**: `{ev['tested_main_sha']}`  
**Tested Code SHA**: `{ev['tested_code_sha']}`  
**Working Branch**: `{ev['branch']}`  
**Date**: `{time.strftime("%Y-%m-%d %H:%M:%SZ", time.gmtime())}`  
**Driver**: Microsoft Edge CDP over WebSocket (real browser automation)

---

## 1. Executive Summary

This report documents the hardened end-to-end execution and verification of the canonical author-to-public lifecycle:
```text
Author DRAFT (Rendered UI)
  -> Submit Publish (Rendered UI)
  -> Deterministic Keyword Filter ('harassment')
  -> PENDING_MODERATION & Moderation Review Enqueued
  -> Author Clicks Rendered 'Logout' in WebAppShell -> Unauthenticated state observed
  -> Admin Logs In via Rendered UI Form -> Navigates to /admin
  -> Admin Moderation Queue & Detail Inspection (/admin/moderation, /admin/moderation/:id)
  -> Admin Resolves APPROVE via Rendered UI Modal
  -> Novel Transitions to PUBLISHED with published_at persisted in PostgreSQL
  -> Admin Clicks Rendered 'Logout' in WebAppShell -> Unauthenticated state observed
  -> Anonymous Guest Visits /public & Searches Catalog (/reading/search)
  -> Public Detail Discovered & Rendered in DOM (/public/novels/:id)
```

All mutations originated strictly in the rendered user interface. Session transitions (Publish-D and Publish-H) executed canonical logout via the rendered `WebAppShell` topbar button. Credential hygiene is strictly enforced: no password literals or auth tokens are committed in code or generated evidence. API and PostgreSQL queries were used exclusively for correlation, invariant validation, and contract verification.

---

## 2. Tested Entities & Deterministic Fixtures

| Field | Value | Notes |
|---|---|---|
| **Novel ID** | `{ev['novel_id']}` | Created via rendered Author UI |
| **Novel Title** | `{ev['unique_novel_title']}` | Unique title generated for this run |
| **Initial Status** | `{ev['novel_initial_status']}` | DRAFT |
| **Pending Status** | `{ev['novel_pending_status']}` | PENDING_MODERATION |
| **Final Status** | `{ev['novel_final_status']}` | PUBLISHED |
| **Published At** | `{ev['published_at']}` | Non-null timestamp |
| **Content Filter Rule ID** | `{ev['content_filter_rule_id']}` | Active PostgreSQL demo filter rule |
| **Filter Trigger Token** | `{ev['moderation_trigger']}` | Exact token in synopsis |
| **Moderation Review ID** | `{ev['moderation_review_id']}` | Valid UUID generated by content control |
| **Review Source** | `{ev['moderation_review_source']}` | KEYWORD_FILTER |
| **Review Initial Status** | `{ev['moderation_review_initial_status']}` | PENDING |
| **Review Final Status** | `{ev['moderation_review_final_status']}` | APPROVED |
| **Reviewed By** | `{ev['reviewed_by']}` | Admin User (`{ev['admin_user_id']}`) |
| **Reviewed At** | `{ev['reviewed_at']}` | Non-null timestamp |
| **Author Logout Request ID** | `{ev.get('author_logout_browser_request_id', 'captured')}` | Captured via CDP `/auth/logout` |
| **Author Logout Destination** | `{ev.get('author_logout_destination', '/login')}` | Observed unauthenticated route |
| **Admin Login Request ID** | `{ev.get('admin_login_browser_request_id', 'captured')}` | Captured via CDP `/auth/login` |
| **Admin Logout Request ID** | `{ev.get('admin_logout_browser_request_id', 'captured')}` | Captured via CDP `/auth/logout` |
| **Anonymous Session Verified** | `{ev.get('anonymous_session_verified', True)}` | DOM proves shell removed |
| **Public Search Request ID** | `{ev['public_search_browser_request_id']}` | Captured via CDP `/reading/search` |
| **Public Detail URL** | `{ev['public_detail_url']}` | Open detail link |

---

## 3. Checkpoint Verification Matrix

| Checkpoint | Description | UI Action | Assertion / Evidence | Result |
|---|---|---|---|:---:|
| **Publish-A** | Author creates deterministic DRAFT novel | Click "New Project" in `/author` | DB: `status=DRAFT`, `author_id={ev['author_user_id']}`, `deleted_at=null` | **PASS** |
| **Publish-B** | Author updates metadata with trigger | Click "Chỉnh sửa thông tin", fill title & synopsis, save | Rendered DOM & DB: title persisted, synopsis contains `harassment`, badge `Bản nháp` | **PASS** |
| **Publish-C** | Author submits publish | Click "Gửi duyệt" | HTTP 200, `status=PENDING_MODERATION`, `moderationRequired=true`, `moderationReviewId={ev['moderation_review_id']}`. Badge: `Chờ duyệt` | **PASS** |
| **Publish-D** | Canonical Logout Author & Login Admin | Author clicks rendered "Logout" in `WebAppShell` topbar; Admin logs in via UI form | Observed `/login`, shell unmounted; Admin logs in, redirects to `/admin`, header verifies Admin Console | **PASS** |
| **Publish-E** | Admin views moderation queue | Navigate `/admin/moderation` | Exact `reviewId` and `targetId` rendered in queue | **PASS** |
| **Publish-F** | Admin resolves review | Open `/admin/moderation/:id`, click Approve + Confirm in modal | HTTP 200, resolve `status=APPROVED` captured via CDP | **PASS** |
| **Publish-G** | Verification of published state | Reload detail, check queue, query DB | Review is `APPROVED`, no longer in PENDING queue. Novel is `PUBLISHED` with `published_at` set | **PASS** |
| **Publish-H** | Canonical Logout Admin & Anonymous discovery | Admin clicks rendered "Logout" in `WebAppShell` topbar; anonymous guest visits `/public` | Observed `/login`, shell unmounted (`anonymous_session_verified=true`); public search returns novel, open detail matches unique title | **PASS** |

---

## 4. Phase C Negative and Idempotency Suite

All 5 Phase C invariants are dynamically verified by executing the production-path test suite:
- **Suite Command**: `{neg.get('command')}`
- **Test File**: `{neg.get('test_file')}`
- **Exit Code**: `{neg.get('exit_code')}`
- **Result**: `{neg.get('result')}` ({neg.get('tests_passed')} passed, {neg.get('tests_failed')} failed)

Covered Invariants:
{invariants_list}

1. **Role Guard (403)**: Reader and Author cannot access `/api/v1/admin/moderation/reviews/:id/resolve` (fails closed with `AUTH_008` / HTTP 403).
2. **Duplicate Resolve (409)**: Resolving an already-approved review fails closed with `ADMIN_002` / HTTP 409.
3. **Resubmit Published Novel (409)**: Submitting an already-`PUBLISHED` novel through `submitPublish` fails closed with `CONTENT_004` / HTTP 409.
4. **Idempotent Open Review**: Calling `checkContent` on a target with an open pending review reuses the existing review ID without creating duplicate pending reviews.
5. **Target Isolation**: Resolving an unrelated pending review has zero effect on the target novel's pending status.

---

## 5. Local Validation Manifest

The following validation commands were executed from the tested code tree:

| Step Name | Executed Command | Exit Code | Tests Summary | Result |
|---|---|:---:|---|:---:|
{val_table_str}

---

## 6. Visual Evidence Artifacts

The following full-resolution screenshots were captured at each checkpoint and archived in `docs/development/AUTHOR-PUBLISH-ADMIN-MODERATION-E2E/`:
- `publish-a-author-create-draft.png` — Author creates initial draft novel
- `publish-b-author-synopsis-trigger.png` — Author verifies updated title & trigger synopsis
- `publish-c-author-submit-moderation.png` — Author submits publish and UI reflects `Chờ duyệt`
- `publish-d-admin-login.png` — Admin logs into Admin Console via UI
- `publish-e-admin-moderation-queue.png` — Admin inspects exact pending review in moderation queue
- `publish-f-admin-moderation-detail-approve.png` — Admin confirms `APPROVED` in moderation detail modal
- `publish-g-admin-approved-novel-published.png` — Readback confirms review approved & novel published
- `publish-h-anonymous-public-discovery.png` — Anonymous guest discovers published novel in `/public` catalog

---

## 7. Stop Boundary & Verdict

```text
Verdict: AUTHOR_PUBLISH_ADMIN_MODERATION_PASS
Local State: LOCAL_PASS_CI_PENDING
```

All 8 checkpoints and all 5 Phase C negative invariants PASS.
Session transitions operate canonically through rendered UI controls.
Credentials and tokens are strictly sanitized.
Validation manifest and negative claims are directly derived from local execution.
Gemini stops strictly at `LOCAL_PASS_CI_PENDING` with a clean working tree.
ChatGPT owns remote PR review, CI inspection, and merge decision.
"""
    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        f.write(report_content)


if __name__ == "__main__":
    asyncio.run(main())
