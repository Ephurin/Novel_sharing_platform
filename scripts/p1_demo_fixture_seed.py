"""
P1 Author Experience — Reusable Demo Fixture Seeder
Creates the standard 3-chapter + 1-writing-loop demo fixture for P1 Author Experience
using authenticated public/authorized production API paths.

Usage:
  python scripts/p1_demo_fixture_seed.py --gateway http://127.0.0.1:14000/api/v1 --output ./demo-manifest.json
"""
import argparse, json, secrets, sys, urllib.request, urllib.error

def request(method, url, data=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            content = resp.read().decode("utf-8")
            return json.loads(content) if content else {}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(err_body)
            return {"_status": e.code, "_error": parsed}
        except Exception:
            return {"_status": e.code, "_raw": err_body}
    except Exception as err:
        return {"_status": 0, "_error": str(err)}

PROSE_CH1 = """Ánh hoàng hôn buông xuống Trấn Thanh Phong, nhuộm đỏ những mái ngói rêu phong của các gia tộc tu chân nơi biên thùy. Tại một góc sân luyện võ, Lâm Phong khẽ lau đi mồ hôi trên trán, đưa tay chạm vào chiếc Ngọc Bội Huyết Long đeo trước ngực. Miếng ngọc bội gia truyền màu đỏ thẫm nguyên vẹn, bề mặt khắc họa hình rồng cuộn tinh xảo, tỏa ra luồng khí ấm áp dịu dàng.

Từ ngoài cổng viện, tiếng bước chân thanh thoát vang lên. Diệp Linh Nhi mỉm cười bước vào, trên tay cầm theo một hộp đan dược do nàng tự tay luyện chế: "Lâm Phong ca ca, ngày mai chúng ta phải tiến vào Hang Hắc Long tìm Hắc Huyết Thảo rồi, huynh đã chuẩn bị xong chưa?" Lâm Phong gật đầu, ánh mắt kiên định nhìn về phía dãy núi mờ xa."""

PROSE_CH2 = """Trong lòng Hang Hắc Long ẩm ướt và tối tăm, luồng yêu khí nồng nặc bốc lên. Đột nhiên, một con Hắc Long Xà khổng lồ lao ra từ vách đá, đuôi rắn mang theo kình phong xé toạc không khí quét thẳng về phía Diệp Linh Nhi. Trong khoảnh khắc ngàn cân treo sợi tóc, Lâm Phong không ngần ngại lao mình che chắn trước mặt nàng.

Một tiếng nổ chát chúa vang lên khi đòn tấn công va chạm thẳng vào ngực Lâm Phong. Chiếc Ngọc Bội Huyết Long phát ra ánh sáng đỏ chói lòa chống đỡ một phần uy lực, nhưng dưới áp lực khủng khiếp, tiếng rạn nứt vang lên giòn giã. Miếng ngọc bội vỡ làm đôi. Lâm Phong ôm ngực thổ huyết đẩy lui con yêu thú. Sau khi thoát khỏi hang động, Lâm Phong giữ lại nửa mảnh có hình long đầu, còn nửa mảnh vỡ mang hình long vĩ rơi vào tay Diệp Linh Nhi khi nàng đỡ lấy hắn."""

PROSE_CH3 = """Trở về Trấn Thanh Phong sau trận tử chiến, Lâm Phong ngồi tĩnh tọa trong căn phòng nhỏ, nhìn nửa mảnh ngọc bội long đầu nằm trong lòng bàn tay. Diệp Linh Nhi sau khi bôi thuốc cho hắn đã mang nửa mảnh long vĩ về đan phòng để nghiên cứu thành phần ngọc thạch kỳ lạ này. Cả hai đều không hề hay biết rằng, sự vỡ vụn của miếng ngọc chính là bước đầu tiên mở ra một bí mật long trời lở đất."""

PROSE_CH4_WRITING_LOOP = """Sáng sớm hôm sau, Lâm Phong mang theo nửa mảnh ngọc long đầu bước ra khỏi Trấn Thanh Phong, hướng về phía Cổ Sơn..."""

AUTHOR_SECRET_NOTE = """BÍ MẬT TÁC GIẢ (CHỈ DÀNH CHO OUTLINE): Ngọc Bội Huyết Long không phải bảo vật bình thường mà là phong ấn nhốt một sợi tàn hồn của Cổ Đại Thần Ma. Khi bị vỡ làm đôi, phong ấn bắt đầu suy yếu. Chỉ khi máu của hậu duệ Thần Ma nhỏ vào đêm trăng tròn, phong ấn mới hoàn toàn giải trừ. Lâm Phong chính là huyết mạch Ma Thần duy nhất còn sót lại tại thế gian. Tuyệt đối không tiết lộ trong Canon hay context của độc giả trước Chương 50."""

def seed_demo_fixture(gateway_base, output_path=None):
    print(f"[*] Seeding demo fixture via Gateway: {gateway_base}")
    suffix = secrets.token_hex(4)
    username = f"author_p1_demo_{suffix}"
    email = f"{username}@example.invalid"
    password = f"DemoP1!{secrets.token_hex(12)}"

    # 1. Register Author
    print(f"[1] Registering Author account: {username}")
    reg = request("POST", f"{gateway_base}/auth/register", {
        "username": username,
        "email": email,
        "password": password
    })
    assert reg.get("success") or reg.get("status") in (200, 201), f"Register failed: {reg}"
    user_id = reg.get("data", {}).get("user", {}).get("userId") or reg.get("data", {}).get("userId")

    # 2. Login
    print("[2] Logging in author")
    login = request("POST", f"{gateway_base}/auth/login", {
        "identifier": email,
        "password": password
    })
    token = login.get("data", {}).get("accessToken")
    assert token, f"Login failed: {login}"

    # 3. Create Novel
    print("[3] Creating Novel: Đại Lục Tinh Thần")
    novel = request("POST", f"{gateway_base}/novels", {
        "title": "Đại Lục Tinh Thần",
        "synopsis": "Hành trình tu chân và giải mã phong ấn Thần Ma của Lâm Phong và Diệp Linh Nhi."
    }, token)
    novel_id = novel.get("data", {}).get("novelId") or novel.get("data", {}).get("id")
    assert novel_id, f"Create novel failed: {novel}"

    # 4. Create Chapters 1, 2, 3
    chapters = []
    for idx, (title, content) in enumerate([
        ("Chương 1: Khởi Đầu Tại Trấn Thanh Phong", PROSE_CH1),
        ("Chương 2: Biến Cố Hang Hắc Long", PROSE_CH2),
        ("Chương 3: Bí Mật Lâm Gia", PROSE_CH3),
    ], start=1):
        print(f"[4.{idx}] Creating {title}")
        ch = request("POST", f"{gateway_base}/novels/{novel_id}/chapters", {
            "title": title,
            "content": content
        }, token)
        ch_id = ch.get("data", {}).get("chapterId") or ch.get("data", {}).get("id")
        assert ch_id, f"Create chapter {idx} failed: {ch}"
        
        # Snapshot revision
        rev = request("POST", f"{gateway_base}/chapters/{ch_id}/revisions/snapshot", {
            "content": content,
            "purpose": "MANUSCRIPT_BOOTSTRAP" if idx == 1 else "INCREMENTAL_ANALYSIS"
        }, token)
        rev_id = rev.get("data", {}).get("revisionId")
        chapters.append({"chapter_id": ch_id, "title": title, "revision_id": rev_id})

    # 5. Create Chapter 4 (Writing Loop Draft)
    print("[5] Creating Chapter 4 initial draft for writing loop demonstration")
    ch4 = request("POST", f"{gateway_base}/novels/{novel_id}/chapters", {
        "title": "Chương 4: Vết Tích Cổ Sơn",
        "content": PROSE_CH4_WRITING_LOOP
    }, token)
    ch4_id = ch4.get("data", {}).get("chapterId") or ch4.get("data", {}).get("id")
    chapters.append({"chapter_id": ch4_id, "title": "Chương 4: Vết Tích Cổ Sơn", "draft": True})

    manifest = {
        "novel_id": novel_id,
        "novel_title": "Đại Lục Tinh Thần",
        "author": {
            "user_id": user_id,
            "username": username,
            "email": email,
            "token": token
        },
        "chapters": chapters,
        "narrative_fixtures": {
            "characters": ["Lâm Phong", "Diệp Linh Nhi"],
            "location": "Trấn Thanh Phong",
            "item": "Ngọc Bội Huyết Long",
            "state_change": "Chapter 2: Ngọc Bội Huyết Long vỡ làm đôi (Lâm Phong giữ long đầu, Diệp Linh Nhi giữ long vĩ)",
            "author_secret_note": AUTHOR_SECRET_NOTE,
            "pending_correction_proposal": "Diệp Linh Nhi đeo ngọc bội vỡ -> Lâm Phong giữ long đầu, Diệp Linh Nhi giữ long vĩ"
        }
    }

    if output_path:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2, ensure_ascii=False)
        print(f"[+] Saved manifest to {output_path}")

    print("[✓] Demo fixture created successfully!")
    return manifest

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="P1 Demo Fixture Seeder")
    parser.add_argument("--gateway", default="http://127.0.0.1:4000/api/v1", help="API Gateway URL")
    parser.add_argument("--output", default="demo-fixture-manifest.json", help="Manifest output file")
    args = parser.parse_args()
    seed_demo_fixture(args.gateway, args.output)
