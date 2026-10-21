import json
import urllib.request
import sys

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

unattached_ids = [
    ('970b5231-c08e-57f4-bbf0-c76fcda505ef', 'giọng trong bản ghi is sound/utterance, not an entity'),
    ('e2d5c8e2-cc43-53e6-946e-443758583193', 'con hẻm is background scenery'),
    ('60e0b37b-df87-5b84-b986-a3d101931a00', 'tường sau bếp is background scenery'),
    ('d8c668c2-2996-56ee-bf72-d8eb572c2d7a', 'túi áo của An is part of clothing, not entity'),
    ('ead7c1c8-bd9f-5bc9-b7f5-697a6aa5a8a6', 'danh sách trên tường cũ is background scenery'),
    ('3a6b8801-416d-5ac1-bf8c-116b986fd55f', 'danh sách trên tường cũ is background scenery'),
    ('b87138b0-80af-59cd-9f98-fa76cd396305', 'nhà mẹ is location not entity'),
    ('ec8ab259-7259-55dc-a920-947a5b4a9b1e', 'kho is unmapped reference'),
    ('0f695c8f-d5ae-5087-b22a-74e235ec233f', 'tay quay is background object'),
    ('45d7c83b-60d7-5a9b-9562-9edba3a987e0', 'mặt kênh is background scenery'),
    ('0f056196-b58a-58d7-8d3b-f4597c68f7d6', 'bậc thang is background scenery'),
    ('64cea3e0-38b8-591f-8647-97eca7c489ed', 'chậu cây is background scenery'),
    ('c819a997-384a-5447-8916-78232c8dfeb7', 'gió is weather/scenery'),
    ('fa924d0e-6e37-5c93-b74a-8b5f6e5f9f8d', 'Lịch triều is UI display'),
    ('8b03983a-4ac1-5b03-aecb-5a03867403e3', 'kho is unmapped reference'),
    ('8caf6b05-5c21-5a4c-bc6f-71d784c4a0d1', 'vệt dầu cũ is background scenery'),
    ('03aa3be0-53b4-5fb5-86e0-5ac9d2c32f75', 'cửa cầu thang phụ is background scenery')
]

for pid, reason in unattached_ids:
    url = f'http://localhost:18000/v1/proposals/{pid}/reject'
    headers = {
        'Authorization': 'Bearer test-token',
        'X-Service-Token': 'test-token',
        'X-Tenant-Id': '00000000-0000-0000-0000-000000000001',
        'X-Request-Id': f'req-reject-{pid[:8]}',
        'Content-Type': 'application/json'
    }
    body = json.dumps({'reason': reason}).encode()
    req = urllib.request.Request(url, data=body, headers=headers, method='POST')
    try:
        res = json.loads(urllib.request.urlopen(req).read().decode())
        print(f"Rejected {pid}: {res['data']['status']}")
    except Exception as e:
        print(f"Failed to reject {pid}: {e}")

print("Completed author rejection of unattached proposals.")
