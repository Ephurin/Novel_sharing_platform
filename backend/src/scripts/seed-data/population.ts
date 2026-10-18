import { catalogAuthors } from './catalog.js';
import { AVATAR_PHOTOS, avatar, createRng, curatedAuthor, slugify, type SeedUser } from './curated-data.js';

// The seeded accounts: seven authors who own the novels, and a small set of reader accounts for
// trying the reader side. Readers get no activity (likes, follows, unlocks) and no wallet history.

export const seedAuthors: SeedUser[] = [
  curatedAuthor,
  {
    key: 'author02',
    username: 'author02',
    email: 'author02@example.com',
    role: 'AUTHOR',
    displayName: 'Trần Quốc Việt',
    bio: 'Viết tiên hiệp và khoa học viễn tưởng. Tin rằng truyện dài cần một nhịp đều như bước chân người đi bộ đường xa.',
    avatarUrl: avatar(AVATAR_PHOTOS[1])
  },
  {
    key: 'author03',
    username: 'author03',
    email: 'author03@example.com',
    role: 'AUTHOR',
    displayName: 'Phạm Thanh Hà',
    bio: 'Giáo viên văn buổi sáng, người viết ngôn tình và truyện đời thường buổi tối. Thích cà phê và những cái kết dịu dàng.',
    avatarUrl: avatar(AVATAR_PHOTOS[7])
  },
  ...catalogAuthors
];

const CURATED_READERS: Array<[username: string, displayName: string]> = [
  ['hoanglan', 'Hoàng Lan'],
  ['minhanh', 'Minh Anh'],
  ['quocbao', 'Quốc Bảo'],
  ['thutrang', 'Thu Trang'],
  ['duchuy', 'Đức Huy'],
  ['ngocmai', 'Ngọc Mai']
];

const FAMILY_NAMES = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý'];
const MIDDLE_NAMES = ['Văn', 'Thị', 'Minh', 'Ngọc', 'Thanh', 'Quốc', 'Đức', 'Thu', 'Hải', 'Anh', 'Gia', 'Bảo'];
const GIVEN_NAMES = [
  'An', 'Bình', 'Châu', 'Dung', 'Giang', 'Hà', 'Hạnh', 'Khoa', 'Linh', 'Long', 'Mai', 'Nam', 'Phong',
  'Quân', 'Sơn', 'Thảo', 'Trang', 'Tú', 'Uyên', 'Việt', 'Yến', 'Hiếu', 'Lan', 'Nhi', 'Phúc', 'Vy'
];
const READER_BIOS = [
  'Đọc truyện mỗi tối trước khi ngủ.',
  'Mê truyện đô thị và trinh thám.',
  'Thích những câu chuyện chữa lành.',
  'Fan cứng của tiên hiệp và kiếm hiệp.',
  'Đọc trên tàu điện mỗi sáng.',
  'Sưu tầm những truyện hay trên nền tảng.',
  'Thích bình luận và ủng hộ tác giả.',
  'Đọc nhiều thể loại, không kén chọn.'
];

export const READER_COUNT = 20;

function buildReaders(): SeedUser[] {
  const rng = createRng('readers');
  const readers: SeedUser[] = CURATED_READERS.map(([username, displayName], index) => ({
    key: username,
    username,
    email: `${username}.seed@example.com`,
    role: 'READER',
    displayName,
    bio: READER_BIOS[index % READER_BIOS.length],
    avatarUrl: avatar(AVATAR_PHOTOS[index % AVATAR_PHOTOS.length])
  }));
  const usedNames = new Set(readers.map((reader) => reader.displayName));

  for (let index = readers.length; index < READER_COUNT; index++) {
    let displayName = '';
    do {
      displayName = `${rng.pick(FAMILY_NAMES)} ${rng.pick(MIDDLE_NAMES)} ${rng.pick(GIVEN_NAMES)}`;
    } while (usedNames.has(displayName));
    usedNames.add(displayName);

    const parts = displayName.split(' ');
    const username = `${slugify(parts[2])}${slugify(parts[0])}${String(index + 1).padStart(2, '0')}`;
    readers.push({
      key: username,
      username,
      email: `${username}.seed@example.com`,
      role: 'READER',
      displayName,
      bio: rng.pick(READER_BIOS),
      avatarUrl: avatar(AVATAR_PHOTOS[index % AVATAR_PHOTOS.length])
    });
  }
  return readers;
}

export const seedReaders: SeedUser[] = buildReaders();
