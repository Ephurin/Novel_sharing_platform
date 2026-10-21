import { createHash } from 'node:crypto';

// Hand-written part of the author workspace seed: shared types and helpers, the lead author
// (Mai Linh) and four curated novels. generated-novels.ts extends these and adds the generated
// catalog; author-workspace.ts assembles everything.

export const SEED_PASSWORD = 'StrongPassword123!';

export type SeedUser = {
  key: string;
  username: string;
  email: string;
  role: 'AUTHOR' | 'READER';
  displayName: string;
  bio: string;
  avatarUrl: string;
};

export type SeedChapter = {
  key: string;
  title: string;
  content: string;
  status: 'PUBLISHED' | 'DRAFT';
  priceCoins: number;
  /** Days before the seed run; null for drafts. */
  publishedDaysAgo: number | null;
};

export type SeedCharacter = {
  key: string;
  name: string;
  role: 'PROTAGONIST' | 'ANTAGONIST' | 'SUPPORTING' | 'MINOR';
  /** Rendered by the IDE as the "[Thân phận: ...]" prefix of the description. */
  customTitle: string;
  personality: string;
  description: string;
  notes: string;
};

export type SeedStoryContext = {
  characters: SeedCharacter[];
  relationships: Array<{ source: string; target: string; type: string; description: string }>;
  timeline: Array<{ title: string; chapterKey: string; summary: string }>;
  summaries: Array<
    | { scope: 'NOVEL'; summary: string }
    | { scope: 'ARC'; arcName: string; startChapter: number; endChapter: number; summary: string }
    | { scope: 'CHAPTER'; chapterKey: string; summary: string }
  >;
};

export type SeedNovel = {
  key: string;
  authorKey: string;
  title: string;
  slug: string;
  synopsis: string;
  genre: string;
  tags: string[];
  coverImageUrl: string;
  status: 'PUBLISHED' | 'DRAFT';
  serialStatus: 'ONGOING' | 'COMPLETED' | 'HIATUS';
  ageRating: 'EVERYONE' | 'TEEN' | 'MATURE';
  createdDaysAgo: number;
  chapters: SeedChapter[];
  context?: SeedStoryContext;
};

/** Deterministic UUID so re-running the seed updates rows instead of duplicating them. */
export function seedUuid(key: string) {
  const hex = createHash('sha1').update(`author-workspace-seed:${key}`).digest('hex');
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function countWords(content: string) {
  return content.trim().split(/\s+/).filter(Boolean).length;
}

/** Small deterministic PRNG so every run generates the same catalog. */
export type Rng = {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  chance(probability: number): boolean;
  shuffle<T>(items: readonly T[]): T[];
};

export function createRng(seedText: string): Rng {
  let state = createHash('sha1').update(seedText).digest().readUInt32LE(0);
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    pick: (items) => items[int(0, items.length - 1)],
    chance: (probability) => next() < probability,
    shuffle: (items) => {
      const copy = [...items];
      for (let index = copy.length - 1; index > 0; index--) {
        const other = int(0, index);
        [copy[index], copy[other]] = [copy[other], copy[index]];
      }
      return copy;
    }
  };
}

// Only photos confirmed to resolve (HTTP 200) when the seed was written.
export const AVATAR_PHOTOS = [
  'photo-1534528741775-53994a69daeb',
  'photo-1507003211169-0a1dd7228f2d',
  'photo-1517841905240-472988babdf9',
  'photo-1500648767791-00dcc994a43e',
  'photo-1494790108377-be9c29b29330',
  'photo-1522075469751-3a6694fb2f61',
  'photo-1544005313-94ddf0286df2',
  'photo-1438761681033-6461ffad8d80',
  'photo-1472099645785-5658abf4ff4e',
  'photo-1539571696357-5a69c17a67c6',
  'photo-1506794778202-cad84cf45f1d',
  'photo-1573496359142-b8d87734a5a2',
  'photo-1580489944761-15a19d654956'
] as const;

export const COVER_PHOTOS = [
  'photo-1544716278-ca5e3f4abd8c',
  'photo-1512820790803-83ca734da794',
  'photo-1476275466078-4007374efbbe',
  'photo-1516979187457-637abb4f9353',
  'photo-1481627834876-b7833e8f5570',
  'photo-1495446815901-a7297e633e8d',
  'photo-1524995997946-a1c2e315a42f',
  'photo-1507842217343-583bb7270b66',
  'photo-1589998059171-988d887df646',
  'photo-1543002588-bfa74002ed7e',
  'photo-1491841550275-ad7854e35ca6',
  'photo-1519682337058-a94d519337bc'
] as const;

export const avatar = (photoId: string) => `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=160&q=80`;
export const cover = (photoId: string) => `https://images.unsplash.com/${photoId}?q=80&w=600&auto=format&fit=crop`;

export const curatedAuthor: SeedUser = {
  key: 'author01',
  username: 'author01',
  email: 'author01@example.com',
  role: 'AUTHOR',
  displayName: 'Mai Linh',
  bio: 'Viết những câu chuyện về ký ức, con người và những góc phố cũ. Yêu văn chương, Hà Nội và những ngày mưa.',
  avatarUrl: avatar('photo-1494790108377-be9c29b29330')
};
export const curatedNovels: SeedNovel[] = [
  {
    key: 'gio-thoang',
    title: 'Gió Thoảng Qua Phố Cổ',
    slug: 'gio-thoang-qua-pho-co',
    synopsis:
      'Sau khi bà ngoại qua đời, Minh Thư trở về Hà Nội để bán lại hiệu sách cũ trên phố Hàng Bạc. Nhưng những lá thư chưa từng gửi trong chiếc hộp thiếc trên gác xép, cùng sự xuất hiện của chàng kiến trúc sư Hoàng Lâm, khiến cô dần hiểu vì sao bà dặn mình đừng bán nó.',
    genre: 'Lãng mạn',
    tags: ['Hiện đại', 'Lãng mạn', 'Hà Nội'],
    coverImageUrl: cover('photo-1544716278-ca5e3f4abd8c'),
    status: 'PUBLISHED',
    serialStatus: 'ONGOING',
    ageRating: 'EVERYONE',
    createdDaysAgo: 320,
    authorKey: 'author01',
    chapters: [
      {
        key: 'gio-thoang-1',
        title: 'Chương 1: Hiệu sách trên phố Hàng Bạc',
        status: 'PUBLISHED',
        priceCoins: 0,
        publishedDaysAgo: 300,
        content: `Minh Thư trở về Hà Nội vào một buổi chiều cuối thu, khi gió heo may vừa kịp lùa qua những mái ngói rêu phong của phố cổ. Chiếc va li nhỏ lạch cạch trên vỉa hè lát đá, dừng lại trước một cánh cửa gỗ đã bạc màu. Tấm biển "Hiệu sách Gió Thoảng" vẫn treo đó, chỉ có nét sơn là mờ đi theo năm tháng.

Bà ngoại mất được ba tháng. Người ta gửi cho Thư một chùm chìa khóa, một tờ giấy thừa kế và một lời nhắn ngắn: "Đừng bán nó vội." Thư đã định bán. Ở Sài Gòn, cô có công việc, có căn hộ thuê và một cuộc sống không cần đến những kệ sách cũ kỹ.

Nhưng khi cánh cửa mở ra, mùi giấy cũ và mùi gỗ lim ùa đến, Thư đứng lặng rất lâu. Trên quầy, chiếc ấm trà của bà vẫn úp ngược, như thể bà chỉ vừa ra đầu ngõ mua mớ rau, chốc nữa sẽ về.

"Cháu là cháu bà Hạnh phải không?" Ông Tư bán trà đá đầu ngõ ló đầu vào, giọng khàn khàn. "Bà cứ nhắc mãi, bảo thế nào cháu cũng về."

Thư không trả lời. Cô chỉ khẽ gật đầu, rồi đặt va li xuống, lần đầu tiên sau nhiều năm thấy mình không còn vội.`
      },
      {
        key: 'gio-thoang-2',
        title: 'Chương 2: Người kiến trúc sư lạ mặt',
        status: 'PUBLISHED',
        priceCoins: 0,
        publishedDaysAgo: 270,
        content: `Sáng thứ hai, tiếng gõ cửa vang lên khi Thư đang lau bụi trên kệ sách văn học Nga. Đứng ngoài là một người đàn ông cao, đeo kính, tay cầm cuộn bản vẽ đã sờn mép.

"Tôi là Hoàng Lâm, kiến trúc sư phụ trách khảo sát các nhà cổ trên phố này," anh nói, giọng điềm đạm. "Tôi muốn xin phép đo đạc lại ngôi nhà."

Thư nhíu mày. Từ hôm về, cô đã nhận ba cuộc gọi hỏi mua lại hiệu sách, cuộc nào cũng nhắc đến một "dự án" mơ hồ.

"Anh làm cho ai?"

Lâm hơi khựng lại, rồi mỉm cười: "Cho ngôi nhà này. Nó có một cái giếng trời rất đẹp mà ít ai còn giữ được."

Anh đi khắp các gian, gõ nhẹ vào những bức tường vôi, ngước nhìn những thanh xà gỗ đã ngả màu. Đến chiều, khi nắng xiên qua giếng trời rơi xuống nền gạch bát, Thư bắt gặp anh đứng lặng như đang nghe ngôi nhà kể chuyện.

Cô không biết nên tin anh hay không. Nhưng cô biết, đã lâu lắm rồi mới có người nhìn hiệu sách của bà bằng ánh mắt như thế.`
      },
      {
        key: 'gio-thoang-3',
        title: 'Chương 3: Chiếc hộp thiếc của bà',
        status: 'PUBLISHED',
        priceCoins: 0,
        publishedDaysAgo: 230,
        content: `Căn gác xép của hiệu sách thấp đến mức Thư phải cúi người mới đứng được. Giữa những chồng báo cũ và mấy chiếc quạt nan, cô tìm thấy một chiếc hộp thiếc đựng bánh quy, nắp đã gỉ sét.

Bên trong là hàng chục lá thư, xếp ngay ngắn theo năm. Nét chữ nghiêng nghiêng của bà ngoại, mực tím đã phai. Lá trên cùng đề ngày 12 tháng 10 năm 1972, gửi một người tên Khiêm.

Thư chưa bao giờ nghe bà nhắc đến cái tên ấy.

Cô ngồi bệt xuống sàn gỗ, đọc đến khi trời tối hẳn. Những lá thư kể về phố Hàng Bạc thời bom đạn, về hiệu sách mở cửa cả trong những ngày sơ tán, về một lời hẹn "khi nào hòa bình, mình sẽ cùng uống trà trên gác này."

Không lá thư nào có dấu bưu điện. Bà đã viết, rồi cất đi, suốt năm mươi năm.

Dưới đáy hộp, một tấm ảnh đen trắng chụp hai người trẻ đứng trước cửa hiệu sách. Mặt sau ghi vội một dòng: "Đừng bán nó, Hạnh nhé."`
      },
      {
        key: 'gio-thoang-4',
        title: 'Chương 4: Mưa đầu mùa',
        status: 'PUBLISHED',
        priceCoins: 15,
        publishedDaysAgo: 180,
        content: `Cơn mưa đầu mùa đổ xuống phố cổ vào đúng lúc Trần Khải bước vào hiệu sách. Anh ta mặc com-lê xám, giày da bóng loáng, mang theo một tập hồ sơ dày và nụ cười của người quen đàm phán.

"Chúng tôi trả gấp rưỡi giá thị trường," Khải đặt tập hồ sơ lên quầy, ngay cạnh chiếc ấm trà của bà. "Khách sạn boutique, giữ nguyên mặt tiền. Phố cổ cần những dự án như thế này."

Thư lật vài trang. Ở góc bản vẽ phối cảnh, cô nhận ra nét chữ ký quen thuộc: H. Lâm.

Cô ngẩng lên, thấy Lâm đang đứng ngoài hiên trú mưa, áo sơ mi ướt sũng một bên vai. Ánh mắt hai người gặp nhau qua lớp kính mờ hơi nước.

"Tôi sẽ suy nghĩ," Thư nói, giọng bình thản đến mức chính cô cũng ngạc nhiên.

Khi Khải đi rồi, Lâm bước vào, định nói điều gì đó. Thư đặt tập hồ sơ vào tay anh.

"Anh không cần giải thích," cô nói. "Tôi chỉ cần biết, cái giếng trời anh khen hôm trước, trong bản vẽ này còn không?"

Lâm im lặng rất lâu. Ngoài kia, mưa vẫn rơi không ngớt.`
      },
      {
        key: 'gio-thoang-5',
        title: 'Chương 5: Bức thư tay chưa gửi',
        status: 'PUBLISHED',
        priceCoins: 15,
        publishedDaysAgo: 90,
        content: `Lá thư cuối cùng trong hộp thiếc không đề ngày. Giấy mới hơn, nét chữ run hơn, như được viết trong những năm cuối đời của bà.

"Khiêm à, hôm nay có một cậu bé đến hỏi mua cuốn Đất rừng phương Nam. Nó đứng đọc nguyên buổi chiều rồi mới dám hỏi giá. Em nhớ anh cũng từng đứng như thế, ở đúng chỗ đó, năm mười chín tuổi..."

Thư đọc to lá thư trong gian hàng vắng. Lâm ngồi ở bậc cửa, lặng lẽ nghe.

"Ông Khiêm không về," ông Tư nói, khi Thư mang lá thư ra đầu ngõ hỏi. "Đi chiến trường năm bảy hai, rồi không về nữa. Bà cháu đợi cả đời, mở hiệu sách cả đời, để nếu ông về thì còn chỗ mà tìm."

Đêm ấy Thư không ngủ. Cô nhận ra hiệu sách không chỉ là một ngôi nhà, mà là một lời hứa chưa ai giải phóng.

Sáng hôm sau, cô viết một lá thư trả lời Trần Khải. Chỉ một dòng: "Hiệu sách Gió Thoảng không bán."`
      },
      {
        key: 'gio-thoang-6',
        title: 'Chương 6: Lời thú nhận',
        status: 'PUBLISHED',
        priceCoins: 15,
        publishedDaysAgo: 20,
        content: `Lâm đến vào lúc hiệu sách vừa lên đèn, tay cầm một cuộn bản vẽ mới.

"Tôi đã rút khỏi dự án của anh Khải," anh nói. "Nhưng tôi nợ cô một lời thật lòng. Ngày đầu tiên tôi đến đây, đúng là tôi đến để khảo sát cho khách sạn."

Thư không ngắt lời. Cô rót trà vào hai chiếc chén nhỏ, đẩy một chén về phía anh.

"Rồi tôi thấy cái giếng trời," Lâm tiếp, "và thấy cô đứng dưới nắng, lau từng gáy sách như đang chăm một người ốm. Tôi không làm tiếp bản vẽ đó được nữa."

Anh trải cuộn giấy ra quầy. Đó là phương án phục dựng hiệu sách: giữ nguyên giếng trời, gia cố xà gỗ, biến gác xép thành một góc đọc nhỏ có cửa sổ nhìn ra phố.

"Chi phí không rẻ," anh nói. "Nhưng tôi có thể làm miễn phí phần thiết kế. Coi như trả lại cho ngôi nhà những gì tôi suýt lấy đi của nó."

Thư nhìn bản vẽ, rồi nhìn anh. Gió từ giếng trời lùa xuống, làm lật mấy trang sách trên quầy.

"Trà nguội rồi kìa," cô nói, và lần đầu tiên, cô mỉm cười với anh.`
      },
      {
        key: 'gio-thoang-7',
        title: 'Chương 7: Ngã rẽ ở cầu Long Biên',
        status: 'DRAFT',
        priceCoins: 0,
        publishedDaysAgo: null,
        content: `Thư và Lâm đạp xe qua cầu Long Biên lúc bình minh, mang theo phong bì của lá thư đầu tiên. Địa chỉ trên đó đã mờ, chỉ còn đọc được tên một con ngõ bên kia sông.

Bãi giữa sông Hồng sương còn giăng trắng. Lâm dừng xe, chỉ về phía những mái nhà thấp bên kia đê.

"Theo bản đồ năm bảy mươi, số nhà này giờ thuộc phường Ngọc Thụy."

Thư siết chặt phong bì trong tay. Cô không biết mình đang mong tìm thấy điều gì.`
      }
    ],
    context: {
      characters: [
        {
          key: 'thu',
          name: 'Minh Thư',
          role: 'PROTAGONIST',
          customTitle: 'Chủ hiệu sách Gió Thoảng',
          personality: 'Điềm tĩnh, thực tế, ngại bộc lộ cảm xúc nhưng rất giữ lời.',
          description: 'Cháu ngoại bà Hạnh, 28 tuổi, từng làm biên tập viên ở Sài Gòn. Trở về Hà Nội để xử lý hiệu sách thừa kế.',
          notes: 'Hành trình chính: từ muốn bán hiệu sách đến quyết định giữ nó như một lời hứa.'
        },
        {
          key: 'lam',
          name: 'Hoàng Lâm',
          role: 'PROTAGONIST',
          customTitle: 'Kiến trúc sư phục dựng nhà cổ',
          personality: 'Ôn hòa, kiệm lời, say mê kiến trúc cũ, mang mặc cảm vì từng làm cho dự án khách sạn.',
          description: 'Kiến trúc sư 31 tuổi, ban đầu được thuê khảo sát hiệu sách cho dự án của Trần Khải.',
          notes: 'Không để Lâm trở thành "người hùng cứu rỗi"; Thư tự quyết định số phận hiệu sách.'
        },
        {
          key: 'hanh',
          name: 'Bà Hạnh',
          role: 'SUPPORTING',
          customTitle: 'Bà ngoại của Thư, chủ cũ hiệu sách',
          personality: 'Kiên nhẫn, chung thủy, lặng lẽ.',
          description: 'Đã mất trước khi truyện bắt đầu. Xuất hiện qua những lá thư chưa gửi cho ông Khiêm.',
          notes: 'Giọng thư cần mộc mạc, đúng văn phong người Hà Nội những năm 1970.'
        },
        {
          key: 'tu',
          name: 'Ông Tư',
          role: 'MINOR',
          customTitle: 'Ông cụ bán trà đá đầu ngõ',
          personality: 'Hay chuyện, tốt bụng, nhớ rõ chuyện cũ của phố.',
          description: 'Hàng xóm lâu năm, người duy nhất còn biết chuyện bà Hạnh và ông Khiêm.',
          notes: 'Nguồn thông tin quá khứ; tránh để ông kể hết một lần.'
        },
        {
          key: 'khai',
          name: 'Trần Khải',
          role: 'ANTAGONIST',
          customTitle: 'Giám đốc dự án khách sạn phố cổ',
          personality: 'Lịch thiệp, thực dụng, kiên trì.',
          description: 'Muốn mua lại dãy nhà trên phố Hàng Bạc để làm khách sạn boutique.',
          notes: 'Không phải phản diện tàn nhẫn; đại diện cho áp lực thương mại hóa phố cổ.'
        }
      ],
      relationships: [
        { source: 'thu', target: 'lam', type: 'Tình cảm chớm nở', description: 'Từ nghi ngờ đến tin tưởng sau lời thú nhận ở chương 6.' },
        { source: 'thu', target: 'hanh', type: 'Bà cháu', description: 'Thư hiểu bà qua những lá thư nhiều hơn khi bà còn sống.' },
        { source: 'lam', target: 'khai', type: 'Đối tác cũ', description: 'Lâm rút khỏi dự án của Khải ở chương 6.' },
        { source: 'thu', target: 'khai', type: 'Đối đầu', description: 'Khải muốn mua hiệu sách; Thư từ chối ở chương 5.' },
        { source: 'hanh', target: 'tu', type: 'Hàng xóm lâu năm', description: 'Ông Tư chứng kiến bà Hạnh chờ ông Khiêm suốt nhiều năm.' }
      ],
      timeline: [
        { title: 'Thư trở về Hà Nội nhận hiệu sách', chapterKey: 'gio-thoang-1', summary: 'Thư mở lại hiệu sách Gió Thoảng sau ba tháng bà ngoại mất.' },
        { title: 'Lâm đến khảo sát ngôi nhà', chapterKey: 'gio-thoang-2', summary: 'Hoàng Lâm xin đo đạc hiệu sách, giấu việc mình làm cho dự án khách sạn.' },
        { title: 'Tìm thấy hộp thư của bà', chapterKey: 'gio-thoang-3', summary: 'Thư phát hiện hàng chục lá thư bà Hạnh viết cho ông Khiêm nhưng chưa từng gửi.' },
        { title: 'Khải đề nghị mua hiệu sách', chapterKey: 'gio-thoang-4', summary: 'Trần Khải trả giá gấp rưỡi; Thư phát hiện chữ ký của Lâm trên bản vẽ.' },
        { title: 'Thư từ chối bán', chapterKey: 'gio-thoang-5', summary: 'Biết chuyện ông Khiêm không trở về, Thư quyết định giữ hiệu sách.' },
        { title: 'Lâm thú nhận', chapterKey: 'gio-thoang-6', summary: 'Lâm rút khỏi dự án và đề xuất phương án phục dựng hiệu sách.' }
      ],
      summaries: [
        {
          scope: 'NOVEL',
          summary: 'Một cô gái trở về phố cổ để bán hiệu sách thừa kế, rồi qua những lá thư chưa gửi của bà ngoại mà học cách giữ lại ký ức và mở lòng với tình yêu mới.'
        },
        { scope: 'ARC', arcName: 'Phần 1: Trở về', startChapter: 1, endChapter: 3, summary: 'Thư nhận hiệu sách, gặp Lâm và tìm thấy hộp thư của bà.' },
        { scope: 'ARC', arcName: 'Phần 2: Những lá thư', startChapter: 4, endChapter: 6, summary: 'Áp lực từ dự án khách sạn, bí mật của bà Hạnh và lời thú nhận của Lâm.' },
        { scope: 'CHAPTER', chapterKey: 'gio-thoang-5', summary: 'Lá thư cuối của bà hé lộ ông Khiêm không trở về; Thư từ chối bán hiệu sách.' },
        { scope: 'CHAPTER', chapterKey: 'gio-thoang-6', summary: 'Lâm thú nhận vai trò trong dự án và đưa ra bản vẽ phục dựng.' }
      ]
    }
  },
  {
    key: 'dem-mua',
    title: 'Đêm Mưa Trên Phố Cũ',
    slug: 'dem-mua-tren-pho-cu',
    synopsis:
      'Một cô gái mất tích trong đêm mưa trên phố Hàng Mã, đúng mười năm sau một vụ án giống hệt chưa được phá. Đại úy Phan Vũ và nữ phóng viên Lê Ngân lần theo những manh mối dẫn về tuyến tàu điện đã biến mất của Hà Nội.',
    genre: 'Trinh thám',
    tags: ['Trinh thám', 'Hà Nội'],
    coverImageUrl: cover('photo-1512820790803-83ca734da794'),
    status: 'PUBLISHED',
    serialStatus: 'ONGOING',
    ageRating: 'TEEN',
    createdDaysAgo: 200,
    authorKey: 'author01',
    chapters: [
      {
        key: 'dem-mua-1',
        title: 'Chương 1: Vụ mất tích ở phố Hàng Mã',
        status: 'PUBLISHED',
        priceCoins: 0,
        publishedDaysAgo: 190,
        content: `Đêm hai mươi ba tháng Chạp, phố Hàng Mã rực đỏ đèn lồng nhưng ướt sũng dưới cơn mưa phùn dai dẳng. Bà chủ tiệm vàng mã số 17 báo mất tích con gái: Nguyễn Hà My, hai mươi bốn tuổi, rời nhà lúc chín giờ tối và không trở về.

Đại úy Phan Vũ đứng trước cửa tiệm, nhìn vệt nước loang trên nền gạch. Camera an ninh đầu phố chỉ ghi được một hình ảnh: My đi cạnh một người đàn ông mặc áo mưa xám, mũ trùm kín mặt.

"Không có dấu hiệu giằng co," trinh sát báo cáo. "Cô ấy đi theo hắn một cách tự nguyện."

Vũ châm điếu thuốc nhưng không hút. Mười năm trước, cũng trên con phố này, cũng một đêm mưa phùn, đã có một cô gái biến mất theo cách y hệt. Vụ án ấy đến giờ vẫn chưa khép hồ sơ.`
      },
      {
        key: 'dem-mua-2',
        title: 'Chương 2: Chiếc ô bỏ quên',
        status: 'PUBLISHED',
        priceCoins: 0,
        publishedDaysAgo: 150,
        content: `Lê Ngân tìm đến đồn vào sáng hôm sau, mang theo một chiếc ô đen gãy gọng.

"Tôi nhặt được ở ngõ Phất Lộc, cách tiệm vàng mã hai trăm mét," cô nói, đặt chiếc ô lên bàn. "Trên cán có khắc chữ H.M."

Vũ nhìn nữ phóng viên đầy nghi ngại. Báo chí thường đến đồn để hỏi, hiếm khi đến để đưa.

"Sao cô biết vụ này?"

"Vì mười năm trước, người mất tích là chị gái tôi," Ngân đáp, giọng không run. "Và tôi chưa bao giờ ngừng theo dõi con phố này."

Bên trong lòng ô, giắt giữa hai nan kim loại, là một tấm vé tàu điện đã ố vàng: tuyến Bờ Hồ – Mơ, một tuyến đã ngừng chạy từ năm 1991.`
      },
      {
        key: 'dem-mua-3',
        title: 'Chương 3: Nhân chứng thứ ba',
        status: 'PUBLISHED',
        priceCoins: 20,
        publishedDaysAgo: 60,
        content: `Nhân chứng thứ ba là ông Đặng Quý, người gác đêm của chợ Đồng Xuân. Ông khai rằng lúc gần mười giờ, ông thấy một người đàn ông áo mưa xám dìu một cô gái đi về phía bãi đỗ xe ven sông.

"Cô ấy cười," ông Quý nói, xoa hai bàn tay vào nhau. "Cười như gặp lại người quen lâu năm."

Vũ và Ngân nhìn nhau. Trong vụ mười năm trước, nhân chứng duy nhất cũng khai đúng một câu như thế.

Đêm đó, Vũ mở lại hồ sơ cũ. Ở trang cuối, có một chi tiết bị gạch bỏ bằng bút đỏ: nghi phạm từng làm soát vé trên tuyến tàu điện Bờ Hồ – Mơ.

Ngoài cửa sổ, mưa lại bắt đầu rơi.`
      }
    ],
    context: {
      characters: [
        {
          key: 'vu',
          name: 'Phan Vũ',
          role: 'PROTAGONIST',
          customTitle: 'Đại úy, điều tra viên Công an quận Hoàn Kiếm',
          personality: 'Kiệm lời, cố chấp, bị ám ảnh bởi vụ án chưa phá.',
          description: 'Điều tra viên 38 tuổi, từng tham gia vụ mất tích mười năm trước.',
          notes: 'Không để Vũ suy luận quá nhanh; manh mối phải đến từ hiện trường.'
        },
        {
          key: 'ngan',
          name: 'Lê Ngân',
          role: 'SUPPORTING',
          customTitle: 'Phóng viên báo Pháp luật',
          personality: 'Quyết liệt, lý trí, giấu nỗi đau mất chị.',
          description: 'Em gái nạn nhân vụ mất tích mười năm trước.',
          notes: 'Động cơ cá nhân có thể khiến cô che giấu thông tin với Vũ.'
        },
        {
          key: 'ao-mua',
          name: 'Kẻ áo mưa xám',
          role: 'ANTAGONIST',
          customTitle: 'Nghi phạm chưa rõ danh tính',
          personality: 'Chưa tiết lộ.',
          description: 'Xuất hiện trong camera đêm mất tích; nạn nhân đi theo hắn tự nguyện.',
          notes: 'Gợi ý liên hệ với tuyến tàu điện Bờ Hồ – Mơ.'
        }
      ],
      relationships: [
        { source: 'vu', target: 'ngan', type: 'Cộng sự bất đắc dĩ', description: 'Hợp tác vì cùng truy tìm kẻ áo mưa xám.' },
        { source: 'ngan', target: 'ao-mua', type: 'Truy đuổi', description: 'Ngân tin hắn liên quan đến việc chị gái mất tích.' }
      ],
      timeline: [
        { title: 'Hà My mất tích', chapterKey: 'dem-mua-1', summary: 'Nạn nhân rời nhà lúc 21 giờ, đi theo một người mặc áo mưa xám.' },
        { title: 'Ngân mang chiếc ô đến đồn', chapterKey: 'dem-mua-2', summary: 'Chiếc ô chứa vé tàu điện tuyến Bờ Hồ – Mơ.' },
        { title: 'Lời khai của ông Quý', chapterKey: 'dem-mua-3', summary: 'Lời khai trùng khớp với nhân chứng vụ án cũ.' }
      ],
      summaries: [
        {
          scope: 'NOVEL',
          summary: 'Một vụ mất tích lặp lại sau mười năm buộc một điều tra viên và em gái nạn nhân cũ hợp tác lần theo dấu vết tuyến tàu điện đã biến mất.'
        }
      ]
    }
  },
  {
    key: 'dau-chan',
    title: 'Dấu Chân Trong Sương',
    slug: 'dau-chan-trong-suong',
    synopsis:
      'Một thợ ảnh tự do phát hiện những dấu chân trần trên mặt Hồ Tây trong mùa sương, và một cô gái không có bóng đã chờ đợi suốt trăm năm ở cửa ô cũ.',
    genre: 'Huyền bí',
    tags: ['Huyền bí', 'Đô thị', 'Hoàn thành'],
    coverImageUrl: cover('photo-1476275466078-4007374efbbe'),
    status: 'PUBLISHED',
    serialStatus: 'COMPLETED',
    ageRating: 'TEEN',
    createdDaysAgo: 360,
    authorKey: 'author01',
    chapters: [
      {
        key: 'dau-chan-1',
        title: 'Chương 1: Sương mù trên Hồ Tây',
        status: 'PUBLISHED',
        priceCoins: 0,
        publishedDaysAgo: 350,
        content: `Mỗi sáng tháng Ba, Hồ Tây chìm trong một lớp sương dày đến mức người ta không nhìn thấy mũi thuyền của chính mình. Tú, một thợ ảnh tự do, đã chụp hồ suốt năm năm mà chưa từng thấy điều gì khác thường.

Cho đến buổi sáng cậu phát hiện một hàng dấu chân trần in trên mặt nước, kéo dài từ chân chùa Trấn Quốc ra giữa hồ.

Cậu bấm máy liên tục. Khi về nhà rửa ảnh, tất cả các khung hình đều trắng xóa, chỉ trừ tấm cuối cùng: một cô gái mặc áo tứ thân đứng giữa hồ, quay lưng về phía ống kính.`
      },
      {
        key: 'dau-chan-2',
        title: 'Chương 2: Người con gái không có bóng',
        status: 'PUBLISHED',
        priceCoins: 0,
        publishedDaysAgo: 340,
        content: `Tú gặp lại cô gái ở chợ hoa Quảng Bá lúc bốn giờ sáng. Cô đứng giữa những bó đào phai, mua một cành sen dù đang là mùa xuân.

"Cô là ai?" Tú hỏi.

"Người đi tìm đường về," cô đáp, rồi quay đi. Dưới ánh đèn đường vàng vọt, Tú nhận ra cô không có bóng.

Bà cụ bán hoa thì thầm với cậu rằng cứ mỗi năm, vào mùa sương, người ta lại thấy cô ở đây. Từ thời bà còn là đứa trẻ con.`
      },
      {
        key: 'dau-chan-3',
        title: 'Chương 3: Lối về qua cửa ô',
        status: 'PUBLISHED',
        priceCoins: 0,
        publishedDaysAgo: 330,
        content: `Theo lời bà cụ, Tú tìm đến cửa ô Quan Chưởng vào đêm rằm. Cô gái đã đứng đợi sẵn dưới vòm cửa, tay vẫn cầm cành sen.

"Một trăm năm trước, tôi hẹn một người ở đây," cô nói. "Anh ấy là thợ chụp ảnh, giống cậu. Anh ấy không đến."

Tú giơ máy ảnh lên. Lần này, cô gái quay mặt về phía ống kính và mỉm cười.

Khi tiếng màn trập vang lên, sương tan. Dưới vòm cửa chỉ còn lại một cành sen nằm trên nền đá, và trong máy ảnh của Tú, tấm ảnh cuối cùng chụp hai người đứng cạnh nhau, rõ nét như vừa chụp hôm qua.`
      }
    ]
  },
  {
    key: 'mua-ha',
    title: 'Mùa Hạ Không Tên',
    slug: 'mua-ha-khong-ten',
    synopsis: 'Mùa hè cuối cấp của lớp 12A3, nơi những rung động đầu đời nở muộn như cây phượng già trước cửa lớp.',
    genre: 'Thanh xuân',
    tags: ['Thanh xuân', 'Học đường'],
    coverImageUrl: cover('photo-1516979187457-637abb4f9353'),
    status: 'DRAFT',
    serialStatus: 'ONGOING',
    ageRating: 'EVERYONE',
    createdDaysAgo: 10,
    authorKey: 'author01',
    chapters: [
      {
        key: 'mua-ha-1',
        title: 'Chương 1: Lớp 12A3 và cây phượng già',
        status: 'DRAFT',
        priceCoins: 0,
        publishedDaysAgo: null,
        content: `Mùa hè năm ấy, cây phượng trước lớp 12A3 nở muộn hơn mọi năm. Linh ngồi bàn cuối, cạnh cửa sổ, đếm từng chùm hoa đỏ như đếm những ngày còn lại trước kỳ thi.

Cậu bạn mới chuyển đến tên Nam, không nói chuyện với ai, chỉ hay vẽ những bức tranh nhỏ ở lề vở.`
      },
      {
        key: 'mua-ha-2',
        title: 'Chương 2: Bức vẽ ở lề vở',
        status: 'DRAFT',
        priceCoins: 0,
        publishedDaysAgo: null,
        content: `Linh vô tình nhìn thấy bức vẽ trong vở của Nam: một cô gái ngồi cạnh cửa sổ, đang ngước nhìn cây phượng.

Cô nhận ra đó là mình.`
      }
    ]
  }
];
