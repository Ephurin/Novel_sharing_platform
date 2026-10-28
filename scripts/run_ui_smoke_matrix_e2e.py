"""
Mounted-browser smoke matrix for the StoryCraft shell on a disposable stack.

For every viewport (375, 390, 1440 px) and colour scheme (light, dark) it checks, in headless Edge:
- guest: public library, the public author profile reached from a public novel, after reload and
  by direct URL, a public chapter, and that anonymous follow/donate/wallet calls are rejected;
- reader: role-aware navigation, novel detail, chapter prose readable on every reading background,
  logged-in author profile, logout through the avatar menu;
- author: navigation, novel workspace, writing IDE, own profile, logout;
- admin: admin home and moderation, logout.
Every page is also checked for horizontal overflow, the applied colour scheme and error states.

The run uses scripts/e2e_isolated_stack.py (own databases and ports; shared data untouched).
Usage (repo root):
  EPHURIN_ALLOW_TEST_DB_MUTATIONS=1 EPHURIN_E2E_DEMO_PASSWORD=... python scripts/run_ui_smoke_matrix_e2e.py
Optional: EPHURIN_E2E_BACKEND_PORT (4321), EPHURIN_E2E_WEB_PORT (5321), EPHURIN_E2E_EVIDENCE_DIR.
Exit codes: 0 PASS, 1 FAIL, 3 REFUSED (nothing was written).
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
from typing import Any, Dict, List, Optional

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import httpx
import psycopg
import websockets

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

VIEWPORTS = [(375, 812), (390, 844), (1440, 900)]
THEMES = ["light", "dark"]
READER, AUTHOR, ADMIN = "reader04@example.com", "reader03@example.com", "reader02@example.com"
NOVEL_SLUG = "sample-ashenhold-test-story"
READER_NAV = ["Khám phá", "Thư viện", "Lịch sử đọc", "Ví xu"]

SESSION_ROLE_JS = r"""(() => {
  const marker = document.querySelector('[data-testid="shell-session"]');
  if (marker) return marker.dataset.userRole || '';
  const text = document.querySelector('.web-topbar')?.innerText || '';
  const match = text.match(/\b(READER|AUTHOR|ADMIN)\b/);
  return match ? match[1] : '';
})()"""

PAGE_STATE_JS = r"""(() => {
  const text = document.body.innerText;
  return {
    path: location.pathname,
    theme: document.documentElement.dataset.theme || '',
    overflowPx: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
    errorState: /Something went wrong|Permission required/.test(text),
    heading: document.querySelector('h1')?.innerText.trim() || ''
  };
})()"""

# The author name sits below the profile banner; a wrapped name must not slide under it.
PROFILE_HEADING_CLEAR_JS = r"""(() => {
  const heading = document.querySelector('.sc-profile-heading h1')?.getBoundingClientRect();
  const banner = document.querySelector('.sc-profile-banner')?.getBoundingClientRect();
  return Boolean(heading && banner && heading.top >= banner.bottom - 1);
})()"""

# Stepper buttons of every NumberInput must sit inside their field.
NUMBER_STEPPERS_FIT_JS = r"""(() => {
  const roots = [...document.querySelectorAll('.mantine-NumberInput-root')];
  return roots.length > 0 && roots.every((root) => {
    const field = root.querySelector('input').getBoundingClientRect();
    return [...root.querySelectorAll('.mantine-NumberInput-controls button')].every((button) => {
      const b = button.getBoundingClientRect();
      return b.top >= field.top - 1 && b.bottom <= field.bottom + 1;
    });
  });
})()"""

PROSE_CONTRAST_JS = r"""(() => {
  const prose = document.querySelector('.chapter-prose');
  if (!prose) return null;
  const parse = (c) => (c.match(/[\d.]+/g) || []).map(Number);
  const channel = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  let bg = [255, 255, 255];
  for (let node = prose; node; node = node.parentElement) {
    const c = parse(getComputedStyle(node).backgroundColor);
    if (c.length >= 3 && (c.length < 4 || c[3] > 0.5)) { bg = c; break; }
  }
  const fg = parse(getComputedStyle(prose).color);
  const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
  return { ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100, color: getComputedStyle(prose).color, background: `rgb(${bg.slice(0, 3).join(', ')})`, textLength: prose.innerText.length };
})()"""


class Page:
    def __init__(self, ws_url: str):
        self.ws_url = ws_url
        self.ws = None
        self.msg_id = 0
        self.pending: Dict[int, asyncio.Future] = {}
        self.listener: Optional[asyncio.Task] = None

    async def connect(self, width: int, height: int, theme: str):
        self.ws = await websockets.connect(self.ws_url, max_size=30 * 1024 * 1024)
        self.listener = asyncio.create_task(self._listen())
        await self.call("Page.enable")
        await self.call("Runtime.enable")
        await self.call("Emulation.setDeviceMetricsOverride", {"width": width, "height": height, "deviceScaleFactor": 1, "mobile": width < 768})
        await self.call("Page.addScriptToEvaluateOnNewDocument", {
            "source": f"try {{ localStorage.setItem('storycraft-theme', {json.dumps(theme)}); }} catch (_) {{}}"
        })

    async def _listen(self):
        try:
            async for raw in self.ws:
                msg = json.loads(raw)
                if msg.get("id") in self.pending:
                    self.pending.pop(msg["id"]).set_result(msg)
        except Exception:
            pass

    async def call(self, method: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        self.msg_id += 1
        future = asyncio.get_running_loop().create_future()
        self.pending[self.msg_id] = future
        await self.ws.send(json.dumps({"id": self.msg_id, "method": method, "params": params or {}}))
        result = await asyncio.wait_for(future, timeout=35.0)
        if "error" in result:
            raise RuntimeError(f"CDP {method} error: {result['error']}")
        return result.get("result", {})

    async def evaluate(self, expression: str) -> Any:
        result = (await self.call("Runtime.evaluate", {"expression": expression, "returnByValue": True, "awaitPromise": True})).get("result", {})
        if result.get("subtype") == "error":
            raise RuntimeError(result.get("description"))
        return result.get("value")

    async def wait_for(self, condition: str, timeout: float = 15.0) -> Any:
        deadline = time.time() + timeout
        while time.time() < deadline:
            value = await self.evaluate(condition)
            if value:
                return value
            await asyncio.sleep(0.3)
        raise TimeoutError(f"Timed out waiting for {condition} at {await self.evaluate('location.href')}")

    async def goto(self, url: str, ready: str = "document.readyState === 'complete'"):
        await self.call("Page.navigate", {"url": url})
        await asyncio.sleep(0.4)
        await self.wait_for(ready)
        await asyncio.sleep(0.8)

    async def reload(self):
        await self.call("Page.reload")
        await asyncio.sleep(0.4)
        await self.wait_for("document.readyState === 'complete'")
        await asyncio.sleep(0.8)

    async def set_input(self, selector: str, value: str):
        await self.evaluate(f"""(() => {{
            const el = document.querySelector({json.dumps(selector)});
            if (!el) throw new Error('missing ' + {json.dumps(selector)});
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, {json.dumps(value)});
            el.dispatchEvent(new Event('input', {{ bubbles: true }}));
        }})()""")

    async def mouse_click(self, selector: str):
        point = await self.evaluate(f"""(() => {{
            const el = document.querySelector({json.dumps(selector)});
            if (!el) throw new Error('missing ' + {json.dumps(selector)});
            el.scrollIntoView({{ block: 'center' }});
            const r = el.getBoundingClientRect();
            return {{ x: r.left + r.width / 2, y: r.top + r.height / 2 }};
        }})()""")
        for event_type in ("mousePressed", "mouseReleased"):
            await self.call("Input.dispatchMouseEvent", {"type": event_type, "x": point["x"], "y": point["y"], "button": "left", "clickCount": 1})

    async def screenshot(self, path: str):
        data = (await self.call("Page.captureScreenshot", {"format": "png"})).get("data", "")
        with open(path, "wb") as handle:
            handle.write(base64.b64decode(data))

    async def close(self):
        if self.listener:
            self.listener.cancel()
        if self.ws:
            await self.ws.close()


class Matrix:
    def __init__(self, stack: IsolatedStack, fixture: Dict[str, str], password: str, evidence_dir: str):
        self.stack = stack
        self.fx = fixture
        self.password = password
        self.evidence_dir = evidence_dir
        self.results: List[Dict[str, Any]] = []
        self.page: Optional[Page] = None
        self.combo = ""
        self.theme = ""

    async def check(self, role: str, step: str, run, expect_path: Optional[str] = None) -> None:
        """Runs one step, then the page-level checks, and records PASS/FAIL without stopping the matrix."""
        record: Dict[str, Any] = {"combo": self.combo, "role": role, "step": step}
        try:
            detail = await run()
            state = await self.page.evaluate(PAGE_STATE_JS)
            problems = []
            if expect_path and not state["path"].startswith(expect_path):
                problems.append(f"path {state['path']} != {expect_path}")
            if state["theme"] != self.theme:
                problems.append(f"theme {state['theme']} != {self.theme}")
            if state["overflowPx"] > 1:
                problems.append(f"horizontal overflow {state['overflowPx']}px")
            if state["errorState"]:
                problems.append("error or permission state rendered")
            record.update({"path": state["path"], "detail": detail})
            record["result"] = "FAIL" if problems else "PASS"
            if problems:
                record["problems"] = problems
        except Exception as error:
            record.update({"result": "FAIL", "problems": [f"{type(error).__name__}: {error}"]})
        shot = f"{self.combo}-{role}-{step}.png".replace("/", "_")
        try:
            await self.page.screenshot(os.path.join(self.evidence_dir, shot))
            record["screenshot"] = shot
        except Exception:
            pass
        self.results.append(record)
        mark = "PASS" if record["result"] == "PASS" else f"FAIL {record.get('problems')}"
        print(f"  [{self.combo}] {role}/{step}: {mark}")

    async def api(self, method: str, path: str, token: bool = False, body: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Calls the API from the page origin, optionally with the stored session token."""
        return await self.page.evaluate(f"""(async () => {{
            const headers = {{ 'content-type': 'application/json' }};
            const token = localStorage.getItem('ephurin_access_token');
            if ({json.dumps(token)} && token) headers.Authorization = 'Bearer ' + token;
            const response = await fetch({json.dumps(self.stack.api_url + path)}, {{ method: {json.dumps(method)}, headers, body: {json.dumps(json.dumps(body)) if body else 'undefined'} }});
            let data = null; try {{ data = (await response.json()).data; }} catch (_) {{}}
            return {{ status: response.status, keys: data && typeof data === 'object' ? Object.keys(data) : [] }};
        }})()""")

    async def login(self, email: str, role: str, landing: str):
        web = self.stack.web_url
        await self.page.goto(f"{web}/login", "document.querySelector('input[type=\"password\"]') !== null")
        await self.page.set_input("input:not([type='password'])", email)
        await self.page.set_input("input[type='password']", self.password)
        await self.page.evaluate("[...document.querySelectorAll('button')].find(b => /login|đăng nhập/i.test(b.innerText)).click()")
        await self.page.wait_for(f"location.pathname.startsWith({json.dumps(landing)})", 20.0)
        await self.page.wait_for(f"{SESSION_ROLE_JS} === {json.dumps(role)}", 10.0)
        await asyncio.sleep(0.6)
        return {"session_role": await self.page.evaluate(SESSION_ROLE_JS)}

    async def logout(self):
        avatar = "[data-testid='shell-avatar-btn']"
        via = "visible button"
        if await self.page.evaluate(f"document.querySelector({json.dumps(avatar)}) !== null"):
            await self.page.mouse_click(avatar)
            await self.page.wait_for("document.querySelector(\"[data-testid='shell-logout-btn']\") !== null", 5.0)
            via = "avatar menu"
        await self.page.evaluate("document.querySelector(\"[data-testid='shell-logout-btn']\").click()")
        await self.page.wait_for("location.pathname === '/login'", 10.0)
        assert await self.page.evaluate("localStorage.getItem('ephurin_access_token') === null"), "token kept after logout"
        return {"logout_via": via}

    async def nav_labels(self) -> List[str]:
        return await self.page.evaluate("[...document.querySelectorAll('.sc-global-nav a')].map(a => a.innerText.trim())")

    async def run_combo(self, width: int, height: int, theme: str, debug_port: int):
        self.combo, self.theme = f"{width}-{theme}", theme
        web, fx = self.stack.web_url, self.fx
        user_dir = os.path.join(tempfile.gettempdir(), f"edge-smoke-{uuid.uuid4().hex[:8]}")
        edge = subprocess.Popen([EDGE_PATH, "--headless=new", f"--remote-debugging-port={debug_port}", f"--user-data-dir={user_dir}",
                                 "--disable-gpu", "--no-first-run", "--no-default-browser-check", "about:blank"])
        try:
            await asyncio.sleep(2.5)
            target = next(t for t in httpx.get(f"http://127.0.0.1:{debug_port}/json").json() if t.get("type") == "page")
            self.page = Page(target["webSocketDebuggerUrl"])
            await self.page.connect(width, height, theme)
            author_path = f"/authors/{fx['author_id']}"

            # Guest
            async def public_library():
                await self.page.goto(f"{web}/public", "document.querySelector('.sc-global-nav') !== null")
                assert await self.page.evaluate("!document.querySelector('[data-testid=\"shell-session\"]')"), "guest has a session marker"
                return {"nav": await self.nav_labels()}
            await self.check("guest", "public-library", public_library, "/public")

            async def author_from_public_novel():
                await self.page.goto(f"{web}/public/novels/{fx['novel_id']}", f"document.querySelector('a[href=\"{author_path}\"]') !== null")
                await self.page.evaluate(f"document.querySelector('a[href=\"{author_path}\"]').click()")
                return await self.assert_guest_profile(author_path)
            await self.check("guest", "author-from-public-novel", author_from_public_novel, author_path)

            async def author_after_reload():
                await self.page.reload()
                return await self.assert_guest_profile(author_path)
            await self.check("guest", "author-after-reload", author_after_reload, author_path)

            async def author_direct_url():
                await self.page.goto(f"{web}{author_path}")
                return await self.assert_guest_profile(author_path)
            await self.check("guest", "author-direct-url", author_direct_url, author_path)

            async def public_chapter():
                await self.page.goto(f"{web}/public/chapters/{fx['chapter_id']}", "document.querySelector('.chapter-prose') !== null")
                prose = await self.page.evaluate(PROSE_CONTRAST_JS)
                assert prose["textLength"] > 200 and prose["ratio"] >= 4.5, f"prose not readable: {prose}"
                return {"prose": prose}
            await self.check("guest", "public-chapter", public_chapter, "/public/chapters/")

            async def anonymous_api_negatives():
                results = {
                    "follow": await self.api("POST", f"/authors/{fx['author_id']}/follow"),
                    "donate": await self.api("POST", f"/authors/{fx['author_id']}/donations", body={"amountCoins": 10}),
                    "wallet": await self.api("GET", "/wallet/me"),
                    "profile": await self.api("GET", f"/authors/{fx['author_id']}/profile"),
                    "reader_profile": await self.api("GET", f"/authors/{fx['reader_id']}/profile"),
                }
                assert results["follow"]["status"] == 401 and results["donate"]["status"] == 401 and results["wallet"]["status"] == 401, results
                assert results["profile"]["status"] == 200 and "email" not in results["profile"]["keys"], results
                assert results["reader_profile"]["status"] == 404, results
                return {name: value["status"] for name, value in results.items()}
            await self.check("guest", "anonymous-api-negatives", anonymous_api_negatives)

            # Reader
            await self.check("reader", "login", lambda: self.login(READER, "READER", "/reader"), "/reader")

            async def reader_nav():
                labels = await self.nav_labels()
                assert labels == READER_NAV, f"reader nav {labels}"
                return {"nav": labels}
            await self.check("reader", "navigation", reader_nav)

            async def reader_novel():
                await self.page.goto(f"{web}/reader/novels/{fx['novel_id']}", "document.querySelector('[data-testid=\"reader-like-btn\"]') !== null")
                return {"heading": await self.page.evaluate("document.querySelector('h1')?.innerText")}
            await self.check("reader", "novel-detail", reader_novel, "/reader/novels/")

            for background in ["SEPIA", "DARK", "LIGHT"]:
                async def chapter_prose(background=background):
                    saved = await self.api("PUT", "/reading/preferences/me", token=True,
                                           body={"fontFamily": "Georgia", "fontSize": 18, "background": background, "lineHeight": 1.8})
                    assert saved["status"] == 200, saved
                    await self.page.goto(f"{web}/reader/chapters/{fx['chapter_id']}", "document.querySelector('.chapter-prose') !== null && document.querySelector('[data-testid=\"reader-save-preferences-btn\"]') !== null")
                    prose = await self.page.evaluate(PROSE_CONTRAST_JS)
                    assert prose["textLength"] > 200 and prose["ratio"] >= 4.5, f"prose not readable on {background}: {prose}"
                    assert await self.page.evaluate(NUMBER_STEPPERS_FIT_JS), "number stepper buttons overflow their field"
                    return {"background": background, "prose": prose}
                await self.check("reader", f"chapter-prose-{background.lower()}", chapter_prose, "/reader/chapters/")

            async def reader_author_profile():
                await self.page.goto(f"{web}{author_path}", "document.querySelector('h1') !== null")
                has_follow = await self.page.evaluate("[...document.querySelectorAll('button')].some(b => b.innerText.includes('Theo dõi'))")
                has_cta = await self.page.evaluate("Boolean(document.querySelector('[data-testid=\"author-profile-login-cta\"]'))")
                assert has_follow and not has_cta, f"follow={has_follow} login_cta={has_cta}"
                assert await self.page.evaluate(PROFILE_HEADING_CLEAR_JS), "author name is covered by the profile banner"
                return {"follow_button": has_follow}
            await self.check("reader", "author-profile", reader_author_profile, author_path)
            await self.check("reader", "logout", self.logout, "/login")

            # Author
            await self.check("author", "login", lambda: self.login(AUTHOR, "AUTHOR", "/author"), "/author")

            async def author_nav():
                labels = await self.nav_labels()
                assert "Tác phẩm" in labels, f"author nav {labels}"
                return {"nav": labels}
            await self.check("author", "navigation", author_nav)

            async def author_workspace():
                await self.page.goto(f"{web}/author/novels/{fx['novel_id']}")
                await self.page.wait_for(f"document.body.innerText.includes({json.dumps(fx['novel_title'])})")
                return {}
            await self.check("author", "novel-workspace", author_workspace, "/author/novels/")

            async def author_ide():
                await self.page.goto(f"{web}/author/ide?novelId={fx['novel_id']}")
                await self.page.wait_for("document.querySelector('textarea, [contenteditable=\"true\"]') !== null", 20.0)
                return {}
            await self.check("author", "writing-ide", author_ide, "/author/ide")

            async def author_own_profile():
                await self.page.goto(f"{web}{author_path}", "document.querySelector('h1') !== null")
                assert await self.page.evaluate("document.body.innerText.includes('Chỉnh sửa hồ sơ')"), "own profile edit link missing"
                assert await self.page.evaluate(PROFILE_HEADING_CLEAR_JS), "author name is covered by the profile banner"
                return {}
            await self.check("author", "own-public-profile", author_own_profile, author_path)
            await self.check("author", "logout", self.logout, "/login")

            # Admin
            await self.check("admin", "login", lambda: self.login(ADMIN, "ADMIN", "/admin"), "/admin")

            async def admin_moderation():
                await self.page.goto(f"{web}/admin/moderation")
                await asyncio.sleep(1.0)
                return {"session_role": await self.page.evaluate(SESSION_ROLE_JS)}
            await self.check("admin", "moderation", admin_moderation, "/admin")
            await self.check("admin", "logout", self.logout, "/login")
        finally:
            if self.page:
                await self.page.close()
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(edge.pid)], capture_output=True)
            shutil.rmtree(user_dir, ignore_errors=True)

    async def assert_guest_profile(self, author_path: str) -> Dict[str, Any]:
        await self.page.wait_for(f"location.pathname === {json.dumps(author_path)} && document.querySelector('h1') !== null")
        state = await self.page.evaluate("""(() => ({
            heading: document.querySelector('h1')?.innerText.trim(),
            loginCta: document.querySelector('[data-testid="author-profile-login-cta"]')?.getAttribute('href'),
            followButton: [...document.querySelectorAll('button')].some(b => b.innerText.includes('Theo dõi')),
            supportButton: [...document.querySelectorAll('button')].some(b => b.innerText.includes('Ủng hộ')),
            workLinks: [...new Set([...document.querySelectorAll('main a[href*="/novels/"]')].map(a => a.getAttribute('href')))],
            token: localStorage.getItem('ephurin_access_token')
        }))()""")
        assert state["heading"] == self.fx["author_name"], f"heading {state['heading']!r}"
        assert state["loginCta"] == "/login" and not state["followButton"] and not state["supportButton"], state
        assert state["workLinks"] and all(link.startswith("/public/novels/") for link in state["workLinks"]), state
        assert state["token"] is None, "guest has a token"
        assert await self.page.evaluate(PROFILE_HEADING_CLEAR_JS), "author name is covered by the profile banner"
        return state


def resolve_fixture(pg_url: str) -> Dict[str, str]:
    with psycopg.connect(pg_url) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT novel_id, title, author_id FROM novels WHERE slug = %s", (NOVEL_SLUG,))
            novel_id, title, author_id = cur.fetchone()
            cur.execute("SELECT chapter_id FROM chapters WHERE novel_id = %s AND chapter_number = 1", (novel_id,))
            chapter_id = cur.fetchone()[0]
            cur.execute("SELECT coalesce(p.display_name, u.username) FROM users u JOIN user_profiles p ON p.user_id = u.user_id WHERE u.user_id = %s", (author_id,))
            author_name = cur.fetchone()[0]
            cur.execute("SELECT u.user_id, u.email FROM users u WHERE u.email IN (%s, %s)", (READER, AUTHOR))
            ids = {email: str(user_id) for user_id, email in cur.fetchall()}
            assert ids.get(AUTHOR) == str(author_id), "seeded author is not the novel's author"
    return {"novel_id": str(novel_id), "novel_title": title, "author_id": str(author_id), "author_name": author_name,
            "chapter_id": str(chapter_id), "reader_id": ids[READER]}


def git_info() -> Dict[str, Any]:
    git = os.environ.get("GIT_EXECUTABLE") or shutil.which("git") or "git"

    def run(args: str) -> str:
        return subprocess.run(f'"{git}" {args}', shell=True, capture_output=True, text=True, cwd=REPO_ROOT).stdout.strip()
    return {"head_sha": run("rev-parse HEAD"), "branch": run("rev-parse --abbrev-ref HEAD"),
            "working_tree_dirty": bool(run("status --porcelain --untracked-files=no"))}


def main() -> int:
    stack = IsolatedStack(config_from_env("smoke", default_backend_port=4321, default_web_port=5321))
    try:
        stack.preflight()
    except RefusedError as error:
        print(f"REFUSED: {error}. Nothing was written.")
        return REFUSED_EXIT_CODE
    password = os.environ.get("EPHURIN_E2E_DEMO_PASSWORD")
    if not password:
        print("REFUSED: missing EPHURIN_E2E_DEMO_PASSWORD. Nothing was written.")
        return REFUSED_EXIT_CODE

    evidence_dir = os.environ.get("EPHURIN_E2E_EVIDENCE_DIR") or os.path.join(tempfile.gettempdir(), "ephurin-e2e", stack.config.db_name)
    os.makedirs(evidence_dir, exist_ok=True)
    info = git_info()
    print(f"UI SMOKE MATRIX  branch={info['branch']} head={info['head_sha']} db={stack.config.db_name}")
    shared_before = fingerprint_shared()
    matrix: Optional[Matrix] = None
    failure = None
    try:
        stack.start()
        matrix = Matrix(stack, resolve_fixture(stack.pg_url), password, evidence_dir)
        for index, (width, height) in enumerate(VIEWPORTS):
            for theme_index, theme in enumerate(THEMES):
                asyncio.run(matrix.run_combo(width, height, theme, 9350 + index * 2 + theme_index))
    except Exception as error:
        failure = f"{type(error).__name__}: {error}"
        traceback.print_exc()
    finally:
        stack.stop()
    shared_after = fingerprint_shared()
    results = matrix.results if matrix else []
    failed = [r for r in results if r["result"] != "PASS"]
    evidence = {
        "gate": "UI-SMOKE-MATRIX", "tested_code_sha": info["head_sha"], "branch": info["branch"],
        "working_tree_dirty": info["working_tree_dirty"], "disposable_database": stack.config.db_name,
        "stack_steps": stack.steps, "db_ownership": stack.ownership, "teardown_ok": stack.teardown_ok,
        "shared_fingerprint_before": shared_before["sha256"], "shared_fingerprint_after": shared_after["sha256"],
        "shared_changes": diff_fingerprints(shared_before, shared_after), "failure": failure,
        "checks_total": len(results), "checks_failed": len(failed), "results": results,
    }
    evidence["verdict"] = "PASS" if results and not failed and failure is None and stack.teardown_ok and not evidence["shared_changes"] else "FAIL"
    with open(os.path.join(evidence_dir, "ui-smoke-matrix-evidence.json"), "w", encoding="utf-8") as handle:
        json.dump(evidence, handle, indent=2, ensure_ascii=False)
    print(f"\nChecks: {len(results) - len(failed)}/{len(results)} PASS; teardown_ok={stack.teardown_ok}; shared_changes={evidence['shared_changes'] or 'none'}")
    for record in failed:
        print(f"  FAIL {record['combo']} {record['role']}/{record['step']}: {record.get('problems')}")
    print(f"VERDICT = {evidence['verdict']}  (evidence: {evidence_dir})")
    return 0 if evidence["verdict"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
