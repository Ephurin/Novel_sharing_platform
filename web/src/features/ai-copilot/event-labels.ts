const labels: Record<string, string> = {
  illness: 'Ốm bệnh', interaction: 'Tương tác', observation: 'Quan sát', movement: 'Di chuyển',
  conversation: 'Trò chuyện', battle: 'Giao chiến', combat: 'Giao chiến', rescue: 'Cứu giúp',
  discovery: 'Phát hiện', meeting: 'Gặp gỡ', meet: 'Gặp gỡ', encounter: 'Chạm mặt',
  conflict: 'Xung đột', revelation: 'Tiết lộ', action: 'Hành động', departure: 'Rời đi',
  injury: 'Bị thương', other: 'Khác'
};

export const eventTypeLabel = (value: string) => labels[value.toLowerCase()] ?? value;
