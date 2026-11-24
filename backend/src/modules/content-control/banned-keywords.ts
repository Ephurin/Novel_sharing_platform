// Built-in banned keyword list (Vietnamese first, a few English).
//
// How this list is meant to work, borrowed from common platform practice:
// - YouTube "blocked words" and Facebook Page keyword blocking: a match does not
//   delete anything, it holds the comment for a moderator.
// - Twitch AutoMod and Discord AutoMod preset lists: words are grouped by category
//   and level, so mild slang can pass while slurs and threats are always held.
// - Wattpad / Webnovel: fiction may legitimately contain profanity and violence;
//   chapters and novels always go to an admin anyway, so matches there are only
//   evidence for the reviewer, never an automatic rejection.
// The list is deliberately small and conservative. Evasions (spaced letters,
// symbols) are left to reader reports, which every target already supports.
//
// Matching rules (see content-filter.ts):
// - case-insensitive, Unicode NFC, whole words only ("ass" does not match "assassin");
// - spaces inside a phrase match any run of whitespace;
// - diacritics are NOT stripped: "cặc" must never match "các". Add unaccented
//   variants explicitly, and only when they are unambiguous.
//
// Severity:
// - LOW: casual slang. Recorded as evidence, but a comment is not held for it alone.
// - MEDIUM: profanity, sexual solicitation, spam/scam. Comment is held for review.
// - HIGH: slurs, threats, self-harm incitement, child sexual content. Held for review.

export type KeywordSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export type KeywordGroup = {
  category: string;
  name: string;
  severity: KeywordSeverity;
  words: string[];
};

export const bannedKeywordGroups: KeywordGroup[] = [
  {
    category: 'PROFANITY',
    name: 'Tiếng lóng nhẹ',
    severity: 'LOW',
    words: ['vl', 'vcl', 'vkl', 'vcc', 'clgt', 'đếch', 'shit', 'wtf']
  },
  {
    category: 'PROFANITY',
    name: 'Chửi tục',
    severity: 'MEDIUM',
    words: [
      'địt', 'đụ', 'đéo', 'lồn', 'buồi', 'cặc', 'đĩ', 'con đĩ', 'đồ chó', 'óc chó', 'mẹ mày',
      'đm', 'đmm', 'đcm', 'dcm', 'đkm', 'clm', 'cmm', 'đù má', 'đụ má', 'địt mẹ', 'vãi lồn',
      'du ma', 'dit me', 'dit con me', 'fuck', 'fucking', 'bitch', 'motherfucker'
    ]
  },
  {
    category: 'SEXUAL',
    name: 'Nội dung/gạ gẫm tình dục',
    severity: 'MEDIUM',
    words: [
      'chat sex', 'sex chat', 'gái gọi', 'gái bao', 'trai bao', 'phim sex', 'clip sex', 'phim heo',
      'clip nóng', 'porn', 'jav'
    ]
  },
  {
    category: 'SEXUAL_MINOR',
    name: 'Tình dục trẻ em',
    severity: 'HIGH',
    words: ['ấu dâm', 'lolicon', 'shotacon', 'child porn', 'cp trẻ em']
  },
  {
    category: 'HATE',
    name: 'Miệt thị vùng miền/sắc tộc/xu hướng',
    severity: 'HIGH',
    words: [
      'parky', 'bắc kỳ chó', 'nam kỳ chó', 'ba que', '3 que', 'khựa', 'tàu khựa', 'đồ mọi',
      'thằng mọi', 'nigger', 'nigga', 'faggot'
    ]
  },
  {
    category: 'HARASSMENT',
    name: 'Đe doạ/xúi tự hại',
    severity: 'HIGH',
    words: [
      'mày chết đi', 'đi chết đi', 'chết mẹ mày đi', 'tự tử đi', 'nhảy lầu đi', 'tao giết mày',
      'tao sẽ giết mày', 'biết nhà mày', 'kill yourself', 'kys'
    ]
  },
  {
    category: 'SPAM',
    name: 'Cờ bạc/lừa đảo/quảng cáo',
    severity: 'MEDIUM',
    words: [
      'nhà cái', 'cá cược', 'tài xỉu', 'casino', 'nổ hũ', 'lô đề', 'soi cầu', 'kiếm tiền online',
      'việc nhẹ lương cao', 'vay tiền nhanh', 'app vay', 'nhận code free', 'inbox zalo',
      'kết bạn zalo', 'zalo.me', 't.me', 'bit.ly', 'tinyurl.com'
    ]
  }
];
