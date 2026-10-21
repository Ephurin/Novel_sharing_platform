import { buildCatalogSpecs } from './catalog.js';
import {
  COVER_PHOTOS,
  cover,
  createRng,
  curatedNovels,
  slugify,
  type Rng,
  type SeedChapter,
  type SeedCharacter,
  type SeedNovel,
  type SeedStoryContext
} from './curated-data.js';

// Procedurally generated novels and chapter text. Output is deterministic (seeded PRNG), so the
// same chapters, dates and prices come out on every run. Text comes from per-genre sentence packs
// filled with each novel's own cast and places: realistic in shape and volume, filler in content.

export type PackName = 'romance' | 'mystery' | 'fantasy' | 'scifi' | 'slice';

type Pack = {
  openers: string[];
  middles: string[];
  closers: string[];
  titleHeads: string[];
  titleTails: string[];
  relationshipTypes: Array<[type: string, description: string]>;
};

type Cast = { hero: string; ally: string; rival: string; elder: string; minor: string };

const packs: Record<PackName, Pack> = {
  romance: {
    openers: [
      'Buổi sáng ở {place} bắt đầu bằng một làn sương mỏng và mùi cà phê mới pha.',
      'Cơn mưa lất phất kéo dài từ chiều qua, làm những con phố quanh {place} sáng lên dưới ánh đèn.',
      '{hero} thức dậy sớm hơn thường lệ, lòng nặng trĩu bởi điều chưa kịp nói với {ally}.',
      'Gió mùa về, mang theo cái lạnh đầu tiên của năm, tràn qua khung cửa sổ nhìn ra {place}.',
      'Tin nhắn của {ally} đến lúc nửa đêm, chỉ vỏn vẹn vài chữ nhưng khiến {hero} thao thức đến sáng.',
      'Chiều muộn, {place} đông người qua lại, nhưng {hero} chỉ để ý đến một dáng người quen thuộc.'
    ],
    middles: [
      '{hero} siết nhẹ tay áo, cố giữ cho giọng mình đừng run khi nhắc đến chuyện cũ.',
      '"Em nghĩ mình nên nói thật với nhau," {ally} khẽ nói, mắt nhìn ra phía {place}.',
      'Chiếc {item} nằm yên trên bàn, như một nhân chứng lặng lẽ của những điều chưa ai dám gọi tên.',
      '{elder} từng bảo rằng có những lời hứa phải mất rất nhiều năm mới hiểu hết ý nghĩa.',
      '{rival} xuất hiện đúng lúc không ai mong đợi, mang theo nụ cười lịch thiệp và những toan tính riêng.',
      'Họ đi dọc {place} mà không ai nhắc đến chuyện hôm qua, chỉ để sự im lặng làm nốt phần việc của nó.',
      '{hero} chợt nhận ra mình đã quen với sự hiện diện của {ally} nhiều hơn mình tưởng.',
      'Một tiếng cười vang lên từ cuối phố, khiến cả hai cùng quay lại rồi cùng bối rối quay đi.',
      'Ly trà đã nguội từ lúc nào, nhưng {hero} vẫn cầm trên tay như thể đang giữ lấy một điều gì đó.',
      '{ally} kể về những ngày còn nhỏ ở {place}, giọng trầm xuống ở những đoạn mà chính mình cũng không muốn nhớ.',
      'Có những buổi chiều, {hero} tự hỏi liệu mình giữ lại kỷ niệm hay chính kỷ niệm đang giữ lấy mình.',
      'Bức thư nhàu nát trong túi áo nhắc {hero} rằng thời gian không chờ ai quyết định hộ.',
      '{rival} đặt một lời đề nghị lên bàn, thật nhẹ nhàng, thật khó từ chối.',
      'Ánh nắng cuối ngày đổ xuống {place}, nhuộm vàng cả những điều chưa được nói ra.',
      '"Nếu đổi lại là cậu, cậu sẽ chọn gì?" {hero} hỏi, và {ally} không trả lời được ngay.',
      'Tiếng chuông gió ngoài hiên vang lên, nghe như ai đó vừa nhắc lại một cái tên cũ.',
      '{elder} lặng lẽ pha trà, rồi kể một câu chuyện tưởng chẳng liên quan nhưng lại chạm đúng chỗ đau.',
      'Giữa {place} đông đúc, {hero} bỗng thấy mình nhỏ bé và cô đơn lạ thường.'
    ],
    closers: [
      'Khi đèn đường bật sáng, {hero} biết mình không thể quay lại như trước nữa.',
      'Đêm ấy, {hero} viết một dòng vào cuốn sổ nhỏ rồi gạch đi, rồi lại viết lại.',
      '{ally} đứng rất lâu dưới hiên, như đang chờ một lời đáp mà cả hai đều biết là chưa đến lúc.',
      'Ngoài kia, mưa vẫn rơi, và có điều gì đó trong lòng {hero} cũng bắt đầu tan ra.',
      'Chương mới của câu chuyện khép lại bằng một cái gật đầu khẽ, đủ để mở ra những ngày sau.',
      '{hero} mỉm cười một mình, lần đầu tiên sau rất nhiều ngày.',
      'Cánh cửa khép lại, để lại {place} chìm trong ánh vàng nhạt cuối ngày.',
      'Họ chia tay nhau ở ngã tư quen thuộc, với một lời hẹn chưa ai dám gọi là lời hẹn.'
    ],
    titleHeads: [
      'Lời hẹn', 'Bức thư', 'Cơn mưa', 'Ngã rẽ', 'Bí mật', 'Chiếc hộp', 'Giấc mơ', 'Tiếng vọng', 'Ánh đèn', 'Dấu vết', 'Cuộc gặp', 'Lời nói dối'
    ],
    titleTails: [
      'đầu tiên', 'bên cửa sổ', 'cuối con ngõ', 'trong đêm', 'dưới trời mưa', 'chưa nói hết', 'muộn màng', 'giữa đám đông', 'ở ga cũ', 'sau bức tường', 'của mùa thu', 'không tên'
    ],
    relationshipTypes: [
      ['Tình cảm chớm nở', 'Từ những hiểu lầm nhỏ dần trở nên gắn bó hơn qua từng chương.'],
      ['Bạn thân', 'Luôn là người đầu tiên lắng nghe và giữ kín những điều khó nói.'],
      ['Đối đầu', 'Lợi ích và quan điểm khác nhau khiến hai người liên tục va chạm.'],
      ['Người dẫn đường', 'Chia sẻ những câu chuyện cũ giúp nhân vật hiểu rõ lựa chọn của mình.']
    ]
  },
  mystery: {
    openers: [
      'Sáng sớm, {place} vẫn còn phong tỏa bằng dải băng vàng, và mùi ẩm mốc len vào từng ngóc ngách.',
      'Đèn đường chập chờn, chiếu xuống {place} một thứ ánh sáng đục như sương.',
      '{hero} đến hiện trường lúc trời chưa sáng, mang theo cuốn sổ ghi chép đã sờn gáy.',
      'Cú điện thoại lúc ba giờ sáng luôn báo trước một ngày chẳng dễ chịu gì.',
      'Hồ sơ cũ được rút ra từ ngăn dưới cùng, phủ một lớp bụi mỏng của mười năm im lặng.',
      'Mưa không ngớt suốt ba ngày, và {place} càng lúc càng giống một cái bẫy.'
    ],
    middles: [
      '{hero} quỳ xuống, soi đèn vào vệt bùn khô còn sót lại dưới chân tường.',
      '"Có người đã dọn dẹp ở đây," {ally} nói, "và làm rất kỹ."',
      'Chiếc {item} được tìm thấy ở nơi không ai ngờ tới, và nó không nên có mặt ở đó.',
      '{elder} khai rằng đêm hôm đó mình chỉ nghe thấy tiếng bước chân, không thấy ai.',
      '{rival} luôn đi trước một bước, như thể biết rõ từng quyết định của {hero}.',
      'Camera ở {place} hỏng đúng vào khoảng thời gian quan trọng nhất, một sự trùng hợp quá đẹp.',
      '{hero} xếp các mảnh ghi chép lên tường, nối chúng bằng những sợi chỉ đỏ.',
      'Lời khai của hai nhân chứng khớp nhau đến từng chi tiết, và chính điều đó khiến {ally} nghi ngờ.',
      'Mùi thuốc lá cũ vương trong căn phòng, dù chủ nhà khẳng định không ai hút thuốc.',
      '{hero} đọc lại biên bản lần thứ ba và nhận ra một chữ ký bị viết sai ngày.',
      'Một cuộc gọi nặc danh báo rằng sự thật nằm ở {place}, rồi im bặt.',
      '"Mọi thứ đều chỉ về cùng một hướng," {ally} thì thầm, "và đó là điều đáng sợ."',
      'Vết xước trên chiếc {item} không phải do tai nạn, mà do ai đó cố mở nó ra.',
      '{elder} im lặng rất lâu, rồi chỉ nói: "Có những chuyện nên để yên."',
      'Bản đồ trải trên bàn đã đánh dấu bốn điểm, và điểm thứ năm vẫn còn để trống.',
      '{rival} gửi đến một lời nhắn lịch sự, gần như thân mật, và đó mới là điều đáng lo.',
      'Trong túi áo của nạn nhân chỉ có một tấm vé cũ và một dòng địa chỉ viết dở.',
      'Tiếng mưa gõ đều trên mái tôn, trộn lẫn với tiếng đồng hồ tích tắc của căn phòng thẩm vấn.'
    ],
    closers: [
      'Khi đèn phòng làm việc tắt, {hero} vẫn nhìn mãi vào tấm bản đồ đã đánh dấu.',
      'Có điều gì đó vẫn chưa khớp, và {hero} biết mình sẽ không ngủ được đêm nay.',
      '{ally} khép hồ sơ lại, nhưng ánh mắt thì vẫn dừng ở trang cuối cùng.',
      'Ngoài cửa sổ, một bóng người đứng yên dưới mưa, rồi biến mất ngay khi {hero} bước ra.',
      'Manh mối mới không làm mọi thứ sáng tỏ hơn, nó chỉ khiến câu hỏi lớn thêm.',
      'Cuộc gọi tiếp theo đến lúc bình minh, và giọng nói bên kia không phải của người {hero} mong đợi.',
      '{hero} ghi lại một dòng cuối vào sổ: sự thật luôn nằm ở nơi người ta ít chịu nhìn nhất.',
      'Một cánh cửa nữa đã mở ra, nhưng phía sau nó là bóng tối dày hơn.'
    ],
    titleHeads: [
      'Dấu vân tay', 'Lời khai', 'Bóng người', 'Hồ sơ', 'Cuộc gọi', 'Chiếc chìa khóa', 'Manh mối', 'Căn phòng', 'Nhân chứng', 'Bức ảnh', 'Vết máu', 'Bản đồ'
    ],
    titleTails: [
      'lúc nửa đêm', 'ở hiện trường', 'bị xóa', 'mười năm trước', 'trong bóng tối', 'không tồn tại', 'cuối cùng', 'thứ năm', 'dưới mưa', 'bị giấu kín', 'còn thiếu', 'của kẻ lạ mặt'
    ],
    relationshipTypes: [
      ['Cộng sự', 'Cùng điều tra nhưng không phải lúc nào cũng chia sẻ hết những gì mình biết.'],
      ['Đối thủ', 'Luôn đi trước một bước và biết rõ cách suy nghĩ của người truy đuổi.'],
      ['Nhân chứng then chốt', 'Giữ trong tay mảnh ghép quan trọng nhưng chưa sẵn lòng nói ra.'],
      ['Người thầy cũ', 'Từng dạy nghề và hiểu rõ điểm yếu của người học trò năm xưa.']
    ]
  },
  fantasy: {
    openers: [
      'Trăng máu treo lơ lửng trên {place}, và linh khí trong không trung xao động bất thường.',
      'Tiếng chuông đồng ngân vang khắp {place}, báo hiệu đại hội mười năm một lần sắp bắt đầu.',
      '{hero} tỉnh lại giữa tàn tích của trận chiến đêm qua, bên cạnh vẫn là thanh {item} nứt vỡ.',
      'Sương mù dày đặc phủ kín {place}, che lấp cả con đường mà {hero} đã đi suốt ba ngày.',
      'Gió núi lạnh buốt thổi qua đỉnh cao, mang theo mùi tanh của máu và sắt thép.',
      'Một luồng khí tức xa lạ lan tràn từ {place}, khiến mọi tu sĩ trong vùng đều biến sắc.'
    ],
    middles: [
      '{hero} siết chặt chuôi {item}, cảm nhận dòng chân khí chảy rần rật trong kinh mạch.',
      '"Tu hành không phải để cướp đoạt," {elder} chậm rãi nói, "mà để hiểu mình là ai."',
      '{rival} bước ra giữa sân, áo choàng đen phấp phới, ánh mắt đầy khinh miệt.',
      'Linh thú gầm lên một tiếng, làm đá vụn rơi lả tả từ vách đá {place}.',
      '{ally} tung ra ba đạo kiếm khí liên tiếp, nhưng chỉ đủ làm đối phương lùi lại nửa bước.',
      'Trong cổ tịch có ghi: kẻ nào thu thập đủ bảy ấn ký sẽ mở được cánh cổng cuối cùng của {place}.',
      '{hero} nhớ lại lời thề năm xưa, và biết mình không thể lùi bước thêm nữa.',
      'Trận pháp bắt đầu sáng lên từng tầng, rực rỡ như một đóa hoa đang nở.',
      '{elder} thở dài: "Con đường này, ta đã đi qua, và không muốn con đi lại."',
      'Một mảnh ngọc giản cổ rơi ra từ chiếc {item}, khắc những chữ không ai đọc được.',
      '{rival} cười nhạt: "Ngươi nghĩ mình thắng được số mệnh sao?"',
      'Đan điền của {hero} chấn động, như có thứ gì đó từ rất xa xưa đang thức giấc.',
      'Cả {place} im phăng phắc, chỉ còn tiếng gió thổi qua những lá cờ rách.',
      '{ally} dìu {hero} qua con suối băng giá, vừa đi vừa thì thầm những lời động viên khó nghe.',
      'Trên bầu trời, thiên kiếp ngưng tụ thành vòng xoáy tím đen, nuốt lấy cả ánh sao.',
      '"Muốn đi xa, trước hết phải học cách ngã," {elder} nói, rồi quay lưng bước đi.',
      'Chiếc {item} rung lên bần bật, như phản ứng với một luồng sức mạnh đang tới gần.',
      'Dưới chân {hero}, mặt đất nứt toác, để lộ một lối đi dẫn xuống lòng núi.'
    ],
    closers: [
      'Khi bình minh lên, {hero} biết con đường phía trước chỉ mới bắt đầu.',
      'Dư âm trận chiến còn vang mãi, nhưng trong lòng {hero}, một quyết tâm mới đã thành hình.',
      '{ally} lặng lẽ băng bó vết thương, không nói thêm lời nào, nhưng cả hai đều hiểu.',
      'Ở nơi xa, một đôi mắt đỏ rực mở ra, và {place} bắt đầu rung chuyển.',
      'Tấm ngọc giản tan thành ánh sáng, để lại trong thức hải của {hero} một đoạn khẩu quyết lạ.',
      '{rival} biến mất trong màn sương, nhưng lời đe dọa vẫn còn treo lơ lửng.',
      'Đêm xuống, {hero} ngồi thiền dưới gốc cổ thụ, và linh khí trời đất chầm chậm hội tụ.',
      'Cánh cổng đá khép lại sau lưng, tiếng vang dội mãi trong lòng núi.'
    ],
    titleHeads: [
      'Kiếm khí', 'Trận chiến', 'Lời thề', 'Bí cảnh', 'Thiên kiếp', 'Ma khí', 'Tông môn', 'Truyền thừa', 'Huyết ấn', 'Cổ mộ', 'Linh thú', 'Đại hội'
    ],
    titleTails: [
      'ở biên thành', 'dưới trăng máu', 'trên đỉnh núi', 'trong sương mù', 'thức tỉnh', 'phản bội', 'trở về', 'khai mở', 'tan vỡ', 'của kẻ vô danh', 'cuối cùng', 'đêm giông'
    ],
    relationshipTypes: [
      ['Đồng môn', 'Cùng tu luyện, cùng nhau vượt qua những thử thách đầu tiên của tông môn.'],
      ['Tử địch', 'Mối thù truyền kiếp khiến hai bên chạm trán ở mọi ngã rẽ của con đường tu hành.'],
      ['Sư phụ', 'Dẫn dắt nhưng cũng giấu đi một phần sự thật về xuất thân của nhân vật chính.'],
      ['Đồng minh bất đắc dĩ', 'Hợp tác tạm thời vì lợi ích chung, còn tin tưởng thì chưa.']
    ]
  },
  scifi: {
    openers: [
      'Báo động đỏ vang lên khắp {place}, và đèn hành lang chuyển sang màu hổ phách.',
      'Bản đồ sao hiện lên trên màn hình chính, thiếu mất một điểm sáng vốn luôn có mặt ở đó.',
      '{hero} thức dậy trong khoang ngủ đóng kín, tai vẫn ù đi vì tiếng động cơ ngừng đột ngột.',
      'Tín hiệu lạ đến từ {place} chỉ kéo dài bốn giây, nhưng đủ làm mọi hệ thống lên tiếng.',
      'Trạm điều khiển ở {place} yên lặng một cách bất thường kể từ ca trực đêm qua.',
      'Ánh sáng nhân tạo của khoang sinh hoạt mờ dần, báo hiệu chu kỳ ngày kết thúc sớm hơn lịch.'
    ],
    middles: [
      '{hero} kiểm tra lại nhật ký hệ thống và thấy một dòng lệnh không có người ký.',
      '"Dữ liệu này không thể đúng," {ally} nói, "trừ khi ai đó đã sửa nó từ bên trong."',
      'Chiếc {item} phát ra tiếng ping đều đặn, như đang đếm ngược tới một thời điểm nào đó.',
      '{elder} bật lại bản ghi cũ, và cả phòng họp lặng đi khi nghe giọng nói trong đó.',
      '{rival} yêu cầu phong tỏa toàn bộ khu {place}, viện cớ an toàn nhưng không giải thích thêm.',
      'Màn hình phân tích hiện ra hàng nghìn dòng số, và chỉ một trong số đó khác biệt.',
      '{hero} nhớ lại lần cuối thấy hệ thống phản ứng như vậy, trước khi mất liên lạc với trái đất.',
      'Những chiếc drone lần lượt tắt đèn, rơi xuống như một đàn chim bị bắn hạ.',
      '{ally} lập trình lại cổng khóa thủ công, từng giây trôi qua đều có thể là giây cuối cùng.',
      'Nguồn năng lượng dự phòng chỉ đủ cho bốn mươi phút, và không ai biết liệu bốn mươi phút có đủ.',
      '{elder} thừa nhận rằng dự án này không hoàn toàn như những gì được công bố.',
      'Trong khoang thí nghiệm, mẫu vật bắt đầu phát sáng, rồi chuyển sang trạng thái không được ghi chép.',
      '{rival} gửi một thông điệp mã hóa, và {hero} mất nửa đêm để giải mã nó.',
      'Mọi cảm biến đều báo bình thường, và chính điều đó làm {hero} bất an nhất.',
      '"Chúng ta không đơn độc ở đây," {ally} thì thầm, chỉ vào dòng tín hiệu thứ hai trên màn hình.',
      'Tàu rung nhẹ khi đi qua dải bụi sao, và ánh sáng xanh lam tràn vào qua ô cửa quan sát.',
      'Hệ thống trí tuệ nhân tạo từ chối thực thi lệnh, lần đầu tiên trong suốt mười hai năm hoạt động.',
      'Từ {place}, một dải sáng mờ mở ra như một cánh cửa, đủ rộng cho một con tàu nhỏ lọt qua.'
    ],
    closers: [
      'Khi hệ thống khởi động lại, {hero} biết mọi thứ đã khác, dù màn hình hiển thị vẫn như cũ.',
      'Dòng dữ liệu cuối cùng cho thấy một tọa độ mà không ai có trong bản đồ.',
      '{ally} nhìn ra ô cửa quan sát, nơi những vì sao đang xếp thành một hình dạng lạ.',
      'Lệnh phong tỏa được dỡ bỏ, nhưng không ai dám thở phào.',
      'Trong khoang tối, chiếc {item} sáng lên một lần nữa, rồi tắt hẳn.',
      '{hero} lưu lại bản ghi cuối ngày, và chỉ nói một câu: chúng ta cần quay lại {place}.',
      'Tín hiệu thứ hai không tắt, nó chỉ chuyển sang một tần số mà thiết bị chưa thể dò ra.',
      'Con tàu lặng lẽ rẽ hướng, và không ai trong ban chỉ huy lên tiếng phản đối.'
    ],
    titleHeads: [
      'Tín hiệu', 'Quỹ đạo', 'Dữ liệu', 'Khoang tàu', 'Mật mã', 'Ký ức', 'Cổng không gian', 'Hệ thống', 'Mẫu vật', 'Thiên thạch', 'Lệnh phong tỏa', 'Bản sao'
    ],
    titleTails: [
      'bị mã hóa', 'từ vực sâu', 'thứ hai', 'ngoài tầm kiểm soát', 'cuối cùng', 'mất liên lạc', 'ở rìa thiên hà', 'đang thức tỉnh', 'không tên', 'bị xóa sạch', 'trong bóng tối', 'đếm ngược'
    ],
    relationshipTypes: [
      ['Đồng đội', 'Cùng phụ trách một ca trực và tin tưởng nhau trong những quyết định sống còn.'],
      ['Đối trọng', 'Giữ quan điểm trái ngược về việc có nên công khai sự thật hay không.'],
      ['Nhà khoa học trưởng', 'Nắm giữ thông tin gốc của dự án và chỉ tiết lộ từng phần.'],
      ['Trí tuệ nhân tạo', 'Vừa là công cụ, vừa là ẩn số khó đoán nhất trên tàu.']
    ]
  },
  slice: {
    openers: [
      'Buổi sáng ở {place} bắt đầu bằng tiếng xe cộ và mùi bánh mì nướng thoang thoảng.',
      'Nắng đầu tuần lười biếng rọi qua rèm cửa, đánh thức {hero} bằng một vệt sáng ngay giữa mặt.',
      'Chiều thứ sáu, {place} đông hơn thường lệ, ai cũng vội vã như sợ lỡ mất điều gì.',
      '{hero} đẩy cửa bước vào, chuông gió leng keng báo hiệu một ngày mới bắt đầu.',
      'Ngày hôm ấy bình thường đến mức không ai ngờ nó sẽ thay đổi nhiều thứ.',
      'Mưa tạnh, vỉa hè quanh {place} còn đọng những vũng nước nhỏ phản chiếu bầu trời xám.'
    ],
    middles: [
      '{hero} ngồi xuống cạnh cửa sổ, nhìn dòng người qua lại mà chẳng nghĩ gì cụ thể.',
      '"Hôm nay nhớ ăn sáng nhé," {ally} nhắn, kèm một biểu tượng cười ngớ ngẩn.',
      'Chiếc {item} đặt trên kệ, mang theo cả một đoạn ký ức mà {hero} chưa kịp kể.',
      '{elder} có thói quen kể chuyện xưa, mỗi lần một khác, nhưng lần nào cũng ấm áp.',
      '{rival} ghé qua với nụ cười đầy ẩn ý, và {hero} biết ngay sẽ có chuyện không đơn giản.',
      'Câu chuyện bắt đầu bằng một chuyện nhỏ xíu ở {place}, rồi lớn dần như quả bóng tuyết.',
      '{hero} thử làm lại món ăn cũ, và lần đầu tiên không bị cháy.',
      'Cả nhóm cười ồ lên khi {ally} kể về lần suýt đi nhầm lớp vào ngày đầu tiên.',
      'Buổi trưa, {place} yên ắng lạ, chỉ còn tiếng quạt trần quay đều.',
      '{hero} nhận ra mình đã bỏ lỡ nhiều điều chỉ vì mải mê chạy theo một thứ không tên.',
      '"Có những ngày chẳng cần làm gì to tát," {elder} bảo, "chỉ cần có mặt."',
      'Tờ lịch trên tường đã lật sang trang mới, nhưng {hero} vẫn quên đổi ngày.',
      '{ally} đưa cho {hero} một chiếc ô, dù trời hôm nay nắng chang chang.',
      'Mùi cà phê, mùi giấy mới và tiếng cười từ bàn bên tạo nên một buổi chiều rất bình yên.',
      '{rival} đề nghị một cuộc thi nhỏ, và không ai trong nhóm nỡ từ chối.',
      'Ở góc {place}, một con mèo lười ngủ gục trên chiếc ghế đẩu cũ.',
      '{hero} ghi vội vài dòng vào sổ tay: hôm nay mình đã làm được một điều nhỏ.',
      'Chiều xuống, ánh đèn từ các quán ven {place} lần lượt sáng lên như một dãy đèn lồng.'
    ],
    closers: [
      'Tối đến, {hero} nằm nhìn trần nhà và mỉm cười vì một ngày chẳng có gì đặc biệt.',
      'Cửa hàng đóng lại, nhưng câu chuyện ở {place} thì vẫn còn đang viết dở.',
      '{ally} vẫy tay chào ở đầu phố, hẹn gặp lại ngày mai.',
      'Điều nhỏ bé hôm nay lại khiến {hero} thấy mọi thứ nhẹ nhõm hơn hẳn.',
      'Một tin nhắn mới hiện lên khi {hero} chuẩn bị tắt đèn, ngắn gọn nhưng đủ làm mất ngủ.',
      '{hero} khóa cửa lại, mang theo cả tiếng cười còn vương lại từ buổi chiều.',
      'Đêm yên, chỉ còn tiếng gió rì rào qua tán cây trước {place}.',
      'Và thế là một ngày nữa khép lại, nhẹ như một hơi thở.'
    ],
    titleHeads: [
      'Buổi sáng', 'Bữa trưa', 'Chuyến đi', 'Cuộc thi', 'Tin nhắn', 'Chiếc ô', 'Quán quen', 'Món quà', 'Cuối tuần', 'Lời xin lỗi', 'Ngày mưa', 'Bất ngờ'
    ],
    titleTails: [
      'ở góc phố', 'không báo trước', 'đầu tiên', 'của cả nhóm', 'sau giờ học', 'muộn màng', 'ngày nắng', 'cuối cùng', 'chưa kể', 'bình thường', 'của mùa hè', 'nhỏ xíu'
    ],
    relationshipTypes: [
      ['Bạn thân', 'Cùng nhau trải qua những ngày vui buồn, luôn là chỗ dựa của nhau.'],
      ['Bạn cùng nhóm', 'Có lúc cãi vã vì những chuyện nhỏ nhưng chưa bao giờ giận lâu.'],
      ['Người lớn tuổi', 'Kể những câu chuyện ấm áp và đưa ra lời khuyên đúng lúc.'],
      ['Đối thủ thân thiện', 'Luôn thách thức nhau trong mọi chuyện, từ điểm số đến món ăn.']
    ]
  }
};

export type NovelSpec = {
  key: string;
  authorKey: string;
  title: string;
  pack: PackName;
  genre: string;
  tags: string[];
  synopsis: string;
  cast: Cast;
  places: [string, string, string, ...string[]];
  items: [string, ...string[]];
  chapterCount: number;
  /** Trailing chapters that stay drafts (ongoing novels). */
  draftTail: number;
  /** First VIP chapter number; 0 means every chapter is free. */
  vipFrom: number;
  vipPrice: number;
  status: 'PUBLISHED' | 'DRAFT';
  serialStatus: 'ONGOING' | 'COMPLETED' | 'HIATUS';
  ageRating: 'EVERYONE' | 'TEEN' | 'MATURE';
  createdDaysAgo: number;
  coverIndex: number;
};

type ChapterPlan = Pick<NovelSpec, 'pack' | 'cast' | 'places' | 'items' | 'chapterCount' | 'draftTail' | 'vipFrom' | 'vipPrice'>;

/** Extra chapters appended to hand-written novels so they reach a realistic length. */
const curatedExtensions: Record<string, ChapterPlan> = {
  'gio-thoang': {
    pack: 'romance',
    cast: { hero: 'Minh Thư', ally: 'Hoàng Lâm', rival: 'Trần Khải', elder: 'ông Tư', minor: 'bà Hạnh' },
    places: ['phố Hàng Bạc', 'hiệu sách Gió Thoảng', 'cầu Long Biên', 'Hồ Tây'],
    items: ['hộp thiếc', 'lá thư cũ', 'chiếc ấm trà'],
    chapterCount: 48,
    draftTail: 2,
    vipFrom: 4,
    vipPrice: 15
  },
  'dem-mua': {
    pack: 'mystery',
    cast: { hero: 'Phan Vũ', ally: 'Lê Ngân', rival: 'kẻ áo mưa xám', elder: 'ông Quý', minor: 'Hà My' },
    places: ['phố Hàng Mã', 'ngõ Phất Lộc', 'chợ Đồng Xuân', 'ga Bờ Hồ'],
    items: ['chiếc ô gãy gọng', 'tấm vé tàu điện', 'cuốn hồ sơ cũ'],
    chapterCount: 36,
    draftTail: 1,
    vipFrom: 3,
    vipPrice: 20
  },
  'dau-chan': {
    pack: 'fantasy',
    cast: { hero: 'Tú', ally: 'cô gái không bóng', rival: 'kẻ giữ cửa ô', elder: 'bà cụ bán hoa', minor: 'người thợ ảnh năm xưa' },
    places: ['Hồ Tây', 'cửa ô Quan Chưởng', 'chợ hoa Quảng Bá', 'chùa Trấn Quốc'],
    items: ['cành sen', 'chiếc máy ảnh cũ', 'tấm ảnh đen trắng'],
    chapterCount: 24,
    draftTail: 0,
    vipFrom: 10,
    vipPrice: 10
  },
  'mua-ha': {
    pack: 'slice',
    cast: { hero: 'Linh', ally: 'Nam', rival: 'Quân', elder: 'cô chủ nhiệm', minor: 'bác bảo vệ' },
    places: ['lớp 12A3', 'sân trường', 'thư viện', 'quán chè đầu ngõ'],
    items: ['cuốn vở vẽ', 'chiếc quạt giấy', 'cây phượng già'],
    chapterCount: 12,
    draftTail: 12,
    vipFrom: 0,
    vipPrice: 0
  }
};

const generatedSpecs: NovelSpec[] = [
  {
    key: 'thu-mua-dong', authorKey: 'author01', title: 'Thư Gửi Mùa Đông', pack: 'romance', genre: 'Lãng mạn',
    tags: ['Hiện đại', 'Lãng mạn', 'Chữa lành'],
    synopsis: 'Sau một lần đổ vỡ, Diệp Anh nhận công việc biên tập thư tay cho một chuyên mục cuối báo. Những lá thư gửi về từ người lạ dần kéo cô trở lại với thế giới, và với một người viết thư bí ẩn luôn ký tên "Mùa Đông".',
    cast: { hero: 'Diệp Anh', ally: 'Đình Phong', rival: 'Hạ Vy', elder: 'cô Nguyệt', minor: 'bác đưa thư' },
    places: ['tòa soạn cũ', 'quán cà phê Lặng', 'bưu điện Bờ Hồ', 'ga Hà Nội'], items: ['phong bì xanh', 'cây bút máy', 'hộp thư trước cửa'],
    chapterCount: 30, draftTail: 1, vipFrom: 6, vipPrice: 12, status: 'PUBLISHED', serialStatus: 'ONGOING', ageRating: 'EVERYONE',
    createdDaysAgo: 260, coverIndex: 4
  },
  {
    key: 'meo-pho', authorKey: 'author01', title: 'Nhật Ký Của Con Mèo Phố', pack: 'slice', genre: 'Đời thường',
    tags: ['Hài hước', 'Đời thường', 'Động vật'],
    synopsis: 'Mướp là con mèo lang thang của khu tập thể cũ. Mỗi chương là một ngày nhìn thế giới con người bằng đôi mắt xanh lá: những bữa cơm chung, những cuộc cãi vã và cả những điều tử tế rất nhỏ.',
    cast: { hero: 'Mướp', ally: 'bé Na', rival: 'chú Hải', elder: 'bà Bảy', minor: 'chị bán xôi' },
    places: ['khu tập thể B7', 'hàng xôi đầu ngõ', 'sân phơi quần áo', 'mái tôn nhà bà Bảy'], items: ['bát cơm nguội', 'chiếc nệm cũ', 'sợi dây len'],
    chapterCount: 20, draftTail: 0, vipFrom: 0, vipPrice: 0, status: 'PUBLISHED', serialStatus: 'COMPLETED', ageRating: 'EVERYONE',
    createdDaysAgo: 340, coverIndex: 5
  },
  {
    key: 'ho-so-pho-co', authorKey: 'author01', title: 'Hồ Sơ Phố Cổ', pack: 'mystery', genre: 'Trinh thám',
    tags: ['Trinh thám', 'Hà Nội', 'Hình sự'],
    synopsis: 'Một chuỗi vụ mất cắp cổ vật tại các ngôi nhà cổ phố Hàng Đào dẫn thám tử tư Bạch Dương đến một mạng lưới buôn bán di sản kéo dài suốt ba thập kỷ.',
    cast: { hero: 'Bạch Dương', ally: 'Thùy Chi', rival: 'ông Lâm Đức', elder: 'cụ Tám', minor: 'thằng bé giao báo' },
    places: ['phố Hàng Đào', 'nhà cổ 87 Mã Mây', 'chợ đồ cổ', 'kho hàng ven sông'], items: ['bình gốm men rạn', 'cuốn sổ kiểm kê', 'chiếc chìa khóa đồng'],
    chapterCount: 40, draftTail: 2, vipFrom: 5, vipPrice: 18, status: 'PUBLISHED', serialStatus: 'ONGOING', ageRating: 'TEEN',
    createdDaysAgo: 220, coverIndex: 6
  },
  {
    key: 'lu-khach', authorKey: 'author01', title: 'Lữ Khách Cuối Cùng', pack: 'scifi', genre: 'Khoa học viễn tưởng',
    tags: ['Khoa học viễn tưởng', 'Phiêu lưu', 'Không gian'],
    synopsis: 'Con tàu di dân Aurora mất liên lạc với Trái Đất đã tám mươi năm. Khi hệ thống đánh thức người cuối cùng khỏi giấc ngủ lạnh, cô phát hiện mình không phải người đầu tiên tỉnh dậy.',
    cast: { hero: 'Kỳ An', ally: 'AI Sao Mai', rival: 'thuyền trưởng Vance', elder: 'tiến sĩ Hạ', minor: 'robot bảo trì' },
    places: ['khoang ngủ lạnh', 'đài chỉ huy Aurora', 'khoang năng lượng', 'vành đai tiểu hành tinh'], items: ['thẻ định danh', 'máy dò tín hiệu', 'bản ghi hành trình'],
    chapterCount: 28, draftTail: 2, vipFrom: 5, vipPrice: 15, status: 'PUBLISHED', serialStatus: 'ONGOING', ageRating: 'TEEN',
    createdDaysAgo: 150, coverIndex: 7
  },
  {
    key: 'huyet-kiem', authorKey: 'author02', title: 'Huyết Kiếm Biên Thành', pack: 'fantasy', genre: 'Tiên hiệp',
    tags: ['Tiên hiệp', 'Kiếm hiệp', 'Tu luyện'],
    synopsis: 'Thiếu niên Lăng Tiêu mang trong người một đạo huyết ấn bị phong từ thuở nhỏ. Khi biên thành bị thú triều tấn công, phong ấn nứt vỡ, và hắn buộc phải bước lên con đường tu hành đầy máu lửa.',
    cast: { hero: 'Lăng Tiêu', ally: 'Tô Nhược Hàn', rival: 'Mộ Dung Khuyết', elder: 'lão kiếm Trần', minor: 'tiểu thú Tuyết Nhi' },
    places: ['biên thành', 'Thanh Phong tông', 'Hắc Vụ sơn mạch', 'Cổ Kiếm trủng'], items: ['huyết kiếm', 'ngọc giản cổ', 'linh đan'],
    chapterCount: 60, draftTail: 3, vipFrom: 8, vipPrice: 10, status: 'PUBLISHED', serialStatus: 'ONGOING', ageRating: 'TEEN',
    createdDaysAgo: 365, coverIndex: 8
  },
  {
    key: 'de-quoc-sao', authorKey: 'author02', title: 'Đế Quốc Sao Băng', pack: 'scifi', genre: 'Khoa học viễn tưởng',
    tags: ['Khoa học viễn tưởng', 'Chiến tranh', 'Không gian'],
    synopsis: 'Ba trăm năm sau cuộc di cư khỏi Trái Đất, đế quốc Sao Băng trải dài qua mười hai hệ sao. Một sĩ quan hậu cần tầm thường vô tình nắm trong tay bản đồ dẫn đến cội nguồn của nhân loại.',
    cast: { hero: 'Hàn Nguyệt', ally: 'đại úy Rowan', rival: 'tể tướng Aldric', elder: 'giáo sư Bách', minor: 'phi công Kiên' },
    places: ['căn cứ Sao Hỏa', 'cung điện Thiên Hà', 'trạm trung chuyển Orion', 'bãi tha ma phi thuyền'], items: ['bản đồ sao', 'thẻ chỉ huy', 'tinh thể dữ liệu'],
    chapterCount: 45, draftTail: 2, vipFrom: 6, vipPrice: 12, status: 'PUBLISHED', serialStatus: 'ONGOING', ageRating: 'TEEN',
    createdDaysAgo: 300, coverIndex: 9
  },
  {
    key: 'tho-san-bong', authorKey: 'author02', title: 'Thợ Săn Bóng Đêm', pack: 'fantasy', genre: 'Huyền huyễn',
    tags: ['Huyền huyễn', 'Đô thị', 'Siêu nhiên'],
    synopsis: 'Ban ngày là nhân viên văn phòng, ban đêm Vân Khải là thợ săn những thứ mà thành phố này không muốn thừa nhận. Một lời nguyền cổ đang lan khắp Sài Gòn, và danh sách nạn nhân ngày một dài.',
    cast: { hero: 'Vân Khải', ally: 'Bảo Châu', rival: 'Hội Tám Ngón', elder: 'thầy đồng Tư', minor: 'chú mèo đen' },
    places: ['hẻm 47 Bùi Viện', 'tòa nhà bỏ hoang', 'chợ đêm Bến Thành', 'cầu Sài Gòn'], items: ['sợi dây ngũ sắc', 'cây đèn dầu', 'lá bùa cũ'],
    chapterCount: 52, draftTail: 2, vipFrom: 8, vipPrice: 12, status: 'PUBLISHED', serialStatus: 'ONGOING', ageRating: 'MATURE',
    createdDaysAgo: 280, coverIndex: 10
  },
  {
    key: 'ha-truong-thanh', authorKey: 'author02', title: 'Hạ Trường Thành', pack: 'fantasy', genre: 'Lịch sử',
    tags: ['Lịch sử', 'Chiến trận', 'Kiếm hiệp'],
    synopsis: 'Cuối triều Trần, một viên tướng trẻ bị điều ra trấn giữ ải biên cương. Giữa mùa đông, ông phát hiện đội quân phương Bắc chỉ là mồi nhử cho một âm mưu lớn hơn nhiều ngay trong triều đình.',
    cast: { hero: 'Trần Quang', ally: 'Lê Thị Ngọc', rival: 'Đại Hành khiển', elder: 'lão quân sư', minor: 'tiểu đồng Bảo' },
    places: ['ải Nam Quan', 'kinh thành Thăng Long', 'doanh trại Bạch Đằng', 'rừng Yên Tử'], items: ['binh thư', 'cờ lệnh', 'kiếm tổ truyền'],
    chapterCount: 36, draftTail: 0, vipFrom: 10, vipPrice: 10, status: 'PUBLISHED', serialStatus: 'COMPLETED', ageRating: 'TEEN',
    createdDaysAgo: 400, coverIndex: 11
  },
  {
    key: 'co-dau-thang-bay', authorKey: 'author03', title: 'Cô Dâu Tháng Bảy', pack: 'romance', genre: 'Ngôn tình',
    tags: ['Ngôn tình', 'Hôn nhân', 'Gia đình'],
    synopsis: 'Một cuộc hôn nhân sắp đặt giữa hai gia đình làm ăn đối địch. Nguyên Chi và Hạo Thiên đều nghĩ sẽ chỉ diễn kịch trong một năm, cho đến khi những bí mật của hai gia tộc lần lượt lộ diện.',
    cast: { hero: 'Nguyên Chi', ally: 'Hạo Thiên', rival: 'Tống Mạn', elder: 'bà nội Hạ', minor: 'quản gia Trương' },
    places: ['biệt thự nhà họ Hạ', 'công ty Hạ Thị', 'quán trà Lục Thủy', 'sân bay Nội Bài'], items: ['chiếc nhẫn cưới', 'hợp đồng hôn nhân', 'cuốn album cũ'],
    chapterCount: 40, draftTail: 2, vipFrom: 6, vipPrice: 15, status: 'PUBLISHED', serialStatus: 'ONGOING', ageRating: 'TEEN',
    createdDaysAgo: 240, coverIndex: 1
  },
  {
    key: 'truong-phep-thuat', authorKey: 'author03', title: 'Trường Học Phép Thuật Hà Nội', pack: 'fantasy', genre: 'Phiêu lưu',
    tags: ['Phiêu lưu', 'Học đường', 'Phép thuật'],
    synopsis: 'Ẩn sau một con ngõ nhỏ ở Tây Hồ là học viện Văn Lang, nơi dạy phép thuật cho những đứa trẻ sinh ra với dấu ấn bảy sắc. Bé Mi, học sinh mới, phát hiện dấu ấn của mình không giống bất kỳ ai.',
    cast: { hero: 'bé Mi', ally: 'cậu Đông', rival: 'Hoàng Lam', elder: 'thầy hiệu trưởng Thạch', minor: 'con cú Bông' },
    places: ['học viện Văn Lang', 'thư viện bay', 'vườn thuốc Tây Hồ', 'hầm bí mật'], items: ['cây đũa phép tre', 'sách phép cổ', 'chuông gọi hồn'],
    chapterCount: 34, draftTail: 1, vipFrom: 7, vipPrice: 10, status: 'PUBLISHED', serialStatus: 'ONGOING', ageRating: 'EVERYONE',
    createdDaysAgo: 200, coverIndex: 0
  },
  {
    key: 'quan-ca-phe-9', authorKey: 'author03', title: 'Quán Cà Phê Số 9', pack: 'slice', genre: 'Đời thường',
    tags: ['Đời thường', 'Chữa lành', 'Ẩm thực'],
    synopsis: 'Quán cà phê nhỏ cuối hẻm chỉ mở cửa chín tiếng mỗi ngày. Mỗi vị khách mang đến một câu chuyện, và cô chủ quán Thục Anh luôn pha cho họ một ly đúng với tâm trạng mà họ chưa kịp nói ra.',
    cast: { hero: 'Thục Anh', ally: 'anh Kiệt', rival: 'bà chủ nhà', elder: 'cụ Phúc', minor: 'cậu sinh viên' },
    places: ['quán cà phê số 9', 'hẻm 12', 'chợ sáng', 'ban công tầng hai'], items: ['máy xay cũ', 'cuốn sổ order', 'tách sứ trắng'],
    chapterCount: 26, draftTail: 1, vipFrom: 8, vipPrice: 8, status: 'PUBLISHED', serialStatus: 'ONGOING', ageRating: 'EVERYONE',
    createdDaysAgo: 120, coverIndex: 2
  },
  {
    key: 'me-cung-guong', authorKey: 'author03', title: 'Mê Cung Gương', pack: 'mystery', genre: 'Kinh dị',
    tags: ['Kinh dị', 'Bí ẩn', 'Tâm lý'],
    synopsis: 'Năm sinh viên nhận lời qua đêm trong ngôi nhà gương bỏ hoang để quay phim. Sáng hôm sau, chỉ còn bốn người bước ra, và không ai nhớ người thứ năm là ai.',
    cast: { hero: 'Khánh Ly', ally: 'Quang Huy', rival: 'bóng trong gương', elder: 'người trông nhà', minor: 'cô bạn mất tích' },
    places: ['ngôi nhà gương', 'hành lang tầng ba', 'tầng hầm', 'sân trước đầy rêu'], items: ['mảnh gương vỡ', 'cuộn băng quay phim', 'chiếc đèn pin'],
    chapterCount: 22, draftTail: 0, vipFrom: 6, vipPrice: 10, status: 'PUBLISHED', serialStatus: 'COMPLETED', ageRating: 'MATURE',
    createdDaysAgo: 90, coverIndex: 3
  }
];

const fill = (sentence: string, cast: Cast, place: string, item: string) =>
  sentence
    .replaceAll('{hero}', cast.hero)
    .replaceAll('{ally}', cast.ally)
    .replaceAll('{rival}', cast.rival)
    .replaceAll('{elder}', cast.elder)
    .replaceAll('{minor}', cast.minor)
    .replaceAll('{place}', place)
    .replaceAll('{item}', item);

function chapterTitles(pack: Pack, rng: Rng, count: number) {
  const combos = pack.titleHeads.flatMap((head) => pack.titleTails.map((tail) => `${head} ${tail}`));
  const shuffled = rng.shuffle(combos);
  return Array.from({ length: count }, (_, index) => shuffled[index % shuffled.length] + (index >= shuffled.length ? ` (${Math.floor(index / shuffled.length) + 1})` : ''));
}

function chapterContent(pack: Pack, rng: Rng, cast: Cast, places: readonly string[], items: readonly string[], chapterNumber: number, total: number) {
  const arcPlace = places[Math.min(places.length - 1, Math.floor(((chapterNumber - 1) / total) * places.length))];
  const place = () => (rng.chance(0.55) ? arcPlace : rng.pick(places));
  const item = () => rng.pick(items);
  const middleCount = rng.int(5, 8);
  const middles = rng.shuffle(pack.middles).slice(0, middleCount);
  const sentences = [
    rng.pick(pack.openers),
    ...middles,
    rng.pick(pack.closers)
  ].map((sentence) => fill(sentence, cast, place(), item()));

  const paragraphs: string[] = [];
  let index = 0;
  while (index < sentences.length) {
    const size = index === 0 ? 2 : index + 3 >= sentences.length ? sentences.length - index : rng.int(2, 3);
    paragraphs.push(sentences.slice(index, index + size).join(' '));
    index += size;
  }
  return paragraphs.join('\n\n');
}

function buildContext(spec: NovelSpec, chapters: SeedChapter[], rng: Rng): SeedStoryContext {
  const pack = packs[spec.pack];
  const { cast } = spec;
  const published = chapters.filter((chapter) => chapter.status === 'PUBLISHED');
  const total = chapters.length;
  const personalities = [
    'Bình tĩnh, quan sát kỹ, ít khi bộc lộ cảm xúc.',
    'Bộc trực, dễ nóng nhưng rất trọng tình nghĩa.',
    'Kiên trì, hay tự trách, luôn cố làm đến cùng.',
    'Nhạy cảm, tinh tế, giỏi đọc suy nghĩ người khác.'
  ];

  const characters: SeedCharacter[] = [
    { key: 'hero', name: cast.hero, role: 'PROTAGONIST', customTitle: 'Nhân vật chính', personality: rng.pick(personalities), description: `${cast.hero} là người dẫn dắt câu chuyện "${spec.title}" và chịu nhiều thay đổi nhất qua từng chương.`, notes: 'Cần giữ nhất quán động cơ chính xuyên suốt các phần.' },
    { key: 'ally', name: cast.ally, role: 'SUPPORTING', customTitle: 'Người đồng hành', personality: rng.pick(personalities), description: `${cast.ally} luôn đứng cạnh ${cast.hero} ở những khúc quanh quan trọng.`, notes: 'Có một bí mật riêng, sẽ được hé lộ ở nửa sau truyện.' },
    { key: 'rival', name: cast.rival, role: 'ANTAGONIST', customTitle: 'Đối thủ chính', personality: rng.pick(personalities), description: `${cast.rival} đối đầu với ${cast.hero} vì lợi ích và quan điểm trái ngược.`, notes: 'Không phải phản diện một chiều; mỗi lần xuất hiện cần có lý do rõ ràng.' },
    { key: 'elder', name: cast.elder, role: 'SUPPORTING', customTitle: 'Người dẫn đường', personality: rng.pick(personalities), description: `${cast.elder} nắm giữ nhiều ký ức quan trọng và chỉ tiết lộ từng phần.`, notes: 'Dùng làm nguồn thông tin quá khứ, tránh kể một lần.' },
    { key: 'minor', name: cast.minor, role: 'MINOR', customTitle: 'Nhân vật phụ', personality: rng.pick(personalities), description: `${cast.minor} xuất hiện ở những chương then chốt và để lại ấn tượng sâu sắc.`, notes: 'Có thể mở rộng thành tuyến phụ nếu cần.' }
  ];

  const [bond, conflict, mentor, extra] = pack.relationshipTypes;
  const relationships = [
    { source: 'hero', target: 'ally', type: bond[0], description: bond[1] },
    { source: 'hero', target: 'rival', type: conflict[0], description: conflict[1] },
    { source: 'hero', target: 'elder', type: mentor[0], description: mentor[1] },
    { source: 'ally', target: 'rival', type: extra[0], description: extra[1] },
    { source: 'hero', target: 'minor', type: 'Liên quan', description: `${cast.minor} liên quan trực tiếp đến một bước ngoặt của ${cast.hero}.` }
  ];

  const milestones: Array<[number, string, string]> = [
    [1, `${cast.hero} khởi đầu ở ${spec.places[0]}`, `${cast.hero} bước vào câu chuyện và gặp những người sẽ đồng hành lâu dài.`],
    [0.12, `${cast.hero} gặp ${cast.ally}`, `${cast.ally} xuất hiện và trở thành người đồng hành quan trọng.`],
    [0.25, `Lần đầu chạm trán ${cast.rival}`, `${cast.rival} lộ diện, khiến mục tiêu của ${cast.hero} trở nên rõ ràng hơn.`],
    [0.4, `Bí mật của ${cast.elder}`, `${cast.elder} tiết lộ một phần quá khứ làm thay đổi hướng đi của câu chuyện.`],
    [0.55, `Bước ngoặt ở ${spec.places[1]}`, `Một sự kiện lớn ở ${spec.places[1]} buộc ${cast.hero} phải lựa chọn.`],
    [0.7, `${cast.ally} đối mặt thử thách`, `${cast.ally} phải đưa ra quyết định có thể làm thay đổi mối quan hệ với ${cast.hero}.`],
    [0.85, `Đối đầu cuối cùng với ${cast.rival}`, `Mâu thuẫn giữa ${cast.hero} và ${cast.rival} lên đến đỉnh điểm.`]
  ];
  const usableChapters = published.length || chapters.length;
  const timeline = milestones.map(([position, title, summary]) => {
    const chapterNumber = position === 1 ? 1 : Math.max(2, Math.round(position * usableChapters));
    const chapter = chapters[Math.min(chapterNumber, chapters.length) - 1];
    return { title, chapterKey: chapter.key, summary };
  });

  const summaries: SeedStoryContext['summaries'] = [{ scope: 'NOVEL', summary: spec.synopsis }];
  const arcSize = 10;
  for (let start = 1; start <= total; start += arcSize) {
    const end = Math.min(total, start + arcSize - 1);
    const place = spec.places[Math.min(spec.places.length - 1, Math.floor(((start - 1) / total) * spec.places.length))];
    summaries.push({
      scope: 'ARC',
      arcName: `Phần ${Math.floor(start / arcSize) + 1}: ${place}`,
      startChapter: start,
      endChapter: end,
      summary: `Từ chương ${start} đến chương ${end}, ${cast.hero} tiếp tục hành trình ở ${place}, đối mặt với ${cast.rival} và dần hiểu rõ hơn về ${cast.ally}.`
    });
  }
  for (const chapter of published.filter((_, index) => index % 7 === 0).slice(0, 6)) {
    summaries.push({ scope: 'CHAPTER', chapterKey: chapter.key, summary: `${chapter.title.replace(/^Chương \d+: /, '')}: ${cast.hero} có thêm một manh mối quan trọng cho mạch truyện chính.` });
  }

  return { characters, relationships, timeline, summaries };
}

function buildChapters(novelKey: string, plan: ChapterPlan, existing: SeedChapter[]) {
  const rng = createRng(`chapters:${novelKey}`);
  const pack = packs[plan.pack];
  const titles = chapterTitles(pack, rng, plan.chapterCount);
  const chapters: SeedChapter[] = [...existing];

  for (let number = existing.length + 1; number <= plan.chapterCount; number++) {
    chapters.push({
      key: `${novelKey}-${number}`,
      title: `Chương ${number}: ${titles[number - 1]}`.slice(0, 100),
      content: chapterContent(pack, rng, plan.cast, plan.places, plan.items, number, plan.chapterCount),
      status: 'PUBLISHED',
      priceCoins: 0,
      publishedDaysAgo: null
    });
  }
  return chapters.map((chapter, index) => {
    const number = index + 1;
    const isDraft = number > chapters.length - plan.draftTail;
    return {
      ...chapter,
      status: isDraft ? ('DRAFT' as const) : ('PUBLISHED' as const),
      priceCoins: plan.vipFrom > 0 && number >= plan.vipFrom ? plan.vipPrice : 0
    };
  });
}

/** Spreads published chapters evenly from the novel's start to its latest update; drafts stay undated. */
function scheduleChapters(chapters: SeedChapter[], createdDaysAgo: number, completed: boolean): SeedChapter[] {
  const published = chapters.filter((chapter) => chapter.status === 'PUBLISHED');
  const firstDay = Math.max(2, createdDaysAgo - 5);
  const lastDay = completed ? Math.min(firstDay - 1, 14) : 1.5;
  let publishedIndex = 0;
  return chapters.map((chapter) => {
    if (chapter.status !== 'PUBLISHED') return { ...chapter, publishedDaysAgo: null };
    const progress = published.length > 1 ? publishedIndex / (published.length - 1) : 0;
    publishedIndex++;
    const days = firstDay - (firstDay - lastDay) * progress;
    return { ...chapter, publishedDaysAgo: Math.round(days * 100) / 100 };
  });
}

function extendCurated(novel: SeedNovel): SeedNovel {
  const extension = curatedExtensions[novel.key];
  if (!extension) throw new Error(`No extension spec for curated novel ${novel.key}`);
  const chapters = scheduleChapters(
    buildChapters(novel.key, extension, novel.chapters),
    novel.createdDaysAgo,
    novel.serialStatus === 'COMPLETED'
  );
  const finalChapters =
    novel.status === 'DRAFT' ? chapters.map((chapter) => ({ ...chapter, status: 'DRAFT' as const, publishedDaysAgo: null })) : chapters;
  return { ...novel, chapters: finalChapters };
}

function generateNovel(spec: NovelSpec): SeedNovel {
  const chapters = scheduleChapters(buildChapters(spec.key, spec, []), spec.createdDaysAgo, spec.serialStatus === 'COMPLETED');
  return {
    key: spec.key,
    authorKey: spec.authorKey,
    title: spec.title,
    slug: slugify(spec.title),
    synopsis: spec.synopsis,
    genre: spec.genre,
    tags: spec.tags,
    coverImageUrl: cover(COVER_PHOTOS[spec.coverIndex % COVER_PHOTOS.length]),
    status: spec.status,
    serialStatus: spec.serialStatus,
    ageRating: spec.ageRating,
    createdDaysAgo: spec.createdDaysAgo,
    chapters,
    context: buildContext(spec, chapters, createRng(`context:${spec.key}`))
  };
}

export function buildNovels(): SeedNovel[] {
  const handWrittenTitles = new Set([...curatedNovels.map((novel) => novel.title), ...generatedSpecs.map((spec) => spec.title)]);
  return [
    ...curatedNovels.map(extendCurated),
    ...generatedSpecs.map(generateNovel),
    ...buildCatalogSpecs(handWrittenTitles).map(generateNovel)
  ];
}
