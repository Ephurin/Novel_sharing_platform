import { createServer } from 'node:net';
import { adminOperationsCases } from './admin-operations.cases.mjs';
import { adminSessionTransitions } from './admin-session-transitions.cases.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sourceSha=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).stdout.trim();
const sourceTreeDirty=spawnSync('git',['diff','--quiet','HEAD','--','backend','web'],{cwd:root,windowsHide:true}).status!==0;
const backend = path.join(root, 'backend');
const requireBackend = createRequire(path.join(backend, 'package.json'));
const { Client } = requireBackend('pg');
const { MongoClient } = requireBackend('mongodb');
const tsx = path.join(backend, 'node_modules/tsx/dist/cli.mjs');
const output =
  process.env.ADMIN_BROWSER_OUTPUT_DIR || path.join(root, 'docs/development/ADMIN-UI-REDESIGN');
const id = (key) => {
  const h = createHash('sha256').update(`storycraft-admin-v1:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

test(
  'admin redesign: real API, isolated seed, browser flows and responsive themes',
  { skip: process.env.RUN_ADMIN_BROWSER_TESTS !== '1', timeout: 360000 },
  async (t) => {
    const availablePort=()=>new Promise((resolve,reject)=>{const server=createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(error=>error?reject(error):resolve(port));});});
    const apiPort=await availablePort();let webPort=await availablePort();while(webPort===apiPort)webPort=await availablePort();
    const base=`http://127.0.0.1:${apiPort}/api/v1`;
    const webOrigin=`http://127.0.0.1:${webPort}`;
    const dbName = `ephurin_test_admin_ui_${Date.now()}`;
    const adminUrl =
      process.env.ADMIN_TEST_POSTGRES_URL ||
      'postgresql://postgres:postgres@localhost:5432/postgres';
    const pgUrl = new URL(adminUrl);
    pgUrl.pathname = `/${dbName}`;
    const mongoUrl = new URL(process.env.ADMIN_TEST_MONGO_URL || 'mongodb://localhost:27017');
    mongoUrl.pathname = `/${dbName}`;
    const adminDb = new Client({ connectionString: adminUrl });
    await adminDb.connect();
    const mongo = new MongoClient(mongoUrl.toString());
    const env = {
      ...process.env,
      NODE_ENV: 'test',
      DOTENV_CONFIG_PATH: path.join(backend, '.env.example'),
      DATABASE_URL: pgUrl.toString(),
      MONGODB_URI: mongoUrl.toString(),
      JWT_ACCESS_SECRET: 'admin-ui-test-access-secret',
      JWT_REFRESH_SECRET: 'admin-ui-test-refresh-secret',
      PORT: String(apiPort),
      DB_CONNECT_ON_START: 'false',
      VITE_API_BASE_URL: base, WEB_ORIGIN:webOrigin
    };
    const children = [];
    let browser;
    const logs = [];
    const errors = [];
    const checks = [];
    const start = (args, cwd) => {
      const child = spawn(process.execPath, args, {
        cwd,
        env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      children.push(child);
      child.stdout.on('data', (b) => logs.push(b.toString()));
      child.stderr.on('data', (b) => logs.push(b.toString()));
      return child;
    };
    const run = (script) => {
      const r = spawnSync(process.execPath, [tsx, script], {
        cwd: backend,
        env,
        encoding: 'utf8',
        windowsHide: true,
        timeout: 45000
      });
      if (r.status !== 0) throw new Error(r.stderr || r.stdout);
    };
    const waitFor = async (url) => {
      for (let i = 0; i < 80; i++) {
        try {
          if(children.some(child=>child.exitCode!==null))throw new Error('Test server exited before readiness');
          if ((await fetch(url)).ok) return;
        } catch {}
        await new Promise((r) => setTimeout(r, 250));
      }
      throw new Error(`Server not ready: ${url}`);
    };
    let token;
    const api = async (route, { method = 'GET', body, auth = token, status = 200 } = {}) => {
      const r = await fetch(`${base}${route}`, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(auth ? { authorization: `Bearer ${auth}` } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      assert.equal(r.status, status, `${method} ${route}: ${r.status}`);
      return r.status === 204 ? null : r.json();
    };
    try {
      await adminDb.query(`create database ${dbName}`);
      run('src/core/database/migrate.ts');
      run('src/scripts/seed-admin.ts');
      run('src/scripts/seed-admin.ts');
      start([tsx, 'src/main.ts'], backend);
      start(
        [
          path.join(root, 'web/node_modules/vite/bin/vite.js'),
          '--host',
          '127.0.0.1',
          '--port',
          String(webPort),
          '--strictPort'
        ],
        path.join(root, 'web')
      );
      await Promise.all([waitFor(`${base}/health`), waitFor(webOrigin)]);
      token = (
        await api('/auth/login', {
          method: 'POST',
          body: { identifier: 'admin_seed', password: 'AdminDemo@2026' }
        })
      ).data.accessToken;
      await t.test(
        'API: pagination, filters, authorization, seed idempotence and evidence',
        async () => {
          await api('/admin/dashboard/stats', { auth: null, status: 401 });
          const reader = (
            await api('/auth/login', {
              method: 'POST',
              body: { identifier: 'admin_seed_13', password: 'AdminDemo@2026' }
            })
          ).data.accessToken;
          await api(`/admin/chapters/${id('chapter:1:1')}`, {
            auth: reader,
            status: 403
          });
          for (const route of [
            '/admin/withdraw-requests',
            `/admin/withdraw-requests/${id('withdraw:1')}/approve`,
            `/admin/withdraw-requests/${id('withdraw:1')}/reject`
          ]) {
            const method = route.endsWith('requests') ? 'GET' : 'POST';
            await api(route, {
              method,
              auth: reader,
              body: method === 'POST' ? { reason: 'Unauthorized test' } : undefined,
              status: 403
            });
            await api(route, {
              method,
              auth: null,
              body: method === 'POST' ? { reason: 'Unauthorized test' } : undefined,
              status: 401
            });
          }
          const stats = (await api('/admin/dashboard/stats')).data;
          assert.equal(stats.totalUsers, 25);
          assert.equal(stats.totalNovels, 11);
          assert.equal(stats.activity.length, 7);
          assert.equal(stats.totalDepositedCoins, 0);
          const a = await api('/admin/users?page=1&limit=8');
          const b = await api('/admin/users?page=2&limit=8');
          assert.equal(a.meta.totalItems, 25);
          assert.equal(new Set([...a.data, ...b.data].map((u) => u.userId)).size, 16);
          const locked = await api('/admin/users?role=AUTHOR&status=LOCKED');
          assert.equal(locked.data.length, 1);
          const hidden = await api('/admin/novels?includeDeleted=false');
          assert.ok(hidden.data.every((n) => !n.deletedAt));
          const included = await api('/admin/novels?includeDeleted=true');
          assert.equal(included.meta.totalItems, 12);
          const completed = await api('/admin/novels?serialStatus=COMPLETED');
          assert.ok(completed.data.length);
          assert.ok(completed.data.every((n) => n.serialStatus === 'COMPLETED'));
          const reports = await api('/admin/moderation/reviews?source=USER_REPORT');
          assert.equal(reports.meta.totalItems, 6);
          assert.ok(reports.data.every((r) => r.reportCount === 3));
          const review = (await api(`/admin/moderation/reviews/${id('review:1')}`)).data;
          assert.match(review.target.content, /seed/);
          assert.equal(
            review.reportReasons.reduce((sum, r) => sum + r.count, 0),
            3
          );
          const db = new Client({ connectionString: pgUrl.toString() });
          await db.connect();
          try {
            // Reasons are user text, including names that also exist on Object.prototype.
            await db.query('update reports set reason=$2 where report_id=$1', [
              id('report:1:0'),
              '__proto__'
            ]);
            const special = (await api(`/admin/moderation/reviews/${id('review:1')}`)).data;
            assert.equal(
              special.reportReasons.find((item) => item.reason === '__proto__').count,
              1
            );
            await db.query('update reports set reason=$2 where report_id=$1', [
              id('report:1:0'),
              'Nội dung gây rối'
            ]);
          } finally {
            await db.end();
          }
          checks.push(
            'API authorization, server filters/pagination, idempotent seed and real report evidence'
          );
        }
      );
      browser = await chromium.launch({ channel: 'chrome', headless: true });
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        permissions: ['clipboard-read', 'clipboard-write']
      });
      await context.addInitScript((t) => {
        localStorage.setItem('ephurin_access_token', t);
        localStorage.setItem('storycraft-theme', 'light');
      }, token);
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      const goto = async (route) => {
        await page.goto(`${webOrigin}${route}`);
        await page.locator('main h1, .admin-appeal-portal h1').waitFor();
      };
      await t.test('browser: compact IDs copy full UUIDs and preserve routing', async () => {
        for (const route of ['/admin/moderation', '/admin/reports']) {
          await goto(route);
          const row = page.locator(`[data-testid="moderation-review-card-${id('review:1')}"]`);
          const value = row.locator('.admin-id-value').first();
          assert.equal(
            await value.locator('span[title]').innerText(),
            `${id('review:1').slice(0, 8)}…${id('review:1').slice(-4)}`
          );
          assert.equal(await value.locator('span[title]').getAttribute('title'), id('review:1'));
          await value.getByRole('button', { name: 'Sao chép mã kiểm duyệt', exact: true }).click();
          assert.equal(await page.evaluate(() => navigator.clipboard.readText()), id('review:1'));
          assert.equal(
            await row.getByRole('link', { name: 'Chi tiết →', exact: true }).getAttribute('href'),
            `/admin/moderation/${id('review:1')}`
          );
        }
        checks.push(
          'Abbreviated UUID display with full clipboard values, tooltip titles and unchanged detail routes'
        );
      });
      await t.test('browser: novel cover, expandable synopsis and secondary IDs', async () => {
        const db = new Client({ connectionString: pgUrl.toString() });
        await db.connect();
        const synopsis =
          'Giới thiệu dài để kiểm tra khả năng đọc. '.repeat(24) + 'KẾT THÚC GIỚI THIỆU';
        const cover =
          'data:image/svg+xml,' +
          encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="180"><rect width="120" height="180" fill="#dd8567"/><text x="10" y="90">Test cover</text></svg>'
          );
        try {
          await db.query('update novels set synopsis=$2,cover_image_url=$3 where novel_id=$1', [
            id('novel:1'),
            synopsis,
            cover
          ]);
        } finally {
          await db.end();
        }
        await goto('/admin/novels');
        await page.locator('tbody tr').first().waitFor();
        assert.equal(await page.locator('td.admin-table-title small').count(), 0);
        await page.getByLabel('Tìm kiếm', { exact: true }).fill('admin_seed_12');
        await page.getByLabel('Hiện truyện đã gỡ', { exact: true }).check();
        const removed = page.locator('tbody tr').filter({ hasText: '@admin_seed_12' });
        await removed.getByText('Đã gỡ', { exact: true }).waitFor();
        await removed.getByText('Đã xuất bản', { exact: true }).waitFor();
        await goto(`/admin/novels/${id('novel:1')}`);
        await page.locator('.admin-novel-cover img').waitFor();
        assert.equal(await page.locator('.admin-novel-cover img').getAttribute('src'), cover);
        assert.equal(await page.locator('details.admin-metadata').getAttribute('open'), null);
        assert.ok(
          (await page.locator('#admin-novel-synopsis').innerText()).length < synopsis.length
        );
        await page.getByRole('button', { name: 'Xem thêm', exact: true }).click();
        assert.equal(await page.locator('#admin-novel-synopsis').innerText(), synopsis);
        await page.getByText('Thông tin bổ sung', { exact: true }).click();
        await page.locator('.admin-metadata').getByText(id('novel:1'), { exact: true }).waitFor();
        checks.push(
          'Existing API cover rendered; synopsis expands fully; technical IDs remain accessible in secondary metadata'
        );
      });
      await t.test('browser: loading, recoverable error and real empty search', async () => {
        const pattern = /\/api\/v1\/admin\/novels\?/;
        let release;
        const gate = new Promise((resolve) => {
          release = resolve;
        });
        await page.route(pattern, async (route) => {
          await gate;
          await route.continue();
        });
        await goto('/admin/novels');
        await page.getByText('Đang tải truyện...', { exact: true }).waitFor();
        release();
        await page.locator('tbody tr').first().waitFor();
        await page.unroute(pattern);
        let fail = true;
        await page.route(pattern, (route) =>
          fail
            ? route.fulfill({
                status: 503,
                contentType: 'application/json',
                body: JSON.stringify({
                  success: false,
                  error: { code: 'ADMIN_TEST_ERROR', message: 'Lỗi kiểm thử có thể thử lại' }
                })
              })
            : route.continue()
        );
        await goto('/admin/novels');
        await page.getByText(/Lỗi kiểm thử có thể thử lại/).waitFor();
        fail = false;
        await page.getByRole('button', { name: 'Retry', exact: true }).click();
        await page.locator('tbody tr').first().waitFor();
        await page.unroute(pattern);
        await page.getByLabel('Tìm kiếm', { exact: true }).fill('no-such-novel-0000');
        await page.getByText('Không tìm thấy truyện phù hợp.', { exact: true }).waitFor();
        checks.push(
          'Loading state during held real request; 503 error with working Retry; empty search'
        );
      });
      await t.test(
        'browser: all 9 routes, both themes at desktop/mobile, shared type and no page overflow',
        async () => {
          const routes = [
            ['overview', '/admin'],
            ['users', '/admin/users'],
            ['novels', '/admin/novels'],
            ['novel-detail', `/admin/novels/${id('novel:1')}`],
            ['taxonomy', '/admin/taxonomy'],
            ['moderation', '/admin/moderation'],
            ['reports', '/admin/reports'],
            ['moderation-detail', `/admin/moderation/${id('review:1')}`],
            ['withdraws', '/admin/withdraws'],
            ['audit', '/admin/audit'],
            ['appeals', '/admin/appeals'],
            ['user-detail', `/admin/users/${id('user:13')}`],
            ['reconciliation', `/admin/withdraws/${id('withdraw:1')}`]
          ];
          await mkdir(output, { recursive: true });
          for (const [name, route] of routes) {
            for (const [theme, width] of [
              ['light', 1440],
              ['dark', 1440],
              ['light', 390],
              ['dark', 390]
            ]) {
              await page.setViewportSize({ width, height: 1000 });
              await goto(route);
              await page.evaluate((theme) => {
                window.storycraftTheme.write(theme);
                window.storycraftTheme.apply();
              }, theme);
              await page.locator('main .admin-panel,main .admin-metric').first().waitFor();
              await page.evaluate(() => document.fonts.ready);
              // Wait for the requested theme rather than introducing timing-only sleeps.
              await page.waitForFunction(
                (theme) => document.documentElement.dataset.theme === theme,
                theme
              );
              const dimensions = await page.evaluate(() => ({
                width: innerWidth,
                scroll: document.documentElement.scrollWidth,
                font: getComputedStyle(document.querySelector('main h1')).fontFamily,
                size: getComputedStyle(document.querySelector('main h1')).fontSize
              }));
              assert.ok(
                dimensions.scroll <= dimensions.width + 1,
                `${name}/${theme}: horizontal overflow ${JSON.stringify(dimensions)}`
              );
              assert.match(dimensions.font, /Be Vietnam Pro/);
              assert.equal(dimensions.size, '24px');
              await page.screenshot({
                path: path.join(output, `${name}-${theme}-${width}.png`),
                fullPage: true
              });
            }
          }
          assert.deepEqual(errors, []);
          checks.push(
            '9 routes x 2 themes x 2 widths; Be Vietnam Pro 24px headings; no document overflow'
          );
        }
      );
      await page.setViewportSize({ width: 1440, height: 1000 });
      await t.test('browser: account lock/unlock and search empty state', async () => {
        await goto('/admin/users');
        await page.getByLabel('Tìm kiếm', { exact: true }).fill('admin_seed_13');
        const row = page.locator('tbody tr').filter({ hasText: '@admin_seed_13' });
        await row.waitFor();
        await row.getByRole('button', { name: 'Khóa tài khoản', exact: true }).click();
        await page.getByRole('dialog').locator('textarea').fill('Admin operations lock test');
        await page
          .getByRole('dialog')
          .getByRole('button', { name: 'Khóa tài khoản', exact: true })
          .click();
        await row.getByRole('button', { name: 'Mở khóa', exact: true }).waitFor();
        assert.equal((await api('/admin/users?q=admin_seed_13')).data[0].status, 'LOCKED');
        await row.getByRole('button', { name: 'Mở khóa', exact: true }).click();
        await page.getByRole('dialog').locator('textarea').fill('Admin operations unlock test');
        await page
          .getByRole('dialog')
          .getByRole('button', { name: 'Mở khóa tài khoản', exact: true })
          .click();
        await row.getByRole('button', { name: 'Khóa tài khoản', exact: true }).waitFor();
        await page.getByLabel('Tìm kiếm', { exact: true }).fill('no-such-user-0000');
        await page.getByText('Không tìm thấy người dùng phù hợp.').waitFor();
        checks.push('Browser lock/unlock and empty search');
      });
      await t.test(
        'browser: taxonomy saves to database and rejects duplicates/whitespace',
        async () => {
          await goto('/admin/taxonomy');
          await page.getByLabel('Tên thể loại mới').fill('Thể loại kiểm thử');
          await page.getByRole('button', { name: 'Thêm thể loại', exact: true }).click();
          await page.getByText('Đã thêm thể loại.', { exact: true }).waitFor();
          await page.getByLabel('Tên thể loại mới').fill('Thể loại kiểm thử');
          await page.getByRole('button', { name: 'Thêm thể loại', exact: true }).click();
          await page.getByText('Tên này đã tồn tại.', { exact: true }).waitFor();
          await api('/admin/taxonomy/genres', {
            method: 'POST',
            body: { name: '   ' },
            status: 400
          });
          await api('/admin/taxonomy/genres', {
            method: 'POST',
            body: { name: 'Thể loại kiểm thử' },
            status: 409
          });
          await page.getByLabel('Tên tag mới').fill('#Kiểm thử');
          await page.getByRole('button', { name: 'Thêm tag', exact: true }).click();
          await page.getByText('Đã thêm tag.', { exact: true }).waitFor();
          await page.reload();
          await page.getByText('# Kiểm thử', { exact: true }).waitFor();
          checks.push('Taxonomy persistent creation and duplicate validation');
        }
      );
      await t.test('browser: chapter inspection, novel remove and restore', async () => {
        await goto(`/admin/novels/${id('novel:1')}`);
        await page.getByRole('button', { name: 'Xem nội dung', exact: true }).first().click();
        await page
          .getByRole('dialog')
          .getByText(/Buổi sớm/)
          .waitFor();
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Gỡ truyện', exact: true }).click();
        await page.getByRole('dialog').getByLabel('Lý do xử lý').fill('Kiểm thử gỡ và khôi phục');
        await page.getByRole('button', { name: 'Xác nhận gỡ truyện', exact: true }).click();
        await page.getByRole('button', { name: 'Khôi phục truyện', exact: true }).waitFor();
        const hidden = await api('/admin/novels?includeDeleted=false');
        assert.ok(!hidden.data.some((n) => n.novelId === id('novel:1')));
        await page.getByRole('button', { name: 'Khôi phục truyện', exact: true }).click();
        await page.getByRole('dialog').locator('textarea').fill('Admin operations restore test');
        await page
          .getByRole('dialog')
          .getByRole('button', { name: 'Khôi phục', exact: true })
          .click();
        await page.getByRole('button', { name: 'Gỡ truyện', exact: true }).waitFor();
        checks.push('Admin chapter preview and confirmed novel removal/restore');
      });
      await t.test(
        'browser: full reported content/evidence and keyword publication semantics',
        async () => {
          await mongo.connect();
          const content =
            'Bình luận seed cần được kiểm tra đầy đủ. '.repeat(30) + 'KẾT THÚC NỘI DUNG';
          await mongo
            .db()
            .collection('comments')
            .updateOne({ commentId: id('comment:1') }, { $set: { content } });
          await goto(`/admin/moderation/${id('review:1')}`);
          assert.ok(
            (await page.locator('#admin-review-content').innerText()).length < content.length
          );
          await page.getByRole('button', { name: 'Xem đầy đủ', exact: true }).click();
          assert.equal(await page.locator('#admin-review-content').innerText(), content);
          await page.getByText('Thông tin kiểm duyệt', { exact: true }).click();
          await page
            .locator('.admin-metadata')
            .getByText(id('review:1'), { exact: true })
            .waitFor();
          const review = (await api(`/admin/moderation/reviews/${id('review:2')}`)).data;
          await goto(`/admin/moderation/${id('review:2')}`);
          for (const rule of review.evidenceSummary.matchedRules)
            await page.locator('.admin-evidence-list').getByText(rule, { exact: true }).waitFor();
          await page.getByText(review.evidenceSummary.summary, { exact: true }).waitFor();
          await page.getByRole('button', { name: 'Duyệt nội dung', exact: true }).click();
          await page
            .getByRole('dialog')
            .getByText('Duyệt xuất bản nội dung theo phiên bản đang được kiểm duyệt.', {
              exact: true
            })
            .waitFor();
          await page.getByRole('button', { name: 'Xác nhận xử lý', exact: true }).click();
          await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
          assert.equal((await api(`/admin/novels/${id('novel:2')}`)).data.status, 'PUBLISHED');
          checks.push(
            'Full reported text and available evidence remain accessible; keyword approval publishes submitted novel'
          );
        }
      );
      await t.test(
        'browser: accept/reject comment reports and verify persisted content state',
        async () => {
          await goto(`/admin/moderation/${id('review:1')}`);
          await page.getByRole('button', { name: 'Chấp nhận báo cáo', exact: true }).click();
          await page
            .getByRole('dialog')
            .getByLabel('Lý do xử lý')
            .fill('Nội dung vi phạm sau khi kiểm tra');
          await page.getByRole('button', { name: 'Xác nhận xử lý', exact: true }).click();
          await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
          await page.waitForFunction(
            () => document.querySelector('[data-testid="admin-approve-report-btn"]')?.disabled
          );
          const approved = (await api(`/admin/moderation/reviews/${id('review:1')}`)).data;
          assert.equal(approved.status, 'APPROVED');
          assert.equal(approved.target.status, 'DELETED');
          assert.equal(approved.reason, 'Nội dung vi phạm sau khi kiểm tra');
          await goto(`/admin/moderation/${id('review:3')}`);
          await page.getByRole('button', { name: 'Từ chối báo cáo', exact: true }).click();
          assert.equal(
            await page.getByRole('button', { name: 'Xác nhận xử lý', exact: true }).isDisabled(),
            true
          );
          await page.getByRole('dialog').getByLabel('Lý do xử lý').fill('Không đủ căn cứ');
          await page.getByRole('button', { name: 'Xác nhận xử lý', exact: true }).click();
          await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
          const rejected = (await api(`/admin/moderation/reviews/${id('review:3')}`)).data;
          assert.equal(rejected.status, 'REJECTED');
          assert.equal(rejected.target.status, 'APPROVED');
          checks.push(
            'Comment report accept removes comment; reject preserves comment; reasons persisted'
          );
        }
      );
      await t.test('browser: approve/reject withdrawals and verify wallet state', async () => {
        await goto('/admin/withdraws');
        await page.locator('tbody tr').first().waitFor();
        let row = page
          .locator('tbody tr')
          .filter({ has: page.getByText('@admin_seed_1', { exact: true }) });
        let release;
        const gate = new Promise((resolve) => {
          release = resolve;
        });
        let reached;
        const captured = new Promise((resolve) => {
          reached = resolve;
        });
        const approvalRoute = `${base}/admin/withdraw-requests/${id('withdraw:1')}/approve`;
        await page.route(approvalRoute, async (route) => {
          const response = await route.fetch();
          reached();
          await gate;
          await route.fulfill({ response });
        });
        await row.getByRole('button', { name: 'Duyệt', exact: true }).click();
        await page
          .getByRole('dialog')
          .getByText(/không xác nhận tiền đã vào tài khoản ngân hàng/)
          .waitFor();
        await page.getByRole('button', { name: 'Xác nhận duyệt', exact: true }).click();
        await captured;
        assert.equal(
          await page.getByRole('button', { name: 'Xác nhận duyệt', exact: true }).isDisabled(),
          true
        );
        assert.equal(
          await row.getByRole('button', { name: 'Duyệt', exact: true }).isDisabled(),
          true
        );
        await page.keyboard.press('Escape');
        assert.equal(await page.getByRole('dialog').isVisible(), true);
        release();
        await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
        await page.unroute(approvalRoute);
        await page
          .getByRole('alert')
          .getByText('Đã duyệt yêu cầu trong hệ thống.', { exact: true })
          .waitFor();
        row = page.locator('tbody tr').filter({ hasText: '@admin_seed_2' });
        await row.getByRole('button', { name: 'Từ chối', exact: true }).click();
        assert.equal(
          await page.getByRole('button', { name: 'Xác nhận từ chối', exact: true }).isDisabled(),
          true
        );
        await page
          .getByRole('dialog')
          .getByLabel('Lý do xử lý')
          .fill('Thông tin nhận tiền cần bổ sung');
        await page.getByRole('button', { name: 'Xác nhận từ chối', exact: true }).click();
        await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
        const db = new Client({ connectionString: pgUrl.toString() });
        await db.connect();
        try {
          const wallets = (
            await db.query(
              'select user_id,coins_balance,locked_coins from wallets where user_id=any($1::uuid[])',
              [[id('user:1'), id('user:2')]]
            )
          ).rows;
          assert.equal(wallets.find((w) => w.user_id === id('user:1')).locked_coins, 0);
          assert.equal(wallets.find((w) => w.user_id === id('user:2')).coins_balance, 120);
          assert.equal(wallets.find((w) => w.user_id === id('user:2')).locked_coins, 0);
        } finally {
          await db.end();
        }
        await api(`/admin/withdraw-requests/${id('withdraw:1')}/approve`, {
          method: 'POST',
          status: 404
        });
        const requests = await Promise.all(
          [1, 2].map(() =>
            fetch(`${base}/admin/withdraw-requests/${id('withdraw:3')}/approve`, {
              method: 'POST',
              headers: { authorization: `Bearer ${token}` }
            })
          )
        );
        assert.deepEqual(requests.map((r) => r.status).sort(), [200, 404]);
        const verify = new Client({ connectionString: pgUrl.toString() });
        await verify.connect();
        try {
          const wallet = (
            await verify.query('select locked_coins from wallets where user_id=$1', [id('user:3')])
          ).rows[0];
          assert.equal(wallet.locked_coins, 0);
          const tx = (
            await verify.query('select status from transactions where transaction_id=$1', [
              id('withdraw-tx:3')
            ])
          ).rows[0];
          assert.equal(tx.status, 'SUCCESS');
        } finally {
          await verify.end();
        }
        checks.push(
          'Withdrawal permissions, pending confirmation lock, no payment claim, ledger updates and concurrent duplicate approval blocked'
        );
      });
      await t.test(
        'browser: mobile navigation, theme menu and preference persistence',
        async () => {
          await page.setViewportSize({ width: 390, height: 844 });
          await goto('/admin');
          await page.getByRole('button', { name: 'Mở điều hướng', exact: true }).click();
          await page
            .getByRole('navigation')
            .getByRole('link', { name: 'Thể loại & Tag', exact: true })
            .click();
          await page.getByRole('heading', { name: 'Thể loại & Tag', exact: true }).waitFor();
          assert.equal(
            await page.getByRole('button', { name: 'Đóng điều hướng', exact: true }).count(),
            0
          );
          await page.getByRole('button', { name: 'Giao diện', exact: true }).click();
          await page.getByRole('menuitem', { name: 'Tối', exact: true }).click();
          await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
          assert.equal(await page.evaluate(() => localStorage.getItem('storycraft-theme')), 'dark');
          // The initial script sets light on each full document; use a new context to test
          // the persisted preference without overriding it on reload.
          const persistent = await browser.newContext({
            storageState: await context.storageState(),
            viewport: { width: 390, height: 844 }
          });
          const p = await persistent.newPage();
          await p.goto(`${webOrigin}/admin/taxonomy`);
          await p.locator('main h1').waitFor();
          assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), 'dark');
          await persistent.close();
          checks.push(
            'Mobile navigation and real theme menu with preference restored on new document'
          );
        }
      );
      const operationsDb = new Client({ connectionString: pgUrl.toString() });
      await operationsDb.connect();
      try {
        await adminOperationsCases({ t, api, pg: operationsDb, mongo, id, page, goto, output,apiBase:base });
        await adminSessionTransitions({t,browser,output,origin:webOrigin});
      } finally {
        await operationsDb.end();
      }
    } finally {
      await browser?.close();
      for (const child of children) {
        if (process.platform === 'win32')
          spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
            windowsHide: true,
            stdio: 'ignore'
          });
        else child.kill('SIGTERM');
      }
      await mongo.connect();
      await mongo.db().dropDatabase();
      await mongo.close();
      await adminDb.query(`drop database if exists ${dbName} with (force)`);
      await adminDb.end();
      await mkdir(output, { recursive: true });
      await writeFile(
        path.join(output, 'browser-checks.json'),
        JSON.stringify({ sourceSha,sourceTreeDirty,apiOrigin:base,webOrigin,checks, errors, isolatedDatabase: dbName, cleanedUp: true }, null, 2)
      );
      await writeFile(path.join(output, 'test-server.log'), logs.join(''));
    }
  }
);
