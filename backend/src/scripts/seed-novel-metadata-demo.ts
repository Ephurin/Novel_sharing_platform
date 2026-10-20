import { disconnectPostgres } from '../core/database/postgres.js';
import { withPostgresTransaction } from '../core/database/transaction.js';
import { upsertGenre } from '../modules/novels/novels.repository.js';

// Explicit local-demo fixtures only. Do not rerun the broader seed/reset users.
const samples = [
  {
    id: '81b923d7-5507-48ea-9a84-5303fd1de5f4', extraGenre: 'Phiêu lưu',
    oldPrefix: 'A sample fantasy novel used for local reader and author workflow testing.',
    synopsis: 'Sau đêm Ashenhold chìm trong biển lửa, Kael Draven rời thành phố với một mảnh bản đồ và lời hứa chưa hoàn thành. Trên đường tới Silverkeep, cậu gặp những người sống sót đang tìm một nơi có thể gọi là nhà.\n\nNhưng đằng sau các bức tường an toàn là dấu vết của hội Crimson Sanctum. Để cứu những người đồng hành, Kael phải lần theo bí mật về sự sụp đổ của quê hương và lựa chọn giữa trả thù với việc xây dựng một khởi đầu mới. Đây là truyện mẫu để thử giao diện giới thiệu dài, nhiều thể loại và danh sách chương.',
    note: 'Cảm ơn bạn đã đồng hành cùng hành trình của Kael. Tôi muốn kể một câu chuyện về những người tìm lại hy vọng sau mất mát, nơi mỗi lựa chọn đều để lại dấu vết.\n\nĐây là lời tác giả mẫu dành cho môi trường thử nghiệm. Bạn có thể sửa hoặc xóa nội dung này trong “Chỉnh sửa thông tin”.'
  },
  {
    id: '451e1280-214c-4500-980b-34b9af0989eb', extraGenre: 'Kiếm hiệp',
    oldPrefix: 'A second sample cultivation fantasy novel used for local reader workflow testing.',
    synopsis: 'Từ một làng nhỏ dưới chân núi, chàng thiếu niên mang thanh kiếm cũ bước vào Thanh Vân môn. Những bài học đầu tiên không chỉ nói về kiếm thuật, mà còn đặt cậu trước câu hỏi: sức mạnh có ý nghĩa gì nếu không thể bảo vệ người thân?\n\nGiữa các cuộc tranh tài và bí mật của môn phái, cậu dần nhận ra con đường tu luyện luôn bắt đầu từ những quyết định rất đời thường. Truyện mẫu có ba chương để kiểm tra khung bảng năm dòng và cách hiển thị phần giới thiệu nhiều đoạn.',
    note: 'Tôi hy vọng những chương truyện này mang lại một khoảng nghỉ dễ chịu cho bạn. Mỗi nhân vật đều có một con đường riêng để trưởng thành.\n\nNội dung này là dữ liệu mẫu, có thể chỉnh sửa trực tiếp để thử lưu lời tác giả và thay đổi thể loại.'
  }
];

try {
  for (const sample of samples) {
    const applied = await withPostgresTransaction(async client => {
      const found = await client.query(`select n.novel_id, n.genre_id, n.author_note, n.synopsis
        from novels n join users u on u.user_id = n.author_id
        where n.novel_id = $1 and n.slug like 'sample-%' and u.username = 'reader03'
          and n.deleted_at is null for update of n`, [sample.id]);
      const row = found.rows[0];
      if (!row || row.author_note !== null) return false;
      const extraId = await upsertGenre(client, sample.extraGenre);
      await client.query(`insert into novel_genres (novel_id, genre_id)
        select $1, unnest($2::uuid[]) on conflict do nothing`, [sample.id, [row.genre_id, extraId].filter(Boolean)]);
      await client.query(`update novels set author_note = $2, synopsis = $3, updated_at = now() where novel_id = $1`,
        [sample.id, sample.note, String(row.synopsis).startsWith(sample.oldPrefix) ? sample.synopsis : row.synopsis]);
      return true;
    });
    console.log(JSON.stringify({ novelId: sample.id, metadataSeeded: applied }));
  }
} finally {
  await disconnectPostgres();
}
