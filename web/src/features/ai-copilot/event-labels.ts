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
  power_use: 'Dùng sức mạnh', ability_use: 'Dùng năng lực', memory_loss: 'Mất ký ức'
};

/** Vietnamese label for an event type. An unknown type is shown as words, not as a code. */
export const eventTypeLabel = (value: string) =>
  labels[value.toLowerCase()] ?? value.replace(/_/g, ' ').toLowerCase();

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
  ability: 'Năng lực', relationship: 'Quan hệ', origin: 'Xuất thân', affiliation: 'Thuộc phe', world_rule: 'Quy tắc thế giới'
};
/** UI walkthrough (UI-5): "Màu tóc" instead of "hair_color". An unknown key is shown as words. */
export const factKeyLabel = (key: string) => factKeys[key.toLowerCase()] ?? key.replace(/_/g, ' ');

/** Option label for picking an entity: name and type, plus a short code only when two entities share
 *  the name (for example two characters called Minh), so the author can still tell them apart. */
export const entityOptionLabel = (e: { entity_id: string; name: string; entity_type?: string | null },
  all: { entity_id: string; name: string }[]) => {
  const twin = all.some(o => o.entity_id !== e.entity_id && o.name.trim().toLowerCase() === e.name.trim().toLowerCase());
  return `${e.name} (${entityTypeLabel(e.entity_type)})${twin ? ` · #${e.entity_id.slice(0, 6)}` : ''}`;
};
