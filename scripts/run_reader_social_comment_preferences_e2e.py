"""
Real Browser E2E Automation for Reader Social Interactions, Comments, and Reading Preferences
Gate: READER-SOCIAL-COMMENT-PREFERENCES-E2E
Checkpoints: Interact-A through Interact-H + Phase C negative invariants

Drives real DOM interactions via Microsoft Edge CDP over WebSocket against a disposable stack
(scripts/e2e_isolated_stack.py): its own PostgreSQL and MongoDB databases, migrated and seeded,
with the API and a production web build on dedicated ports. The shared development databases
are never written; their fingerprint is taken before and after the run and must be unchanged.
The disposable databases are dropped in `finally`.

Usage (repo root):
  EPHURIN_ALLOW_TEST_DB_MUTATIONS=1 EPHURIN_E2E_DEMO_PASSWORD=... python scripts/run_reader_social_comment_preferences_e2e.py
Optional: EPHURIN_E2E_TEST_DB_NAME, EPHURIN_E2E_BACKEND_PORT (4311), EPHURIN_E2E_WEB_PORT (5311),
EPHURIN_E2E_EVIDENCE_DIR (default: a temp folder; canonical docs/development evidence is not overwritten).
Exit codes: 0 PASS, 1 FAIL, 3 REFUSED (nothing was written).

The full backend suite is not a gate input here: it runs in CI and needs the AI service.
"""

import asyncio
import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import traceback
import uuid
from typing import Any, Callable, Dict, List, Optional

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import httpx
import psycopg
import websockets
from pymongo import MongoClient

from e2e_isolated_stack import (
    REFUSED_EXIT_CODE,
    IsolatedStack,
    RefusedError,
    config_from_env,
    diff_fingerprints,
    fingerprint_shared,
)

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

EDGE_PATH = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not os.path.exists(EDGE_PATH):
    EDGE_PATH = r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"

READER_EMAIL = "reader04@example.com"
TARGET_NOVEL_SLUG = "sample-ashenhold-test-story"
TARGET_NOVEL_TITLE = "Ashenhold - Sample Story"
TARGET_CHAPTER_NUMBER = 1

# Signed-in role from the shell's stable session hook; falls back to the legacy topbar text so the
# runner works on both the StoryCraft shell and the older WebAppShell.
SESSION_ROLE_JS = r"""(() => {
  const marker = document.querySelector('[data-testid="shell-session"]');
  if (marker) return marker.dataset.userRole || '';
  const text = document.querySelector('.web-topbar')?.innerText || '';
  const match = text.match(/\b(READER|AUTHOR|ADMIN)\b/);
  return match ? match[1] : '';
})()"""

# CommentsSection has no test ids; it is driven by its accessible structure and visible labels.
CHAPTER_COMMENTS = "section[aria-label='Bình luận chương']"


class CDPBrowser:
    def __init__(self, ws_url: str, evidence_dir: str):
        self.ws_url = ws_url
        self.evidence_dir = evidence_dir
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.msg_id = 0
        self.pending_responses: Dict[int, asyncio.Future] = {}
        self.network_events: List[Dict[str, Any]] = []
        self.network_requests: Dict[str, Dict[str, Any]] = {}
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
                if method == "Network.requestWillBeSent":
                    params = msg.get("params", {})
                    req_id = params.get("requestId")
                    if req_id:
                        self.network_requests[req_id] = params.get("request", {})
                elif method.startswith("Network."):
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
        self.network_requests.clear()
        await self.call("Page.navigate", {"url": url})
        await asyncio.sleep(wait_seconds)

    async def reload(self, wait_seconds: float = 2.0):
        print("  [Browser] Reloading page...")
        self.network_events.clear()
        self.network_requests.clear()
        await self.call("Page.reload")
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

    async def wait_for_response(
        self,
        url_pattern: str,
        timeout: float = 15.0,
        predicate: Optional[Callable[[Dict[str, Any]], bool]] = None
    ) -> Dict[str, Any]:
        start = time.time()
        while time.time() - start < timeout:
            for ev in self.network_events:
                if ev.get("method") == "Network.responseReceived":
                    resp = ev.get("params", {}).get("response", {})
                    url = resp.get("url", "")
                    status = resp.get("status")
                    request_id = ev.get("params", {}).get("requestId")
                    req_meta = self.network_requests.get(request_id, {})
                    method = req_meta.get("method", "")
                    if method == "OPTIONS":
                        continue
                    if status == 204 and method != "DELETE":
                        continue
                    if url_pattern in url:
                        body_data = None
                        try:
                            body_res = await self.call("Network.getResponseBody", {"requestId": request_id})
                            body_data = body_res.get("body")
                        except Exception:
                            pass
                        item = {
                            "requestId": request_id,
                            "url": url,
                            "status": status,
                            "method": method or "GET",
                            "postData": req_meta.get("postData"),
                            "body": body_data,
                            "headers": resp.get("headers", {})
                        }
                        if predicate is None or predicate(item):
                            return item
            await asyncio.sleep(0.3)
        raise TimeoutError(f"Network response matching '{url_pattern}' timed out after {timeout}s")

    async def screenshot(self, filename: str) -> str:
        res = await self.call("Page.captureScreenshot", {"format": "png"})
        file_path = os.path.join(self.evidence_dir, filename)
        with open(file_path, "wb") as f:
            f.write(base64.b64decode(res.get("data", "")))
        print(f"  [Artifact] Saved screenshot: {file_path}")
        return filename

    async def set_input(self, selector: str, value: str):
        await self.evaluate(f"""
            (() => {{
                let el = document.querySelector({json.dumps(selector)});
                if (!el) throw new Error("Element not found: " + {json.dumps(selector)});
                if (el.tagName.toLowerCase() !== 'input' && el.tagName.toLowerCase() !== 'textarea') {{
                    const inner = el.querySelector('input, textarea');
                    if (inner) el = inner;
                }}
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

    async def click_button_in(self, scope_selector: str, label: str, timeout: float = 10.0):
        """Clicks the enabled button whose visible label is exactly `label` inside `scope_selector`."""
        click_js = f"""
            (() => {{
                const scope = document.querySelector({json.dumps(scope_selector)});
                const btn = scope && Array.from(scope.querySelectorAll('button')).find(b => b.innerText.trim() === {json.dumps(label)});
                if (!btn || btn.disabled) return false;
                btn.scrollIntoView({{ block: 'center' }});
                btn.click();
                return true;
            }})()
        """
        try:
            await self.wait_for_condition(click_js, timeout, poll_interval=0.25)
        except TimeoutError as error:
            raise TimeoutError(f"No enabled button '{label}' in {scope_selector}") from error

    async def select_mantine_option(self, selector: str, option_text: str):
        await self.evaluate(f"""
            (() => {{
                let el = document.querySelector({json.dumps(selector)});
                if (!el) throw new Error("Select element not found: " + {json.dumps(selector)});
                if (el.tagName.toLowerCase() !== 'input') {{
                    const inner = el.querySelector('input');
                    if (inner) el = inner;
                }}
                el.click();
            }})()
        """)
        await asyncio.sleep(0.5)
        await self.evaluate(f"""
            (() => {{
                const options = Array.from(document.querySelectorAll('[role="option"], .mantine-Select-option'));
                const match = options.find(o => o.innerText.trim().includes({json.dumps(option_text)}));
                if (!match) throw new Error("Option not found with text: " + {json.dumps(option_text)});
                match.click();
            }})()
        """)
        await asyncio.sleep(0.3)

    async def close(self):
        if self._listener_task:
            self._listener_task.cancel()
        if self.ws:
            await self.ws.close()


def get_git_info() -> Dict[str, Any]:
    git = os.environ.get("GIT_EXECUTABLE") or shutil.which("git") or "git"

    def run_git(cmd: str) -> str:
        res = subprocess.run(f'"{git}" {cmd}', shell=True, capture_output=True, text=True, cwd=REPO_ROOT)
        return res.stdout.strip()
    return {
        "head_sha": run_git("rev-parse HEAD"),
        "base_main_sha": run_git("rev-parse origin/main"),
        "branch": run_git("rev-parse --abbrev-ref HEAD"),
        "working_tree_dirty": bool(run_git("status --porcelain --untracked-files=no"))
    }


def run_command(name: str, cmd: str, cwd: str, extra_env: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    print(f"\n[Validation] Running '{name}': {cmd}...")
    start_t = time.time()
    env = {**os.environ, **(extra_env or {})}
    res = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=cwd, env=env, encoding="utf-8", errors="replace")
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
    entry: Dict[str, Any] = {
        "name": name,
        "command": cmd,
        "cwd": os.path.relpath(cwd, REPO_ROOT),
        "exit_code": res.returncode,
        "duration_seconds": duration,
        "result": "PASS" if is_pass else "FAIL"
    }
    if passed_cnt is not None:
        entry["tests_passed"] = passed_cnt
    if failed_cnt is not None:
        entry["tests_failed"] = failed_cnt
    print(f"  Result: {entry['result']} (exit={res.returncode}, time={duration}s)")
    assert is_pass, f"Validation command '{name}' failed! Output:\n{output[:1000]}"
    return entry


def resolve_fixture(pg_url: str) -> Dict[str, Any]:
    """Fixture ids come from the freshly seeded database instead of hard-coded uuids."""
    with psycopg.connect(pg_url) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT user_id, role FROM users WHERE email = %s", (READER_EMAIL,))
            reader = cur.fetchone()
            assert reader is not None and reader[1] == "READER", f"Seeded reader {READER_EMAIL} missing"
            cur.execute("SELECT novel_id, title, status, author_id FROM novels WHERE slug = %s", (TARGET_NOVEL_SLUG,))
            novel = cur.fetchone()
            assert novel is not None and novel[2] == "PUBLISHED", f"Seeded novel {TARGET_NOVEL_SLUG} missing or unpublished"
            cur.execute(
                "SELECT chapter_id, title, status, is_vip FROM chapters WHERE novel_id = %s AND chapter_number = %s",
                (novel[0], TARGET_CHAPTER_NUMBER)
            )
            chapter = cur.fetchone()
            assert chapter is not None and chapter[2] == "PUBLISHED" and chapter[3] is False, "Seeded free chapter 1 missing"

            reader_id, novel_id, author_id = str(reader[0]), str(novel[0]), str(novel[3])
            # A fresh database must already be pristine; nothing is deleted to make it so.
            cur.execute("SELECT count(*) FROM likes WHERE user_id = %s AND novel_id = %s", (reader_id, novel_id))
            likes = cur.fetchone()[0]
            cur.execute("SELECT count(*) FROM follows WHERE follower_id = %s AND author_id = %s", (reader_id, author_id))
            follows = cur.fetchone()[0]
            cur.execute("SELECT count(*) FROM reading_preferences WHERE user_id = %s", (reader_id,))
            preferences = cur.fetchone()[0]
            assert (likes, follows, preferences) == (0, 0, 0), f"Seeded state is not pristine: likes={likes}, follows={follows}, preferences={preferences}"
    return {
        "reader_user_id": reader_id,
        "novel_id": novel_id,
        "novel_title": novel[1],
        "author_id": author_id,
        "chapter_id": str(chapter[0]),
        "chapter_title": chapter[1],
    }


def pg_one(pg_url: str, query: str, params: tuple) -> Any:
    with psycopg.connect(pg_url) as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            return cur.fetchone()


def find_comment(mongo_uri: str, comment_id: str) -> Optional[Dict[str, Any]]:
    client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
    try:
        doc = client.get_default_database()["comments"].find_one({"commentId": comment_id})
        return json.loads(json.dumps(doc, default=str)) if doc else None
    finally:
        client.close()


async def run_browser_flow(stack: IsolatedStack, fx: Dict[str, Any], password: str,
                           evidence: Dict[str, Any], evidence_dir: str) -> None:
    web_url = stack.web_url
    pg_url = stack.pg_url
    reader_id, novel_id, author_id, chapter_id = fx["reader_user_id"], fx["novel_id"], fx["author_id"], fx["chapter_id"]
    checkpoints = evidence["checkpoints"]

    debug_port = 9337
    user_data_dir = os.path.join(tempfile.gettempdir(), f"edge-reader-social-{uuid.uuid4().hex[:8]}")
    edge_proc = subprocess.Popen([
        EDGE_PATH, "--headless=new", f"--remote-debugging-port={debug_port}", f"--user-data-dir={user_data_dir}",
        "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--window-size=1440,900", "about:blank"
    ])
    browser: Optional[CDPBrowser] = None
    try:
        await asyncio.sleep(2.5)
        targets = httpx.get(f"http://127.0.0.1:{debug_port}/json").json()
        page_target = next((t for t in targets if t.get("type") == "page"), targets[0])
        browser = CDPBrowser(page_target["webSocketDebuggerUrl"], evidence_dir)
        await browser.connect()

        # Interact-A: log in as READER through the rendered form
        print("\n[Interact-A] Log in as READER via rendered UI form")
        await browser.navigate(f"{web_url}/login")
        await browser.wait_for_condition("document.querySelector('input') !== null", 10.0)
        browser.network_events.clear()
        browser.network_requests.clear()
        await browser.set_input("input[type='text'], input[placeholder*='Email'], input:not([type='password'])", READER_EMAIL)
        await browser.set_input("input[type='password']", password)
        await asyncio.sleep(0.3)
        await browser.click_button_by_text("Login")
        login_resp = await browser.wait_for_response("/auth/login", timeout=15.0)
        assert login_resp["status"] == 200, f"Login failed: status={login_resp['status']}"
        await browser.wait_for_condition("window.location.pathname === '/reader'", 15.0)
        await browser.wait_for_condition(f"{SESSION_ROLE_JS} === 'READER'", 10.0)
        checkpoints["interact_a"] = {
            "request_id": login_resp["requestId"], "status": login_resp["status"], "destination": "/reader",
            "role": await browser.evaluate(SESSION_ROLE_JS), "screenshot": await browser.screenshot("interact-a-login.png"),
            "result": "PASS"
        }

        # Interact-B: like the published novel
        print("\n[Interact-B] Like published novel")
        await browser.navigate(f"{web_url}/reader/novels/{novel_id}")
        await browser.wait_for_condition("document.querySelector('[data-testid=\"reader-like-btn\"]') !== null", 10.0)
        browser.network_events.clear()
        browser.network_requests.clear()
        await browser.click_element("[data-testid='reader-like-btn']")
        like_resp = await browser.wait_for_response(f"/novels/{novel_id}/likes", timeout=15.0)
        assert like_resp["status"] == 200, f"Like failed: {like_resp}"
        like_body = json.loads(like_resp["body"]).get("data", {})
        assert like_body.get("liked") is True, f"Expected liked=true: {like_body}"
        assert pg_one(pg_url, "SELECT count(*) FROM likes WHERE user_id = %s AND novel_id = %s", (reader_id, novel_id))[0] == 1
        checkpoints["interact_b"] = {
            "request_id": like_resp["requestId"], "status": like_resp["status"], "db_like_rows": 1,
            "response_likes_count": like_body.get("likesCount"), "screenshot": await browser.screenshot("interact-b-like.png"),
            "result": "PASS"
        }

        # Interact-C: unlike
        print("\n[Interact-C] Unlike published novel")
        browser.network_events.clear()
        browser.network_requests.clear()
        await browser.click_element("[data-testid='reader-unlike-btn']")
        unlike_resp = await browser.wait_for_response(f"/novels/{novel_id}/likes/me", timeout=15.0)
        assert unlike_resp["status"] == 200, f"Unlike failed: {unlike_resp}"
        assert json.loads(unlike_resp["body"]).get("data", {}).get("liked") is False
        assert pg_one(pg_url, "SELECT count(*) FROM likes WHERE user_id = %s AND novel_id = %s", (reader_id, novel_id))[0] == 0
        checkpoints["interact_c"] = {
            "request_id": unlike_resp["requestId"], "status": unlike_resp["status"], "db_like_rows": 0,
            "screenshot": await browser.screenshot("interact-c-unlike.png"), "result": "PASS"
        }

        # Interact-D: follow, then unfollow the novel's author
        print("\n[Interact-D] Follow and unfollow the author")
        browser.network_events.clear()
        browser.network_requests.clear()
        await browser.click_element("[data-testid='reader-follow-btn']")
        follow_resp = await browser.wait_for_response(f"/authors/{author_id}/follow", timeout=15.0)
        assert follow_resp["status"] == 200, f"Follow failed: {follow_resp}"
        assert json.loads(follow_resp["body"]).get("data", {}).get("following") is True
        follow_sql = "SELECT count(*) FROM follows WHERE follower_id = %s AND author_id = %s"
        assert pg_one(pg_url, follow_sql, (reader_id, author_id))[0] == 1
        browser.network_events.clear()
        browser.network_requests.clear()
        await browser.click_element("[data-testid='reader-unfollow-btn']")
        unfollow_resp = await browser.wait_for_response(f"/authors/{author_id}/follow", timeout=15.0)
        assert unfollow_resp["status"] == 200, f"Unfollow failed: {unfollow_resp}"
        assert json.loads(unfollow_resp["body"]).get("data", {}).get("following") is False
        assert pg_one(pg_url, follow_sql, (reader_id, author_id))[0] == 0
        checkpoints["interact_d"] = {
            "follow_request_id": follow_resp["requestId"], "unfollow_request_id": unfollow_resp["requestId"],
            "db_follow_rows_after_follow": 1, "db_follow_rows_after_unfollow": 0,
            "screenshot": await browser.screenshot("interact-d-follow-unfollow.png"), "result": "PASS"
        }

        # Interact-E: reading preferences persist across reload
        print("\n[Interact-E] Reading preferences: Georgia, 20, SEPIA, 1.9")
        await browser.navigate(f"{web_url}/reader/chapters/{chapter_id}")
        await browser.wait_for_condition("document.querySelector('[data-testid=\"reader-save-preferences-btn\"]') !== null", 10.0)
        await browser.select_mantine_option("[data-testid='reader-pref-font-family']", "Serif")
        await browser.set_input("[data-testid='reader-pref-font-size']", "20")
        await browser.select_mantine_option("[data-testid='reader-pref-background']", "Sepia")
        await browser.set_input("[data-testid='reader-pref-line-height']", "1.9")
        browser.network_events.clear()
        browser.network_requests.clear()
        await browser.click_element("[data-testid='reader-save-preferences-btn']")
        pref_save_resp = await browser.wait_for_response("/reading/preferences/me", timeout=15.0)
        assert pref_save_resp["status"] == 200, f"Preferences save failed: {pref_save_resp}"
        browser.network_events.clear()
        browser.network_requests.clear()
        await browser.reload(wait_seconds=2.0)
        pref_get_resp = await browser.wait_for_response("/reading/preferences/me", timeout=15.0)
        pref_data = json.loads(pref_get_resp["body"]).get("data", {})
        assert pref_data.get("fontFamily") == "Georgia", f"Mismatched fontFamily: {pref_data}"
        assert pref_data.get("fontSize") == 20, f"Mismatched fontSize: {pref_data}"
        assert pref_data.get("background") == "SEPIA", f"Mismatched background: {pref_data}"
        assert abs(float(pref_data.get("lineHeight")) - 1.9) < 0.05, f"Mismatched lineHeight: {pref_data}"
        prose_style = await browser.evaluate("""
            (() => {
                const prose = document.querySelector('.chapter-prose');
                const surface = prose?.closest('article');
                if (!prose || !surface) return null;
                const p = getComputedStyle(prose), s = getComputedStyle(surface);
                return { fontSize: s.fontSize, lineHeight: s.lineHeight, surfaceBackground: s.backgroundColor, proseColor: p.color };
            })()
        """)
        pref_row = pg_one(pg_url, "SELECT font_family, font_size, background, line_height FROM reading_preferences WHERE user_id = %s", (reader_id,))
        assert pref_row is not None and pref_row[2] == "SEPIA", f"DB preferences mismatch: {pref_row}"
        checkpoints["interact_e"] = {
            "request_id": pref_save_resp["requestId"], "persisted_values": pref_data, "computed_style": prose_style,
            "db_row": {"font_family": pref_row[0], "font_size": pref_row[1], "background": pref_row[2], "line_height": float(pref_row[3])},
            "screenshot": await browser.screenshot("interact-e-preferences.png"), "result": "PASS"
        }

        # Interact-F: post a clean comment on the chapter
        print("\n[Interact-F] Create clean comment")
        clean_text = f"E2E clean comment {uuid.uuid4().hex[:8]}"
        textarea = f"{CHAPTER_COMMENTS} form textarea"
        await browser.wait_for_condition(f"document.querySelector({json.dumps(textarea)}) !== null", 10.0)
        await browser.set_input(textarea, clean_text)
        browser.network_events.clear()
        browser.network_requests.clear()
        await browser.click_button_in(f"{CHAPTER_COMMENTS} form", "Gửi bình luận")
        create_resp = await browser.wait_for_response(
            f"/chapters/{chapter_id}/comments", timeout=15.0, predicate=lambda item: item["method"] == "POST"
        )
        assert create_resp["status"] == 201, f"Comment create failed: {create_resp}"
        create_body = json.loads(create_resp["body"]).get("data", {})
        comment_id = create_body.get("commentId")
        assert create_body.get("status") == "APPROVED", f"Expected APPROVED, got {create_body}"
        thread = f"[data-comment-id='{comment_id}']"
        await browser.wait_for_condition(f"document.querySelector({json.dumps(thread)})?.innerText.includes({json.dumps(clean_text)})", 10.0)
        doc = find_comment(stack.mongo_uri, comment_id)
        assert doc and doc.get("status") == "APPROVED" and doc.get("content") == clean_text and doc.get("deletedAt") is None, f"Mongo mismatch: {doc}"
        checkpoints["interact_f"] = {
            "request_id": create_resp["requestId"], "status": create_resp["status"], "comment_id": comment_id,
            "db_status": doc.get("status"), "screenshot": await browser.screenshot("interact-f-comment-created.png"), "result": "PASS"
        }

        # Interact-G: edit own comment
        print("\n[Interact-G] Edit own comment")
        updated_text = f"E2E updated comment {uuid.uuid4().hex[:8]}"
        own_item = f"{thread} article"
        await browser.click_button_in(own_item, "Sửa")
        edit_box = f"{own_item} form textarea"
        await browser.wait_for_condition(f"document.querySelector({json.dumps(edit_box)}) !== null", 10.0)
        await browser.set_input(edit_box, updated_text)
        browser.network_events.clear()
        browser.network_requests.clear()
        await browser.click_button_in(f"{own_item} form", "Lưu bình luận")
        patch_resp = await browser.wait_for_response(f"/comments/{comment_id}", timeout=15.0, predicate=lambda item: item["method"] == "PATCH")
        assert patch_resp["status"] == 200, f"Comment update failed: {patch_resp}"
        assert json.loads(patch_resp["body"]).get("data", {}).get("status") == "APPROVED"
        await browser.reload(wait_seconds=2.0)
        await browser.wait_for_condition(f"document.body.innerText.includes({json.dumps(updated_text)})", 10.0)
        assert not await browser.evaluate(f"document.body.innerText.includes({json.dumps(clean_text)})"), "Old comment text still visible"
        doc = find_comment(stack.mongo_uri, comment_id)
        assert doc and doc.get("content") == updated_text and doc.get("status") == "APPROVED", f"Mongo mismatch: {doc}"
        checkpoints["interact_g"] = {
            "request_id": patch_resp["requestId"], "status": patch_resp["status"], "comment_id": comment_id,
            "db_content_updated": True, "screenshot": await browser.screenshot("interact-g-comment-edited.png"), "result": "PASS"
        }

        # Interact-H: delete own comment (two-step confirmation)
        print("\n[Interact-H] Delete own comment")
        await browser.wait_for_condition(f"document.querySelector({json.dumps(own_item)}) !== null", 10.0)
        await browser.click_button_in(own_item, "Xóa")
        browser.network_events.clear()
        browser.network_requests.clear()
        await browser.click_button_in(own_item, "Xác nhận xóa")
        delete_resp = await browser.wait_for_response(f"/comments/{comment_id}", timeout=15.0, predicate=lambda item: item["method"] == "DELETE")
        assert delete_resp["status"] == 204, f"Comment delete failed: {delete_resp}"
        await browser.reload(wait_seconds=2.0)
        assert not await browser.evaluate(f"Boolean(document.querySelector({json.dumps(thread)}))"), "Deleted comment still rendered"
        doc = find_comment(stack.mongo_uri, comment_id)
        assert doc and doc.get("status") == "DELETED" and doc.get("deletedAt") is not None, f"Mongo mismatch: {doc}"
        checkpoints["interact_h"] = {
            "request_id": delete_resp["requestId"], "status": delete_resp["status"], "comment_id": comment_id,
            "db_status": doc.get("status"), "screenshot": await browser.screenshot("interact-h-comment-deleted.png"), "result": "PASS"
        }
    finally:
        if browser:
            await browser.close()
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(edge_proc.pid)], capture_output=True)


def main() -> int:
    print("=" * 80)
    print("GATE READER-SOCIAL-COMMENT-PREFERENCES-E2E (disposable databases)")
    print("=" * 80)
    stack = IsolatedStack(config_from_env("social", default_backend_port=4311, default_web_port=5311))
    try:
        stack.preflight()
    except RefusedError as error:
        print(f"REFUSED: {error}. Nothing was written.")
        return REFUSED_EXIT_CODE
    password = os.environ.get("EPHURIN_E2E_DEMO_PASSWORD")
    if not password:
        print("REFUSED: missing EPHURIN_E2E_DEMO_PASSWORD. Nothing was written.")
        return REFUSED_EXIT_CODE

    run_name = stack.config.db_name
    evidence_dir = os.environ.get("EPHURIN_E2E_EVIDENCE_DIR") or os.path.join(tempfile.gettempdir(), "ephurin-e2e", run_name)
    os.makedirs(evidence_dir, exist_ok=True)
    git_info = get_git_info()
    print(f"Branch: {git_info['branch']}  HEAD: {git_info['head_sha']}  disposable DB: {run_name}")

    shared_before = fingerprint_shared()
    evidence: Dict[str, Any] = {
        "gate": "READER-SOCIAL-COMMENT-PREFERENCES-E2E",
        "tested_code_sha": git_info["head_sha"],
        "tested_main_sha": git_info["base_main_sha"],
        "branch": git_info["branch"],
        "working_tree_dirty": git_info["working_tree_dirty"],
        "disposable_database": run_name,
        "web_url": stack.web_url,
        "api_url": stack.api_url,
        "checkpoints": {},
        "validation": [],
        "verdict": "FAIL",
    }
    failure: Optional[str] = None
    try:
        stack.start()
        evidence["stack_steps"] = stack.steps
        fixture = resolve_fixture(stack.pg_url)
        evidence["fixture"] = fixture

        web_dir = os.path.join(REPO_ROOT, "web")
        backend_dir = os.path.join(REPO_ROOT, "backend")
        evidence["validation"].append(run_command("web_typecheck", "npm run typecheck", web_dir))
        evidence["validation"].append(run_command("backend_typecheck", "npm run typecheck", backend_dir))
        evidence["validation"].append(run_command(
            "reader_social_comment_preferences_postgres_test",
            "npx tsx --test --test-reporter=tap src/modules/interactions/reader-social-comment-preferences.postgres.test.ts",
            backend_dir,
            stack.db_env()
        ))
        asyncio.run(run_browser_flow(stack, fixture, password, evidence, evidence_dir))
    except Exception as error:
        failure = f"{type(error).__name__}: {error}"
        traceback.print_exc()
    finally:
        stack.stop()

    shared_after = fingerprint_shared()
    shared_changes = diff_fingerprints(shared_before, shared_after)
    leftovers = [name for name in shared_after["postgres_databases"] + shared_after["mongo_databases"] if name == run_name]
    evidence.update({
        "db_ownership": stack.ownership,
        "teardown_ok": stack.teardown_ok,
        "leftover_disposable_databases": leftovers,
        "shared_fingerprint_before": shared_before["sha256"],
        "shared_fingerprint_after": shared_after["sha256"],
        "shared_changes": shared_changes,
        "stack_logs": stack.config.work_dir,
        "failure": failure,
    })
    expected = ["interact_a", "interact_b", "interact_c", "interact_d", "interact_e", "interact_f", "interact_g", "interact_h"]
    passed = all(evidence["checkpoints"].get(key, {}).get("result") == "PASS" for key in expected)
    if failure is None and passed and stack.teardown_ok and not leftovers and not shared_changes:
        evidence["verdict"] = "PASS"

    with open(os.path.join(evidence_dir, "reader-social-comment-preferences-e2e-evidence.json"), "w", encoding="utf-8") as handle:
        json.dump(evidence, handle, indent=2, ensure_ascii=False)
    write_report(evidence, os.path.join(evidence_dir, "report.md"))

    print("\n" + "=" * 80)
    for key in expected:
        print(f"  {key}: {evidence['checkpoints'].get(key, {}).get('result', 'NOT RUN')}")
    print(f"  teardown_ok={stack.teardown_ok} shared_changes={shared_changes or 'none'} failure={failure or 'none'}")
    print(f"VERDICT = {evidence['verdict']}  (evidence: {evidence_dir})")
    print("=" * 80)
    return 0 if evidence["verdict"] == "PASS" else 1


def write_report(ev: Dict[str, Any], path: str) -> None:
    rows = "\n".join(
        f"| Interact-{key[-1].upper()} | {ev['checkpoints'].get(key, {}).get('result', 'NOT RUN')} |"
        for key in ["interact_a", "interact_b", "interact_c", "interact_d", "interact_e", "interact_f", "interact_g", "interact_h"]
    )
    validation = "\n".join(f"| `{v['name']}` | `{v['command']}` | {v['exit_code']} | {v['result']} |" for v in ev["validation"])
    report = f"""# READER-SOCIAL-COMMENT-PREFERENCES-E2E: {ev['verdict']}

- Code SHA: `{ev['tested_code_sha']}` (branch `{ev['branch']}`, uncommitted tracked changes: {ev['working_tree_dirty']})
- Disposable database (PostgreSQL + MongoDB): `{ev['disposable_database']}`; dropped: {ev['teardown_ok']}
- Shared database fingerprint: before `{ev['shared_fingerprint_before'][:16]}`, after `{ev['shared_fingerprint_after'][:16]}`, changed: {ev['shared_changes'] or 'none'}
- Failure: {ev['failure'] or 'none'}

| Checkpoint | Result |
|---|---|
{rows}

| Validation | Command | Exit | Result |
|---|---|---|---|
{validation}
"""
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(report)


if __name__ == "__main__":
    sys.exit(main())
