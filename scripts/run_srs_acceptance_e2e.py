"""
SRS acceptance checks (docs/SRS) at API level on a disposable stack.

Every check is keyed by the test-case id in docs/testing/srs-test-cases.md and records PASS or FAIL
with the observed status, error code and timing. Checks that need infrastructure the local stack
does not have (Redis, FCM, OAuth providers, the LLM service, the mobile app) are not executed here;
the catalogue lists them as NOT_IMPLEMENTED or NOT_RUN.

The run uses scripts/e2e_isolated_stack.py: its own PostgreSQL and MongoDB databases, the API and a
production web build on dedicated ports, and the shared development data is never written (its
fingerprint must be unchanged). Windows-only: the stack and browser helpers use taskkill.

Usage (repo root):
  EPHURIN_ALLOW_TEST_DB_MUTATIONS=1 EPHURIN_E2E_DEMO_PASSWORD=... python scripts/run_srs_acceptance_e2e.py
Optional: EPHURIN_E2E_BACKEND_PORT (4314), EPHURIN_E2E_WEB_PORT (5314), EPHURIN_E2E_EVIDENCE_DIR.
Exit codes: 0 every executed check passed, 1 at least one FAIL, 3 REFUSED (nothing was written).
"""

import base64
import json
import os
import re
import shutil
import statistics
import subprocess
import sys
import tempfile
import time
import traceback
import uuid
from typing import Any, Callable, Dict, List, Optional, Tuple

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import httpx
import psycopg
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
READER, READER_B, AUTHOR, ADMIN = "reader04@example.com", "reader05@example.com", "reader03@example.com", "reader02@example.com"
NOVEL_SLUG = "sample-ashenhold-test-story"
FILTER_WORD = "srs-blocked-term"
STRONG_PASSWORD = "Srs-Check-2026"  # throwaway accounts created inside the disposable database only
re_llm = re.compile(r"(ai-copilot|ai-gateway|llm|openai|anthropic|story-brain)", re.I)


class Response:
    def __init__(self, raw: httpx.Response, elapsed_ms: float):
        self.status = raw.status_code
        self.elapsed_ms = round(elapsed_ms, 1)
        self.headers = raw.headers
        try:
            self.json = raw.json()
        except ValueError:
            self.json = {}

    @property
    def data(self) -> Any:
        return self.json.get("data") if isinstance(self.json, dict) else None

    @property
    def code(self) -> Optional[str]:
        error = self.json.get("error") if isinstance(self.json, dict) else None
        return error.get("code") if isinstance(error, dict) else None

    def brief(self) -> str:
        return f"{self.status} {self.code or ''} {self.elapsed_ms}ms".strip()


class Client:
    """One HTTP session per actor; keeps the refresh cookie and the access token."""

    def __init__(self, api: str):
        self.api = api
        self.http = httpx.Client(timeout=30.0)
        self.token: Optional[str] = None
        self.user: Dict[str, Any] = {}

    def call(self, method: str, path: str, body: Any = None, params: Optional[Dict[str, Any]] = None, auth: bool = True) -> Response:
        headers = {"Authorization": f"Bearer {self.token}"} if auth and self.token else {}
        started = time.perf_counter()
        raw = self.http.request(method, self.api + path, json=body, params=params, headers=headers)
        return Response(raw, (time.perf_counter() - started) * 1000)

    def login(self, identifier: str, password: str) -> Response:
        response = self.call("POST", "/auth/login", {"identifier": identifier, "password": password}, auth=False)
        if response.status == 200:
            self.token = response.data.get("accessToken")
            self.user = response.data.get("user") or {}
        return response


class Suite:
    def __init__(self, stack: IsolatedStack, password: str):
        self.stack = stack
        self.password = password
        self.results: List[Dict[str, Any]] = []
        self.pg_url = stack.pg_url
        self.mongo_uri = stack.mongo_uri

    # helpers -----------------------------------------------------------------
    def client(self, email: Optional[str] = None, password: Optional[str] = None) -> Client:
        client = Client(self.stack.api_url)
        if email:
            response = client.login(email, password or self.password)
            assert response.status == 200, f"login {email}: {response.brief()}"
        return client

    def sql(self, query: str, params: tuple = ()) -> List[tuple]:
        with psycopg.connect(self.pg_url) as conn:
            with conn.cursor() as cur:
                cur.execute(query, params)
                return cur.fetchall() if cur.description else []

    def mongo(self):
        return MongoClient(self.mongo_uri, serverSelectionTimeoutMS=5000).get_default_database()

    def record(self, tc_id: str, title: str, run: Callable[[], Tuple[bool, Any]]) -> None:
        started = time.time()
        try:
            ok, detail = run()
            status = "PASS" if ok else "FAIL"
        except Exception as error:
            status, detail = "FAIL", f"{type(error).__name__}: {error}"
            traceback.print_exc()
        self.results.append({"id": tc_id, "title": title, "result": status, "detail": detail,
                             "seconds": round(time.time() - started, 2)})
        print(f"  {tc_id:<12} {status:<4} {title} :: {json.dumps(detail, ensure_ascii=False, default=str)[:220]}")

    def wait(self, condition: Callable[[], Any], timeout: float = 40.0, step: float = 1.0) -> Any:
        deadline = time.time() + timeout
        while time.time() < deadline:
            value = condition()
            if value:
                return value
            time.sleep(step)
        return None

    def new_reader(self, prefix: str) -> Tuple[Client, Dict[str, str]]:
        suffix = uuid.uuid4().hex[:8]
        account = {"email": f"{prefix}_{suffix}@srs.test", "username": f"{prefix}_{suffix}", "password": STRONG_PASSWORD}
        client = Client(self.stack.api_url)
        response = client.call("POST", "/auth/register", account, auth=False)
        assert response.status in (200, 201), f"register: {response.brief()}"
        assert client.login(account["email"], account["password"]).status == 200
        return client, account

    # fixture -----------------------------------------------------------------
    def setup(self) -> None:
        self.reader = self.client(READER)
        self.reader_b = self.client(READER_B)
        self.author = self.client(AUTHOR)
        self.admin = self.client(ADMIN)
        self.guest = self.client()
        rows = self.sql("SELECT novel_id, author_id, title FROM novels WHERE slug = %s", (NOVEL_SLUG,))
        self.novel_id, self.author_id, self.novel_title = str(rows[0][0]), str(rows[0][1]), rows[0][2]
        self.free_chapter_id = str(self.sql("SELECT chapter_id FROM chapters WHERE novel_id = %s AND chapter_number = 1", (self.novel_id,))[0][0])
        vip = self.sql("SELECT chapter_id, price_coins FROM chapters WHERE is_vip AND status = 'PUBLISHED' AND deleted_at IS NULL ORDER BY chapter_number LIMIT 1")
        self.vip_chapter_id, self.vip_price = (str(vip[0][0]), int(vip[0][1])) if vip else (None, 0)
        self.sql("INSERT INTO content_filter_rules (name, pattern, category, severity) VALUES ('SRS acceptance', %s, 'TEST', 'HIGH')", (FILTER_WORD,))

    # AUTH --------------------------------------------------------------------
    def auth_cases(self) -> None:
        suffix = uuid.uuid4().hex[:8]
        account = {"email": f"srs_new_{suffix}@srs.test", "username": f"srs_new_{suffix}", "password": STRONG_PASSWORD}
        fresh = Client(self.stack.api_url)

        def register_valid():
            response = fresh.call("POST", "/auth/register", account, auth=False)
            row = self.sql("SELECT role, password_hash FROM users WHERE email = %s", (account["email"],))
            hashed = bool(row) and row[0][1].startswith(("$2", "$argon2"))
            return response.status in (200, 201) and row and row[0][0] == "READER" and hashed, {
                "response": response.brief(), "role": row[0][0] if row else None, "password_hashed": hashed}
        self.record("TC-AUTH-01", "Đăng ký hợp lệ tạo tài khoản READER, mật khẩu được băm", register_valid)

        def invalid_email():
            response = fresh.call("POST", "/auth/register", {**account, "email": "not-an-email", "username": f"x{suffix}"}, auth=False)
            return response.status == 400 and response.code == "AUTH_001", {"response": response.brief(), "srs_code": "AUTH_001"}
        self.record("TC-AUTH-02", "Email sai định dạng trả AUTH_001", invalid_email)

        def weak_password():
            response = fresh.call("POST", "/auth/register", {"email": f"w{suffix}@srs.test", "username": f"w{suffix}", "password": "short"}, auth=False)
            return response.status == 400, {"response": response.brief()}
        self.record("TC-AUTH-03", "Mật khẩu yếu bị từ chối", weak_password)

        def duplicate_username():
            response = fresh.call("POST", "/auth/register", {**account, "email": f"d{suffix}@srs.test"}, auth=False)
            return response.code == "USER_004", {"response": response.brief(), "srs_code": "USER_004"}
        self.record("TC-AUTH-04", "Trùng username trả USER_004", duplicate_username)

        def duplicate_email():
            response = fresh.call("POST", "/auth/register", {**account, "username": f"e{suffix}"}, auth=False)
            return 400 <= response.status < 500, {"response": response.brief()}
        self.record("TC-AUTH-05", "Trùng email bị từ chối", duplicate_email)

        def login_valid():
            client = Client(self.stack.api_url)
            response = client.login(account["email"], account["password"])
            cookie = response.headers.get("set-cookie", "")
            payload = json.loads(base64.urlsafe_b64decode(client.token.split(".")[1] + "==")) if client.token else {}
            ttl = payload.get("exp", 0) - payload.get("iat", 0)
            return response.status == 200 and "httponly" in cookie.lower() and ttl == 3600, {
                "response": response.brief(), "refresh_cookie_httponly": "httponly" in cookie.lower(), "access_ttl_seconds": ttl}
        self.record("TC-AUTH-06", "Đăng nhập trả access token 1 giờ và refresh token trong HttpOnly cookie", login_valid)

        def wrong_password():
            response = Client(self.stack.api_url).call("POST", "/auth/login", {"identifier": account["email"], "password": "Wrong-Pass-1"}, auth=False)
            return response.status == 401 and response.code == "AUTH_003", {"response": response.brief()}
        self.record("TC-AUTH-07", "Sai mật khẩu trả AUTH_003", wrong_password)

        def locked_account():
            user_id = str(self.sql("SELECT user_id FROM users WHERE email = %s", (account["email"],))[0][0])
            lock = self.admin.call("PATCH", f"/admin/users/{user_id}/lock", {"reason": "SRS acceptance"})
            response = Client(self.stack.api_url).call("POST", "/auth/login", {"identifier": account["email"], "password": account["password"]}, auth=False)
            self.admin.call("PATCH", f"/admin/users/{user_id}/unlock", {})
            return response.code == "AUTH_004", {"lock": lock.brief(), "login": response.brief()}
        self.record("TC-AUTH-08", "Tài khoản bị khoá đăng nhập trả AUTH_004", locked_account)

        def refresh_token():
            client = Client(self.stack.api_url)
            login = client.login(account["email"], account["password"])
            cookie = login.headers.get("set-cookie", "").lower()
            max_age = next((int(part.split("=")[1]) for part in cookie.replace(",", ";").split(";") if part.strip().startswith("max-age=")), None)
            refreshed = client.call("POST", "/auth/refresh-token", auth=False)
            return refreshed.status == 200 and bool((refreshed.data or {}).get("accessToken")) and max_age == 7 * 24 * 3600, {
                "refresh": refreshed.brief(), "cookie_max_age": max_age}
        self.record("TC-AUTH-10", "Refresh token 7 ngày cấp lại access token", refresh_token)

        def rbac_admin_api():
            response = self.reader.call("GET", "/admin/users")
            return response.status == 403 and response.code == "AUTH_008", {"response": response.brief()}
        self.record("TC-AUTH-11", "Độc giả gọi API admin bị chặn AUTH_008", rbac_admin_api)

    # READING -----------------------------------------------------------------
    def reading_cases(self) -> None:
        def search_keyword():
            response = self.guest.call("GET", "/reading/search", params={"q": "Ashenhold"})
            titles = [item.get("title") for item in response.data or []]
            return response.status == 200 and self.novel_title in titles, {"response": response.brief(), "titles": titles[:5]}
        self.record("TC-READ-05", "Tìm theo từ khoá trả đúng truyện", search_keyword)

        def search_filter_only():
            genre = (self.guest.call("GET", f"/reading/novels/{self.novel_id}").data or {}).get("genre")
            response = self.guest.call("GET", "/reading/search", params={"genre": genre})
            genres = {item.get("genre") for item in response.data or []}
            return response.status == 200 and bool(response.data) and genres == {genre}, {"genre": genre, "response": response.brief(), "result_genres": sorted(map(str, genres))}
        self.record("TC-READ-06", "Lọc theo thể loại không cần từ khoá", search_filter_only)

        def search_empty():
            response = self.guest.call("GET", "/reading/search", params={"q": f"zz-no-match-{uuid.uuid4().hex[:6]}"})
            return response.status == 200 and response.data == [], {"response": response.brief(), "items": len(response.data or [])}
        self.record("TC-READ-07", "Không có kết quả trả danh sách rỗng, không lỗi", search_empty)

        def search_latency():
            samples = [self.guest.call("GET", "/reading/search", params={"q": "Story"}).elapsed_ms for _ in range(5)]
            return max(samples) < 2000, {"samples_ms": samples, "median_ms": statistics.median(samples)}
        self.record("TC-READ-08", "Tìm kiếm phản hồi dưới 2 giây (local)", search_latency)

        def history_sync():
            chapter2 = str(self.sql("SELECT chapter_id FROM chapters WHERE novel_id = %s AND chapter_number = 2", (self.novel_id,))[0][0])
            put = self.reader.call("PUT", "/reading/history/me", {"novelId": self.novel_id, "chapterId": chapter2, "paragraphIndex": 3, "pageOffset": 0.4})
            get = self.reader.call("GET", f"/reading/history/me/{self.novel_id}")
            got = (get.data or {}).get("chapterId")
            return put.status == 200 and got == chapter2, {"put": put.brief(), "get": get.brief(), "chapterId": got}
        self.record("TC-READ-09", "Đồng bộ vị trí đọc và đọc lại đúng chương", history_sync)

        def history_requires_login():
            response = self.guest.call("GET", "/reading/history/me")
            return response.status == 401, {"response": response.brief()}
        self.record("TC-READ-10", "Lịch sử đọc yêu cầu đăng nhập", history_requires_login)

        def chapter_latency():
            samples = [self.guest.call("GET", f"/reading/chapters/{self.free_chapter_id}").elapsed_ms for _ in range(5)]
            return max(samples) < 2000, {"samples_ms": samples}
        self.record("TC-READ-13", "Trang đọc chương phản hồi dưới 2 giây (local)", chapter_latency)

        def preferences_scoped():
            self.reader.call("PUT", "/reading/preferences/me", {"fontFamily": "Georgia", "fontSize": 22, "background": "SEPIA", "lineHeight": 2})
            other = self.reader_b.call("GET", "/reading/preferences/me")
            return other.status == 200 and (other.data or {}).get("fontSize") != 22, {"other_reader": other.data}
        self.record("TC-READ-14", "Tùy chỉnh đọc tách riêng từng người dùng", preferences_scoped)

    # SOCIAL / COMMENTS / MODERATION -----------------------------------------
    def social_cases(self) -> None:
        def like_count():
            before = self.sql("SELECT likes_count FROM novels WHERE novel_id = %s", (self.novel_id,))[0][0]
            like = self.reader_b.call("POST", f"/novels/{self.novel_id}/likes")
            after_like = self.sql("SELECT likes_count FROM novels WHERE novel_id = %s", (self.novel_id,))[0][0]
            duplicate = self.reader_b.call("POST", f"/novels/{self.novel_id}/likes")
            unlike = self.reader_b.call("DELETE", f"/novels/{self.novel_id}/likes/me")
            after_unlike = self.sql("SELECT likes_count FROM novels WHERE novel_id = %s", (self.novel_id,))[0][0]
            ok = like.status == 200 and after_like == before + 1 and duplicate.status == 409 and after_unlike == before
            return ok, {"before": before, "after_like": after_like, "duplicate": duplicate.brief(), "after_unlike": after_unlike}
        self.record("TC-SOC-09", "Like tăng likesCount, like trùng trả 409, bỏ like giảm lại", like_count)

        def flagged_comment_pending():
            response = self.reader.call("POST", f"/chapters/{self.free_chapter_id}/comments", {"content": f"Bình luận có {FILTER_WORD} cần duyệt"})
            data = response.data or {}
            self.flagged_comment = data
            public = self.guest.call("GET", f"/chapters/{self.free_chapter_id}/comments")
            hidden = all(item.get("commentId") != data.get("commentId") for item in public.data or [])
            return data.get("status") == "PENDING_MODERATION" and bool(data.get("moderationReviewId")) and hidden, {
                "create": response.brief(), "status": data.get("status"), "review": data.get("moderationReviewId"), "hidden_from_guest": hidden}
        self.record("TC-SOC-02", "Bình luận dính từ khoá chờ duyệt, khách không thấy", flagged_comment_pending)

        def admin_approves_comment():
            review_id = self.flagged_comment.get("moderationReviewId")
            resolve = self.admin.call("POST", f"/admin/moderation/reviews/{review_id}/resolve", {"decision": "APPROVED", "reason": "SRS acceptance"})
            public = self.guest.call("GET", f"/chapters/{self.free_chapter_id}/comments")
            visible = any(item.get("commentId") == self.flagged_comment.get("commentId") for item in public.data or [])
            again = self.admin.call("POST", f"/admin/moderation/reviews/{review_id}/resolve", {"decision": "REJECTED", "reason": "late"})
            self.stale_resolve = again
            return resolve.status == 200 and visible, {"resolve": resolve.brief(), "visible_to_guest": visible}
        self.record("TC-SOC-03", "Admin duyệt bình luận thì bình luận hiển thị công khai", admin_approves_comment)

        def admin_rejects_comment():
            created = self.reader.call("POST", f"/chapters/{self.free_chapter_id}/comments", {"content": f"Lần hai {FILTER_WORD}"}).data or {}
            resolve = self.admin.call("POST", f"/admin/moderation/reviews/{created.get('moderationReviewId')}/resolve", {"decision": "REJECTED", "reason": "SRS acceptance"})
            comments = self.mongo()["comments"]
            doc = comments.find_one({"commentId": created.get("commentId")}) or comments.find_one({"_id": created.get("commentId")}) or {}
            own_view = self.reader.call("GET", f"/chapters/{self.free_chapter_id}/comments")
            own_status = next((item.get("status") for item in own_view.data or [] if item.get("commentId") == created.get("commentId")), None)
            public = self.guest.call("GET", f"/chapters/{self.free_chapter_id}/comments")
            hidden = all(item.get("commentId") != created.get("commentId") for item in public.data or [])
            status = doc.get("status") or own_status
            return resolve.status == 200 and status == "REJECTED" and hidden, {
                "resolve": resolve.brief(), "db_status": doc.get("status"), "author_view_status": own_status, "hidden_from_guest": hidden}
        self.record("TC-SOC-04", "Admin từ chối bình luận thì bình luận bị ẩn (REJECTED)", admin_rejects_comment)

        def foreign_comment_edit():
            created = self.reader.call("POST", f"/chapters/{self.free_chapter_id}/comments", {"content": "Bình luận sạch của reader04"}).data or {}
            edit = self.reader_b.call("PATCH", f"/comments/{created.get('commentId')}", {"content": "sửa trộm"})
            delete = self.reader_b.call("DELETE", f"/comments/{created.get('commentId')}")
            return edit.status == 403 and delete.status == 403, {"edit": edit.brief(), "delete": delete.brief()}
        self.record("TC-SOC-06", "Không sửa/xoá được bình luận của người khác", foreign_comment_edit)

        def anonymous_comment():
            response = self.guest.call("POST", f"/chapters/{self.free_chapter_id}/comments", {"content": "khách"})
            return response.status == 401, {"response": response.brief()}
        self.record("TC-SOC-07", "Khách không bình luận được (401)", anonymous_comment)

        def follow_author():
            follow = self.reader_b.call("POST", f"/authors/{self.author_id}/follow")
            rows = self.sql("SELECT count(*) FROM follows WHERE follower_id = %s AND author_id = %s", (self.reader_b.user.get("userId"), self.author_id))[0][0]
            count = self.guest.call("GET", f"/authors/{self.author_id}/followers/count")
            return follow.status == 200 and rows == 1, {"follow": follow.brief(), "db_rows": rows, "followers": count.data}
        self.record("TC-SOC-11", "Theo dõi tác giả ghi quan hệ follow", follow_author)

    def moderation_cases(self) -> None:
        def report_creates_review():
            response = self.reader.call("POST", "/reports", {"targetType": "CHAPTER", "targetId": self.free_chapter_id, "reason": "Nội dung vi phạm"})
            self.report = response.data or {}
            return response.status in (200, 201) and bool(self.report.get("moderationReviewId") or self.report.get("reviewId")), {"response": response.brief(), "data": self.report}
        self.record("TC-MOD-02", "Báo cáo kèm lý do tạo USER_REPORT và review", report_creates_review)

        def report_without_reason():
            response = self.reader.call("POST", "/reports", {"targetType": "CHAPTER", "targetId": self.free_chapter_id, "reason": ""})
            return response.status == 400, {"response": response.brief()}
        self.record("TC-MOD-03", "Báo cáo thiếu lý do bị từ chối", report_without_reason)

        def report_missing_target():
            response = self.reader.call("POST", "/reports", {"targetType": "CHAPTER", "targetId": str(uuid.uuid4()), "reason": "không tồn tại"})
            return response.status == 404, {"response": response.brief()}
        self.record("TC-MOD-04", "Báo cáo đối tượng không tồn tại bị từ chối", report_missing_target)

        def second_report_links():
            response = self.reader_b.call("POST", "/reports", {"targetType": "CHAPTER", "targetId": self.free_chapter_id, "reason": "Báo cáo thứ hai"})
            first = self.report.get("moderationReviewId") or self.report.get("reviewId")
            second = (response.data or {}).get("moderationReviewId") or (response.data or {}).get("reviewId")
            return response.status in (200, 201) and first == second, {"first_review": first, "second_review": second}
        self.record("TC-MOD-05", "Báo cáo thứ hai gắn vào review đang mở", second_report_links)

        def admin_filters_queue():
            response = self.admin.call("GET", "/admin/moderation/reviews", params={"status": "PENDING", "source": "USER_REPORT"})
            first = self.report.get("moderationReviewId") or self.report.get("reviewId")
            ids = [item.get("reviewId") for item in response.data or []]
            return response.status == 200 and first in ids, {"response": response.brief(), "found": first in ids}
        self.record("TC-MOD-06", "Admin lọc hàng đợi theo trạng thái và nguồn", admin_filters_queue)

        def stale_decision():
            response = getattr(self, "stale_resolve", None)
            return response is not None and response.status == 409, {"second_resolve": response.brief() if response else None}
        self.record("TC-MOD-07", "Quyết định lần hai trên review đã xử lý bị từ chối", stale_decision)

        def reader_cannot_moderate():
            response = self.reader.call("GET", "/admin/moderation/reviews")
            return response.status == 403, {"response": response.brief()}
        self.record("TC-MOD-08", "Độc giả không vào được hàng đợi kiểm duyệt", reader_cannot_moderate)

        def no_llm_in_moderation():
            folder = os.path.join(REPO_ROOT, "backend", "src", "modules", "content-control")
            offenders = []
            for name in sorted(os.listdir(folder)):
                if name.endswith(".ts") and ".test." not in name:
                    with open(os.path.join(folder, name), encoding="utf-8") as handle:
                        for line in handle:
                            if line.lstrip().startswith("import") and re_llm.search(line):
                                offenders.append(f"{name}: {line.strip()}")
            return not offenders, {"files_scanned": "backend/src/modules/content-control/*.ts", "ai_imports": offenders}
        self.record("TC-MOD-10", "Luồng kiểm duyệt không gọi AI/LLM (quét import)", no_llm_in_moderation)

    # NOVELS / CHAPTERS -------------------------------------------------------
    def novel_cases(self) -> None:
        synopsis = "Tóm tắt kiểm thử SRS. " * 30  # > 500 characters

        def create_novel():
            response = self.author.call("POST", "/novels", {"title": f"SRS Novel {uuid.uuid4().hex[:6]}", "synopsis": synopsis, "genre": "Fantasy", "tags": []})
            self.test_novel = response.data or {}
            return response.status in (200, 201) and self.test_novel.get("status") == "DRAFT", {"response": response.brief(), "status": self.test_novel.get("status")}
        self.record("TC-NOV-01", "Tác giả tạo truyện mới ở trạng thái DRAFT", create_novel)

        def title_255():
            response = self.author.call("POST", "/novels", {"title": "T" * 255, "synopsis": synopsis, "genre": "Fantasy", "tags": []})
            return 400 <= response.status < 500, {"response": response.brief(), "srs": "tiêu đề phải < 255 ký tự"}
        self.record("TC-NOV-02", "Tiêu đề 255 ký tự bị từ chối", title_255)

        def synopsis_short():
            response = self.author.call("POST", "/novels", {"title": "Short synopsis", "synopsis": "Ngắn hơn 500 ký tự.", "genre": "Fantasy", "tags": []})
            return 400 <= response.status < 500, {"response": response.brief(), "srs": "tóm tắt phải >= 500 ký tự"}
        self.record("TC-NOV-03", "Tóm tắt dưới 500 ký tự bị từ chối", synopsis_short)

        novel_id = (getattr(self, "test_novel", {}) or {}).get("novelId")

        def chapter_title_100():
            response = self.author.call("POST", f"/novels/{novel_id}/chapters", {"title": "C" * 100, "content": "x" * 600})
            return 400 <= response.status < 500, {"response": response.brief(), "srs": "tiêu đề chương phải < 100 ký tự"}
        self.record("TC-NOV-05", "Tiêu đề chương 100 ký tự bị từ chối", chapter_title_100)

        long_text = "Nội dung chương đủ dài dùng cho kiểm thử theo SRS. " * 15  # > 500 characters
        final_states = ("PUBLISHED", "PENDING_MODERATION", "REJECTED")

        def chapter_status(chapter_id: Optional[str]) -> Optional[str]:
            return (self.sql("SELECT status FROM chapters WHERE chapter_id = %s", (chapter_id,)) or [[None]])[0][0] if chapter_id else None

        def novel_status(target: Optional[str]) -> Optional[str]:
            return (self.sql("SELECT status FROM novels WHERE novel_id = %s", (target,)) or [[None]])[0][0] if target else None

        def approve_review(target_id: str) -> Optional[Response]:
            review = self.sql("SELECT review_id FROM moderation_reviews WHERE target_id = %s AND status = 'PENDING' ORDER BY created_at DESC LIMIT 1", (target_id,))
            if not review:
                return None
            return self.admin.call("POST", f"/admin/moderation/reviews/{review[0][0]}/resolve", {"decision": "APPROVED", "reason": "SRS acceptance"})

        def submit_chapter(target_novel: str, title: str, content: str) -> Tuple[Response, Optional[str], Optional[str]]:
            created = self.author.call("POST", f"/novels/{target_novel}/chapters", {"title": title, "content": content})
            chapter_id = (created.data or {}).get("chapterId")
            submit = self.author.call("POST", f"/chapters/{chapter_id}/submit-publish")
            status = self.wait(lambda: (lambda s: s if s in final_states else None)(chapter_status(chapter_id)), timeout=20) or chapter_status(chapter_id)
            return submit, chapter_id, status

        def publish_below_five():
            self.author.call("POST", f"/novels/{novel_id}/chapters", {"title": "Chương 1", "content": long_text})
            drafts = self.sql("SELECT count(*) FROM chapters WHERE novel_id = %s AND deleted_at IS NULL", (novel_id,))[0][0]
            submit = self.author.call("POST", f"/novels/{novel_id}/submit-publish")
            time.sleep(2)
            status = novel_status(novel_id)
            return not (200 <= submit.status < 300) and status != "PUBLISHED", {
                "submit": submit.brief(), "novel_status": status, "draft_chapters": drafts, "srs": "cần >= 5 chương nháp trước khi xuất bản"}
        self.record("TC-NOV-04", "Truyện dưới 5 chương nháp không gửi xuất bản được", publish_below_five)

        def publish_novel_with_five():
            created = self.author.call("POST", "/novels", {"title": f"SRS Pipeline {uuid.uuid4().hex[:6]}", "synopsis": synopsis, "genre": "Fantasy", "tags": []})
            self.pipeline_novel = (created.data or {}).get("novelId")
            for index in range(1, 6):
                self.author.call("POST", f"/novels/{self.pipeline_novel}/chapters", {"title": f"Chương {index}", "content": long_text})
            submit = self.author.call("POST", f"/novels/{self.pipeline_novel}/submit-publish")
            status = self.wait(lambda: (lambda s: s if s in final_states else None)(novel_status(self.pipeline_novel)), timeout=20) or novel_status(self.pipeline_novel)
            approved = None
            if status == "PENDING_MODERATION":
                approved = approve_review(self.pipeline_novel)
                status = self.wait(lambda: (lambda s: s if s == "PUBLISHED" else None)(novel_status(self.pipeline_novel)), timeout=20) or novel_status(self.pipeline_novel)
            public = self.guest.call("GET", f"/reading/novels/{self.pipeline_novel}")
            return status == "PUBLISHED" and public.status == 200, {
                "submit": submit.brief(), "final_status": status, "admin_approval": approved.brief() if approved else None, "public_detail": public.brief()}
        self.record("TC-NOV-14", "Truyện đủ 5 chương hợp lệ gửi duyệt thì được xuất bản công khai", publish_novel_with_five)

        pipeline = getattr(self, "pipeline_novel", None)

        def short_chapter_publish():
            submit, chapter_id, status = submit_chapter(pipeline, "Chương ngắn", "Nội dung quá ngắn.")
            return status != "PUBLISHED", {"submit": submit.brief(), "final_status": status, "srs": "nội dung chương phải >= 500 ký tự"}
        self.record("TC-NOV-06", "Chương dưới 500 ký tự không được xuất bản", short_chapter_publish)

        def clean_chapter_publish():
            submit, chapter_id, status = submit_chapter(pipeline, "Chương sạch", long_text)
            self.clean_chapter_id = chapter_id
            public = self.guest.call("GET", f"/reading/chapters/{chapter_id}")
            return status == "PUBLISHED" and public.status == 200, {"submit": submit.brief(), "final_status": status, "guest_read": public.brief()}
        self.record("TC-NOV-07", "Chương hợp lệ được xuất bản và khách đọc được", clean_chapter_publish)

        def flagged_chapter_pending():
            submit, chapter_id, status = submit_chapter(pipeline, "Chương cần duyệt", f"Nội dung có {FILTER_WORD}. " + long_text)
            self.flagged_chapter_id = chapter_id
            hidden = self.guest.call("GET", f"/reading/chapters/{chapter_id}")
            return status == "PENDING_MODERATION" and hidden.status != 200, {"submit": submit.brief(), "final_status": status, "guest_read": hidden.brief()}
        self.record("TC-NOV-08", "Chương dính từ khoá chuyển sang chờ duyệt, chưa công khai", flagged_chapter_pending)

        def admin_approves_chapter():
            resolve = approve_review(getattr(self, "flagged_chapter_id", "") or "")
            if resolve is None:
                return False, {"error": "no pending moderation review for the flagged chapter"}
            status = self.wait(lambda: (lambda s: s if s == "PUBLISHED" else None)(chapter_status(self.flagged_chapter_id)), timeout=20) or chapter_status(self.flagged_chapter_id)
            return resolve.status == 200 and status == "PUBLISHED", {"resolve": resolve.brief(), "final_status": status}
        self.record("TC-NOV-09", "Admin duyệt chương chờ duyệt thì chương được xuất bản", admin_approves_chapter)

        def admin_rejects_chapter():
            submit, chapter_id, status = submit_chapter(pipeline, "Chương bị từ chối", f"Đoạn có {FILTER_WORD}. " + long_text)
            review = self.sql("SELECT review_id FROM moderation_reviews WHERE target_id = %s AND status = 'PENDING' ORDER BY created_at DESC LIMIT 1", (chapter_id,))
            if not review:
                return False, {"submit": submit.brief(), "status": status, "error": "no pending review"}
            reason = f"Lý do SRS {uuid.uuid4().hex[:6]}"
            resolve = self.admin.call("POST", f"/admin/moderation/reviews/{review[0][0]}/resolve", {"decision": "REJECTED", "reason": reason})
            final = chapter_status(chapter_id)
            notified = self.wait(lambda: [item for item in (self.author.call("GET", "/notifications").data or []) if reason in json.dumps(item, ensure_ascii=False)], timeout=20)
            return resolve.status == 200 and final != "PUBLISHED" and bool(notified), {"resolve": resolve.brief(), "final_status": final, "author_got_reason": bool(notified)}
        self.record("TC-NOV-10", "Admin từ chối chương thì chương không công khai và tác giả nhận lý do", admin_rejects_chapter)

        def guest_vip_locked():
            if not self.vip_chapter_id:
                return False, {"error": "seed has no published VIP chapter"}
            response = self.guest.call("GET", f"/reading/chapters/{self.vip_chapter_id}")
            content = (response.data or {}).get("content") if isinstance(response.data, dict) else None
            return response.status in (401, 402, 403) or not content, {"response": response.brief(), "content_returned": bool(content)}
        self.record("TC-NOV-12", "Khách không đọc được nội dung chương VIP", guest_vip_locked)

        def reader_cannot_create_novel():
            response = self.reader.call("POST", "/novels", {"title": "Reader novel", "synopsis": synopsis, "genre": "Fantasy", "tags": []})
            return response.status == 403, {"response": response.brief(), "srs": "ma trận quyền: Reader không tạo truyện"}
        self.record("TC-NOV-13", "Độc giả không tạo được truyện", reader_cannot_create_novel)

        def follower_notified():
            if not getattr(self, "clean_chapter_id", None):
                return False, {"error": "no published chapter from TC-NOV-07"}
            notifications = self.wait(lambda: [item for item in (self.reader_b.call("GET", "/notifications").data or [])
                                               if self.clean_chapter_id in json.dumps(item, default=str) or "chương mới" in json.dumps(item, ensure_ascii=False).lower()], timeout=20)
            return bool(notifications), {"follower_notifications": len(notifications or [])}
        self.record("TC-SOC-12", "Người theo dõi nhận thông báo khi tác giả đăng chương mới", follower_notified)

        def draft_not_blocked():
            created = self.author.call("POST", f"/novels/{novel_id}/chapters", {"title": "Nháp có từ khoá", "content": f"Nháp chứa {FILTER_WORD}"})
            return created.status in (200, 201), {"response": created.brief()}
        self.record("TC-MOD-09", "Lưu nháp chứa từ khoá không bị chặn", draft_not_blocked)

    # WALLET ------------------------------------------------------------------
    def wallet_cases(self) -> None:
        def balance(client: Client) -> Tuple[int, int]:
            data = client.call("GET", "/wallet/me").data or {}
            return int(data.get("coinsBalance", 0)), int(data.get("lockedCoins", 0))

        def deposit(client: Client, code: str = "COIN_500") -> Tuple[Response, Response]:
            session = client.call("POST", "/wallet/deposit-sessions", {"packageCode": code})
            session_id = (session.data or {}).get("depositSessionId")
            confirm = client.call("POST", "/wallet/mock-webhook/deposit-success", {"depositSessionId": session_id, "mockResult": "SUCCESS"})
            return session, confirm

        def packages():
            response = self.guest.call("GET", "/wallet/deposit-packages")
            codes = sorted(item.get("code") for item in response.data or [])
            return codes == ["COIN_100", "COIN_1000", "COIN_500", "COIN_5000"], {"codes": codes}
        self.record("TC-PAY-01", "Hiển thị các gói nạp", packages)

        def deposit_success():
            before, _ = balance(self.reader)
            session, confirm = deposit(self.reader)
            after, _ = balance(self.reader)
            tx = self.reader.call("GET", "/wallet/transactions", params={"type": "DEPOSIT", "status": "SUCCESS"})
            return confirm.status == 200 and after == before + 500 and bool(tx.data), {"before": before, "after": after, "confirm": confirm.brief()}
        self.record("TC-PAY-02", "Nạp thành công cộng Coin và ghi giao dịch DEPOSIT SUCCESS", deposit_success)

        def deposit_unconfirmed():
            before, _ = balance(self.reader)
            session = self.reader.call("POST", "/wallet/deposit-sessions", {"packageCode": "COIN_100"})
            after, _ = balance(self.reader)
            return session.status in (200, 201) and after == before, {"before": before, "after": after}
        self.record("TC-PAY-03", "Phiên nạp chưa xác nhận (huỷ) không cộng Coin", deposit_unconfirmed)

        def unlock_vip():
            if not self.vip_chapter_id:
                return False, {"error": "seed has no published VIP chapter"}
            reader_before, _ = balance(self.reader)
            author_before, _ = balance(self.author)
            response = self.reader.call("POST", f"/chapters/{self.vip_chapter_id}/unlock")
            reader_after, _ = balance(self.reader)
            author_after, _ = balance(self.author)
            read = self.reader.call("GET", f"/reading/chapters/{self.vip_chapter_id}")
            content = (read.data or {}).get("content") if isinstance(read.data, dict) else None
            ok = response.status == 200 and reader_after == reader_before - self.vip_price and author_after > author_before and bool(content)
            return ok, {"unlock": response.brief(), "price": self.vip_price, "reader": [reader_before, reader_after], "author": [author_before, author_after], "content_after_unlock": bool(content)}
        self.record("TC-PAY-04", "Mở khoá VIP trừ Coin độc giả, cộng tác giả, mở nội dung", unlock_vip)

        def unlock_insufficient():
            if not self.vip_chapter_id:
                return False, {"error": "seed has no published VIP chapter"}
            poor, _ = self.new_reader("srs_poor")
            before, _ = balance(poor)
            response = poor.call("POST", f"/chapters/{self.vip_chapter_id}/unlock")
            after, _ = balance(poor)
            return 400 <= response.status < 500 and after == before, {"response": response.brief(), "balance": [before, after]}
        self.record("TC-PAY-05", "Không đủ Coin thì không mở khoá được và không trừ tiền", unlock_insufficient)

        def donate_success():
            reader_before, _ = balance(self.reader)
            author_before, _ = balance(self.author)
            response = self.reader.call("POST", f"/authors/{self.author_id}/donations", {"amountCoins": 10, "message": "SRS"})
            reader_after, _ = balance(self.reader)
            author_after, _ = balance(self.author)
            return response.status in (200, 201) and reader_after == reader_before - 10 and author_after > author_before, {
                "donate": response.brief(), "reader": [reader_before, reader_after], "author": [author_before, author_after]}
        self.record("TC-PAY-07", "Ủng hộ trừ Coin độc giả và cộng tác giả", donate_success)

        def donate_insufficient():
            poor, _ = self.new_reader("srs_poor2")
            response = poor.call("POST", f"/authors/{self.author_id}/donations", {"amountCoins": 50})
            return 400 <= response.status < 500, {"response": response.brief()}
        self.record("TC-PAY-08", "Ủng hộ khi không đủ Coin bị từ chối", donate_insufficient)

        def donate_invalid_amount():
            response = self.reader.call("POST", f"/authors/{self.author_id}/donations", {"amountCoins": 0})
            return response.status == 400, {"response": response.brief()}
        self.record("TC-PAY-09", "Ủng hộ số Coin không hợp lệ bị từ chối", donate_invalid_amount)

        def withdraw_below_minimum():
            response = self.author.call("POST", "/wallet/withdraw-requests", {"amountCoins": 50, "bankAccountLabel": "SRS Bank"})
            return response.status == 400, {"response": response.brief()}
        self.record("TC-PAY-11", "Rút dưới hạn mức tối thiểu bị từ chối", withdraw_below_minimum)

        def withdraw_lock_and_reject():
            if balance(self.author)[0] < 100:
                deposit(self.author)
            before = balance(self.author)
            request = self.author.call("POST", "/wallet/withdraw-requests", {"amountCoins": 100, "bankAccountLabel": "SRS Bank"})
            locked = balance(self.author)
            request_id = (request.data or {}).get("withdrawRequestId")
            self.withdraw_reject_reason = f"Từ chối rút SRS {uuid.uuid4().hex[:6]}"
            reject = self.admin.call("POST", f"/admin/withdraw-requests/{request_id}/reject", {"reason": self.withdraw_reject_reason})
            after = balance(self.author)
            ok = request.status in (200, 201) and locked == (before[0] - 100, before[1] + 100) and reject.status == 200 and after == before
            return ok, {"before": before, "after_request": locked, "after_reject": after, "reject": reject.brief()}
        self.record("TC-PAY-12", "Yêu cầu rút đóng băng Coin; Admin từ chối thì trả lại", withdraw_lock_and_reject)

        def withdraw_reject_notified():
            reason = getattr(self, "withdraw_reject_reason", None)
            notified = self.wait(lambda: [item for item in (self.author.call("GET", "/notifications").data or []) if reason and reason in json.dumps(item, ensure_ascii=False)], timeout=20)
            return bool(notified), {"author_notified_with_reason": bool(notified)}
        self.record("TC-PAY-13", "Tác giả nhận thông báo từ chối rút kèm lý do", withdraw_reject_notified)

        def withdraw_approve():
            if balance(self.author)[0] < 100:
                deposit(self.author)
            before = balance(self.author)
            request = self.author.call("POST", "/wallet/withdraw-requests", {"amountCoins": 100, "bankAccountLabel": "SRS Bank"})
            request_id = (request.data or {}).get("withdrawRequestId")
            approve = self.admin.call("POST", f"/admin/withdraw-requests/{request_id}/approve", {})
            after = balance(self.author)
            tx = self.author.call("GET", "/wallet/transactions", params={"type": "WITHDRAW", "status": "SUCCESS"})
            ok = approve.status == 200 and after == (before[0] - 100, before[1]) and bool(tx.data)
            return ok, {"before": before, "after": after, "approve": approve.brief()}
        self.record("TC-PAY-14", "Admin duyệt rút thì trừ hẳn Coin đóng băng, giao dịch SUCCESS", withdraw_approve)

        def payment_rate_limit():
            statuses = [self.reader.call("POST", "/wallet/deposit-sessions", {"packageCode": "COIN_100"}).status for _ in range(40)]
            return 429 in statuses, {"requests": len(statuses), "status_counts": {str(s): statuses.count(s) for s in set(statuses)}}
        self.record("TC-PAY-15", "API thanh toán có giới hạn tần suất (429)", payment_rate_limit)

    # ADMIN NOVEL MANAGEMENT ----------------------------------------------------
    def admin_cases(self) -> None:
        target = (getattr(self, "test_novel", {}) or {}).get("novelId")
        # An autosave creates the Mongo draft that the removal must archive (TC-ADM-08).
        chapter = self.sql("SELECT chapter_id FROM chapters WHERE novel_id = %s AND deleted_at IS NULL ORDER BY created_at LIMIT 1", (target,))
        self.autosave = None
        if chapter:
            current = self.author.call("GET", f"/chapters/{chapter[0][0]}").data or {}
            version = (current.get("draft") or {}).get("version") or current.get("draftVersion") or 0
            self.autosave = self.author.call("PATCH", f"/chapters/{chapter[0][0]}", {
                "content": "Bản nháp autosave cho kiểm thử SRS.", "autosave": True, "expectedVersion": int(version)})

        def list_and_detail():
            listing = self.admin.call("GET", "/admin/novels", params={"q": "SRS Novel"})
            detail = self.admin.call("GET", f"/admin/novels/{target}")
            found = any(item.get("novelId") == target for item in listing.data or [])
            return listing.status == 200 and found and detail.status == 200, {"list": listing.brief(), "found": found, "detail": detail.brief()}
        self.record("TC-ADM-01", "Admin xem danh sách và chi tiết truyện", list_and_detail)

        def remove_requires_confirm():
            response = self.admin.call("DELETE", f"/admin/novels/{target}", {"reason": "SRS"})
            still = self.sql("SELECT deleted_at FROM novels WHERE novel_id = %s", (target,))[0][0]
            return response.status == 400 and still is None, {"response": response.brief(), "deleted_at": still}
        self.record("TC-ADM-02", "Gỡ truyện thiếu xác nhận không thay đổi dữ liệu", remove_requires_confirm)

        def non_admin_remove():
            response = self.author.call("DELETE", f"/admin/novels/{target}", {"confirm": True})
            return response.status == 403 and response.code == "AUTH_008", {"response": response.brief()}
        self.record("TC-ADM-04", "Người không phải Admin không gỡ được truyện (AUTH_008)", non_admin_remove)

        def remove_soft_and_notify():
            response = self.admin.call("DELETE", f"/admin/novels/{target}", {"confirm": True, "reason": "SRS acceptance"})
            novel_deleted = self.sql("SELECT deleted_at IS NOT NULL FROM novels WHERE novel_id = %s", (target,))[0][0]
            live_chapters = self.sql("SELECT count(*) FROM chapters WHERE novel_id = %s AND deleted_at IS NULL", (target,))[0][0]
            listing = self.admin.call("GET", "/admin/novels", params={"q": "SRS Novel"})
            gone = all(item.get("novelId") != target for item in listing.data or [])
            notified = self.wait(lambda: [item for item in (self.author.call("GET", "/notifications").data or [])
                                          if "gỡ" in json.dumps(item, ensure_ascii=False).lower()], timeout=20)
            ok = response.status in (200, 204) and novel_deleted and live_chapters == 0 and gone and bool(notified)
            return ok, {"remove": response.brief(), "novel_soft_deleted": novel_deleted, "live_chapters": live_chapters, "gone_from_list": gone, "author_notified": bool(notified)}
        self.record("TC-ADM-03", "Gỡ mềm truyện: ẩn truyện và chương, báo tác giả", remove_soft_and_notify)

        def drafts_archived():
            db = self.mongo()
            drafts = db["draft_chapters"]
            total = drafts.count_documents({"novelId": target})
            live = drafts.count_documents({"novelId": target, "deletedAt": None})
            return total > 0 and live == 0, {"autosave": self.autosave.brief() if self.autosave else None, "drafts_total": total, "drafts_not_deleted": live,
                                             "mongo_db": db.name, "collections": sorted(db.list_collection_names()), "all_drafts": drafts.count_documents({})}
        self.record("TC-ADM-08", "Bản nháp Mongo của truyện bị gỡ được đánh dấu xoá", drafts_archived)

        def remove_missing():
            response = self.admin.call("DELETE", f"/admin/novels/{uuid.uuid4()}", {"confirm": True})
            return response.status == 404 and response.code == "CONTENT_001", {"response": response.brief()}
        self.record("TC-ADM-05", "Gỡ truyện không tồn tại trả CONTENT_001", remove_missing)

        def restore():
            response = self.admin.call("POST", f"/admin/novels/{target}/restore", {"reason": "SRS acceptance"})
            restored = self.sql("SELECT deleted_at IS NULL FROM novels WHERE novel_id = %s", (target,))[0][0]
            return response.status in (200, 204) and restored, {"restore": response.brief(), "visible_again": restored}
        self.record("TC-ADM-06", "Admin khôi phục truyện đã gỡ", restore)

    # AI + PERMISSIONS ----------------------------------------------------------
    def ai_and_permission_cases(self) -> None:
        def ai_fallback():
            response = self.author.call("POST", "/ai/copilot/suggestions", {"novelId": self.novel_id, "instruction": "Viết tiếp đoạn mở đầu"})
            data = response.data if isinstance(response.data, dict) else {}
            return response.code == "AI_001" and response.elapsed_ms < 5000, {
                "response": response.brief(), "data_keys": sorted(data)[:12], "data_preview": json.dumps(data, ensure_ascii=False)[:300]}
        self.record("TC-AI-06", "AI không sẵn sàng trả AI_001 trong 5 giây, không chặn thao tác", ai_fallback)

        def permission_matrix():
            checks = {
                "guest_reads_free_chapter": self.guest.call("GET", f"/reading/chapters/{self.free_chapter_id}").status == 200,
                "guest_cannot_follow": self.guest.call("POST", f"/authors/{self.author_id}/follow").status == 401,
                "author_cannot_admin": self.author.call("GET", "/admin/users").status == 403,
                "reader_cannot_moderate": self.reader.call("GET", "/admin/moderation/reviews").status == 403,
            }
            return all(checks.values()), checks
        self.record("TC-SYS-01", "Ma trận quyền Guest/Reader/Author/Admin", permission_matrix)

        def novel_list_latency():
            samples = [self.guest.call("GET", "/novels", params={"limit": 20}).elapsed_ms for _ in range(5)]
            return max(samples) < 2000, {"samples_ms": samples}
        self.record("TC-SYS-03", "Danh sách truyện phản hồi dưới 2 giây (local)", novel_list_latency)

    def run(self) -> None:
        self.setup()
        for group in (self.auth_cases, self.reading_cases, self.social_cases, self.moderation_cases,
                      self.novel_cases, self.wallet_cases, self.admin_cases, self.ai_and_permission_cases):
            print(f"\n[{group.__name__}]")
            try:
                group()
            except Exception as error:
                traceback.print_exc()
                self.results.append({"id": f"{group.__name__}-setup", "title": "group aborted", "result": "FAIL", "detail": str(error), "seconds": 0})


def git_info() -> Dict[str, Any]:
    git = os.environ.get("GIT_EXECUTABLE") or shutil.which("git") or "git"

    def run(args: str) -> str:
        return subprocess.run(f'"{git}" {args}', shell=True, capture_output=True, text=True, cwd=REPO_ROOT).stdout.strip()
    return {"head_sha": run("rev-parse HEAD"), "branch": run("rev-parse --abbrev-ref HEAD"),
            "working_tree_dirty": bool(run("status --porcelain --untracked-files=no"))}


def main() -> int:
    stack = IsolatedStack(config_from_env("srs", default_backend_port=4314, default_web_port=5314))
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
    print(f"SRS ACCEPTANCE  branch={info['branch']} head={info['head_sha']} db={stack.config.db_name}")
    shared_before = fingerprint_shared()
    suite: Optional[Suite] = None
    failure = None
    try:
        stack.start()
        suite = Suite(stack, password)
        suite.run()
    except Exception as error:
        failure = f"{type(error).__name__}: {error}"
        traceback.print_exc()
    finally:
        stack.stop()
    shared_after = fingerprint_shared()
    results = suite.results if suite else []
    failed = [r for r in results if r["result"] != "PASS"]
    evidence = {
        "gate": "SRS-ACCEPTANCE", "tested_code_sha": info["head_sha"], "branch": info["branch"],
        "working_tree_dirty": info["working_tree_dirty"], "disposable_database": stack.config.db_name,
        "stack_steps": stack.steps, "db_ownership": stack.ownership, "teardown_ok": stack.teardown_ok,
        "shared_fingerprint_before": shared_before["sha256"], "shared_fingerprint_after": shared_after["sha256"],
        "shared_changes": diff_fingerprints(shared_before, shared_after), "failure": failure,
        "checks_total": len(results), "checks_failed": len(failed), "results": results,
    }
    evidence["verdict"] = "PASS" if results and not failed and failure is None and stack.teardown_ok and not evidence["shared_changes"] else "FAIL"
    with open(os.path.join(evidence_dir, "srs-acceptance-evidence.json"), "w", encoding="utf-8") as handle:
        json.dump(evidence, handle, indent=2, ensure_ascii=False, default=str)
    print(f"\nChecks: {len(results) - len(failed)}/{len(results)} PASS; teardown_ok={stack.teardown_ok}; shared_changes={evidence['shared_changes'] or 'none'}")
    for record in failed:
        print(f"  FAIL {record['id']} {record['title']}: {json.dumps(record['detail'], ensure_ascii=False, default=str)[:200]}")
    print(f"VERDICT = {evidence['verdict']}  (evidence: {evidence_dir})")
    return 0 if evidence["verdict"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
