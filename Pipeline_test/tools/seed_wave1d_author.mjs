// Test-owned account setup ONLY; never a replacement for author UI writes.
import { pathToFileURL } from 'node:url';
const env = process.env;
const project = env.WAVE1D_PROJECT;
const db = new URL(env.DATABASE_URL);
if (!/^p1-wave1[de]-[a-z0-9-]+$/.test(project || '') || db.hostname !== 'postgres' ||
    db.pathname !== '/' + project.replaceAll('-', '_') || env.BUDGET_GUARD_MODE !== 'proxy') {
  throw Error('Refusing to seed a database outside the new owned offline Compose project');
}
const email = env.WAVE1D_AUTHOR_EMAIL;
const username = env.WAVE1D_AUTHOR_USERNAME;
const password = env.WAVE1D_AUTHOR_PASSWORD;
if (!email?.endsWith('@example.invalid') || !username || !password || password.length < 16) {
  throw Error('Required isolated author identity is missing');
}
const { register } = await import(pathToFileURL(process.cwd() + '/dist/modules/auth/auth.service.js'));
const { getPostgresPool, disconnectPostgres } = await import(pathToFileURL(process.cwd() + '/dist/core/database/postgres.js'));
try {
  // Registration is insert-only. Duplicate identity fails instead of editing prior data.
  const session = await register({ email, username, password });
  const userId = session.user.userId;
  const updated = await getPostgresPool().query(
    "UPDATE users SET role='AUTHOR' WHERE user_id=$1 AND email=$2 AND role='READER' RETURNING user_id", [userId, email]);
  if (updated.rowCount !== 1) throw Error('New author role setup did not affect exactly one new account');
  console.log(JSON.stringify({ setup: 'NEW_OFFLINE_AUTHOR_CREATED', user_id: userId, project }));
} finally {
  await disconnectPostgres();
}
