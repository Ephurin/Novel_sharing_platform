import { getPostgresPool, disconnectPostgres } from '../core/database/postgres.js';
import { logger } from '../core/logger/logger.js';
import {
  convertLegacyModeratorAccounts,
  inventoryLegacyModeratorConversion,
  listLegacyModeratorAccounts,
  rollbackModeratorConversion
} from '../modules/admin/moderator-conversion.js';

const usage = `Công cụ chuyển đổi Moderator legacy (PR-07).
Cách dùng: tsx src/scripts/moderator-conversion.ts <lệnh> --actor <uuid> --reason "..." [--accounts ...]

Lệnh:
  dry-run          Kiểm kê chỉ đọc các cặp users.role='ADMIN' + admin_access.scope='MODERATOR'.
  convert          Chuyển từng tài khoản sang role MODERATOR bằng lệnh cấp quyền chung.
  rollback         Đưa các tài khoản đã chuyển về lại ADMIN + scope cũ (dạng --accounts=userId:scope,...).

Tùy chọn:
  --actor <uuid>   Admin toàn quyền phê duyệt thao tác (bắt buộc với convert/rollback).
  --reason <text>  Lý do ghi vào audit (bắt buộc với convert/rollback).
  --accounts <...> Giới hạn danh sách tài khoản (id[,id...] cho convert; id:scope[,...] cho rollback).
`;

const args = process.argv.slice(2);
const command = args[0];
const option = (name: string, fallback?: string) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : (args[index + 1] ?? fallback);
};
const actor = option('actor');
const reason = option('reason');
const accountsArg = option('accounts');
const startedAt = new Date().toISOString();

const fail = (message: string) => {
  logger.error(message);
  process.exitCode = 1;
  return undefined;
};

async function main() {
  if (process.env.NODE_ENV === 'production') fail('Công cụ chỉ chạy trên môi trường kiểm thử.');
  if (!['dry-run', 'convert', 'rollback'].includes(command ?? '')) fail(usage);
  if (command !== 'dry-run') {
    if (!actor) fail('Thiếu --actor (admin toàn quyền phê duyệt).');
    if (!reason) fail('Thiếu --reason (lý do thao tác).');
  }
  const pool = getPostgresPool();
  try {
    if (command === 'dry-run') {
      const accounts = await inventoryLegacyModeratorConversion(pool);
      const legacy = await listLegacyModeratorAccounts(pool);
      process.stdout.write(
        `${JSON.stringify({ command: 'dry-run', startedAt, legacyCount: legacy.length, accounts }, null, 2)}\n`
      );
      return;
    }
    if (command === 'convert') {
      const accounts = accountsArg?.split(',').map((value) => value.trim()).filter(Boolean);
      const result = await convertLegacyModeratorAccounts({ userId: actor! }, reason!, { accounts });
      process.stdout.write(
        `${JSON.stringify({ command: 'convert', startedAt, actor, reason, ...result }, null, 2)}\n`
      );
      return;
    }
    const rollbackAccounts = (accountsArg?.split(',').map((value) => value.trim()).filter(Boolean) ?? []).map(
      (value) => {
        const [userId, scope] = value.split(':');
        return { userId, scope };
      }
    );
    if (!rollbackAccounts.length) fail('Rollback cần --accounts=userId:scope[,...].');
    const result = await rollbackModeratorConversion({ userId: actor! }, rollbackAccounts, reason!);
    process.stdout.write(
      `${JSON.stringify({ command: 'rollback', startedAt, actor, reason, ...result }, null, 2)}\n`
    );
  } finally {
    await disconnectPostgres();
  }
}

await main();
