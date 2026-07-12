import requests
import json

url = "http://127.0.0.1:8000/v1/ai/kb/confirm"
payload = {
    "story_id": "test_narrative_v2",
    "text": "# Chương 1: Thiếu Niên Vùng Biên Thùy\n\nTiêu Trần đứng trên đỉnh Thương Loan Sơn, phóng tầm mắt nhìn về phía xa xăm, nơi mây mù bao phủ lấy Thanh Vân Môn — tông môn lớn nhất vùng Đông Hải. Gió thổi lồng lộng làm mái tóc đen của hắn bay loạn, nhưng đôi mắt hắn lại bình thản đến lạ kỳ.\n\n\"Tiêu Trần, ngươi lại lười biếng rồi!\" Một giọng nói trong trẻo vang lên.\n\nTiêu Trần mỉm cười, không cần quay đầu lại cũng biết đó là Lâm Nguyệt Nhi, thanh mai trúc mã của hắn. Cô là con gái của thành chủ Thanh Châu Thành, sở hữu thiên phú tu luyện khiến nhiều người ghen tị.\n\n\"Nguyệt Nhi, tỷ xem, Thanh Vân Môn trông thật hùng vĩ. Một ngày nào đó, đệ nhất định sẽ gia nhập Thanh Liên Kiếm Phái, trở thành một kiếm tu chân chính.\" Tiêu Trần hào hứng nói.\n\nLâm Nguyệt Nhi bĩu môi: \"Thanh Liên Kiếm Phái chỉ tuyển những thiên tài thực thụ. Ngươi ngay cả Linh Khí cũng chưa cảm ứng được, làm sao gia nhập? Thôi, đừng mơ mộng nữa, mau quay về tu luyện Sơ Cấp Công Pháp đi.\"\n\nTiêu Trần im lặng. Hắn biết mình vốn là phế vật trong mắt mọi người ở Tiêu Gia. Nhưng không ai biết rằng, trong tay hắn đang nắm giữ một bí mật lớn: một mảnh ngọc bội cổ xưa có khắc bốn chữ 'Vạn Kiếm Quy Tông'.\n\nBất thình lình, bầu trời Thanh Châu Thành tối sầm lại. Một luồng hắc khí cuồn cuộn từ phương Bắc kéo đến. Những tiếng hét thảm thiết vang lên từ phía dưới thung lũng.\n\n\"Không ổn! Là người của Hắc Ma Hội!\" Lâm Nguyệt Nhi biến sắc, thanh kiếm Băng Lam Kiếm trong tay cô run rẩy.\n\nHắc Ma Hội là một tổ chức tà ác chuyên đi cướp bóc và tàn sát các gia tộc nhỏ. Lần này, mục tiêu của chúng dường như chính là Tiêu Gia tại Thanh Châu Thành.\n\n\"Mau đi!\" Tiêu Trần nắm lấy tay Lâm Nguyệt Nhi, cả hai lao nhanh xuống núi. Hắn biết, một trận cuồng phong bão táp sắp ập đến.",
    "approved_candidates": [
        {
            "id": "cand_1",
            "raw_name": "Thương Loan Sơn",
            "normalized_name": "Thương Loan Sơn",
            "type": "LOC",
            "confidence": 0.95,
            "status": "pending",
            "source": "ner",
            "action": "suggest_add"
        },
        {
            "id": "cand_2",
            "raw_name": "Thanh Vân Môn",
            "normalized_name": "Thanh Vân Môn",
            "type": "ORG",
            "confidence": 0.95,
            "status": "pending",
            "source": "ner",
            "action": "suggest_add"
        },
        {
            "id": "cand_3",
            "raw_name": "Tiêu Trần",
            "normalized_name": "Tiêu Trần",
            "type": "PER",
            "confidence": 0.95,
            "status": "pending",
            "source": "ner",
            "action": "suggest_add"
        },
        {
            "id": "cand_4",
            "raw_name": "Băng Lam Kiếm",
            "normalized_name": "Băng Lam Kiếm",
            "type": "ITEM",
            "confidence": 0.9,
            "status": "pending",
            "source": "ner",
            "action": "suggest_add"
        },
        {
            "id": "cand_5",
            "raw_name": "Đông Hải",
            "normalized_name": "Đông Hải",
            "type": "LOC",
            "confidence": 0.85,
            "status": "pending",
            "source": "ner",
            "action": "suggest_add"
        },
        {
            "id": "cand_6",
            "raw_name": "Lâm Nguyệt Nhi",
            "normalized_name": "Lâm Nguyệt Nhi",
            "type": "PER",
            "confidence": 0.85,
            "status": "pending",
            "source": "ner",
            "action": "suggest_add"
        },
        {
            "id": "cand_7",
            "raw_name": "Hắc Ma Hội",
            "normalized_name": "Hắc Ma Hội",
            "type": "ORG",
            "confidence": 0.85,
            "status": "pending",
            "source": "ner",
            "action": "suggest_add"
        },
        {
            "id": "cand_8",
            "raw_name": "Thành chủ Thanh Châu Thành",
            "normalized_name": "Thành chủ Thanh Châu Thành",
            "type": "PER",
            "confidence": 0.75,
            "status": "pending",
            "source": "ner",
            "action": "suggest_add"
        },
        {
            "id": "cand_9",
            "raw_name": "Thanh Liên Kiếm Phái",
            "normalized_name": "Thanh Liên Kiếm Phái",
            "type": "ORG",
            "confidence": 0.75,
            "status": "pending",
            "source": "ner",
            "action": "suggest_add"
        }
    ]
}

def test_api():
    print("Testing /kb/confirm (Option A) with Event & State updates...")
    try:
        response = requests.post(url, json=payload)
        response.raise_for_status()
        data = response.json()
        
        print("\nAPI Response:")
        print(json.dumps(data, indent=2, ensure_ascii=True))
        
    except Exception as e:
        print(f"API Test failed: {e}")
        if hasattr(e, 'response') and e.response:
            print(f"Response: {e.response.text}")

if __name__ == "__main__":
    test_api()
