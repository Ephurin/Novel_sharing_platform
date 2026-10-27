"""
Real-browser check of shell session transitions: Reader -> Reader -> Admin.

Logs in through the rendered /login form, reads the signed-in role from the shell session hook
(`[data-testid="shell-session"]`, falling back to the legacy `.web-topbar` text), and logs out the
way a user does (opening the StoryCraft avatar menu when present). Works against both the
StoryCraft shell and the legacy WebAppShell, so it can be run on main and on a UI branch to
separate regressions from baseline behaviour.

Requires: a running web app (EPHURIN_E2E_WEB_URL, default http://127.0.0.1:5173) and API,
seeded demo accounts, Microsoft Edge, and EPHURIN_E2E_DEMO_PASSWORD. Does not write to databases.
Usage: python scripts/run_shell_session_transition_e2e.py
"""

import asyncio
import json
import os
import subprocess
import sys
import tempfile
import uuid
from typing import Any, Dict, List, Optional

import httpx
import websockets

WEB_URL = os.environ.get("EPHURIN_E2E_WEB_URL", "http://127.0.0.1:5173")
DEMO_PASSWORD = os.environ.get("EPHURIN_E2E_DEMO_PASSWORD")
if not DEMO_PASSWORD:
    raise RuntimeError("Missing required environment variable EPHURIN_E2E_DEMO_PASSWORD.")

EDGE_PATH = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not os.path.exists(EDGE_PATH):
    EDGE_PATH = r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"

DEBUG_PORT = int(os.environ.get("EPHURIN_E2E_DEBUG_PORT", "9341"))
VIEWPORT_WIDTH = int(os.environ.get("EPHURIN_E2E_VIEWPORT_WIDTH", "1440"))
EVIDENCE_PATH = os.environ.get(
    "EPHURIN_E2E_EVIDENCE_PATH",
    os.path.join(tempfile.gettempdir(), "shell-session-transition-e2e.json")
)

# (email, expected role, landing path prefix)
SEQUENCE = [
    ("reader04@example.com", "READER", "/reader"),
    ("reader05@example.com", "READER", "/reader"),
    ("reader02@example.com", "ADMIN", "/admin"),
]

SESSION_ROLE_JS = r"""(() => {
  const marker = document.querySelector('[data-testid="shell-session"]');
  if (marker) return marker.dataset.userRole || '';
  const text = document.querySelector('.web-topbar')?.innerText || '';
  const match = text.match(/\b(READER|AUTHOR|ADMIN)\b/);
  return match ? match[1] : '';
})()"""


class Browser:
    def __init__(self, ws_url: str):
        self.ws_url = ws_url
        self.ws = None
        self.msg_id = 0
        self.pending: Dict[int, asyncio.Future] = {}
        self.listener: Optional[asyncio.Task] = None

    async def connect(self):
        self.ws = await websockets.connect(self.ws_url, max_size=20 * 1024 * 1024)
        self.listener = asyncio.create_task(self._listen())
        await self.call("Page.enable")
        await self.call("Runtime.enable")
        await self.call("Emulation.setDeviceMetricsOverride", {
            "width": VIEWPORT_WIDTH, "height": 900, "deviceScaleFactor": 1, "mobile": VIEWPORT_WIDTH < 768
        })

    async def _listen(self):
        try:
            async for raw in self.ws:
                msg = json.loads(raw)
                if msg.get("id") in self.pending:
                    self.pending[msg["id"]].set_result(msg)
        except Exception:
            pass

    async def call(self, method: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        self.msg_id += 1
        fut = asyncio.get_running_loop().create_future()
        self.pending[self.msg_id] = fut
        await self.ws.send(json.dumps({"id": self.msg_id, "method": method, "params": params or {}}))
        res = await asyncio.wait_for(fut, timeout=30.0)
        if "error" in res:
            raise RuntimeError(f"CDP {method} error: {res['error']}")
        return res.get("result", {})

    async def evaluate(self, expression: str) -> Any:
        res = await self.call("Runtime.evaluate", {"expression": expression, "returnByValue": True, "awaitPromise": True})
        result = res.get("result", {})
        if result.get("subtype") == "error":
            raise RuntimeError(result.get("description"))
        return result.get("value")

    async def wait_for(self, condition_js: str, timeout: float = 15.0) -> Any:
        deadline = asyncio.get_running_loop().time() + timeout
        while asyncio.get_running_loop().time() < deadline:
            value = await self.evaluate(condition_js)
            if value:
                return value
            await asyncio.sleep(0.3)
        url = await self.evaluate("location.href")
        raise TimeoutError(f"Timed out waiting for: {condition_js} (at {url})")

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
            await self.call("Input.dispatchMouseEvent", {
                "type": event_type, "x": point["x"], "y": point["y"], "button": "left", "clickCount": 1
            })

    async def login(self, email: str, expected_role: str, landing: str) -> str:
        await self.call("Page.navigate", {"url": f"{WEB_URL}/login"})
        await self.wait_for("document.querySelector('input[type=\"password\"]') !== null")
        await self.set_input("input:not([type='password'])", email)
        await self.set_input("input[type='password']", DEMO_PASSWORD)
        await self.evaluate("""(() => {
            const button = [...document.querySelectorAll('button')].find(b => /login|đăng nhập/i.test(b.innerText));
            if (!button) throw new Error('login button not found');
            button.click();
        })()""")
        await self.wait_for(f"location.pathname.startsWith({json.dumps(landing)})")
        await self.wait_for(f"{SESSION_ROLE_JS} === {json.dumps(expected_role)}", 10.0)
        return await self.evaluate(SESSION_ROLE_JS)

    async def logout(self) -> str:
        avatar = "[data-testid='shell-avatar-btn']"
        via = "visible topbar button"
        if await self.evaluate(f"document.querySelector({json.dumps(avatar)}) !== null"):
            await self.mouse_click(avatar)
            await self.wait_for("document.querySelector(\"[data-testid='shell-logout-btn']\") !== null", 5.0)
            via = "avatar menu"
        await self.evaluate("document.querySelector(\"[data-testid='shell-logout-btn']\").click()")
        await self.wait_for("location.pathname === '/login'", 10.0)
        token_cleared = await self.evaluate("localStorage.getItem('ephurin_access_token') === null")
        if not token_cleared:
            raise AssertionError("access token still present after logout")
        return via


async def run() -> int:
    user_data_dir = os.path.join(tempfile.gettempdir(), f"edge-session-e2e-{uuid.uuid4().hex[:8]}")
    edge = subprocess.Popen([
        EDGE_PATH, "--headless=new", f"--remote-debugging-port={DEBUG_PORT}", f"--user-data-dir={user_data_dir}",
        "--disable-gpu", "--no-first-run", "--no-default-browser-check", "about:blank"
    ])
    steps: List[Dict[str, Any]] = []
    exit_code = 0
    try:
        await asyncio.sleep(2.5)
        targets = httpx.get(f"http://127.0.0.1:{DEBUG_PORT}/json").json()
        page = next(t for t in targets if t.get("type") == "page")
        browser = Browser(page["webSocketDebuggerUrl"])
        await browser.connect()

        for index, (email, role, landing) in enumerate(SEQUENCE):
            step: Dict[str, Any] = {"email": email, "expected_role": role}
            try:
                step["session_role"] = await browser.login(email, role, landing)
                step["landing"] = await browser.evaluate("location.pathname")
                step["logout_via"] = await browser.logout()
                step["result"] = "PASS"
            except Exception as error:  # record and stop: later transitions depend on this one
                step["result"] = "FAIL"
                step["error"] = str(error)
                exit_code = 1
            steps.append(step)
            print(f"[{index + 1}/{len(SEQUENCE)}] {email}: {step['result']} {json.dumps(step, ensure_ascii=False)}")
            if step["result"] != "PASS":
                break
    finally:
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(edge.pid)], capture_output=True)

    evidence = {"web_url": WEB_URL, "viewport_width": VIEWPORT_WIDTH, "steps": steps,
                "result": "PASS" if exit_code == 0 and len(steps) == len(SEQUENCE) else "FAIL"}
    with open(EVIDENCE_PATH, "w", encoding="utf-8") as handle:
        json.dump(evidence, handle, ensure_ascii=False, indent=2)
    print(f"RESULT: {evidence['result']} (evidence: {EVIDENCE_PATH})")
    return 0 if evidence["result"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(run()))
