"""
Automated Product UI Reconnaissance & Inventory Runner
Gate: PRODUCT-UI-INTEGRATION-INVENTORY
Performs CDP browser reconnaissance across all major web surfaces for:
  - Anonymous visitor
  - Reader (reader04@example.com)
  - Author (reader03@example.com)
  - Admin (reader02@example.com)
Captures DOM rendered state, network calls, API correlation, and screenshots.
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
import websockets

BACKEND_URL = "http://localhost:4000/api/v1"
WEB_URL = "http://127.0.0.1:5173"
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCREENSHOT_DIR = os.path.join(REPO_ROOT, "docs", "development", "PRODUCT-UI-INTEGRATION-INVENTORY")
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

EDGE_PATH = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

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
        res = await asyncio.wait_for(fut, timeout=25.0)
        del self.pending_responses[call_id]
        if "error" in res:
            raise RuntimeError(f"CDP call {method} error: {res['error']}")
        return res.get("result", {})

    async def navigate(self, path: str, wait_seconds: float = 2.0):
        url = f"{WEB_URL}{path}"
        print(f"  [Navigating] {url}")
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

    async def screenshot(self, filename: str) -> str:
        res = await self.call("Page.captureScreenshot", {"format": "png"})
        b64data = res.get("data", "")
        file_path = os.path.join(SCREENSHOT_DIR, filename)
        with open(file_path, "wb") as f:
            f.write(base64.b64decode(b64data))
        print(f"  [Screenshot] Saved: {filename}")
        return filename

    async def get_rendered_info(self) -> Dict[str, Any]:
        info = await self.evaluate("""
            (() => {
                const title = document.title;
                const h1 = document.querySelector('h1')?.innerText || '';
                const h2 = document.querySelector('h2')?.innerText || '';
                const h3 = document.querySelector('h3')?.innerText || '';
                const bodyText = document.body.innerText.slice(0, 500);
                const buttons = Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean);
                const inputs = Array.from(document.querySelectorAll('input')).map(i => ({
                    placeholder: i.placeholder,
                    value: i.value,
                    type: i.type
                }));
                const links = Array.from(document.querySelectorAll('a')).map(a => ({
                    text: a.innerText.trim(),
                    href: a.getAttribute('href')
                })).filter(l => l.text);
                const cards = document.querySelectorAll('.mantine-Paper-root, .mantine-Card-root').length;
                return {
                    url: window.location.pathname + window.location.search,
                    title,
                    headers: [h1, h2, h3].filter(Boolean),
                    bodySnippet: bodyText,
                    buttons: buttons.slice(0, 10),
                    inputs: inputs.slice(0, 5),
                    links: links.slice(0, 10),
                    cardCount: cards
                };
            })()
        """)
        return info

    def get_api_requests(self) -> List[Dict[str, Any]]:
        requests = []
        for ev in self.network_events:
            if ev.get("method") == "Network.requestWillBeSent":
                req = ev.get("params", {}).get("request", {})
                url = req.get("url", "")
                if "/api/v1" in url or ":4000" in url or ":8000" in url:
                    requests.append({
                        "method": req.get("method"),
                        "url": url,
                        "requestId": ev.get("params", {}).get("requestId")
                    })
        return requests

    async def close(self):
        if self._listener_task:
            self._listener_task.cancel()
        if self.ws:
            await self.ws.close()


async def set_auth_session(browser: CDPBrowser, token: str, user: Dict[str, Any]):
    user_json = json.dumps(user)
    await browser.evaluate(f"""
        (() => {{
            localStorage.setItem('ephurin_access_token', '{token}');
            localStorage.setItem('ephurin_user', JSON.stringify({user_json}));
            // Also update zustand auth store state in localStorage if present
        }})()
    """)


async def clear_auth_session(browser: CDPBrowser):
    await browser.evaluate("""
        (() => {
            localStorage.clear();
            sessionStorage.clear();
        })()
    """)


async def run_reconnaissance():
    print("=" * 80)
    print("STARTING COMPREHENSIVE PRODUCT UI RECONNAISSANCE")
    print("=" * 80)

    # 1. Fetch test tokens and user data for all 3 seeded accounts
    print("\n[Setup] Authenticating test accounts...")
    accounts = {}
    async with httpx.AsyncClient(base_url=BACKEND_URL) as client:
        for ident, pwd, role_key in [
            ("reader04@example.com", "StrongPassword123!", "reader"),
            ("reader03@example.com", "StrongPassword123!", "author"),
            ("reader02@example.com", "StrongPassword123!", "admin")
        ]:
            resp = await client.post("/auth/login", json={"identifier": ident, "password": pwd})
            assert resp.status_code == 200, f"Login failed for {ident}: {resp.text}"
            data = resp.json()["data"]
            accounts[role_key] = {
                "token": data["accessToken"],
                "user": data["user"]
            }
            print(f"  {role_key.upper()}: userId={data['user']['userId']}, email={data['user']['email']}, role={data['user']['role']}")

    # 2. Launch Edge CDP
    DEBUG_PORT = 9444
    user_data_dir = os.path.join(tempfile.gettempdir(), f"edge-recon-{uuid.uuid4().hex[:8]}")
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

    recon_results = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "surfaces": []
    }

    try:
        res = httpx.get(f"http://127.0.0.1:{DEBUG_PORT}/json")
        targets = res.json()
        page_target = next((t for t in targets if t.get("type") == "page"), targets[0])
        ws_url = page_target["webSocketDebuggerUrl"]
        browser = CDPBrowser(ws_url)
        await browser.connect()

        # =================================================================
        # TEST SUITE 1: ANONYMOUS VISITOR
        # =================================================================
        print("\n" + "=" * 60)
        print("SUITE 1: ANONYMOUS VISITOR RECONNAISSANCE")
        print("=" * 60)

        await browser.navigate("/login", wait_seconds=1.5)
        await clear_auth_session(browser)

        # 1.1 /login
        print("\n--- Route: /login (Anonymous) ---")
        await browser.navigate("/login", wait_seconds=2.0)
        rendered = await browser.get_rendered_info()
        api_reqs = browser.get_api_requests()
        ss = await browser.screenshot("anon-01-login.png")
        recon_results["surfaces"].append({
            "route": "/login",
            "identity": "anonymous",
            "rendered": rendered,
            "api_requests": api_reqs,
            "screenshot": ss
        })

        # Test toggle register
        await browser.evaluate("document.querySelectorAll('button')[1]?.click()")
        await asyncio.sleep(0.5)
        reg_rendered = await browser.get_rendered_info()

        # 1.2 /public
        print("\n--- Route: /public (Anonymous Reader Discovery) ---")
        await browser.navigate("/public", wait_seconds=2.5)
        rendered = await browser.get_rendered_info()
        api_reqs = browser.get_api_requests()
        ss = await browser.screenshot("anon-02-public-library.png")
        recon_results["surfaces"].append({
            "route": "/public",
            "identity": "anonymous",
            "rendered": rendered,
            "api_requests": api_reqs,
            "screenshot": ss
        })

        # 1.3 /public/novels/81b923d7-5507-48ea-9a84-5303fd1de5f4 (Ashenhold Sample Novel)
        print("\n--- Route: /public/novels/:novelId (Anonymous Novel Detail) ---")
        await browser.navigate("/public/novels/81b923d7-5507-48ea-9a84-5303fd1de5f4", wait_seconds=2.5)
        rendered = await browser.get_rendered_info()
        api_reqs = browser.get_api_requests()
        ss = await browser.screenshot("anon-03-public-novel-detail.png")
        recon_results["surfaces"].append({
            "route": "/public/novels/81b923d7-5507-48ea-9a84-5303fd1de5f4",
            "identity": "anonymous",
            "rendered": rendered,
            "api_requests": api_reqs,
            "screenshot": ss
        })

        # 1.4 /public/chapters/c660bede-0493-4a46-97f2-6d01c8ddd3db (Chapter 1)
        print("\n--- Route: /public/chapters/:chapterId (Anonymous Chapter Reader) ---")
        await browser.navigate("/public/chapters/c660bede-0493-4a46-97f2-6d01c8ddd3db", wait_seconds=2.5)
        rendered = await browser.get_rendered_info()
        api_reqs = browser.get_api_requests()
        ss = await browser.screenshot("anon-04-public-chapter-reader.png")
        recon_results["surfaces"].append({
            "route": "/public/chapters/c660bede-0493-4a46-97f2-6d01c8ddd3db",
            "identity": "anonymous",
            "rendered": rendered,
            "api_requests": api_reqs,
            "screenshot": ss
        })

        # 1.5 Anonymous redirection guard test on protected routes
        for protected_path in ["/author", "/reader", "/admin", "/wallet", "/profile/me"]:
            print(f"\n--- Testing AuthGate guard: {protected_path} (Anonymous) ---")
            await browser.navigate(protected_path, wait_seconds=1.5)
            current_loc = await browser.evaluate("window.location.pathname")
            print(f"  Navigated to {protected_path} -> Observed URL: {current_loc}")
            assert current_loc == "/login", f"Expected redirect to /login but got {current_loc}"

        # =================================================================
        # TEST SUITE 2: AUTHENTICATED READER (reader04@example.com)
        # =================================================================
        print("\n" + "=" * 60)
        print("SUITE 2: READER RECONNAISSANCE")
        print("=" * 60)

        # Perform UI login as reader04
        await browser.navigate("/login", wait_seconds=1.5)
        await browser.evaluate("""
            (() => {
                const setVal = (el, val) => {
                    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                    setter.call(el, val);
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                };
                const inputs = document.querySelectorAll('input');
                setVal(inputs[0], 'reader04@example.com');
                setVal(inputs[1], 'StrongPassword123!');
                const buttons = document.querySelectorAll('button');
                buttons[0].click(); // Login
            })()
        """)
        await asyncio.sleep(3.0)
        after_login_url = await browser.evaluate("window.location.pathname")
        print(f"  Reader login -> Redirected to: {after_login_url}")
        if after_login_url == "/login":
            # If still on /login, set token in localStorage and reload
            token = accounts['reader']['token']
            user = accounts['reader']['user']
            await set_auth_session(browser, token, user)
            await browser.navigate("/reader", wait_seconds=2.0)

        # 2.1 /reader (Authenticated Reader Home & Discovery)
        print("\n--- Route: /reader (Reader Home) ---")
        rendered = await browser.get_rendered_info()
        api_reqs = browser.get_api_requests()
        ss = await browser.screenshot("reader-01-home.png")
        recon_results["surfaces"].append({
            "route": "/reader",
            "identity": "reader",
            "rendered": rendered,
            "api_requests": api_reqs,
            "screenshot": ss
        })

        # 2.2 /reader/novels/81b923d7-5507-48ea-9a84-5303fd1de5f4
        print("\n--- Route: /reader/novels/:novelId (Reader Novel Detail) ---")
        await browser.navigate("/reader/novels/81b923d7-5507-48ea-9a84-5303fd1de5f4", wait_seconds=2.5)
        rendered = await browser.get_rendered_info()
        api_reqs = browser.get_api_requests()
        ss = await browser.screenshot("reader-02-novel-detail.png")
        recon_results["surfaces"].append({
            "route": "/reader/novels/81b923d7-5507-48ea-9a84-5303fd1de5f4",
            "identity": "reader",
            "rendered": rendered,
            "api_requests": api_reqs,
            "screenshot": ss
        })

        # 2.3 /reader/chapters/c660bede-0493-4a46-97f2-6d01c8ddd3db
        print("\n--- Route: /reader/chapters/:chapterId (Reader Chapter Reader + Comments) ---")
        await browser.navigate("/reader/chapters/c660bede-0493-4a46-97f2-6d01c8ddd3db", wait_seconds=2.5)
        rendered = await browser.get_rendered_info()
        api_reqs = browser.get_api_requests()
        ss = await browser.screenshot("reader-03-chapter-reader.png")
        recon_results["surfaces"].append({
            "route": "/reader/chapters/c660bede-0493-4a46-97f2-6d01c8ddd3db",
            "identity": "reader",
            "rendered": rendered,
            "api_requests": api_reqs,
            "screenshot": ss
        })

        # 2.4 /reader/library
        print("\n--- Route: /reader/library (Reader Library) ---")
        await browser.navigate("/reader/library", wait_seconds=2.0)
        rendered = await browser.get_rendered_info()
        api_reqs = browser.get_api_requests()
        ss = await browser.screenshot("reader-04-library.png")
        recon_results["surfaces"].append({
            "route": "/reader/library",
            "identity": "reader",
            "rendered": rendered,
            "api_requests": api_reqs,
            "screenshot": ss
        })

        # 2.5 /reader/history
        print("\n--- Route: /reader/history (Reader History) ---")
        await browser.navigate("/reader/history", wait_seconds=2.0)
        rendered = await browser.get_rendered_info()
        api_reqs = browser.get_api_requests()
        ss = await browser.screenshot("reader-05-history.png")
        recon_results["surfaces"].append({
            "route": "/reader/history",
            "identity": "reader",
            "rendered": rendered,
            "api_requests": api_reqs,
            "screenshot": ss
        })

        # 2.6 /wallet
        print("\n--- Route: /wallet (Reader Wallet) ---")
        await browser.navigate("/wallet", wait_seconds=2.0)
        rendered = await browser.get_rendered_info()
        api_reqs = browser.get_api_requests()
        ss = await browser.screenshot("reader-06-wallet.png")
        recon_results["surfaces"].append({
            "route": "/wallet",
            "identity": "reader",
            "rendered": rendered,
            "api_requests": api_reqs,
            "screenshot": ss
        })

        # 2.7 /notifications
        print("\n--- Route: /notifications (Reader Notifications) ---")
        await browser.navigate("/notifications", wait_seconds=2.0)
        rendered = await browser.get_rendered_info()
        api_reqs = browser.get_api_requests()
        ss = await browser.screenshot("reader-07-notifications.png")
        recon_results["surfaces"].append({
            "route": "/notifications",
            "identity": "reader",
            "rendered": rendered,
            "api_requests": api_reqs,
            "screenshot": ss
        })

        # 2.8 /profile/me
        print("\n--- Route: /profile/me (Reader Profile) ---")
        await browser.navigate("/profile/me", wait_seconds=2.0)
        rendered = await browser.get_rendered_info()
        api_reqs = browser.get_api_requests()
        ss = await browser.screenshot("reader-08-profile.png")
        recon_results["surfaces"].append({
            "route": "/profile/me",
            "identity": "reader",
            "rendered": rendered,
            "api_requests": api_reqs,
            "screenshot": ss
        })

        # 2.9 /authors/51ca9a66-d798-4f6c-8518-11c085678e4f
        print("\n--- Route: /authors/:authorId (Public Author Profile) ---")
        await browser.navigate("/authors/51ca9a66-d798-4f6c-8518-11c085678e4f", wait_seconds=2.0)
        rendered = await browser.get_rendered_info()
        api_reqs = browser.get_api_requests()
        ss = await browser.screenshot("reader-09-author-profile.png")
        recon_results["surfaces"].append({
            "route": "/authors/51ca9a66-d798-4f6c-8518-11c085678e4f",
            "identity": "reader",
            "rendered": rendered,
            "api_requests": api_reqs,
            "screenshot": ss
        })

        # 2.10 RoleGuard checks for Reader accessing Author/Admin
        for restricted in ["/author", "/admin"]:
            print(f"\n--- Testing RoleGuard on {restricted} for Reader ---")
            await browser.navigate(restricted, wait_seconds=1.5)
            body_text = await browser.evaluate("document.body.innerText")
            print(f"  Accessing {restricted} -> Body snippet: {body_text[:120]}...")
            assert "Permission Required" in body_text or "not have permission" in body_text or "AUTHOR" in body_text or "ADMIN" in body_text

        # =================================================================
        # TEST SUITE 3: AUTHENTICATED AUTHOR (reader03@example.com)
        # =================================================================
        print("\n" + "=" * 60)
        print("SUITE 3: AUTHOR RECONNAISSANCE")
        print("=" * 60)

        # Logout & login as author
        await clear_auth_session(browser)
        await browser.navigate("/login", wait_seconds=1.5)
        await browser.evaluate("""
            (() => {
                const setVal = (el, val) => {
                    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                    setter.call(el, val);
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                };
                const inputs = document.querySelectorAll('input');
                setVal(inputs[0], 'reader03@example.com');
                setVal(inputs[1], 'StrongPassword123!');
                const buttons = document.querySelectorAll('button');
                buttons[0].click();
            })()
        """)
        await asyncio.sleep(3.0)
        after_login_url = await browser.evaluate("window.location.pathname")
        print(f"  Author login -> Redirected to: {after_login_url}")
        if after_login_url == "/login":
            token = accounts['author']['token']
            user = accounts['author']['user']
            await set_auth_session(browser, token, user)
            await browser.navigate("/author", wait_seconds=2.0)

        # 3.1 /author (Author Projects Dashboard)
        print("\n--- Route: /author (Author Projects) ---")
        rendered = await browser.get_rendered_info()
        api_reqs = browser.get_api_requests()
        ss = await browser.screenshot("author-01-projects.png")
        recon_results["surfaces"].append({
            "route": "/author",
            "identity": "author",
            "rendered": rendered,
            "api_requests": api_reqs,
            "screenshot": ss
        })

        # 3.2 /author/novels/81b923d7-5507-48ea-9a84-5303fd1de5f4 (Author Novel Metadata & Chapters)
        print("\n--- Route: /author/novels/:novelId (Author Novel Metadata) ---")
        await browser.navigate("/author/novels/81b923d7-5507-48ea-9a84-5303fd1de5f4", wait_seconds=2.5)
        rendered = await browser.get_rendered_info()
        api_reqs = browser.get_api_requests()
        ss = await browser.screenshot("author-02-novel-metadata.png")
        recon_results["surfaces"].append({
            "route": "/author/novels/81b923d7-5507-48ea-9a84-5303fd1de5f4",
            "identity": "author",
            "rendered": rendered,
            "api_requests": api_reqs,
            "screenshot": ss
        })

        # 3.3 /author/context/81b923d7-5507-48ea-9a84-5303fd1de5f4 (Story Context / Story Bible)
        print("\n--- Route: /author/context/:novelId (Author Story Context / Story Bible) ---")
        await browser.navigate("/author/context/81b923d7-5507-48ea-9a84-5303fd1de5f4", wait_seconds=2.5)
        rendered = await browser.get_rendered_info()
        api_reqs = browser.get_api_requests()
        ss = await browser.screenshot("author-03-story-context.png")
        recon_results["surfaces"].append({
            "route": "/author/context/81b923d7-5507-48ea-9a84-5303fd1de5f4",
            "identity": "author",
            "rendered": rendered,
            "api_requests": api_reqs,
            "screenshot": ss
        })

        # 3.4 /author/import/81b923d7-5507-48ea-9a84-5303fd1de5f4 (Manuscript Import)
        print("\n--- Route: /author/import/:novelId (Manuscript Import) ---")
        await browser.navigate("/author/import/81b923d7-5507-48ea-9a84-5303fd1de5f4", wait_seconds=2.5)
        rendered = await browser.get_rendered_info()
        api_reqs = browser.get_api_requests()
        ss = await browser.screenshot("author-04-manuscript-import.png")
        recon_results["surfaces"].append({
            "route": "/author/import/81b923d7-5507-48ea-9a84-5303fd1de5f4",
            "identity": "author",
            "rendered": rendered,
            "api_requests": api_reqs,
            "screenshot": ss
        })

        # 3.5 /author/ide (Author Writing IDE)
        print("\n--- Route: /author/ide (Author Writing IDE) ---")
        await browser.navigate("/author/ide?novelId=81b923d7-5507-48ea-9a84-5303fd1de5f4&chapterId=c660bede-0493-4a46-97f2-6d01c8ddd3db", wait_seconds=3.0)
        rendered = await browser.get_rendered_info()
        api_reqs = browser.get_api_requests()
        ss = await browser.screenshot("author-05-writing-ide.png")
        recon_results["surfaces"].append({
            "route": "/author/ide",
            "identity": "author",
            "rendered": rendered,
            "api_requests": api_reqs,
            "screenshot": ss
        })

        # =================================================================
        # TEST SUITE 4: AUTHENTICATED ADMIN (reader02@example.com)
        # =================================================================
        print("\n" + "=" * 60)
        print("SUITE 4: ADMIN RECONNAISSANCE")
        print("=" * 60)

        # Logout & login as admin
        await clear_auth_session(browser)
        await browser.navigate("/login", wait_seconds=1.5)
        await browser.evaluate("""
            (() => {
                const setVal = (el, val) => {
                    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                    setter.call(el, val);
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                };
                const inputs = document.querySelectorAll('input');
                setVal(inputs[0], 'reader02@example.com');
                setVal(inputs[1], 'StrongPassword123!');
                const buttons = document.querySelectorAll('button');
                buttons[0].click();
            })()
        """)
        await asyncio.sleep(3.0)
        after_login_url = await browser.evaluate("window.location.pathname")
        print(f"  Admin login -> Redirected to: {after_login_url}")
        if after_login_url == "/login":
            token = accounts['admin']['token']
            user = accounts['admin']['user']
            await set_auth_session(browser, token, user)
            await browser.navigate("/admin", wait_seconds=2.0)

        # 4.1 /admin (Overview)
        print("\n--- Route: /admin (Admin Console Overview) ---")
        rendered = await browser.get_rendered_info()
        api_reqs = browser.get_api_requests()
        ss = await browser.screenshot("admin-01-overview.png")
        recon_results["surfaces"].append({
            "route": "/admin",
            "identity": "admin",
            "rendered": rendered,
            "api_requests": api_reqs,
            "screenshot": ss
        })

        # 4.2 /admin/users
        print("\n--- Route: /admin/users (Admin User Management) ---")
        await browser.navigate("/admin/users", wait_seconds=2.0)
        rendered = await browser.get_rendered_info()
        api_reqs = browser.get_api_requests()
        ss = await browser.screenshot("admin-02-users.png")
        recon_results["surfaces"].append({
            "route": "/admin/users",
            "identity": "admin",
            "rendered": rendered,
            "api_requests": api_reqs,
            "screenshot": ss
        })

        # 4.3 /admin/novels
        print("\n--- Route: /admin/novels (Admin Novels List) ---")
        await browser.navigate("/admin/novels", wait_seconds=2.0)
        rendered = await browser.get_rendered_info()
        api_reqs = browser.get_api_requests()
        ss = await browser.screenshot("admin-03-novels.png")
        recon_results["surfaces"].append({
            "route": "/admin/novels",
            "identity": "admin",
            "rendered": rendered,
            "api_requests": api_reqs,
            "screenshot": ss
        })

        # 4.4 /admin/novels/81b923d7-5507-48ea-9a84-5303fd1de5f4
        print("\n--- Route: /admin/novels/:novelId (Admin Novel Detail) ---")
        await browser.navigate("/admin/novels/81b923d7-5507-48ea-9a84-5303fd1de5f4", wait_seconds=2.0)
        rendered = await browser.get_rendered_info()
        api_reqs = browser.get_api_requests()
        ss = await browser.screenshot("admin-04-novel-detail.png")
        recon_results["surfaces"].append({
            "route": "/admin/novels/81b923d7-5507-48ea-9a84-5303fd1de5f4",
            "identity": "admin",
            "rendered": rendered,
            "api_requests": api_reqs,
            "screenshot": ss
        })

        # 4.5 /admin/taxonomy
        print("\n--- Route: /admin/taxonomy (Admin Taxonomy: Genres & Tags) ---")
        await browser.navigate("/admin/taxonomy", wait_seconds=2.0)
        rendered = await browser.get_rendered_info()
        api_reqs = browser.get_api_requests()
        ss = await browser.screenshot("admin-05-taxonomy.png")
        recon_results["surfaces"].append({
            "route": "/admin/taxonomy",
            "identity": "admin",
            "rendered": rendered,
            "api_requests": api_reqs,
            "screenshot": ss
        })

        # 4.6 /admin/moderation
        print("\n--- Route: /admin/moderation (Admin Moderation Queue) ---")
        await browser.navigate("/admin/moderation", wait_seconds=2.0)
        rendered = await browser.get_rendered_info()
        api_reqs = browser.get_api_requests()
        ss = await browser.screenshot("admin-06-moderation.png")
        recon_results["surfaces"].append({
            "route": "/admin/moderation",
            "identity": "admin",
            "rendered": rendered,
            "api_requests": api_reqs,
            "screenshot": ss
        })

        # 4.7 /admin/withdraws
        print("\n--- Route: /admin/withdraws (Admin Withdraw Requests) ---")
        await browser.navigate("/admin/withdraws", wait_seconds=2.0)
        rendered = await browser.get_rendered_info()
        api_reqs = browser.get_api_requests()
        ss = await browser.screenshot("admin-07-withdraws.png")
        recon_results["surfaces"].append({
            "route": "/admin/withdraws",
            "identity": "admin",
            "rendered": rendered,
            "api_requests": api_reqs,
            "screenshot": ss
        })

        # Save reconnaissance JSON
        output_json = os.path.join(REPO_ROOT, "docs", "development", "PRODUCT-UI-INTEGRATION-INVENTORY.json")
        with open(output_json, "w", encoding="utf-8") as f:
            json.dump(recon_results, f, indent=2, ensure_ascii=False)
        print(f"\n[Artifact] Wrote complete reconnaissance results to: {output_json}")

    finally:
        if 'browser' in locals():
            await browser.close()
        edge_proc.terminate()
        try:
            edge_proc.wait(timeout=3)
        except Exception:
            edge_proc.kill()


if __name__ == "__main__":
    asyncio.run(run_reconnaissance())
