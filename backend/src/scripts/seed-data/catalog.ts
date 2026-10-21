import { avatar, createRng, type Rng, type SeedUser } from './curated-data.js';
import type { NovelSpec, PackName } from './generated-novels.js';

// Catalog of additional authors and novels, composed from name, title and place pools so the seed
// covers many genres and states while staying deterministic. Each novel gets its own cast, setting
// and cover; the chapter text itself comes from the genre packs in generated-novels.ts.

export const catalogAuthors: SeedUser[] = [
  {
    key: 'author04',
    username: 'author04',
    email: 'author04@example.com',
    role: 'AUTHOR',
    displayName: 'Lê Hoài Nam',
    bio: 'Tu tiên là cách tôi đi du lịch mà không cần rời bàn viết. Mỗi bộ truyện là một thế giới có luật chơi riêng.',
    avatarUrl: avatar('photo-1472099645785-5658abf4ff4e')
  },
  {
    key: 'author05',
    username: 'author05',
    email: 'author05@example.com',
    role: 'AUTHOR',
    displayName: 'Nguyễn Thùy Dương',
    bio: 'Viết ngôn tình vì tin rằng ai cũng xứng đáng có một câu chuyện tình có hậu, dù chỉ trên trang giấy.',
    avatarUrl: avatar('photo-1438761681033-6461ffad8d80')
  },
  {
    key: 'author06',
    username: 'author06',
    email: 'author06@example.com',
    role: 'AUTHOR',
    displayName: 'Vũ Minh Khôi',
    bio: 'Cựu phóng viên mảng pháp luật, giờ viết truyện trinh thám và kinh dị từ những vụ án chưa có lời giải.',
    avatarUrl: avatar('photo-1506794778202-cad84cf45f1d')
  },
  {
    key: 'author07',
    username: 'author07',
    email: 'author07@example.com',
    role: 'AUTHOR',
    displayName: 'Đặng Khánh Linh',
    bio: 'Viết về những ngày bình thường nhất, vì tôi tin chuyện lớn nào cũng bắt đầu từ một bữa cơm.',
    avatarUrl: avatar('photo-1573496359142-b8d87734a5a2')
  }
];

/**
 * A batch of generated novels. `key` seeds the generator, so a batch keeps producing the same
 * titles and chapters even if it is reassigned to another author.
 */
type CatalogBatch = { key: string; authorKey: string; packs: PackName[]; novelCount: number };

const catalogBatches: CatalogBatch[] = [
  { key: 'author04', authorKey: 'author04', packs: ['fantasy', 'fantasy', 'scifi'], novelCount: 6 },
  { key: 'author05', authorKey: 'author05', packs: ['romance', 'romance', 'slice'], novelCount: 7 },
  { key: 'author06', authorKey: 'author06', packs: ['mystery', 'mystery', 'fantasy'], novelCount: 6 },
  { key: 'author07', authorKey: 'author07', packs: ['slice', 'slice', 'romance'], novelCount: 6 },
  { key: 'author08', authorKey: 'author04', packs: ['scifi', 'scifi', 'mystery'], novelCount: 6 },
  { key: 'author09', authorKey: 'author05', packs: ['romance', 'fantasy', 'romance'], novelCount: 5 },
  { key: 'author10', authorKey: 'author06', packs: ['mystery', 'slice', 'fantasy', 'scifi', 'romance'], novelCount: 6 }
];

type PackCatalog = {
  genres: Array<{ genre: string; tags: string[] }>;
  titleHeads: string[];
  titleTails: string[];
  heroes: string[];
  allies: string[];
  rivals: string[];
  elders: string[];
  minors: string[];
  places: string[];
  items: string[];
  synopses: string[];
  ageRatings: Array<'EVERYONE' | 'TEEN' | 'MATURE'>;
};

const catalogs: Record<PackName, PackCatalog> = {
  romance: {
    genres: [
      { genre: 'Ngôn tình', tags: ['Ngôn tình', 'Hiện đại', 'Hôn nhân'] },
      { genre: 'Lãng mạn', tags: ['Lãng mạn', 'Chữa lành', 'Hiện đại'] },
      { genre: 'Tình yêu học đường', tags: ['Học đường', 'Thanh xuân', 'Lãng mạn'] }
    ],
    titleHeads: ['Mùa', 'Hẹn ước', 'Giấc mơ', 'Lời thì thầm', 'Bản tình ca', 'Nhịp tim', 'Dấu yêu', 'Chuyến tàu', 'Ngày em đến', 'Một thời'],
    titleTails: ['Hà Nội', 'Sài Gòn', 'Huế', 'Đà Lạt', 'tháng Năm', 'cuối thu', 'ban mai', 'chiều muộn', 'phố núi', 'bên sông', 'đầu đông', 'còn lại'],
    heroes: ['Diệp Anh', 'Thu Hà', 'Mai Phương', 'Ngọc Lan', 'Bích Ngọc', 'Khánh Vy', 'Hải Yến', 'Thanh Tâm', 'Minh Châu', 'Quỳnh Như', 'Lan Hương', 'Tú Anh'],
    allies: ['Đình Phong', 'Gia Huy', 'Quốc Khánh', 'Thành Đạt', 'Hoàng Nam', 'Bảo Long', 'Anh Tuấn', 'Minh Quân', 'Đức Thịnh', 'Trọng Nghĩa'],
    rivals: ['Hạ Vy', 'Tống Mạn', 'Kiều Trang', 'Quang Vinh', 'Lâm Phi', 'Ngân Khánh'],
    elders: ['bà Lan', 'ông Sáu', 'cô Hạnh', 'chú Ba', 'bác Tư', 'dì Năm'],
    minors: ['cậu bé hàng xóm', 'chị lao công', 'bác bảo vệ', 'cô thư ký', 'anh giao hàng', 'em họ'],
    places: ['quán cà phê góc phố', 'tòa nhà văn phòng', 'ga tàu cũ', 'bờ sông Hương', 'phố đi bộ', 'hiệu sách nhỏ', 'sân thượng', 'bệnh viện nhi', 'trường đại học', 'chợ hoa', 'căn hộ tầng 7', 'bến xe miền núi'],
    items: ['chiếc nhẫn bạc', 'bức thư tay', 'cuốn nhật ký', 'chiếc ô trong suốt', 'bó hoa cúc', 'tấm vé khứ hồi', 'cây đàn guitar cũ'],
    synopses: [
      '{hero} và {ally} gặp nhau trong một hoàn cảnh không ai ngờ tới ở {place}. Giữa những hiểu lầm, áp lực gia đình và sự xuất hiện của {rival}, họ phải quyết định liệu tình cảm này có đáng để giữ lại.',
      'Sau nhiều năm xa cách, {hero} trở về {place} và gặp lại {ally}, người mà cô từng hứa sẽ không bao giờ quên. Nhưng quá khứ có những điều {rival} không muốn ai biết.',
      'Một hợp đồng tưởng như chỉ là hình thức đã kéo {hero} và {ally} vào cuộc sống chung. Khi {rival} bước vào, ranh giới giữa diễn kịch và thật lòng bắt đầu mờ đi.'
    ],
    ageRatings: ['EVERYONE', 'TEEN', 'TEEN']
  },
  mystery: {
    genres: [
      { genre: 'Trinh thám', tags: ['Trinh thám', 'Hình sự', 'Điều tra'] },
      { genre: 'Kinh dị', tags: ['Kinh dị', 'Tâm lý', 'Bí ẩn'] },
      { genre: 'Hình sự', tags: ['Hình sự', 'Pháp y', 'Điều tra'] }
    ],
    titleHeads: ['Hồ sơ', 'Bóng người', 'Vụ án', 'Lời khai', 'Căn phòng', 'Tiếng gọi', 'Dấu vân tay', 'Kẻ thứ ba', 'Đêm không ngủ', 'Mật thư'],
    titleTails: ['số 13', 'trong bóng tối', 'cuối con hẻm', 'không lời giải', 'tầng hầm', 'mười năm trước', 'bên kia cửa sổ', 'khu tập thể', 'lúc nửa đêm', 'bị lãng quên', 'của người lạ'],
    heroes: ['Bạch Dương', 'Phan Lâm', 'Trịnh Khoa', 'Đoàn Vũ', 'Lý Hạo', 'Minh Triết', 'Hà Phong', 'Tạ Quân', 'Cao Nguyên'],
    allies: ['Thùy Chi', 'Ngọc Hân', 'Tố Uyên', 'Kim Ngân', 'Bảo Trâm', 'Thanh Mai'],
    rivals: ['kẻ giấu mặt', 'ông chủ tịch', 'bóng đen', 'người đàn ông áo nâu', 'tổ chức Ngũ Hành'],
    elders: ['cụ Tám', 'thầy giáo cũ', 'ông chủ quán', 'bà bán báo', 'bác sĩ pháp y Hòa'],
    minors: ['thằng bé giao báo', 'cô lao công', 'bác tài xế', 'cậu thực tập', 'người trông xe'],
    places: ['khu tập thể cũ', 'nhà xác bệnh viện', 'bến xe khuya', 'tòa soạn báo', 'căn biệt thự bỏ hoang', 'quán karaoke', 'cảng Hải Phòng', 'nhà thờ cổ', 'đồn công an phường', 'tầng hầm chung cư', 'khu rừng ven thành phố', 'phòng lưu trữ'],
    items: ['cuốn sổ ghi chép', 'chiếc chìa khóa lạ', 'đoạn băng ghi âm', 'bức ảnh bị xé', 'chiếc đồng hồ dừng', 'phong bì không tên', 'mảnh gương vỡ'],
    synopses: [
      'Một chuỗi vụ việc tưởng chừng không liên quan đã đưa {hero} đến {place}. Càng điều tra, {hero} càng nhận ra {rival} đã đi trước mình nhiều năm, và {ally} có thể biết nhiều hơn những gì cô nói.',
      'Mười năm sau vụ án cũ, một thi thể mới xuất hiện ở {place}, giống hệt hiện trường năm xưa. {hero} buộc phải mở lại hồ sơ mà chính mình từng khép.',
      'Trong đêm mưa, {ally} nhận được một cuộc gọi báo rằng sự thật về cái chết của anh trai mình nằm ở {place}. {hero} nhận lời giúp mà chưa biết {rival} đang chờ ở đó.'
    ],
    ageRatings: ['TEEN', 'MATURE', 'MATURE']
  },
  fantasy: {
    genres: [
      { genre: 'Tiên hiệp', tags: ['Tiên hiệp', 'Tu luyện', 'Kiếm hiệp'] },
      { genre: 'Huyền huyễn', tags: ['Huyền huyễn', 'Phiêu lưu', 'Dị giới'] },
      { genre: 'Kiếm hiệp', tags: ['Kiếm hiệp', 'Võ lâm', 'Giang hồ'] },
      { genre: 'Lịch sử', tags: ['Lịch sử', 'Chiến trận', 'Cổ đại'] }
    ],
    titleHeads: ['Thiên', 'Kiếm', 'Long', 'Phượng', 'Huyết', 'Ma', 'Đế', 'Linh', 'Vô Thượng', 'Cửu Trọng'],
    titleTails: ['Chí Tôn', 'Đạo Chủ', 'Truyền Kỳ', 'Phong Vân', 'Lệnh', 'Sử', 'Thành', 'Kiếp', 'Giới', 'Quy Nhất', 'Tái Thế'],
    heroes: ['Lăng Tiêu', 'Diệp Phàm', 'Lâm Phong', 'Sở Vân', 'Tiêu Viêm', 'Cố Trường Ca', 'Mạc Ngôn', 'Từ Thanh', 'Tần Mục', 'Phong Ẩn', 'Bạch Lộc', 'Lý Thanh Sơn'],
    allies: ['Tô Nhược Hàn', 'Hạ Thanh Y', 'Liễu Như Yên', 'Mộ Thanh Tuyết', 'Dương Hạo', 'Tống Khải'],
    rivals: ['Mộ Dung Khuyết', 'Hắc Long Giáo', 'Âu Dương Chiến', 'Huyết Ma Tôn', 'Thiên Cơ Các'],
    elders: ['lão kiếm Trần', 'sư phụ Huyền Cơ', 'trưởng lão Vân', 'lão ăn mày', 'đạo sĩ Thanh Hư'],
    minors: ['tiểu thú Tuyết Nhi', 'linh hồ Bạch Vũ', 'tiểu đồng Mặc', 'sư đệ Hạo', 'khí linh trong kiếm'],
    places: ['Thanh Vân tông', 'Hắc Vụ sơn mạch', 'Cổ Kiếm trủng', 'thành Lạc Dương', 'Vạn Thú cốc', 'Cửu U địa phủ', 'Thiên Môn quan', 'Bích Hải đảo', 'Huyền Băng cung', 'Linh Dược viên', 'Đông Hải long cung', 'Tây Vực sa mạc'],
    items: ['thanh cổ kiếm', 'ngọc giản truyền thừa', 'linh đan thượng phẩm', 'chiếc nhẫn trữ vật', 'bản đồ bí cảnh', 'lệnh bài tông môn', 'bình thiên địa linh dịch'],
    synopses: [
      '{hero} sinh ra không có linh căn, bị cả tông môn khinh thường. Nhưng nhờ một cơ duyên ở {place}, hắn tìm thấy truyền thừa của một đại năng thượng cổ, và con đường báo thù với {rival} bắt đầu.',
      'Thế giới tu hành chia cắt bởi chín đại tông môn. {hero} cùng {ally} lần lượt khám phá bí mật đằng sau thiên kiếp, đối mặt với {rival} và lời nguyền của {place}.',
      'Giữa loạn thế, {hero} nhận kiếm từ tay {elder} và bước vào giang hồ. Mỗi trận chiến là một bài học, và {rival} luôn là bóng đen phía sau.'
    ],
    ageRatings: ['TEEN', 'TEEN', 'MATURE']
  },
  scifi: {
    genres: [
      { genre: 'Khoa học viễn tưởng', tags: ['Khoa học viễn tưởng', 'Không gian', 'Tương lai'] },
      { genre: 'Cyberpunk', tags: ['Cyberpunk', 'Trí tuệ nhân tạo', 'Đô thị'] },
      { genre: 'Hậu tận thế', tags: ['Hậu tận thế', 'Sinh tồn', 'Khoa học viễn tưởng'] }
    ],
    titleHeads: ['Quỹ đạo', 'Tín hiệu', 'Hệ sao', 'Mật mã', 'Thế giới', 'Bản sao', 'Dải ngân hà', 'Đồng hồ', 'Trạm', 'Cổng'],
    titleTails: ['cuối cùng', 'số 9', 'bị mất', 'Alpha', 'năm 2300', 'không tên', 'thứ hai', 'dưới đại dương', 'sau tận thế', 'của loài người', 'lạ'],
    heroes: ['Kỳ An', 'Hàn Nguyệt', 'Nova', 'Orion', 'Zeke Trần', 'Linh Chi', 'Vega', 'Kai', 'Mira', 'Dax', 'Elyra', 'Quang Minh'],
    allies: ['AI Sao Mai', 'đại úy Rowan', 'Lena', 'kỹ sư Tô', 'Atlas', 'Noor'],
    rivals: ['thuyền trưởng Vance', 'tập đoàn Helix', 'tể tướng Aldric', 'hệ thống Oracle', 'tướng quân Kuro'],
    elders: ['giáo sư Bách', 'tiến sĩ Hạ', 'đô đốc Sato', 'kỹ sư trưởng Vân'],
    minors: ['robot bảo trì', 'phi công Kiên', 'trợ lý ảo', 'thủy thủ đoàn', 'đứa trẻ sinh ra trên tàu'],
    places: ['trạm vũ trụ Hy Vọng', 'khoang năng lượng', 'thành phố ngầm', 'vành đai tiểu hành tinh', 'tàu Aurora', 'căn cứ Mặt Trăng', 'phòng thí nghiệm lạnh', 'sa mạc phóng xạ', 'tháp dữ liệu trung tâm', 'khu ổ chuột tầng thấp', 'hành tinh Kepler', 'cổng không gian số 4'],
    items: ['tinh thể dữ liệu', 'bộ giáp trợ lực', 'chip ký ức', 'máy dò tín hiệu', 'bản đồ sao', 'thẻ chỉ huy', 'viên đạn plasma'],
    synopses: [
      'Năm 2300, {hero} là kỹ thuật viên cấp thấp ở {place}. Một lần sửa lỗi hệ thống vô tình hé lộ cho {hero} thấy {rival} đang che giấu một sự thật về con người, và {ally} là người duy nhất cô có thể tin.',
      'Tín hiệu lạ từ {place} làm đảo lộn mọi dự đoán của giới khoa học. {hero} dẫn một nhóm nhỏ lên đường tìm nguồn gốc, nhưng {rival} đã sẵn sàng chặn họ bằng mọi giá.',
      'Sau tận thế, nhân loại chia thành những khu sinh tồn khép kín. {hero} rời {place} để tìm {ally}, người cuối cùng biết cách khởi động lại hệ sinh thái.'
    ],
    ageRatings: ['TEEN', 'TEEN', 'EVERYONE']
  },
  slice: {
    genres: [
      { genre: 'Đời thường', tags: ['Đời thường', 'Chữa lành', 'Gia đình'] },
      { genre: 'Học đường', tags: ['Học đường', 'Thanh xuân', 'Tình bạn'] },
      { genre: 'Hài hước', tags: ['Hài hước', 'Đời thường', 'Công sở'] }
    ],
    titleHeads: ['Nhật ký', 'Những ngày', 'Chuyện nhỏ', 'Quán', 'Bữa cơm', 'Căn phòng', 'Mùa hè', 'Lớp', 'Xóm', 'Chuyến xe'],
    titleTails: ['của chúng mình', 'ở góc phố', 'bình yên', 'không tên', 'đầu tiên', 'sau giờ học', 'cuối tuần', 'có mưa', 'nhà số 5', 'tháng Sáu', 'ở phố cổ'],
    heroes: ['Thục Anh', 'Bảo Ngân', 'Gia Hân', 'Phương Linh', 'Mai Chi', 'Hải Đăng', 'Minh Khang', 'Tuấn Kiệt', 'Quốc Việt', 'Thảo Vy'],
    allies: ['anh Kiệt', 'chị Lan', 'bé Na', 'Duy Anh', 'cô bạn Mi', 'thằng Tí'],
    rivals: ['bà chủ nhà', 'anh hàng xóm', 'đối thủ cũ', 'chị trưởng phòng', 'cô giáo chủ nhiệm'],
    elders: ['cụ Phúc', 'bà Bảy', 'ông Hai', 'cô Lài', 'chú Tư'],
    minors: ['cậu sinh viên', 'em bé bán vé số', 'con mèo mướp', 'chú chó vàng', 'bác bán bánh mì'],
    places: ['quán cơm văn phòng', 'xóm trọ sinh viên', 'lớp học thêm', 'chung cư cũ', 'chợ sáng', 'tiệm giặt là', 'ban công tầng ba', 'công viên cuối phố', 'tiệm sách cũ', 'căn bếp nhỏ', 'sân trường', 'bến xe buýt số 14'],
    items: ['chiếc xe đạp cũ', 'quyển sổ công thức', 'hộp cơm trưa', 'chiếc loa bluetooth', 'chậu xương rồng', 'cuốn album ảnh', 'cây dù cầu vồng'],
    synopses: [
      '{hero} chuyển đến {place} với hai chiếc va li và một kế hoạch bắt đầu lại. Những người hàng xóm kỳ quặc, trong đó có {ally} và {rival}, dần trở thành gia đình thứ hai của cô.',
      'Mỗi ngày ở {place} là một câu chuyện nhỏ. {hero} học cách nấu ăn, học cách xin lỗi và học cách để {ally} bước vào cuộc sống của mình, dù {rival} không đồng tình.',
      'Cả lớp 11A2 bước vào năm học mới với một cô chủ nhiệm kỳ lạ. {hero} và {ally} cùng nhau vượt qua những kỳ thi, những cuộc cãi vã và cả mối tình đầu.'
    ],
    ageRatings: ['EVERYONE', 'EVERYONE', 'TEEN']
  }
};

function pickDistinct<T>(rng: Rng, items: readonly T[], count: number): T[] {
  return rng.shuffle(items).slice(0, count);
}

export function buildCatalogSpecs(existingTitles: Set<string>): NovelSpec[] {
  const specs: NovelSpec[] = [];
  const usedTitles = new Set(existingTitles);

  for (const batch of catalogBatches) {
    const rng = createRng(`catalog:${batch.key}`);
    for (let index = 0; index < batch.novelCount; index++) {
      const packName = batch.packs[index % batch.packs.length];
      const catalog = catalogs[packName];
      const genre = catalog.genres[index % catalog.genres.length];

      let title = '';
      for (let attempt = 0; attempt < 50 && (!title || usedTitles.has(title)); attempt++) {
        title = `${rng.pick(catalog.titleHeads)} ${rng.pick(catalog.titleTails)}`;
      }
      if (usedTitles.has(title)) title = `${title} ${index + 1}`;
      usedTitles.add(title);

      const hero = rng.pick(catalog.heroes);
      const ally = rng.pick(catalog.allies.filter((name) => name !== hero));
      const rival = rng.pick(catalog.rivals);
      const elder = rng.pick(catalog.elders);
      const minor = rng.pick(catalog.minors);
      const [place0, place1, place2, place3] = pickDistinct(rng, catalog.places, 4);
      const items = pickDistinct(rng, catalog.items, 3) as [string, ...string[]];

      const synopsis = rng
        .pick(catalog.synopses)
        .replaceAll('{hero}', hero)
        .replaceAll('{ally}', ally)
        .replaceAll('{rival}', rival)
        .replaceAll('{elder}', elder)
        .replaceAll('{place}', place0);

      const roll = rng.next();
      const draftNovel = roll < 0.07;
      const completed = !draftNovel && roll > 0.78;
      const hiatus = !draftNovel && !completed && roll > 0.72;
      const chapterCount = draftNovel ? rng.int(3, 10) : rng.int(14, 72);
      // Formerly the novel's popularity; still drawn so the catalog stays identical to earlier runs.
      rng.next();

      specs.push({
        key: `${batch.key}-${packName}-${index + 1}`,
        authorKey: batch.authorKey,
        title,
        pack: packName,
        genre: genre.genre,
        tags: genre.tags,
        synopsis,
        cast: { hero, ally, rival, elder, minor },
        places: [place0, place1, place2, place3],
        items,
        chapterCount,
        draftTail: draftNovel ? chapterCount : completed ? 0 : rng.int(0, 3),
        vipFrom: draftNovel ? 0 : rng.int(4, 12),
        vipPrice: draftNovel ? 0 : rng.pick([8, 10, 10, 12, 15, 15, 20, 25]),
        status: draftNovel ? 'DRAFT' : 'PUBLISHED',
        serialStatus: completed ? 'COMPLETED' : hiatus ? 'HIATUS' : 'ONGOING',
        ageRating: rng.pick(catalog.ageRatings),
        createdDaysAgo: draftNovel ? rng.int(3, 30) : rng.int(35, 420),
        coverIndex: rng.int(0, 11)
      });
    }
  }
  return specs;
}
