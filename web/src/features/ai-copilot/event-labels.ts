const labels: Record<string, string> = {
  illness: 'Ốm bệnh', interaction: 'Tương tác', observation: 'Quan sát', movement: 'Di chuyển',
  conversation: 'Trò chuyện', battle: 'Giao chiến', combat: 'Giao chiến', rescue: 'Cứu giúp',
  discovery: 'Phát hiện', meeting: 'Gặp gỡ', meet: 'Gặp gỡ', encounter: 'Chạm mặt',
  conflict: 'Xung đột', revelation: 'Tiết lộ', action: 'Hành động', departure: 'Rời đi',
  injury: 'Bị thương', other: 'Khác',
  // UI walkthrough (UI-5): types the live model produced that were shown in English.
  suppression: 'Trấn áp', attack: 'Tấn công', defense: 'Phòng thủ', escape: 'Chạy trốn',
  pursuit: 'Truy đuổi', training: 'Tu luyện', cultivation: 'Tu luyện', transformation: 'Biến đổi',
  death: 'Tử vong', ritual: 'Nghi lễ', awakening: 'Thức tỉnh', arrival: 'Đến nơi',
  confrontation: 'Đối đầu', sacrifice: 'Hy sinh', healing: 'Chữa trị', betrayal: 'Phản bội',
  alliance: 'Liên minh', decision: 'Quyết định', plan: 'Lên kế hoạch', reunion: 'Đoàn tụ',
  power_use: 'Dùng sức mạnh', ability_use: 'Dùng năng lực', memory_loss: 'Mất ký ức',
  // Demo walkthrough 2026-11-17: more free-form types from the live model.
  fight: 'Giao chiến', warning: 'Cảnh báo', revival: 'Hồi sinh', threat: 'Đe dọa', chase: 'Truy đuổi',
  entry: 'Tiến vào', 'entry forbidden zone': 'Vào vùng cấm', 'arrival or departure': 'Đến hoặc rời đi'
};

/** Vietnamese label for an event type. A phrase such as "combat encounter" uses its first known word;
 *  an unknown type in plain ASCII (English or Vietnamese without accents) reads "Sự kiện khác" rather
 *  than raw model output, and an unknown Vietnamese type is shown as it is. */
export const eventTypeLabel = (value: string) => {
  const key = value.trim().toLowerCase();
  if (labels[key]) return labels[key];
  const words = key.split(/[\s_-]+/);
  const known = words.find(w => labels[w]);
  if (known) return labels[known];
  return /^[\x20-\x7e]*$/.test(key) ? 'Sự kiện khác' : key.replace(/_/g, ' ');
};

const entityTypes: Record<string, string> = {
  per: 'Nhân vật', person: 'Nhân vật', character: 'Nhân vật',
  loc: 'Địa điểm', location: 'Địa điểm', place: 'Địa điểm',
  org: 'Tổ chức', organization: 'Tổ chức', faction: 'Tổ chức',
  item: 'Vật phẩm', object: 'Vật phẩm', artifact: 'Vật phẩm',
  skill: 'Kỹ năng', technique: 'Công pháp', ability: 'Năng lực',
  creature: 'Sinh vật', concept: 'Khái niệm', event: 'Sự kiện'
};

/** UI walkthrough (UI-5): "Nhân vật" instead of "[PER]" or "[character]". */
export const entityTypeLabel = (value?: string | null) =>
  value ? entityTypes[value.toLowerCase()] ?? value : 'Chưa rõ loại';

/** Name of an entity for display, never its ID. */
export const entityName = (entities: { entity_id: string; name: string }[], id: unknown) =>
  entities.find(e => e.entity_id === id)?.name ?? (typeof id === 'string' && id ? 'Thực thể chưa có trong bộ nhớ' : 'Chung');

const brainStatuses: Record<string, string> = {
  active: 'đang dùng', draft: 'bản nháp', bootstrapping: 'đang khởi tạo', archived: 'đã lưu trữ'
};
/** UI walkthrough (UI-9): "đang dùng" instead of "active". */
export const brainStatusLabel = (value?: string | null) => (value ? brainStatuses[value] ?? value : 'đang tải');

const factKeys: Record<string, string> = {
  hair_color: 'Màu tóc', eye_color: 'Màu mắt', appearance: 'Ngoại hình', age: 'Tuổi', gender: 'Giới tính',
  location: 'Vị trí', last_seen: 'Xuất hiện gần nhất', status: 'Sống/chết', condition: 'Tình trạng',
  health: 'Sức khỏe', posture: 'Tư thế', occupation: 'Nghề nghiệp', title: 'Danh hiệu', weapon: 'Vũ khí',
  realm: 'Cảnh giới', cultivation_level: 'Cảnh giới', personality: 'Tính cách', goal: 'Mục tiêu',
  ability: 'Năng lực', relationship: 'Quan hệ', origin: 'Xuất thân', affiliation: 'Thuộc phe', world_rule: 'Quy tắc thế giới',
  bloodline: 'Huyết mạch', clothing_color: 'Màu áo', injury: 'Vết thương', memory_status: 'Ký ức', possesses: 'Sở hữu'
};
/** UI walkthrough (UI-5): "Màu tóc" instead of "hair_color". An unknown key is shown as words. */
export const factKeyLabel = (key: string) => {
  // Setup world rules are stored as setup_rule_rule_<hash>: never show the hash.
  if (/^setup_rule|(^|_)rule_[0-9a-f]{12,}$/i.test(key)) return 'Quy tắc thế giới';
  return factKeys[key.toLowerCase()] ?? key.replace(/_?[0-9a-f]{12,}/gi, '').replace(/_/g, ' ').trim();
};

// Demo walkthrough 2026-11-17: the Facts tab showed "Alive" while the Characters tab said "Còn sống".
const statusValues: Record<string, string> = {
  alive: 'Còn sống', dead: 'Đã chết', deceased: 'Đã chết', unknown: 'Chưa rõ', unconscious: 'Bất tỉnh',
  injured: 'Bị thương', wounded: 'Bị thương', missing: 'Mất tích', captured: 'Bị bắt', imprisoned: 'Bị giam'
};
/** Stored status words (the canonical English value) with their label, for pickers that must keep the stored value. */
export const statusValueOptions = ['Alive', 'Dead', 'Unknown', 'Unconscious', 'Injured', 'Missing', 'Captured', 'Imprisoned']
  .map(value => ({ value, label: statusValues[value.toLowerCase()] }));
export const isStatusValue = (value: unknown) => typeof value === 'string' && value.trim().toLowerCase() in statusValues;
export const isEntityIdValue = (value: unknown) => typeof value === 'string' && UUID.test(value);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A state value that is an entity ID (for example a location) is shown as that entity's name. */
export const stateValueLabel = (entities: { entity_id: string; name: string }[], value: unknown) =>
  typeof value === 'string' ? (UUID.test(value) ? entityName(entities, value) : (statusValues[value.trim().toLowerCase()] ?? value)) : JSON.stringify(value);

/** Option label for picking an entity: name and type, plus a short code only when two entities share
 *  the name (for example two characters called Minh), so the author can still tell them apart. */
export const entityOptionLabel = (e: { entity_id: string; name: string; entity_type?: string | null },
  all: { entity_id: string; name: string }[]) => {
  const twin = all.some(o => o.entity_id !== e.entity_id && o.name.trim().toLowerCase() === e.name.trim().toLowerCase());
  return `${e.name} (${entityTypeLabel(e.entity_type)})${twin ? ` · #${e.entity_id.slice(-6)}` : ''}`;
};
