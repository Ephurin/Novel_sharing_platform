import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env } from '../core/config/env.js';
import { getPostgresPool, disconnectPostgres } from '../core/database/postgres.js';
import { getMongoDatabase, disconnectMongo } from '../core/database/mongo.js';

// Additive, local fixtures. Fixed IDs and ON CONFLICT DO NOTHING preserve later admin decisions.
// Never resets existing users, author workspaces, wallet balances or resolved reviews.
if (env.NODE_ENV === 'production')
  throw new Error('Admin seed is only available in development/test.');
const id = (key: string) => {
  const h = createHash('sha256').update(`storycraft-admin-v1:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const ago = (days: number) => new Date(Date.now() - days * 86400000);
const names = [
  'An Nhiên',
  'Minh Khang',
  'Thu Hà',
  'Hải Đăng',
  'Ngọc Lan',
  'Quang Huy',
  'Bảo Châu',
  'Thanh Tâm',
  'Hoàng Anh',
  'Mai Phương',
  'Tuấn Kiệt',
  'Khánh Linh'
];
const titles = [
  'Bến Sông Mùa Lá Rụng',
  'Người Giữ Thư Viện',
  'Chuyến Tàu Qua Tháng Tám',
  'Dưới Mái Hiên Xưa',
  'Dấu Vết Trên Đồi Thông',
  'Hành Trình Của Mây',
  'Mùa Gió Ở Làng Biển',
  'Chiếc Đồng Hồ Không Kim',
  'Lời Hẹn Bên Hồ',
  'Bản Đồ Những Vì Sao',
  'Sau Cánh Cửa Gỗ',
  'Ngày Nắng Trở Về'
];
try {
  const password = await bcrypt.hash('AdminDemo@2026', 10);
  const client = await getPostgresPool().connect();
  try {
    await client.query('begin');
    for (let i = 0; i < 25; i++) {
      const role = i === 0 ? 'ADMIN' : i <= 12 ? 'AUTHOR' : 'READER';
      await client.query(
        `insert into users(user_id,email,username,password_hash,role,status,created_at) values($1,$2,$3,$4,$5,$6,$7) on conflict do nothing`,
        [
          id(`user:${i}`),
          `admin.seed.${i}@example.test`,
          i === 0 ? 'admin_seed' : `admin_seed_${i}`,
          password,
          role,
          i === 5 || i === 18 ? 'LOCKED' : 'ACTIVE',
          ago(i % 12)
        ]
      );
      await client.query(
        `insert into user_profiles(user_id,display_name,bio) values($1,$2,$3) on conflict do nothing`,
        [
          id(`user:${i}`),
          i === 0 ? 'Quản trị thử nghiệm' : names[(i - 1 + 12) % 12],
          'Tài khoản seed kiểm tra giao diện quản trị.'
        ]
      );
      await client.query(
        `insert into wallets(wallet_id,user_id) values($1,$2) on conflict do nothing`,
        [id(`wallet:${i}`), id(`user:${i}`)]
      );
    }
    for (const [i, name] of [
      'Trinh thám',
      'Phiêu lưu',
      'Đời thường',
      'Khoa học viễn tưởng'
    ].entries())
      await client.query(
        `insert into genres(genre_id,name,slug) values($1,$2,$3) on conflict do nothing`,
        [id(`genre:${i}`), name, `admin-seed-genre-${i}`]
      );
    for (const [i, name] of ['Hành trình', 'Gia đình', 'Bí ẩn', 'Trưởng thành'].entries())
      await client.query(
        `insert into tags(tag_id,name,slug) values($1,$2,$3) on conflict do nothing`,
        [id(`tag:${i}`), name, `admin-seed-tag-${i}`]
      );
    for (let i = 1; i <= 12; i++) {
      const status =
        i === 2 ? 'PENDING_MODERATION' : i === 3 ? 'DRAFT' : i === 4 ? 'REJECTED' : 'PUBLISHED';
      await client.query(
        `insert into novels(novel_id,author_id,title,slug,synopsis,status,serial_status,chapters_count,created_at,deleted_at) values($1,$2,$3,$4,$5,$6,$7,12,$8,$9) on conflict do nothing`,
        [
          id(`novel:${i}`),
          id(`user:${i}`),
          titles[i - 1],
          `admin-seed-novel-${i}`,
          `${titles[i - 1]} kể về những con người tìm lại hướng đi qua những đổi thay của cuộc sống.\n\nĐây là truyện seed để kiểm tra danh sách, chi tiết, kiểm duyệt và khôi phục trong môi trường phát triển.`,
          status,
          i % 3 === 0 ? 'COMPLETED' : 'ONGOING',
          ago(i % 7),
          i === 12 ? ago(1) : null
        ]
      );
      for (let j = 1; j <= 12; j++)
        await client.query(
          `insert into chapters(chapter_id,novel_id,title,chapter_number,content,word_count,status,is_vip,price_coins,deleted_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict do nothing`,
          [
            id(`chapter:${i}:${j}`),
            id(`novel:${i}`),
            `Chương ${j}: ${['Cuộc gặp gỡ', 'Một lá thư', 'Con đường mới'][(j - 1) % 3]}`,
            j,
            'Buổi sớm, ánh nắng trải dài trên con đường nhỏ. Người lữ khách dừng chân bên bến sông và mở lá thư đã giữ từ nhiều năm trước.',
            29,
            status === 'PUBLISHED' && j < 10 ? 'PUBLISHED' : 'DRAFT',
            j > 5,
            j > 5 ? 10 : 0,
            i === 12 ? ago(1) : null
          ]
        );
      const source = i % 2 ? 'USER_REPORT' : 'KEYWORD_FILTER';
      const targetType = i % 2 ? 'COMMENT' : 'NOVEL';
      const evidenceId = createHash('sha256')
        .update(`admin-evidence:${i}`)
        .digest('hex')
        .slice(0, 24);
      if (source === 'KEYWORD_FILTER')
        await client.query(
          `insert into moderation_evidence(evidence_id,payload) values($1,$2) on conflict do nothing`,
          [
            evidenceId,
            {
              matchedRules: ['Nội dung cần kiểm tra thủ công'],
              summary: 'Bằng chứng seed phục vụ kiểm tra giao diện kiểm duyệt.'
            }
          ]
        );
      await client.query(
        `insert into moderation_reviews(review_id,target_type,target_id,source,status,evidence_id,created_at) values($1,$2,$3,$4,'PENDING',$5,$6) on conflict do nothing`,
        [
          id(`review:${i}`),
          targetType,
          source === 'USER_REPORT' ? id(`comment:${i}`) : id(`novel:${i}`),
          source,
          source === 'KEYWORD_FILTER' ? evidenceId : null,
          ago(i / 10)
        ]
      );
      if (source === 'USER_REPORT')
        for (let r = 0; r < 3; r++)
          await client.query(
            `insert into reports(report_id,reporter_id,target_type,target_id,review_id,reason,description) values($1,$2,'COMMENT',$3,$4,$5,$6) on conflict do nothing`,
            [
              id(`report:${i}:${r}`),
              id(`user:${13 + r}`),
              id(`comment:${i}`),
              id(`review:${i}`),
              r === 0 ? 'Nội dung gây rối' : 'Ngôn từ không phù hợp',
              'Báo cáo seed để kiểm tra thao tác xử lý.'
            ]
          );
      const tx = await client.query(
        `insert into transactions(transaction_id,wallet_id,type,status,amount_coins,metadata) values($1,$2,'WITHDRAW','PENDING',$3,$4) on conflict do nothing returning transaction_id`,
        [id(`withdraw-tx:${i}`), id(`wallet:${i}`), 100 + i * 10, { seed: 'admin-v1' }]
      );
      if (tx.rowCount) {
        await client.query(`update wallets set locked_coins=locked_coins+$2 where wallet_id=$1`, [
          id(`wallet:${i}`),
          100 + i * 10
        ]);
        await client.query(
          `insert into withdraw_requests(withdraw_request_id,wallet_id,amount_coins,bank_account_label,transaction_id,created_at) values($1,$2,$3,$4,$5,$6)`,
          [
            id(`withdraw:${i}`),
            id(`wallet:${i}`),
            100 + i * 10,
            'Tài khoản ngân hàng seed •••• 2026',
            id(`withdraw-tx:${i}`),
            ago(i / 5)
          ]
        );
      }
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  for (let i = 1; i <= 12; i += 2)
    await getMongoDatabase()
      .collection('comments')
      .updateOne(
        { commentId: id(`comment:${i}`) },
        {
          $setOnInsert: {
            commentId: id(`comment:${i}`),
            novelId: id(`novel:${i}`),
            chapterId: id(`chapter:${i}:1`),
            userId: id('user:16'),
            content:
              'Bình luận seed đang được báo cáo: mong mọi người thảo luận lịch sự và tôn trọng tác giả.',
            status: 'APPROVED',
            moderationReviewId: null,
            paragraphOffset: null,
            parentCommentId: null,
            createdAt: ago(1),
            updatedAt: ago(1),
            deletedAt: null
          }
        },
        { upsert: true }
      );
  console.log(
    'Admin seed ready: 25 accounts, 12 novels / 144 chapters, 12 reviews, 18 reports, 12 withdrawals. Existing fixtures preserved. Login: admin_seed / AdminDemo@2026'
  );
} finally {
  await Promise.all([disconnectPostgres(), disconnectMongo()]);
}
