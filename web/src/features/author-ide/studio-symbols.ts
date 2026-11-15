export type StudioSymbol = { name: string; text: string; close?: string };
export const studioSymbolGroups: Array<{ name: string; symbols: StudioSymbol[] }> = [
  { name: 'Ngoặc', symbols: [
    { name: 'Ngoặc Nhật', text: '「', close: '」' }, { name: 'Ngoặc Nhật kép', text: '『', close: '』' },
    { name: 'Ngoặc vuông đậm', text: '【', close: '】' }, { name: 'Ngoặc tên tác phẩm', text: '《', close: '》' },
    { name: 'Ngoặc góc', text: '〈', close: '〉' }, { name: 'Ngoặc mai rùa', text: '〔', close: '〕' },
    { name: 'Ngoặc vuông trắng', text: '〖', close: '〗' }, { name: 'Ngoặc tròn rộng', text: '（', close: '）' },
    { name: 'Ngoặc vuông rộng', text: '［', close: '］' }, { name: 'Ngoặc nhọn rộng', text: '｛', close: '｝' },
    { name: 'Ngoặc kép cong', text: '“', close: '”' }, { name: 'Ngoặc đơn cong', text: '‘', close: '’' }
  ] },
  { name: 'Dấu câu', symbols: [
    { name: 'Gạch thoại dài', text: '—' }, { name: 'Gạch nối dài', text: '–' }, { name: 'Dấu chấm lửng', text: '…' },
    { name: 'Chấm giữa', text: '·' }, { name: 'Chấm tròn', text: '•' }, { name: 'Dấu lược', text: '‧' },
    { name: 'Dấu mở lời dẫn', text: '«', close: '»' }, { name: 'Dấu góc đơn', text: '‹', close: '›' }
  ] },
  { name: 'Ngắt cảnh', symbols: [
    { name: 'Dấu ngắt cảnh Nhật', text: '※' }, { name: 'Sao bốn cánh', text: '✦' }, { name: 'Hoa văn bốn cánh', text: '❖' },
    { name: 'Sao rỗng', text: '☆' }, { name: 'Sao đặc', text: '★' }, { name: 'Thoi rỗng', text: '◇' },
    { name: 'Thoi đặc', text: '◆' }, { name: 'Tròn rỗng', text: '○' }, { name: 'Tròn đặc', text: '●' },
    { name: 'Vuông rỗng', text: '□' }, { name: 'Vuông đặc', text: '■' }
  ] },
  { name: 'Mũi tên', symbols: [
    { name: 'Mũi tên phải', text: '→' }, { name: 'Mũi tên trái', text: '←' }, { name: 'Mũi tên lên', text: '↑' },
    { name: 'Mũi tên xuống', text: '↓' }, { name: 'Mũi tên hai chiều', text: '↔' }, { name: 'Suy ra', text: '⇒' },
    { name: 'Tương đương', text: '⇔' }, { name: 'Mũi tên chéo lên', text: '↗' }, { name: 'Mũi tên chéo xuống', text: '↘' }
  ] },
  { name: 'Ký hiệu', symbols: [
    { name: 'Cộng trừ', text: '±' }, { name: 'Nhân', text: '×' }, { name: 'Chia', text: '÷' },
    { name: 'Không bằng', text: '≠' }, { name: 'Xấp xỉ', text: '≈' }, { name: 'Nhỏ hơn hoặc bằng', text: '≤' },
    { name: 'Lớn hơn hoặc bằng', text: '≥' }, { name: 'Vô cực', text: '∞' }, { name: 'Căn bậc hai', text: '√' },
    { name: 'Độ', text: '°' }, { name: 'Độ C', text: '℃' }, { name: 'Phần nghìn', text: '‰' },
    { name: 'Mục', text: '§' }, { name: 'Dấu thập chú thích', text: '†' }, { name: 'Số thứ tự', text: '№' }
  ] }
];

export function insertStudioSymbol(source: string, start: number, end: number, symbol: StudioSymbol) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > source.length) throw new Error('Vị trí chèn không còn hợp lệ. Chọn lại vị trí trong bản thảo.');
  const selected = source.slice(start, end), close = symbol.close ?? '';
  const text = source.slice(0, start) + symbol.text + (close ? selected + close : '') + source.slice(end);
  return {
    text, start: start + symbol.text.length, end: close ? end + symbol.text.length : start + symbol.text.length,
    edits: close ? [{ start, end: start, replacement: symbol.text }, { start: end, end, replacement: close }] : [{ start, end, replacement: symbol.text }]
  };
}
