"""Generate a navigable code/evidence map. Reads source; never starts the app or LLM."""
from pathlib import Path
import datetime as dt
import hashlib
import json
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
RUN = 'Pipeline_test/runs/2026-10-19-recovery-ui-01/'
phases = []
nodes = []
issues = {}

def issue(key, title, kind, detail, evidence, close):
    issues[key] = dict(id=key, title=title, kind=kind, detail=detail,
                       evidence=evidence, close=close)

def phase(key, title, scope, source):
    phases.append(dict(id=key, title=title, scope=scope, source=source))

def node(key, title, state, incoming, outgoing, control, problem, gate, source=None, next=None):
    p = key[0]
    src = source or [x['source'] for x in phases if x['id'] == p][0]
    nodes.append(dict(id=key, phase=p, title=title, state=state, incoming=incoming,
        outgoing=outgoing, control=control, issues=problem.split() if problem else [],
        gate=gate, source=src, next=next or []))

issue('MEM-CRITICAL-001','Bỏ sót hoặc sai nghĩa facts gold','live',
 '35 assertions gồm facts/events/uncertainty, KHÔNG phải 35 entities. Raw:15 PASS/16 FAIL/4 PARTIAL. Sau review:13 PASS/19 FAIL/2 PARTIAL/1 author wording. Chưa đo precision toàn187 proposals.',
 RUN+'evidence/m0-gold-manual.json',
 'Retest cùng35 gold cố định; critical assertions đúng nội dung/certainty/provenance; báo raw và sau sửa riêng, không dùng đếm records làm recall.')
issue('ENTITY-COVERAGE','Chưa chứng minh entity recall và alias','gap',
 'Một lượt entity extraction, chưa có inventory độc lập để rà thiếu. Alias records=0 trong run; Linh/Mai Linh và Vũ/Nguyễn Vũ có thể tách danh tính. Không suy ra recall entity từ15/35 gold.',
 'ai-service/services/entity_pipeline/pipeline.py; '+RUN+'evidence/m0-after-review/official-memory.json',
 'Tạo gold entity/mention/alias riêng; đo candidate recall, verified recall và false merge; cover tên lạ, vật phẩm có mã và danh xưng.')
issue('ENTITY-HOMONYM','An bị bám vào chữ “an” trong “an toàn”','live',
 'Có span thật nhưng ngữ cảnh không phải người An; tác giả đã loại proposal tương ứng. Grounding hình thức không chứng minh nghĩa.',
 RUN+'evidence/s02-raw/proposals-pending.json',
 'Negative control an toàn/an tâm không tạo mention của An; quyết định theo từng occurrence có offset/ngữ cảnh.')
issue('EXTRACT-SUBJECT-UNRESOLVED-001','Subject không phân giải được','live',
 'INVALID_PROJECTION với Unknown/generic subjects. M0 cần28 unique fact edits và3 numeric rejections; subject prompt chưa được ràng buộc đủ trước review.',
 RUN+'evidence/s03-applied-repairs-ui.json',
 'Mọi confirmed subject có canonical ID hoặc trạng thái unresolved rõ; không tự tạo Unknown entity; numeric/general fact sửa được và không mất assertion.')
issue('REVIEW-EDITS-RESET-001','Duyệt nhóm làm mất edits nhóm khác','live',
 'AuthorMemoryPanel gọi setEdits({}) sau approve; phải nhập lại các edits đã staging ở nhóm khác.',
 'web/src/features/ai-copilot/AuthorMemoryPanel.tsx; '+RUN+'evidence/s03-current-group-93.json',
 'Hai nhóm cùng có edits; approve nhómA chỉ xóa editsA, editsB giữ nguyên sau refetch và có cơ chế tránh mất do reload.')
issue('WRITE-INVALID-JSON-001','JSON dang dở vẫn được coi là prose','live',
 'Generation completed với JSON chưa đóng; parse fallback sang raw; UI ghi đã kiểm định và cho accept. Tester đã bỏ qua, không thực hiện accept bản lỗi.',
 RUN+'evidence/s07-generated-before-accept/writing-generations.json',
 'Malformed/truncated/empty output phải failed có lý do, không accept được ở UI/server; output prose hợp lệ vẫn qua. Không khẳng định MAX_TOKENS khi thiếu finish-reason.')
issue('EXTRACT-ROLE-CONFUSION-001','Nhầm vai trò và trạng thái','live',
 'Nhóm người rời trạm bị chuyển thành trạm Bốn status=Rời đi; tác giả loại. Một số phát biểu chưa xác nhận bị nâng thành confirmed.',
 RUN+'evidence/s08-author-edits.json; '+RUN+'evidence/m0-gold-manual.json',
 'Kiểm tra subject–predicate–value và certainty; station không nhận human action/life status; phủ định/đồn đoán không đổi confirmed state.')
issue('REANALYSIS-LIVE-UNRESOLVED-001','Reconciliation không ra quyết định hợp lệ','live',
 'UI và outbox trả CANON_RECONCILIATION_UNRESOLVED, attempts=3; canon target/kind không hợp lệ. Guard đã chặn partial group nhưng chức năng vẫn FAIL.',
 RUN+'evidence/reanalysis-result-ui.txt; '+RUN+'evidence/final/outbox.json',
 'Reanalyse cùng revision ra nhóm đúng; many-reuse giữ IDs; replace/removed có nguồn; không đổi thành new để né lỗi; lỗi vẫn atomic/actionable.')
issue('GROUNDING-GUARD','Quote mơ hồ: guard đã sửa, live case chưa đủ','mixed',
 'Unique span và bounded quote repair đã có test. Facts grounding unresolved làm fail analysis; event quote không ground được có thể bị bỏ qua, entity status có thể hạ Unknown.',
 'ai-service/services/source_grounding.py; '+RUN+'../2026-10-19-reanalysis-recovery/REPORT.md',
 'Quote lặp cần mở rộng ngữ cảnh đúng; bảo toàn Unicode offset/hash. Báo rõ số event bị bỏ qua, không coi schema success là coverage pass.')
issue('GATEWAY-KEY','Reanalysis Idempotency-Key đã sửa','mixed',
 'UI tạo khóa mới cho action, gateway scoped/hash và forward. Live đã qua gateway tới reconciliation; chưa có reanalysis thành công end-to-end.',
 'backend/src/modules/ai/ai-gateway.controller.ts; '+RUN+'evidence/reanalysis-result-ui.txt',
 'Retry cùng action không tạo duplicate; action phân tích lại mới có run mới đúng canon; route không thiếu header, không tràn chiều dài key.')
issue('PROVIDER-503-001','Gemini quá tải và retry','live',
 '503 high demand; consistency cần retry. Kết thúc run còn5 outbox unfinished; backend/AI stack test riêng đã được dừng có chủ đích.',
 RUN+'evidence/stopped-checkpoint.json; '+RUN+'evidence/provider-http-attempts.json',
 'Phân loại provider/semantic/schema errors, retry có giới hạn và quan sát chi phí; restart đọc lease/state, không gọi lặp mù.')
issue('CONTEXT-COVERAGE','Context pack chưa chứng minh đủ thông tin cần thiết','live',
 '70 hàng kiểm tra là35 assertions trên2 request cố định Linh/cutoff5, không phải70 retrieval calls. 4k:3 present/11 dropped/21 upstream gap;8192:6/8/21. Không yêu cầu pack tất cả gold cùng lúc.',
 RUN+'memory_probes.csv; '+RUN+'evidence/m0-after-review/',
 'Mỗi tác vụ có expected/forbidden riêng; trace retrieved/selected/dropped và source version; phân biệt thiếu upstream với bị pack bỏ; kiểm chứng prompt thực.')
issue('SEMANTIC-UNVERIFIED','Semantic/embedding chưa chứng minh live','untested',
 'Code có derived event embeddings, retrieval và fallback. Run này chưa đủ bằng chứng query/candidate/rank/embedding version để kết luận semantic lane đạt.',
 'ai-service/application/semantic_memory_service.py; ai-service/application/semantic_retriever.py',
 'Backfill/update/retire embeddings, lỗi provider/fallback, cutoff và tenant isolation phải có live evidence; không đồng nhất semantic chunk với extraction chunk.')
issue('STATE-OPTIONS','Bootstrap và incremental khác cấu hình','gap',
 'Bootstrap bật state transitions; API incremental mặc định tắt. check_consistency/build_embeddings có schema nhưng RevisionAnalysisService không tự thực thi chỉ vì option=true.',
 'ai-service/api/schemas.py; ai-service/application/revision_analysis_service.py',
 'Thống nhất contract từng mode, trả effective options; có test execution trace, không ngầm hứa consistency từ một cờ chưa dùng.')
issue('CHUNKING-GAP','Event/fact chưa chia nhỏ chương','gap',
 'Entity discovery đã có overlap/absolute offsets dưới flag. Event/fact/coverage vẫn toàn chương; _split_scenes chỉ đếm. Chưa merge assertions theo chunk.',
 'ai-service/application/bootstrap_service.py; ai-service/application/revision_analysis_service.py',
 'Nếu bổ sung chunking: offset tuyệt đối, overlap dedup, ngữ cảnh nối đoạn và gold so sánh; không coi chunking tự động bảo đảm đủ entities/facts.')
issue('P2-UNTESTED','Luồng ý tưởng chưa retest live','untested',
 'UI dùng mode=extract; backend còn mode=blueprint tạo nội dung mới. P2 NOT_RUN trong recovery run; không lấy P1 PASS cục bộ suy ra P2 PASS.',
 'ai-service/application/bootstrap_service.py; Pipeline_test/WORKFLOW_CONTRACT.md',
 'Đầu vào setup giữ ràng buộc, chỉ trích phần đã cung cấp; outline chưa thành lịch sử; duyệt/init→chương đầu→M-FIRST có evidence riêng.')
issue('P3-UNTESTED','Full auto chưa chứng minh toàn hành trình','untested',
 'Controller có planning/generate/accept/auto-approve/evaluate/stop. Recovery run không chạy P3;0 pending proposals không đủ chứng minh extraction hoàn tất.',
 'backend/src/modules/ai/autonomous-controller.service.ts; '+RUN+'REPORT.md',
 'Nhiều objectives; lỗi memory không advance; crash/resume không sinh/accept trùng; stop/restart/terminal; không publish; 100k có content audit thật.')
issue('VALIDATION-SCOPE','Kiểm định writing còn giới hạn','gap',
 'Có patch offsets/empty check và quy tắc heuristic (dead action/world rules). Không tương đương full literary/semantic consistency; UI wording có thể nói quá mức đã kiểm tra.',
 'ai-service/application/writing_service.py; web/src/features/ai-copilot/WritingAssistantPanel.tsx',
 'Hiển thị validator nào đã chạy; tách parse/patch/consistency/literary verdict; kiểm tra Unicode, flashback, quote, negation; không gắn nhãn đã kiểm định chung.')
issue('FINAL-QUALITY','Chưa hoàn thành hoặc đánh giá tiểu thuyết dài','untested',
 'Run có4992 từ =4747 fixture +245 tác giả viết,6 drafts, không có chương mới hoàn chỉnh;100k/P2/P3 NOT_RUN. Không có literary score độc lập.',
 RUN+'REPORT.md; '+RUN+'revision_manifest.csv',
 '95–105k theo task, ending/payoffs/continuity/POV/repetition kiểm tra; source attribution và independent review; word count hoặc completed jobs không đủ.')
issue('SNAPSHOT-GAP','Save và memory có thể lệch thời điểm','mixed',
 'Revision/outbox/provenance có guard. S08 stale proposal đã bị chặn. S09 saves chồng nhau chưa hoàn tất dedup; cuối run5 jobs chưa xong. Phiên auth hết hạn đã phải đăng nhập lại.',
 RUN+'evidence/s08-stale-rejection-ui.txt; '+RUN+'evidence/stopped-checkpoint.json',
 'Save success có readback; latest revision eventual extraction; stale results không apply; duplicate/no-op save không tạo canon trùng; restart phục hồi lease có evidence.')
issue('OBSERVABILITY','Trace chưa phủ đều tất cả các call','gap',
 'Structured traces có source/hash/model/finish/usage. Writing unstructured chưa có finish reason đủ chứng minh lỗi cắt.104 observed HTTP responses không phải tổng billed calls.',
 RUN+'evidence/provider-traces-progress.json; '+RUN+'REPORT.md',
 'Trace xuyên UI→revision→analysis→proposal→canon→retrieval→generation; request/response hashes +model/effective options/usage/finish, che secrets, không log nguyên prose mặc định.')
issue('CANDIDATE-PROPOSAL','Event/fact chunk merge còn là đề xuất','proposal',
 'Entity candidates/verification/human gate đã có code opt-in. Phần chưa triển khai: event/fact theo chunk, merge assertions/coreference cross-chunk và coverage audit độc lập.',
 'ai-service/application/revision_analysis_service.py',
 'Đo candidate recall và final precision/alias accuracy riêng; mỗi ứng viên có verdict; kiểm tra chunk boundaries/overlap, ambiguous names và chi phí trước rollout.')
issue('OPS-RECOVERED','Docker đã phục hồi; test services đang dừng','mixed',
 'Socket crash đã được người dùng phục hồi. Cuối run tester chủ động dừng backend/AI stack riêng để chặn retry ngầm; web/DB giữ lại. Đây không phải Engine hiện đang crash.',
 RUN+'evidence/stopped-checkpoint.json; '+RUN+'REPORT.md',
 'Trước live test mới: runtime code fingerprint/migrations/schema/provider/ports/auth; chỉ resume jobs sau đọc checkpoint, không reset volumes hoặc khởi động nhầm stack cũ.')

phase('A','Nguồn vào · P1 / P2','Hai nhánh đầu vào; P3 vào vòng G sau khi có brain/baseline','ai-service/application/bootstrap_service.py')
node('A01','P1 · Nhập/chọn bản thảo','ok','Chương nháp hoặc đã xuất bản','Draft chương; chưa phải memory','UI lưu; import không tự đồng nghĩa extraction','SNAPSHOT-GAP','Readback khớp fixture và đúng thứ tự chương.','web/src/features/ai-copilot/AuthorMemoryPanel.tsx',next=['A02'])
node('A02','Bấm trích xuất lần đầu','ok','Các chương đã lưu','Revision manifest cho bootstrap','UI snapshot purpose=MANUSCRIPT_BOOTSTRAP từng chương; hash và IDs','CHUNKING-GAP','Chỉ lấy nội dung đã lưu; không trùng generic outbox bootstrap.','web/src/features/ai-copilot/AuthorMemoryPanel.tsx',next=['A03'])
node('A03','Tạo job nhập bản thảo','ok','Novel/revision IDs, options','Job queued; brain importing','Validate limit/source, identity/idempotency; lưu job durable','OBSERVABILITY','Restart/resume tiếp tục đúng chương, không nhập lại chương completed.',next=['A04'])
node('A04','Lần lượt phân tích từng chương','mixed','Immutable revision manifest','Proposal groups mỗi revision','_split_scenes chỉ đếm; gọi analysis trên TOÀN chương; state transitions bật','CHUNKING-GAP STATE-OPTIONS MEM-CRITICAL-001','Đủ toàn bộ chương; schema success tách semantic coverage.',next=['B04','C01'])
node('A05','P2 · Nhập ý tưởng/thiết lập','code','Setup, constraints; outline/preferences tùy mode','Nguồn setup riêng','UI gọi mode=extract; backend còn blueprint mode','P2-UNTESTED','Không biến future outline thành history.','web/src/features/ai-copilot/AuthorMemoryPanel.tsx',next=['A06','A07'])
node('A06','Extract setup đã cung cấp','code','Idea + constraints','Tên nhân vật/địa danh explicit','setup_extraction LLM; tên phải có trong source; không invent world rules/events','P2-UNTESTED ENTITY-COVERAGE','Tách prior death/uncertain; preservation các trường setup; P2 live riêng.',next=['A08'])
node('A07','Blueprint generation tùy API mode','code','Idea/outline/preferences/constraints','Premise/world rules/entities đề xuất','Chỉ nhánh mode=blueprint; có đường fallback nếu cấu hình cho phép','P2-UNTESTED OBSERVABILITY','Phân biệt invented/author-supplied; UI extract không được chạy nhầm nhánh này.',next=['A08'])
node('A08','Setup proposals → review → baseline','code','Entities + premise/constraints/facts theo mode','Brain đã duyệt; còn thiếu prose đầu tiên','Setup không có chapter quote như P1; lưu provenance dạng nguồn idea','P2-UNTESTED','Duyệt xong mở writing chương đầu; kiểm tra M0/M-FIRST riêng.',next=['D06','F01'])

phase('B','Lưu chương · revision · outbox','P1/P2 sau baseline và AI accept; nguồn bền vững trước extraction','backend/src/modules/novels/chapter-revisions.service.ts')
node('B01','Editor và autosave','ok','Title/content/access fields','PATCH draft sau debounce','UI debounce1200ms; save serial theo chapter; owner/auth','SNAPSHOT-GAP','Expired session có lỗi rõ; UI đã lưu phải khớp server.','web/src/features/author-ide/AuthorWritingIde.tsx',next=['B02'])
node('B02','Lưu draft Mongo + metadata','ok','PATCH nội dung tác giả','Draft version và chapter metadata','Owner check; draft và published content phân biệt','SNAPSHOT-GAP','Đọc draft thật, không coi PostgreSQL content null là mất văn.','backend/src/modules/novels/chapters.service.ts',next=['B03'])
node('B03','Brain active + baseline?','ok','Novel brain state','Có→snapshot tự động; chưa→chỉ draft','snapshotSavedChapter chỉ chạy khi active và có baseline_revision_id','P2-UNTESTED','Import đầu cần explicit bootstrap; sau baseline save content tự phân tích.',next=['B04'])
node('B04','Chốt revision và content hash','ok','Nội dung nguồn chuẩn','Immutable revision/latest pointer','Hash/no-op dedup; transaction/lock; bootstrap purpose riêng','SNAPSHOT-GAP','Hash/Unicode đúng; hai saves không mất head; cùng body không nhân revision.',next=['B05'])
node('B05','Ghi durable outbox','ok','Revision mới sau active','INCREMENTAL_ANALYSIS event','Revision/event uniqueness; trigger worker; AI accept có source_generation_id','SNAPSHOT-GAP','Crash sau commit vẫn còn job; không tạo canon trước review.',next=['B06'])
node('B06','Worker claim + gọi analysis','mixed','Pending outbox; claim token/lease','HTTP analysis; completed hoặc retry','Tick5s; một batch handler; Idempotency-Key=analysis-revision; max_retries mặc định5','PROVIDER-503-001 SNAPSHOT-GAP','Stale claim không overwrite; retry/backoff/recovery quan sát được.','backend/src/jobs/outbox-processor.ts',next=['C01','J04'])
node('B07','Mongo sync fallback khi cần','code','Revision đã commit nhưng draft sync lỗi','MONGO_DRAFT_SYNC retry','Conditional sync tránh đè draft tác giả mới hơn','SNAPSHOT-GAP','Fault injection sync lỗi; phục hồi không mất newer draft.',next=['B02'])

phase('C','Extraction nội dung · nhiều lượt LLM','Flag ON: discovery entity chia đoạn và human gate X trước event/fact; event/fact/coverage vẫn toàn chương. Flag OFF: legacy.','ai-service/application/revision_analysis_service.py')
node('C01','Đọc revision, kiểm tra hash','ok','Tenant/novel/chapter/revision/hash','Prose và provenance chuẩn','Không đọc editor mutable; SHA256/ownership/source_scope','SNAPSHOT-GAP OBSERVABILITY','Wrong source/hash bị từ chối; call trace gắn đúng revision.',next=['C02'])
node('C02','Analysis run và khóa idempotency','mixed','Operation/options/key/input hash','Run/group IDs hoặc proposals đã có','Nếu run đã có proposals thì trả deduplicated; manual reanalyse key mới','GATEWAY-KEY','Retry action không duplicate; reanalysis mới phản ánh canon mới.',next=['C03'])
node('C03','LLM trích named entities','mixed','TOÀN prose chương','PER/LOC/ORG/ITEM/SKILL + confidence/status','Một lượt LLM; parse/schema/score; chưa có rà entity coverage độc lập','ENTITY-COVERAGE ENTITY-HOMONYM CHUNKING-GAP','Gold entity/mention riêng, đo omission và false positives.','ai-service/services/entity_pipeline/pipeline.py',next=['C04'])
node('C04','Ground tên và status','bad','Tên/quote status từ LLM','Entity proposals có evidence','find_mention; non-Unknown status cần grounded quote, lỗi có thể hạ Unknown','ENTITY-HOMONYM GROUNDING-GUARD','Xét occurrence/context, không gắn An vào an toàn; status có nguồn.',next=['C05'])
node('C05','Tạo danh sách known entities','mixed','Approved names + tên mới trích','Names cấp cho event/fact extractor','Tên mới là proposal chưa duyệt, chưa thành official canon','ENTITY-COVERAGE EXTRACT-SUBJECT-UNRESOLVED-001','Tên sai không lan xuống facts/events; alias/canonical IDs rõ.',next=['C06','C07'])
node('C06','LLM trích sự kiện','mixed','TOÀN prose + known entity names','Event/participants/location/summary/consequences','Schema; significant events involving supplied entities; quote grounding; quote lỗi có thể skip event','MEM-CRITICAL-001 GROUNDING-GUARD','Event bỏ qua được thống kê; participants có mặt thật; negation/report preserved.','ai-service/services/event_summarizer.py',next=['C10'])
node('C07','LLM trích atomic facts','bad','TOÀN prose + names','Subject/key/value/certainty/quote','Tuổi/số lượng/identity/possession/limits/history; typed values','MEM-CRITICAL-001 EXTRACT-ROLE-CONFUSION-001 EXTRACT-SUBJECT-UNRESOLVED-001','Đúng subject/certainty/knowledge boundary; mọi critical assertion có evidence.','ai-service/services/prose_facts.py',next=['C08'])
node('C08','LLM rà facts còn thiếu','bad','TOÀN prose + extracted facts','Bổ sung facts thiếu, không lặp','review_fact_coverage; cùng chuỗi provider, không phải reviewer độc lập','MEM-CRITICAL-001 ENTITY-COVERAGE','Coverage đủ theo gold; không gọi bước này là entity coverage review.','ai-service/services/prose_facts.py',next=['C09'])
node('C09','Ground facts + loại trùng exact','mixed','Fact quote + original prose','Span/hash/quote chuẩn; distinct facts','Exact/unique whitespace match; tối đa2 quote repairs; unresolved fact fail analysis','GROUNDING-GUARD MEM-CRITICAL-001','Unicode offsets và unique span; cùng nghĩa khác câu chưa được coi auto dedup.','ai-service/services/source_grounding.py',next=['C10'])
node('C10','Đóng gói proposals và certainty','bad','Entities/events/facts; optional explicit rules','Group cùng analysis/source/version','Confirmed+subject có subject_entity_name; uncertain value giữ attribution; regex Luật:/Rule: tùy option','EXTRACT-SUBJECT-UNRESOLVED-001 EXTRACT-ROLE-CONFUSION-001','Resolve subject trước materialize; không nâng hypothesis thành state.',next=['D01'])
node('C11','LLM trích state transitions tùy mode','mixed','Event mới/thay đổi + event source quotes','State-transition proposals cùng group','Bootstrap bật; incremental default tắt; skip reuse/retired events','STATE-OPTIONS EXTRACT-ROLE-CONFUSION-001','Đồng nhất contract mode; không suy diễn defaults; chỉ participant chính xác.','ai-service/services/state_transition_proposals.py',next=['C12'])
node('C12','Lưu proposals cuối analysis','mixed','Toàn nhóm đã qua reconciliation/transition','Pending proposals trong DB','save_proposals ở cuối; upstream unresolved không lưu partial group','REANALYSIS-LIVE-UNRESOLVED-001','Fault ở giữa không để partial canon/proposals; success rỗng có lý do.',next=['D05'])

phase('D','Đối chiếu canon · review · quyết định','Canon comparison trước persist; human approval mặc định, auto approval chỉ P3','ai-service/services/canon_reconciliation.py')
node('D01','Lấy canon cũ của cùng chương','mixed','Active approved facts/events + source cũ','Approved targets và evidence so sánh','Không có prior cùng chương thì đánh dấu empty base, bỏ qua LLM comparison','REANALYSIS-LIVE-UNRESOLVED-001','Không nhầm occurrence từ chương khác; provenance cũ giữ được.',next=['D02'])
node('D02','LLM chọn new / reuse / replace / remove','bad','Current prose + candidates + prior targets','Decision cho từng event/fact candidate','Phải đủ mỗi candidate; reuse cùng occurrence; remove không vì missed extraction','REANALYSIS-LIVE-UNRESOLVED-001 MEM-CRITICAL-001','Repeated action distinct không merge nhầm; same occurrence không nhân đôi.',next=['D03'])
node('D03','Validate decision + bounded repair','mixed','Decision IDs/type/target claims','Valid mapping hoặc actionable422 attempts3','Many-reuse cùng target được phép; conflicting replace/reuse/removed bị chặn','REANALYSIS-LIVE-UNRESOLVED-001','Không tự đổi invalid comparison thành new; tests guard và live feature tách verdict.',next=['C11','C12','J04'])
node('D04','Phân tích lại qua UI/gateway','mixed','Latest saved revision + thao tác mới','Analysis mới theo canon hiện tại','Key scoped/hash; retry cùng action giữ key; content saved required','GATEWAY-KEY REANALYSIS-LIVE-UNRESOLVED-001','Không thiếu header; key đúng scope; nguyên nhân error hiển thị actionable.','backend/src/modules/ai/ai-gateway.controller.ts',next=['C01'])
node('D05','Hiện queue / quote / revision / reuse','ok','Pending proposals; extraction status','Nhóm chờ review, tách official tabs','Queue0 không có nghĩa extraction COMPLETED; hiển thị outbox status','SNAPSHOT-GAP PROVIDER-503-001','Nhóm và nguồn cũ/mới rõ; không UI success khi latest analysis còn pending.','web/src/features/ai-copilot/AuthorMemoryPanel.tsx',next=['D06'])
node('D06','Tác giả sửa / loại / duyệt nhóm','bad','Payload/quote + quyết định tác giả','Decision audit + edited payloads','Numeric/object edit UI còn hạn chế; approve làm reset edits toàn bộ','REVIEW-EDITS-RESET-001 EXTRACT-SUBJECT-UNRESOLVED-001','Giữ edits nhóm khác; sửa typed facts an toàn; ghi riêng raw/corrected.','web/src/features/ai-copilot/AuthorMemoryPanel.tsx',next=['D07'])
node('D07','Guard stale source và version','mixed','Proposal IDs + expected brain version','Accept hoặc409 conflict/stale','Gateway kiểm source latest; repo lock/version/reconciliation-base refs','SNAPSHOT-GAP','Stale group bị chặn đã live; hoàn tất overlapped saves/dedup regression.','backend/src/modules/ai/proposal-evidence.service.ts',next=['D08'])
node('D08','Materialize trong transaction','mixed','Approved group, edited values','Entities/facts/events/transitions + decisions','Entity normalized-name reuse; canon reuse không insert; replace giữ history; projection resolve subject','EXTRACT-SUBJECT-UNRESOLVED-001 ENTITY-COVERAGE','Unknown/ambiguous subject không partial commit; rollback và feedback sửa được.','ai-service/infrastructure/postgres_narrative_repository.py',next=['D09','E01'])
node('D09','Baseline active / brain version tăng','ok','Các nhóm đã review; bootstrap job','Baseline revision và active brain','Bootstrap chỉ activate sau required review; incremental approval tăng version','MEM-CRITICAL-001','Active không đồng nghĩa semantic quality PASS; M0 audit trước generate.','ai-service/application/bootstrap_service.py',next=['E01'])

phase('E','Memory · embeddings · context','Canon là nguồn; semantic memories là dữ liệu dẫn xuất, không thay thế canon','ai-service/application/writing_service.py')
node('E01','Official structured memory','mixed','Canon + projection sau duyệt','Entities/aliases/facts/events/current states','Pending không dùng làm truth; active/superseded history phân biệt','MEM-CRITICAL-001 ENTITY-COVERAGE','Đối chiếu source assertions, alias và current-state order; reload còn dữ liệu.','ai-service/domain/projection.py',next=['E02','E04'])
node('E02','Derived event chunks + embeddings','code','Approved active event summaries','Memory chunks/vectors theo version/hash','Refresh nền nếu materializer enabled; reuse embedding hash; retire derived chunks','SEMANTIC-UNVERIFIED','Failure không giả vờ semantic ready; rebuild đúng; đây không phải chunk prose extraction.','ai-service/application/semantic_memory_service.py',next=['E03'])
node('E03','Semantic retrieve + hybrid ranking','code','Instruction/selected text query + cutoff','Ranked memories + retrieval/fallback trace','Tenant/cutoff filter; vector version; optional hybrid; fallback rõ','SEMANTIC-UNVERIFIED CONTEXT-COVERAGE','Trace candidates/retrieved vs selected; future/other-tenant không rò.','ai-service/application/semantic_retriever.py',next=['E05'])
node('E04','Lấy structured context theo cutoff','mixed','Chapter/character + approved memory','Entities/states/recent events/rules/plans','Cutoff và active canon; plans/current objective giữ trường riêng','CONTEXT-COVERAGE MEM-CRITICAL-001','Temporal/knowledge boundaries, plan không thành history; cutoff5/6 khác request.',next=['E05'])
node('E05','Chọn legacy pack hoặc balanced scope','code','Structured package + semantic signals','Scoped package/routing path','Balanced chỉ khi đủ policy/signals, default request shape; fallback legacy khi không eligible','CONTEXT-COVERAGE SEMANTIC-UNVERIFIED','Log effective routing; không áp kết quả fixed4k probe cho mọi generation.',next=['E06'])
node('E06','Token packing và budget tiers','mixed','Scoped artifacts và budget','Whole selected artifacts + dropped IDs/estimates','Legacy default12000; balanced thử12/16/20/24k full-fit, quá24k thì fail','CONTEXT-COVERAGE','Query-specific critical context không bị bỏ âm thầm; estimator không phải billed token.','ai-service/application/context_budget.py',next=['E07'])
node('E07','Đóng prompt context và context hash','mixed','Selected context + brain version','Payload đưa writing LLM + trace IDs/hash','Hash exact packed context; selected/dropped/route metadata','OBSERVABILITY CONTEXT-COVERAGE','Chứng minh prompt đã gửi, tách context preview với actual request; che secrets.',next=['F05'])
node('E08','Memory tabs + reload + audit','mixed','Official DB/context + source gold','M0/M-FIRST/FINAL findings','35 gold đã audit;70 rows trên2 context requests; không independent review','MEM-CRITICAL-001 CONTEXT-COVERAGE','Mỗi checkpoint có raw/persisted/context/provenance và issue IDs; không count-only.','Pipeline_test/runs/2026-10-19-recovery-ui-01/MEMORY_AUDIT.md',next=['H02'])

phase('F','Định hướng · viết · kiểm tra · accept','Vòng tác giả dùng chung P1/P2, P3 gọi cùng các service','ai-service/application/writing_service.py')
node('F01','Gợi ý future events từ canon','ok','Approved memory + direction','Future suggestions, chưa thành history','author_operation suggest_events; không lấy pending proposals','P2-UNTESTED','P1 đã sửa1/bỏ1; canon count không tăng do gợi ý.','ai-service/application/author_workflow.py',next=['F02'])
node('F02','Tác giả chỉnh/lưu/activate plan','ok','Selected future events + target/min words/ending','Versioned plan/objectives','Có UI add/drop/edit; active run hạn chế sửa plan','P3-UNTESTED','Plan version và current objective bền sau reload; chưa thành fact đã xảy ra.','web/src/features/ai-copilot/author-memory-api.ts',next=['F03'])
node('F03','Yêu cầu viết / sửa / tiếp diễn','ok','Instruction/style/constraints + selection/revision','Writing job queued','Saved-source/hash/idempotency; pin expected brain/version; offset selection','WRITE-INVALID-JSON-001 SNAPSHOT-GAP','Chỉ dùng revision tương ứng nội dung editor; no-op/duplicate action xử lý đúng.',next=['F04'])
node('F04','Recheck brain + chuẩn bị context','mixed','Queued writing job','Pinned context hoặc STALE_BRAIN_VERSION','Không dùng brain mới âm thầm; query từ instruction+selected text','CONTEXT-COVERAGE OBSERVABILITY','Thay memory khi job chờ phải conflict; đủ trace source/request.',next=['E03','E04','F05'])
node('F05','LLM sinh draft + patch','bad','Selected prose + packed memory + instructions','Draft text/patch/model info','Writing có nhánh unstructured; parse JSON thất bại có thể fallback raw','WRITE-INVALID-JSON-001 PROVIDER-503-001 OBSERVABILITY','Invalid/truncated output fail-closed, không nhận JSON envelope thành prose.','ai-service/core/llm_service.py',next=['F06'])
node('F06','Validation draft và patch','bad','Draft/patch + context','Validation list/status, completed job','Bounds/empty + dead-action/world-rule heuristics; không phải full literary verifier','WRITE-INVALID-JSON-001 VALIDATION-SCOPE','Parse/finish/schema/patch/semantic checks có verdict riêng; Unicode offsets; no false assurance.',next=['F07'])
node('F07','UI xem / bỏ / chấp nhận AI draft','bad','Completed job + validations','Reject hoặc accept request','Run đã reject output lỗi; accept branch của run NOT_RUN','WRITE-INVALID-JSON-001 VALIDATION-SCOPE','Không accept khi output invalid; wording nói đúng validator đã chạy.','web/src/features/ai-copilot/WritingAssistantPanel.tsx',next=['F08'])
node('F08','Server verify rồi apply patch','code','Generation ID, latest chapter revision','AI_DRAFT_ACCEPT revision + source_generation_id','Fetch trusted generation; validation/freshness/chapter/bounds/no-op/idempotency guards','WRITE-INVALID-JSON-001 SNAPSHOT-GAP','Fault injection + live valid accept; same generation không apply2lần; lỗi parse không lọt server.','backend/src/modules/novels/chapter-revisions.service.ts',next=['B05','F09'])
node('F09','Extraction sau lưu → review memory','mixed','Manual save hoặc accepted AI revision','New pending proposals → updated canon','Chung B/C/D; P1 human review, P3 auto review','MEM-CRITICAL-001 REANALYSIS-LIVE-UNRESOLVED-001','Latest prose phản ánh vào memory; không nhầm author text với AI output.',next=['B01','E08'])
node('F10','Consistency check riêng','ok','Saved draft + approved memory','Findings quote + revision ID, không sửa canon','Ground findings bằng exact quote/revision; run An40→19 đã positive/negative pass','PROVIDER-503-001 VALIDATION-SCOPE','Không báo quá khả năng; test thêm negation/reported/alias/temporal contradictions.','ai-service/application/author_workflow.py',next=['B01'])
node('F11','Tác giả đề xuất sửa memory/history','code','Source revision/quote hoặc event correction','Reviewable correction proposal','Không sửa DB trực tiếp; source/quote/expected version; replacement giữ history','EXTRACT-SUBJECT-UNRESOLVED-001 SNAPSHOT-GAP','Sai canon sửa qua UI và reproject không che contradiction nguồn.','web/src/features/ai-copilot/AuthorMemoryRepair.tsx',next=['D05'])

phase('G','P3 · Full auto orchestration','Có code nhưng recovery run P3 NOT_RUN; không dùng quyền publish','backend/src/modules/ai/autonomous-controller.service.ts')
node('G01','Bật full auto + tìm/tạo plan','code','Active brain + optional plan','Durable autonomous run/plan','Nếu thiếu plan: suggest through ending, validate future chapter, save/activate','P3-UNTESTED','Có/không có direction đều có live paths; không ép người dùng nhập plan.',next=['G02'])
node('G02','Server worker / run lease / stop guard','code','Run running + ownership','Một step serialized hoặc terminal return','Max iterations/retries; durable progress; stop kiểm lại trước accept','P3-UNTESTED PROVIDER-503-001','Rời browser vẫn tiến triển; crash/stop không duplicate, restart lease đúng.',next=['G03'])
node('G03','Pin plan version, chọn objective','code','Sorted objectives/current status','Pending/in_progress objective','Plan conflict409; hết objectives không tự suy hoàn tất nếu chưa review','P3-UNTESTED','Không skip objective hoặc âm thầm theo plan mới.',next=['G04'])
node('G04','Chọn/tạo chương và phục hồi accept','code','Objective target chapter + latest revision','Chapter/revision + possible existing gen','Crash recovery kiểm sourceGenerationId, last accepted revision','P3-UNTESTED SNAPSHOT-GAP','Đã accept nhưng crash không generate/accept lại cùng prose.',next=['F03','G05'])
node('G05','Đợi writing và quality gate','code','Writing job/patch/version','Accept allowed hoặc bounded retry','Completed + validation passed + patch nonempty/no-op/bounds + brain freshness','P3-UNTESTED WRITE-INVALID-JSON-001','Guard không đủ nếu writing đã mislabeled passed; test parse failure xuyên fullauto.',next=['F08','G06'])
node('G06','Đợi extraction thật hoàn tất','code','Accepted revision + outbox','Wait / failure / COMPLETED analysis','Không dùng queue0 làm proxy success; không advance khi pending/failed','P3-UNTESTED REANALYSIS-LIVE-UNRESOLVED-001','Fault memory step: giữ objective, recover không viết lại.',next=['G07'])
node('G07','Auto-approve đúng revision','code','Proposal groups của accepted revision','Advanced brain hoặc memory_update_incomplete','Chỉ P3; current source check; expected version qua từng group','P3-UNTESTED MEM-CRITICAL-001 EXTRACT-SUBJECT-UNRESOLVED-001','Auto không có sửa tay cứu; wrong source và semantic wrong không silently accepted.','backend/src/modules/ai/autonomous-memory.service.ts',next=['G08'])
node('G08','Đánh giá objective theo prose','code','Actual prose + min_words + objective','achieved + ending_resolved','Word floor trước LLM; terminal cần ending_resolved=true','P3-UNTESTED FINAL-QUALITY','Outline/lời hứa/lặp không đạt; đủ chữ chưa đủ kết thúc.','backend/src/modules/ai/autonomous-memory.service.ts',next=['G09'])
node('G09','Advance hoặc viết thêm / stop','code','Objective evaluation + remaining objectives','Updated run/checkpoint/stop reason','Chưa đạt→same objective thêm prose; đạt→complete objective; bounds/terminal quyết định','P3-UNTESTED FINAL-QUALITY','Terminal semantic gate và total manuscript acceptance độc lập; no infinite loop.',next=['G03','H01'])

phase('H','Kiểm thử · hoàn thành · xuất bản boundary','Acceptance của task, không đồng nhất với job completed','Pipeline_test/AGENT_GUIDE.md')
node('H01','S01–S11 và gate vòng ngắn','bad','UI actions + source/evidence','Step verdict + blockers','Run hiện PARTIAL_GATE_FAILED; S09 unfinished; S10 pass sau retry','MEM-CRITICAL-001 WRITE-INVALID-JSON-001 REANALYSIS-LIVE-UNRESOLVED-001','Sửa blockers rồi run mới, giữ gold/evidence cũ; không API write cứu UI.',next=['H02'])
node('H02','M0 / M-FIRST /10/20/50/FINAL','mixed','Raw proposals/canon/context/manifest','Memory audit riêng cho P1/P2/P3','Recovery có M0/M-FIRST/FINAL;10/20/50 và P2/P3 NOT_RUN','MEM-CRITICAL-001 SEMANTIC-UNVERIFIED','Đủ source→raw→persisted→packed trace; critical/uncertainty/provenance đúng; đo entity riêng.',next=['H03'])
node('H03','Đọc và đánh giá bản thảo cuối','code','Prose thực + blueprint/objectives','Completeness/literary/continuity judgments','Không lấy completed jobs, objective count hoặc số chữ làm toàn bộ verdict','FINAL-QUALITY','95–105k theo test; ending/payoffs/POV/pacing/repetition/knowledge audited độc lập.',next=['H04'])
node('H04','Export readback + attribution','mixed','Latest saved revisions','Text files + SHA256/word counts/lineage','Test tooling export; không khẳng định product có full-book export UI','FINAL-QUALITY OBSERVABILITY','Mọi file khớp source bytes; AI/manual attribution rõ; không ghép output chưa accept.',next=['H05'])
node('H05','Báo cáo/checkpoint/issues + quyết định','ok','Evidence và kết quả thực','PASS/PARTIAL/FAIL, resume chính xác','5 outbox unfinished; backend/AI riêng đã dừng, không reset DB','OPS-RECOVERED PROVIDER-503-001','Không ghi NOT_RUN thành PASS; resolved guard khác feature success; reviewer độc lập rõ.',next=['H06'])
node('H06','Publish là hành động tác giả riêng','code','Tác giả chủ động chọn xuất bản','Moderation/published platform state','Fullauto chỉ draft; publish ngoài quyền tự duyệt memory','P3-UNTESTED','Kiểm chứng không publish trong mọi AI/test path; không cần publish để đạt test.','backend/src/modules/novels/chapters.service.ts')

phase('J','Provider · hạ tầng · quan sát lỗi','Các bước dùng chung, không phải một phase chỉ chạy cuối cùng','ai-service/core/structured_call.py')
node('J01','Preflight stack/source/schema/auth','mixed','Code fingerprint/ports/migrations/provider','Môi trường ready hoặc blocked','Không chạy stack cũ/migration chưa xác minh; giữ volumes','OPS-RECOVERED','Read-only preflight trước run; provider health không đồng nghĩa mọi call sẽ200.','Pipeline_test/runs/2026-10-19-reanalysis-recovery/REPORT.md',next=['A01','A05','G01'])
node('J02','Structured call/schema/trace','mixed','Operation/system/user/source scope','Provider response + metadata','Source/hash/model/finish/usage tracing; validate schemas tại từng service','OBSERVABILITY PROVIDER-503-001','Malformed/truncated/timeout phân loại; tất cả writing/extraction có source trace.','ai-service/core/structured_call.py',next=['J03'])
node('J03','Định tuyến model/limits/fallback','mixed','Requested model/provider + config','Effective model và output','Runtime Gemini flash-lite observed cho extraction; fallback phụ thuộc config','OBSERVABILITY PROVIDER-503-001','Không silent simulated success; output-limit/model change được report đúng.','ai-service/core/llm_service.py',next=['J04'])
node('J04','Repair tại chỗ và retry outbox','mixed','Schema/grounding/reconciliation/provider error','Repair / delayed retry / terminal failure','Quote max2 repairs; canon3 total; outbox max5 mặc định; backoff riêng','PROVIDER-503-001 REANALYSIS-LIVE-UNRESOLVED-001','Semantic invalid không bắn lại tốn phí vô hạn; counters/traces không lẫn.',next=['J05','B06'])
node('J05','Ngân sách / cancel / durable resume','mixed','Jobs/calls/time/stop request','Checkpoint với source/version/queue','104 HTTP responses observed; stop2 isolated services để không retry ngầm','OBSERVABILITY OPS-RECOVERED P3-UNTESTED','Cap quan sát được; stop không publish/mất data; lần resume đọc DB trạng thái thật.','Pipeline_test/runs/2026-10-19-recovery-ui-01/checkpoint.json')

phase('X','Ứng viên · tác giả duyệt entity','Có implementation opt-in; mặc định OFF. X05/X06 vẫn là thiết kế. Chưa có live provider retest cho luồng mới.','ai-service/application/entity_review_service.py')
node('X01','Chia đoạn cho entity discovery','code','Prose gốc + paragraph/whitespace boundaries','Chunks khoảng4000 ký tự, overlap256; absolute Unicode offsets','Tối đa32 chunks; chỉ discovery chia đoạn, không phải event/fact','CHUNKING-GAP ENTITY-HITL','Unicode/overlap/cap đã có offline tests; live source dài chưa chạy.','ai-service/services/entity_pipeline/candidates.py',next=['X02'])
node('X02','Gom ứng viên recall cao + tên tăng cường','code','Chunks + canonical registry/aliases + hints + patterns + LLM discovery','Occurrences có offsets/context/origins; tên vắng không thành mention','Tên/danh xưng/mã; max1024 candidates; vượt cap fail rõ; registry bulk2 queries, không query từng tên','ENTITY-HITL ENTITY-COVERAGE','Đo recall và chi phí với gold riêng; hints sai/vắng không tạo sự kiện.','ai-service/services/entity_pipeline/candidates.py',next=['X03'])
node('X03','LLM xét từng occurrence có ngữ cảnh','code','Candidate + context + known IDs + guidance không phải chứng cứ','entity / not_entity / unresolved + reason, alias/status quote','Batch24; đúng1 quyết định mỗi ID; tối đa2 attempts/batch; không auto materialize xung đột danh tính','ENTITY-HITL ENTITY-HOMONYM','Offline negative control An/an toàn và malformed PASS; cần live kiểm precision/recall.','ai-service/services/entity_pipeline/verification.py',next=['X09'])
node('X04','Đóng băng inventory đã duyệt','code','Tất cả occurrence đã được tác giả quyết định + canonical registry','entities_reviewed; identity/alias/type/spans, source hash và guidance/review version','Không unresolved; alias phải có bằng chứng; canonical ID/type phải khớp; chặn merge sai và identity lạ','ENTITY-HITL ENTITY-COVERAGE','Tiếp tục dùng checkpoint, không gọi lại entity LLM; nguồn cũ bị gateway409.','ai-service/application/entity_review_service.py',next=['C04','X10'])
node('X05','Extract event/fact theo chunks','proposal','Verified entity inventory + context-overlap','Grounded source-bound assertions','Dùng inventory chung; giữ modality/subject; đoạn phụ trợ không thành event mới','CANDIDATE-PROPOSAL MEM-CRITICAL-001','Cross-chunk coreference, repeated scenes và knowledge constraints có gold.',next=['X06'])
node('X06','Hợp nhất/dedup + coverage audit','proposal','Chunk results + absolute spans','One chapter proposal inventory','Dedup occurrence/meaning, không chỉ exact text; rà lại source coverage','CANDIDATE-PROPOSAL CHUNKING-GAP','So sánh cùng35 gold + entity gold trước/sau; đo chi phí/latency, không chỉ count.',next=['D01'])
node('X07','Rollout có cờ và regression gates','code','Candidate/verified results + offline tests + live benchmark chưa chạy','Flag OFF mặc định; cần migration0011/0012 và isolated retest','ENTITY_CANDIDATE_VERIFICATION_ENABLED=true mới bật gate cho revision; legacy endpoints không tự đổi','ENTITY-HITL P2-UNTESTED P3-UNTESTED','S01–S11 +35 gold, M0/10/20/50 và 100k chưa được mở chỉ vì unit tests PASS.','Pipeline_test/GEMINI_HUMAN_ENTITY_REVIEW_RETEST.md',next=['C13'])
node('X08','Danh sách tăng cường tùy chọn','code','Tác giả nhập tên; API hỗ trợ type/alias/notes và hint/declared','Guidance version riêng, không vào approved memory/context','UI mỗi dòng1 tên; optimistic version; tối đa256 entries/512 names; tên chỉ là chỉ dẫn tìm kiếm','ENTITY-HITL','Tên sai/vắng không tạo entity/occurrence/event; mất cập nhật bị409.','web/src/features/ai-copilot/EntityExtractionReview.tsx',next=['X01','X11'])
node('X09','Dừng để tác giả duyệt entity','code','Inventory + machine decisions + source offsets/context','waiting_entity_review; chưa extract event/fact, chưa lưu partial proposals','Nhóm cùng tên/identity/verdict; xem từng occurrence; giữ/loại/sửa type/name/alias; unresolved bắt buộc xử lý','ENTITY-HITL','P1 job dừng đúng chương; P3 không approve/advance; đủ decision mới freeze.','web/src/features/ai-copilot/EntityExtractionReview.tsx',next=['X04','X10'])
node('X10','Bổ sung tên hoặc gặp identity mới','code','Guidance version đổi hoặc event/fact nhắc identity ngoài inventory','Quay lại checkpoint entity; giữ quyết định còn hợp lệ','Hint đổi: rerun riêng entity, không chạy event/fact; ID/context/machine decision còn khớp mới giữ author decision; downstream unknown không tự tạo','ENTITY-HITL','Source/hash/novel/policy/version độc lập; không mất review hợp lệ sau reload, không lưu group dở.','ai-service/application/revision_analysis_service.py',next=['X01','X09'])
node('X11','Tác giả trực tiếp khai báo entity','code','Tên + loại do tác giả xác nhận; không cần quote chương','Proposal source_type=author_declaration, initial_status Unknown','Duyệt qua queue bình thường mới thành canon; không gắn chapter occurrence/event; tên đã có yêu cầu correction riêng','ENTITY-HITL','Không overwrite/auto-merge entity đã duyệt; sau approve registry hỗ trợ LLM normalization bằng proposal.','ai-service/application/revision_analysis_service.py',next=['D05'])
node('C13','Chọn đường legacy hay human review','code','Flag + extract_entities option + immutable revision','OFF→legacy; ON→entity review gate','Mặc định OFF; UI báo rõ khi server chưa bật. P2 setup có hints và review entity riêng; P1/P3 revision dùng gate X','ENTITY-HITL','Migrations/code/config phải đồng bộ; outbox delivered không đồng nghĩa downstream analysis completed.','ai-service/application/revision_analysis_service.py',next=['C03','X08'])

issue('ENTITY-HITL','Human review đã có code, chưa live retest','untested',
 'Luồng mới: optional guidance → candidate verification → tác giả accept/reject/edit → frozen inventory → event/fact → review canon. Offline tests không chứng minh đủ35 gold hoặc output100k. Flag mặc định OFF, cần migration0012 và deploy đồng bộ. P2 setup chỉ entities nhân vật/địa danh; event/fact vẫn fullchapter.',
 'Pipeline_test/runs/2026-10-20-human-entity-review/REPORT.md',
 'Isolated UI/provider test P1/P2/P3; thử tên thiếu/vắng/alias/homonym, reload/stale/version, resume không rediscovery, unknown downstream và audit35 gold. Chưa mở bài dài trước gate.')

def main():
    # Serial order follows the actual calls; optional semantic/transition branches stay explicit.
    actual_next={'A04':['C01'],'C02':['C13'],'C05':['C06'],'C06':['C07','X10'],
                 'F04':['E04'],'E04':['E03','E05']}
    updates = {
      'A04': dict(control='Lần lượt từng revision; flagON dừng waiting_entity_review trước event/fact, resume giữ chương/checkpoint; scene_count chỉ đếm.', issues=['CHUNKING-GAP','ENTITY-HITL','STATE-OPTIONS']),
      'A06': dict(incoming='Idea + constraints + optional guidance', control='Hints hỗ trợ tìm tên; nguồn setup mới chứng minh presence; không invent event/rule. P2 vẫn entity proposals → review, không phải chunk pipeline của revision.'),
      'C03': dict(title='Legacy: LLM trích entity toàn chương', control='Chỉ đường flagOFF; một lượt LLM + parse/schema/score; flagON đi X08→X01→X02→X03→X09.'),
      'C04': dict(state='mixed', control='Legacy dùng find_mention; human-review dùng verified occurrence offsets. Status không Unknown phải có quote; entity vẫn proposal, chưa canon.'),
      'C05': dict(incoming='Legacy proposals hoặc inventory đã được tác giả review', control='FlagON chỉ names/aliases đã review; unknown downstream mở lại entity gate, không tự sinh entity; registry không query từng tên.', issues=['ENTITY-HITL','EXTRACT-SUBJECT-UNRESOLVED-001']),
      'C06': dict(next=['C07','X10']),
      'C07': dict(next=['C08','X10']),
      'D06': dict(state='mixed', control='Chỉ xóa staged edits của nhóm vừa approve, giữ nhóm khác; numeric/object edit vẫn cần live retest.'),
      'G06': dict(control='Kiểm tra outbox delivery và entity checkpoint riêng. waiting_for_entity_review: giữ objective, không tăng retries/advance, break loop; sau human continue mới tiếp tục auto.', next=['G07','X09'], issues=['P3-UNTESTED','ENTITY-HITL']),
      'J01': dict(control='Đối chiếu source/schema/config; luồng mới cần migration0011/0012; không restart stack cũ có5 durable retries chưa xử lý.')}
    for item in nodes:
        item.update(updates.get(item['id'], {}))
    issues['REVIEW-EDITS-RESET-001'].update(kind='mixed', detail='Đã sửa code: approve nhómA chỉ xóa editsA. Chưa có live UI regression chứng minh giữ editsB qua refetch/reload; hạn chế typed editing vẫn còn.')
    issues['ENTITY-COVERAGE'].update(kind='mixed', detail='Đã có candidate inventory/chunk discovery/verification + human gate dưới flagOFF. Chưa đo live candidate recall/verified recall/alias precision; không suy ra coverage từ số records hoặc15/35 gold.')
    for item in nodes:
        if item['id'] in actual_next:
            item['next']=actual_next[item['id']]
    ids={n['id'] for n in nodes}
    assert len(ids)==len(nodes)
    for n in nodes:
        assert set(n['issues']) <= issues.keys(), n['id']
        assert set(n['next']) <= ids, n['id']
    sources={n['source'] for n in nodes if (ROOT/n['source']).is_file()}
    source_hashes={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in sorted(sources)}
    data=dict(title='AI pipeline · P1 / P2 / P3',
        reviewed_at=dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).isoformat(),
        code_sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT).decode().strip(),
        scope='Canonical author workflow: input, revision, extraction, review, canon, context, writing, autonomous control, acceptance; platform publish shown as boundary. Legacy endpoints not individually inventoried.',
        run='2026-10-19-recovery-ui-01 + 2026-10-20-human-entity-review (offline)',phases=phases,nodes=nodes,issues=issues,source_hashes=source_hashes)
    (HERE/'pipeline-map-data.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    template=(HERE/'pipeline-map.template.html').read_text(encoding='utf-8')
    fragment=template.replace('__PIPELINE_DATA__',json.dumps(data,ensure_ascii=False).replace('<','\\u003c'))
    assert '__PIPELINE_DATA__' not in fragment
    assert len(fragment.encode())<1_000_000
    (HERE/'ai-pipeline-map.html').write_text(fragment,encoding='utf-8')
    lines=['# AI pipeline — map nguồn và tiêu chí đóng lỗi','',
        'Snapshot: '+data['reviewed_at']+'; HEAD '+data['code_sha']+' + working tree.',
        '',data['scope'],'',
        'Không phải cam kết mọi nhánh đã test. live = tái hiện, gap = thiếu từ code/giới hạn suy ra, untested = chưa chạy live, mixed = guard/function test một phần, proposal = chưa triển khai.',
        '','Run nguồn: `'+RUN+'REPORT.md`. 15/35 là assertions gold, không phải entity recall. Không có guarantee đã tìm mọi defect.', '']
    for p in phases:
        lines += ['## '+p['id']+' · '+p['title'],'',p['scope'],'']
        for n in [n for n in nodes if n['phase']==p['id']]:
            lines += ['### '+n['id']+' · '+n['title']+' ['+n['state']+']','',
                '- Input: '+n['incoming'],'- Output: '+n['outgoing'],'- Control: '+n['control'],
                '- Issues: '+(', '.join(n['issues']) or 'Chưa có defect xác lập riêng'),
                '- Gate đề xuất: '+n['gate'],'- Source: `'+n['source']+'`',
                '- Next: '+(', '.join(n['next']) or 'boundary/end'),'']
    lines+=['## Issue registry','']
    for i in issues.values():
        lines += ['### '+i['id']+' · '+i['title']+' ['+i['kind']+']','',i['detail'],
                  '', 'Evidence: `'+i['evidence']+'`','', 'Đóng khi: '+i['close'],'']
    (HERE/'AI_PIPELINE_MAP.md').write_text('\n'.join(lines),encoding='utf-8')
    print(json.dumps(dict(nodes=len(nodes),phases=len(phases),issues=len(issues),html_bytes=len(fragment.encode()))))

if __name__=='__main__': main()
