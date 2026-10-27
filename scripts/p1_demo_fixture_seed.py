"""
P1 Author Experience — Reusable Demo Fixture Seeder
Creates the standard 3-chapter + 1-writing-loop demo fixture for P1 Author Experience
using authenticated production API paths and fail-closed contract verification.

Usage:
  python scripts/p1_demo_fixture_seed.py --gateway http://127.0.0.1:14000/api/v1 --output ./demo-manifest.json
"""
import argparse
import datetime
import json
import os
import pathlib
import secrets
import subprocess
import sys
import urllib.error
import urllib.request

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

PROSE_CH1 = """Ánh hoàng hôn buông xuống Trấn Thanh Phong, nhuộm đỏ những mái ngói rêu phong của các gia tộc tu chân nơi biên thùy. Tại một góc sân luyện võ, Lâm Phong khẽ lau đi mồ hôi trên trán, đưa tay chạm vào chiếc Ngọc Bội Huyết Long đeo trước ngực. Miếng ngọc bội gia truyền màu đỏ thẫm nguyên vẹn, bề mặt khắc họa hình rồng cuộn tinh xảo, tỏa ra luồng khí ấm áp dịu dàng.

Từ ngoài cổng viện, tiếng bước chân thanh thoát vang lên. Diệp Linh Nhi mỉm cười bước vào, trên tay cầm theo một hộp đan dược do nàng tự tay luyện chế: "Lâm Phong ca ca, ngày mai chúng ta phải tiến vào Hang Hắc Long tìm Hắc Huyết Thảo rồi, huynh đã chuẩn bị xong chưa?" Lâm Phong gật đầu, ánh mắt kiên định nhìn về phía dãy núi mờ xa."""

PROSE_CH2 = """Trong lòng Hang Hắc Long ẩm ướt và tối tăm, luồng yêu khí nồng nặc bốc lên. Đột nhiên, một con Hắc Long Xà khổng lồ lao ra từ vách đá, đuôi rắn mang theo kình phong xé toạc không khí quét thẳng về phía Diệp Linh Nhi. Trong khoảnh khắc ngàn cân treo sợi tóc, Lâm Phong không ngần ngại lao mình che chắn trước mặt nàng.

Một tiếng nổ chát chúa vang lên khi đòn tấn công va chạm thẳng vào ngực Lâm Phong. Chiếc Ngọc Bội Huyết Long phát ra ánh sáng đỏ chói lòa chống đỡ một phần uy lực, nhưng dưới áp lực khủng khiếp, tiếng rạn nứt vang lên giòn giã. Miếng ngọc bội vỡ làm đôi. Lâm Phong ôm ngực thổ huyết đẩy lui con yêu thú. Sau khi thoát khỏi hang động, Lâm Phong giữ lại nửa mảnh có hình long đầu, còn nửa mảnh vỡ mang hình long vĩ rơi vào tay Diệp Linh Nhi khi nàng đỡ lấy hắn."""

PROSE_CH3 = """Trở về Trấn Thanh Phong sau trận tử chiến, Lâm Phong ngồi tĩnh tọa trong căn phòng nhỏ, nhìn nửa mảnh ngọc bội long đầu nằm trong lòng bàn tay. Diệp Linh Nhi sau khi bôi thuốc cho hắn đã mang nửa mảnh long vĩ về đan phòng để nghiên cứu thành phần ngọc thạch kỳ lạ này. Cả hai đều không hề hay biết rằng, sự vỡ vụn của miếng ngọc chính là bước đầu tiên mở ra một bí mật long trời lở đất."""

PROSE_CH4_WRITING_LOOP = """Sáng sớm hôm sau, Lâm Phong mang theo nửa mảnh ngọc long đầu bước ra khỏi Trấn Thanh Phong, hướng về phía Cổ Sơn..."""


def get_git_provenance():
    """Extract current commit and tree SHA for traceability."""
    try:
        sha = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
        tree = subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], text=True).strip()
        return {"commit_sha": sha, "tree_sha": tree}
    except Exception:
        return {"commit_sha": "UNKNOWN", "tree_sha": "UNKNOWN"}


def api_request(method, url, data=None, token=None, timeout=30):
    """
    Fail-closed HTTP request helper.
    Returns (status_code, parsed_json_or_raw).
    """
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            content = resp.read().decode("utf-8")
            parsed = json.loads(content) if content else {}
            return resp.status, parsed
    except urllib.error.HTTPError as err:
        raw = err.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(raw)
        except Exception:
            parsed = {"raw": raw}
        return err.code, parsed
    except Exception as exc:
        raise RuntimeError(f"Network transport error calling {method} {url}: {exc}") from exc


def seed_demo_fixture(gateway_base, output_path=None, private_output_path=None, run_id=None, with_canon=False):
    """
    Executes the standard demo fixture sequence using official production endpoints:
    1. Register User (Role READER)
    2. Login Reader
    3. Promote to Author (/auth/become-author)
    4. Create Novel with Author Token
    5. Create Chapters 1..3 with valid snapshot purposes:
       - Ch 1: MANUSCRIPT_BOOTSTRAP
       - Ch 2: AUTHOR_SNAPSHOT
       - Ch 3: AUTHOR_SNAPSHOT
    6. Create Chapter 4 Draft (for writing loop)
    7. Readback Verification
    8. Write sanitized public manifest (no credentials).
    """
    if not run_id:
        timestamp_str = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d_%H%M%S")
        run_id = f"demo_p1_{timestamp_str}_{secrets.token_hex(3)}"

    print(f"[*] Starting Demo Fixture Seeder [Run: {run_id}] against {gateway_base}")

    # Preflight Health Check
    status, health = api_request("GET", f"{gateway_base}/health")
    if status != 200:
        raise RuntimeError(f"FAIL-CLOSED: Gateway health check failed with status {status}: {health}")
    print("    [OK] Gateway is reachable and healthy")

    author_username = f"author_{run_id}"
    author_email = f"{author_username}@example.invalid"
    author_password = f"P1Demo!{secrets.token_hex(12)}"

    # 1. Register User (Default role is READER)
    print(f"[1/7] Registering Reader account: {author_username}")
    status, reg = api_request("POST", f"{gateway_base}/auth/register", {
        "username": author_username,
        "email": author_email,
        "password": author_password
    })
    if status not in (200, 201) or not reg.get("success"):
        raise RuntimeError(f"FAIL-CLOSED: Registration failed (HTTP {status}): {reg}")
    user_id = reg.get("data", {}).get("user", {}).get("userId") or reg.get("data", {}).get("userId")
    print(f"    [OK] User registered (ID: {user_id})")

    # 2. Login Reader to get initial access token
    print("[2/7] Logging in as Reader")
    status, login = api_request("POST", f"{gateway_base}/auth/login", {
        "identifier": author_email,
        "password": author_password
    })
    if status != 200 or not login.get("success"):
        raise RuntimeError(f"FAIL-CLOSED: Login failed (HTTP {status}): {login}")
    reader_token = login.get("data", {}).get("accessToken")
    if not reader_token:
        raise RuntimeError(f"FAIL-CLOSED: No accessToken in login response: {login}")
    print("    [OK] Reader login successful")

    # 3. Promote to AUTHOR role via production /auth/become-author
    print("[3/7] Promoting user to AUTHOR role via /auth/become-author")
    status, become_res = api_request("POST", f"{gateway_base}/auth/become-author", {}, token=reader_token)
    if status not in (200, 201) or not become_res.get("success"):
        raise RuntimeError(f"FAIL-CLOSED: become-author failed (HTTP {status}): {become_res}")
    author_token = become_res.get("data", {}).get("accessToken")
    if not author_token:
        raise RuntimeError(f"FAIL-CLOSED: become-author response missing new AUTHOR accessToken: {become_res}")
    print("    [OK] Successfully promoted to AUTHOR role; received upgraded access token")

    # 4. Create Novel with AUTHOR Token
    print("[4/7] Creating Novel: 'Đại Lục Tinh Thần'")
    status, novel_res = api_request("POST", f"{gateway_base}/novels", {
        "title": "Đại Lục Tinh Thần",
        "synopsis": "Hành trình tu chân và giải mã phong ấn Thần Ma của Lâm Phong và Diệp Linh Nhi."
    }, token=author_token)
    if status not in (200, 201) or not novel_res.get("success"):
        raise RuntimeError(f"FAIL-CLOSED: Novel creation failed (HTTP {status}): {novel_res}")
    novel_id = novel_res.get("data", {}).get("novelId") or novel_res.get("data", {}).get("id")
    if not novel_id:
        raise RuntimeError(f"FAIL-CLOSED: Novel ID missing from creation response: {novel_res}")
    print(f"    [OK] Novel created (ID: {novel_id})")

    # 5. Create Chapters 1..3 with Valid Revisions
    print("[5/7] Creating Chapters 1..3 and Snapshot Revisions")
    chapter_specs = [
        (1, "Chương 1: Khởi Đầu Tại Trấn Thanh Phong", PROSE_CH1, "MANUSCRIPT_BOOTSTRAP"),
        (2, "Chương 2: Biến Cố Hang Hắc Long", PROSE_CH2, "AUTHOR_SNAPSHOT"),
        (3, "Chương 3: Bí Mật Lâm Gia", PROSE_CH3, "AUTHOR_SNAPSHOT"),
    ]
    created_chapters = []

    for num, title, prose, purpose in chapter_specs:
        print(f"    - Creating Chapter {num}: {title}")
        status, ch_res = api_request("POST", f"{gateway_base}/novels/{novel_id}/chapters", {
            "title": title,
            "content": prose
        }, token=author_token)
        if status not in (200, 201) or not ch_res.get("success"):
            raise RuntimeError(f"FAIL-CLOSED: Chapter {num} creation failed (HTTP {status}): {ch_res}")
        chapter_id = ch_res.get("data", {}).get("chapterId") or ch_res.get("data", {}).get("id")
        if not chapter_id:
            raise RuntimeError(f"FAIL-CLOSED: Chapter {num} missing chapterId: {ch_res}")

        # Snapshot Revision with valid purpose enum
        status, snap_res = api_request("POST", f"{gateway_base}/chapters/{chapter_id}/revisions/snapshot", {
            "content": prose,
            "purpose": purpose
        }, token=author_token)
        if status not in (200, 201) or not snap_res.get("success"):
            raise RuntimeError(f"FAIL-CLOSED: Snapshot for chapter {num} failed (HTTP {status}, purpose={purpose}): {snap_res}")
        revision_id = snap_res.get("data", {}).get("revisionId")
        if not revision_id:
            raise RuntimeError(f"FAIL-CLOSED: Chapter {num} snapshot missing revisionId: {snap_res}")

        created_chapters.append({
            "number": num,
            "title": title,
            "chapter_id": chapter_id,
            "revision_id": revision_id,
            "purpose": purpose
        })
        print(f"      [OK] Chapter {num} seeded: chapter_id={chapter_id}, revision_id={revision_id}")

    # 6. Create Chapter 4 Draft (for Interactive Writing Loop)
    print("[6/7] Creating Chapter 4 initial draft for writing loop")
    status, ch4_res = api_request("POST", f"{gateway_base}/novels/{novel_id}/chapters", {
        "title": "Chương 4: Vết Tích Cổ Sơn",
        "content": PROSE_CH4_WRITING_LOOP
    }, token=author_token)
    if status not in (200, 201) or not ch4_res.get("success"):
        raise RuntimeError(f"FAIL-CLOSED: Chapter 4 creation failed (HTTP {status}): {ch4_res}")
    ch4_id = ch4_res.get("data", {}).get("chapterId") or ch4_res.get("data", {}).get("id")
    created_chapters.append({
        "number": 4,
        "title": "Chương 4: Vết Tích Cổ Sơn",
        "chapter_id": ch4_id,
        "revision_id": None,
        "purpose": "UNSAVED_DRAFT_INITIAL"
    })
    print(f"    [OK] Chapter 4 seeded: chapter_id={ch4_id}")

    # 7. Readback Verification
    print("[7/7] Executing readback verification via production API")
    status, list_ch_res = api_request("GET", f"{gateway_base}/novels/{novel_id}/chapters", token=author_token)
    if status != 200:
        raise RuntimeError(f"FAIL-CLOSED: Readback of chapters failed (HTTP {status}): {list_ch_res}")
    ch_items = list_ch_res.get("data", {}).get("items") or list_ch_res.get("data") or []
    if len(ch_items) < 4:
        raise RuntimeError(f"FAIL-CLOSED: Readback expected at least 4 chapters, found {len(ch_items)}")
    print(f"    [OK] Verified {len(ch_items)} chapters persisted")

    # Determine Fixture Stages
    basic_fixture_ready = True
    canon_fixture_ready = False
    canon_notes = "CANON_FIXTURE_PENDING_HITL (Requires execution through Story Brain HITL approval endpoint)"

    if with_canon:
        print("[*] Attempting Story Brain Manuscript Bootstrap...")
        status, bs_res = api_request("POST", f"{gateway_base}/ai/story-brains/bootstrap/from-manuscript", {
            "novel_id": novel_id,
            "chapter_id": created_chapters[0]["chapter_id"]
        }, token=author_token)
        if status in (200, 201, 202) and bs_res.get("success"):
            canon_fixture_ready = True
            canon_notes = "CANON_FIXTURE_READY (Bootstrap initiated via production API)"
            print("    [OK] Story Brain bootstrap initiated")
        else:
            print(f"    [!] Story Brain bootstrap returned HTTP {status}: {bs_res}")
            canon_notes = f"CANON_FIXTURE_ATTEMPTED_STATUS_{status}"

    # Build Sanitized Public Manifest (Strictly NO credentials, NO tokens, NO passwords)
    git_info = get_git_provenance()
    manifest = {
        "manifest_type": "P1_DEMO_FIXTURE_PUBLIC_MANIFEST",
        "fixture_version": "1.0",
        "run_id": run_id,
        "git_provenance": git_info,
        "novel": {
            "novel_id": novel_id,
            "title": "Đại Lục Tinh Thần"
        },
        "author": {
            "user_id": user_id,
            "username": author_username
            # NOTE: token and password are strictly excluded for credential safety
        },
        "chapters": created_chapters,
        "stages": {
            "basic_fixture": "BASIC_FIXTURE_READY" if basic_fixture_ready else "FAILED",
            "canon_fixture": "CANON_FIXTURE_READY" if canon_fixture_ready else "CANON_FIXTURE_PENDING_HITL",
            "details": canon_notes
        },
        "narrative_design": {
            "characters": ["Lâm Phong", "Diệp Linh Nhi"],
            "location": "Trấn Thanh Phong",
            "item": "Ngọc Bội Huyết Long",
            "temporal_change": "Chapter 2: Ngọc Bội Huyết Long vỡ làm đôi (Lâm Phong giữ long đầu, Diệp Linh Nhi giữ long vĩ)",
            "lore_boundary": "Confidential Ma Thần lore is excluded from Canon and public artifacts"
        },
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "final_status": "BASIC_FIXTURE_READY"
    }

    if output_path:
        out_p = pathlib.Path(output_path).resolve()
        out_p.parent.mkdir(parents=True, exist_ok=True)
        with open(out_p, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2, ensure_ascii=False)
        print(f"[+] Saved sanitized public manifest to {out_p}")

    # Optionally write private credentials outside repository
    if private_output_path:
        priv_p = pathlib.Path(private_output_path).resolve()
        priv_p.parent.mkdir(parents=True, exist_ok=True)
        private_data = {
            "run_id": run_id,
            "user_id": user_id,
            "username": author_username,
            "email": author_email,
            "password": author_password,
            "author_token": author_token,
            "novel_id": novel_id,
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }
        with open(priv_p, "w", encoding="utf-8") as f:
            json.dump(private_data, f, indent=2)
        print(f"[+] Saved private credentials outside repo to {priv_p}")

    print("\n[OK] BASIC_FIXTURE_READY: Minimal demo fixture created and verified successfully via production API!")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="P1 Demo Fixture Seeder")
    parser.add_argument("--gateway", default="http://127.0.0.1:14000/api/v1", help="API Gateway URL")
    parser.add_argument(
        "--output",
        default="docs/development/integration/p1-author/p1-demo-qa-prep/evidence/demo-fixture-manifest.json",
        help="Public manifest output path"
    )
    parser.add_argument(
        "--private-output",
        default=None,
        help="Private credentials output path (MUST be outside repository)"
    )
    parser.add_argument("--run-id", default=None, help="Explicit unique run ID")
    parser.add_argument(
        "--with-canon-bootstrap",
        action="store_true",
        default=False,
        help="Attempt Story Brain manuscript bootstrap"
    )
    args = parser.parse_args()

    try:
        seed_demo_fixture(
            gateway_base=args.gateway,
            output_path=args.output,
            private_output_path=args.private_output,
            run_id=args.run_id,
            with_canon=args.with_canon_bootstrap
        )
    except Exception as exc:
        print(f"\n[FAIL-CLOSED ERROR] Demo fixture creation aborted: {exc}", file=sys.stderr)
        sys.exit(1)

