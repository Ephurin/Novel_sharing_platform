import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Called only inside the browser harness's freshly created, uniquely named databases.
export async function adminOperationsCases({ t, api, pg, mongo, id, page, goto, output }) {
  const reason = 'Verified administrative integration test';
  const login = async (n) =>
    (
      await api('/auth/login', {
        method: 'POST',
        body: { identifier: `admin_seed_${n}`, password: 'AdminDemo@2026' }
      })
    ).data.accessToken;
  const report = async (type, targetId, auth) =>
    (
      await api('/reports', {
        method: 'POST',
        auth,
        body: { targetType: type, targetId, reason: 'OTHER', description: reason },
        status: 201
      })
    ).data.moderationReviewId;
  const resolve = async (reviewId, action, decision = 'APPROVED') =>
    api(`/admin/moderation/reviews/${reviewId}/resolve`, {
      method: 'POST',
      body: { decision, action, reason }
    });
  const reader = await login(14),
    owner = await login(1);
  await t.test('operations: audit, account details and immutable history', async () => {
    const rows = (await api('/admin/audit?limit=100')).data;
    assert.ok(rows.some((r) => r.action === 'USER_LOCK'));
    assert.ok(rows.some((r) => r.action === 'WITHDRAW_APPROVED'));
    const detail = (await api(`/admin/users/${id('user:13')}`)).data;
    assert.ok(detail.history.length);
    assert.equal(detail.user.password_hash, undefined);
    await assert.rejects(
      pg.query('update admin_audit set reason=$1 where audit_id=$2', ['tamper', rows[0].audit_id]),
      (e) => e.code === '55000'
    );
    await api(`/admin/users/${id('user:0')}/lock`, {
      method: 'PATCH',
      body: { reason },
      status: 409
    });
    await api(`/admin/users/${id('user:0')}/access`, {
      method: 'PATCH',
      body: { role: 'READER', reason },
      status: 409
    });
    await api(`/admin/users/${id('user:14')}/lock`, {
      method: 'PATCH',
      body: { reason: ' ' },
      status: 400
    });
  });
  await t.test(
    'operations: taxonomy edit, merge preserves associations, only unused deletion',
    async () => {
      const source = (
        await api('/admin/taxonomy/genres', {
          method: 'POST',
          body: { name: 'Operations source genre' },
          status: 201
        })
      ).data;
      const target = (
        await api('/admin/taxonomy/genres', {
          method: 'POST',
          body: { name: 'Operations target genre' },
          status: 201
        })
      ).data;
      await pg.query('insert into novel_genres(novel_id,genre_id) values($1,$2),($1,$3)', [
        id('novel:1'),
        source.genreId,
        target.genreId
      ]);
      await pg.query('update novels set genre_id=$2 where novel_id=$1', [
        id('novel:1'),
        source.genreId
      ]);
      assert.equal(
        (await api('/admin/taxonomy')).data.genres.find((g) => g.genreId === source.genreId)
          .usageCount,
        1
      );
      await api(`/admin/taxonomy/genres/${source.genreId}`, {
        method: 'DELETE',
        body: { confirm: true, reason },
        status: 409
      });
      await api(`/admin/taxonomy/genres/${source.genreId}`, {
        method: 'PATCH',
        body: { name: 'Operations renamed genre', reason }
      });
      await api(`/admin/taxonomy/genres/${source.genreId}/merge`, {
        method: 'POST',
        body: { targetId: target.genreId, confirm: true, reason }
      });
      const row = (await pg.query('select genre_id from novels where novel_id=$1', [id('novel:1')]))
        .rows[0];
      assert.equal(row.genre_id, target.genreId);
      assert.equal(
        (
          await pg.query(
            'select count(*)::int as n from novel_genres where novel_id=$1 and genre_id=$2',
            [id('novel:1'), target.genreId]
          )
        ).rows[0].n,
        1
      );
      const tag = (
        await api('/admin/taxonomy/tags', {
          method: 'POST',
          body: { name: 'Operations unused tag' },
          status: 201
        })
      ).data;
      await api(`/admin/taxonomy/tags/${tag.tagId}`, {
        method: 'DELETE',
        body: { confirm: true, reason }
      });
    }
  );
  await t.test(
    'operations: reported novels hide without publishing, owner-only appeal and safe reversal',
    async () => {
      const chapterId = id('chapter:1:12');
      const before = (
        await pg.query('select deleted_at from chapters where chapter_id=$1', [chapterId])
      ).rows[0];
      await pg.query('update chapters set deleted_at=now() where chapter_id=$1', [chapterId]);
      const hiddenChapter = (
        await pg.query('select deleted_at from chapters where chapter_id=$1', [chapterId])
      ).rows[0];
      const reviewId = await report('NOVEL', id('novel:1'), reader);
      await resolve(reviewId, 'HIDE');
      const novel = (
        await pg.query('select status,deleted_at from novels where novel_id=$1', [id('novel:1')])
      ).rows[0];
      assert.equal(novel.status, 'PUBLISHED');
      assert.ok(novel.deleted_at);
      const decision = (await api('/account/decisions', { auth: owner })).data.find(
        (d) => d.target_id === id('novel:1') && d.active
      );
      assert.ok(decision);
      await api('/account/appeals', {
        method: 'POST',
        auth: reader,
        body: { auditId: decision.audit_id, message: reason },
        status: 404
      });
      const results = await Promise.all(
        [201, 409].map(() => fetchAppeal(api, owner, decision.audit_id, reason))
      );
      assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
      const appeal = (await api('/admin/appeals?status=OPEN')).data.find(
        (a) => a.audit_id === decision.audit_id
      );
      assert.ok(appeal);
      await api(`/admin/appeals/${appeal.appeal_id}/resolve`, {
        method: 'POST',
        body: { decision: 'ACCEPTED', reason }
      });
      await api(`/admin/appeals/${appeal.appeal_id}/resolve`, {
        method: 'POST',
        body: { decision: 'ACCEPTED', reason },
        status: 409
      });
      assert.equal(
        (await pg.query('select deleted_at from novels where novel_id=$1', [id('novel:1')])).rows[0]
          .deleted_at,
        null
      );
      assert.equal(
        (
          await pg.query('select deleted_at from chapters where chapter_id=$1', [chapterId])
        ).rows[0].deleted_at.toISOString(),
        hiddenChapter.deleted_at.toISOString()
      );
      await pg.query('update chapters set deleted_at=$2 where chapter_id=$1', [
        chapterId,
        before.deleted_at
      ]);
    }
  );
  await t.test(
    'operations: warnings and dismissed chapter reports preserve publication',
    async () => {
      const review = await report('NOVEL', id('novel:1'), reader);
      await resolve(review, 'WARN');
      assert.equal(
        (await pg.query('select deleted_at from novels where novel_id=$1', [id('novel:1')])).rows[0]
          .deleted_at,
        null
      );
      const chapter = id('chapter:1:1');
      const before = (
        await pg.query('select status,deleted_at from chapters where chapter_id=$1', [chapter])
      ).rows[0];
      const dismissed = await report('CHAPTER', chapter, reader);
      await resolve(dismissed, 'DISMISS', 'REJECTED');
      assert.deepEqual(
        (await pg.query('select status,deleted_at from chapters where chapter_id=$1', [chapter]))
          .rows[0],
        before
      );
      assert.equal(
        (await pg.query('select status from reports where review_id=$1', [dismissed])).rows[0]
          .status,
        'REJECTED'
      );
    }
  );
  await t.test(
    'operations: locked accounts, restricted appeal sessions, accept and reject semantics',
    async () => {
      const userToken = await login(13);
      const review = await report('USER', id('user:13'), reader);
      await resolve(review, 'LOCK');
      await api('/users/me/profile', { auth: userToken, status: 403 });
      const restricted = (
        await api('/account/appeal-session', {
          method: 'POST',
          body: { identifier: 'admin_seed_13', password: 'AdminDemo@2026' }
        })
      ).data.token;
      await api('/admin/access', { auth: restricted, status: 401 });
      await api('/users/me/profile', { auth: restricted, status: 401 });
      const decision = (await api('/account/decisions', { auth: restricted })).data.find(
        (d) => d.action === 'LOCK' && d.active
      );
      const appeal = (
        await api('/account/appeals', {
          method: 'POST',
          auth: restricted,
          body: { auditId: decision.audit_id, message: reason },
          status: 201
        })
      ).data;
      await api(`/admin/appeals/${appeal.appeal_id}/resolve`, {
        method: 'POST',
        body: { decision: 'ACCEPTED', reason }
      });
      await api('/users/me/profile', { auth: userToken });
      const warning = (
        await api(`/admin/users/${id('user:13')}/warn`, { method: 'POST', body: { reason } })
      ).data;
      const declined = (
        await api('/account/appeals', {
          method: 'POST',
          auth: userToken,
          body: { auditId: warning.audit_id, message: reason },
          status: 201
        })
      ).data;
      await api(`/admin/appeals/${declined.appeal_id}/resolve`, {
        method: 'POST',
        body: { decision: 'REJECTED', reason }
      });
      assert.equal(
        (
          await pg.query('select active from admin_sanctions where sanction_id=$1', [
            warning.sanction_id
          ])
        ).rows[0].active,
        true
      );
    }
  );
  await t.test(
    'operations: comment sanctions restore replies and jobs stay idempotent',
    async () => {
      const commentId = randomUUID(),
        replyId = randomUUID();
      const comments = mongo.db().collection('comments');
      await comments.insertMany(
        [
          { commentId, parentCommentId: null, userId: id('user:16') },
          { commentId: replyId, parentCommentId: commentId, userId: id('user:17') }
        ].map((c) => ({
          ...c,
          novelId: id('novel:1'),
          chapterId: null,
          content: 'Operations comment evidence',
          status: 'APPROVED',
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date()
        }))
      );
      const review = await report('COMMENT', commentId, reader);
      await resolve(review, 'HIDE');
      assert.equal((await comments.findOne({ commentId: replyId })).status, 'DELETED');
      const commentOwner = await login(16);
      const decision = (await api('/account/decisions', { auth: commentOwner })).data.find(
        (d) => d.target_id === commentId
      );
      const appeal = (
        await api('/account/appeals', {
          method: 'POST',
          auth: commentOwner,
          body: { auditId: decision.audit_id, message: reason },
          status: 201
        })
      ).data;
      await api(`/admin/appeals/${appeal.appeal_id}/resolve`, {
        method: 'POST',
        body: { decision: 'ACCEPTED', reason }
      });
      assert.equal((await comments.findOne({ commentId })).status, 'APPROVED');
      assert.equal((await comments.findOne({ commentId: replyId })).status, 'APPROVED');
      const n = await mongo.db().collection('notifications').countDocuments();
      await api('/admin/jobs/retry', { method: 'POST', body: {} });
      await api('/admin/jobs/retry', { method: 'POST', body: {} });
      assert.equal(await mongo.db().collection('notifications').countDocuments(), n);
    }
  );
  await t.test(
    'operations: reconciliation guards version/reference and never changes balances',
    async () => {
      const path = `/admin/withdraw-requests/${id('withdraw:3')}/reconciliation`;
      const before = (await pg.query('select * from wallets order by wallet_id')).rows;
      assert.equal((await api(path)).data.state.status, 'UNCONFIRMED');
      await api(path, { method: 'POST', body: { status: 'PROCESSING', version: 0, note: reason } });
      await api(path, {
        method: 'POST',
        body: { status: 'PAID', version: 0, reference: 'OPS-BANK-1', note: reason },
        status: 409
      });
      await api(path, {
        method: 'POST',
        body: { status: 'PAID', version: 1, note: reason },
        status: 422
      });
      await api(path, {
        method: 'POST',
        body: {
          status: 'PAID',
          version: 1,
          reference: 'OPS-BANK-1',
          evidenceUrl: 'https://example.com/evidence',
          note: reason
        }
      });
      await api(path, {
        method: 'POST',
        body: { status: 'PROCESSING', version: 2, note: reason },
        status: 409
      });
      const another = (
        await pg.query(
          "select withdraw_request_id from withdraw_requests where status='SUCCESS' and withdraw_request_id<>$1 limit 1",
          [id('withdraw:3')]
        )
      ).rows[0];
      assert.ok(another);
      await api(`/admin/withdraw-requests/${another.withdraw_request_id}/reconciliation`, {
        method: 'POST',
        body: { status: 'PAID', version: 0, reference: 'ops-bank-1', note: reason },
        status: 409
      });
      assert.equal((await api(path)).data.history.length, 2);
      assert.deepEqual((await pg.query('select * from wallets order by wallet_id')).rows, before);
    }
  );
  await t.test(
    'operations: scope permissions, immediate role changes and concurrent last-admin protection',
    async () => {
      const userId = id('user:20');
      const accessPath = `/admin/users/${userId}/access`;
      await api(accessPath, {
        method: 'PATCH',
        body: { role: 'ADMIN', scope: 'MODERATOR', reason }
      });
      const staff = await login(20);
      await api('/admin/withdraw-requests', { auth: staff, status: 403 });
      await api('/admin/users', { auth: staff, status: 403 });
      await api('/admin/moderation/reviews', { auth: staff });
      await api(accessPath, {
        method: 'PATCH',
        auth: staff,
        body: { role: 'ADMIN', scope: 'SUPER_ADMIN', reason },
        status: 403
      });
      const review = await report('USER', id('user:14'), await login(13));
      await api(`/admin/moderation/reviews/${review}/resolve`, {
        method: 'POST',
        auth: staff,
        body: { decision: 'APPROVED', action: 'LOCK', reason },
        status: 403
      });
      await api(accessPath, { method: 'PATCH', body: { role: 'ADMIN', scope: 'FINANCE', reason } });
      await api('/admin/withdraw-requests', { auth: staff });
    await api(`/novels/${id('novel:1')}`,{method:'PATCH',auth:staff,body:{title:'Forbidden change'},status:403});
    await api('/content-control/check',{method:'POST',auth:staff,body:{targetType:'NOVEL',targetId:id('novel:1'),content:'test',submittedBy:userId},status:403});

      await api('/admin/moderation/reviews', { auth: staff, status: 403 });
      await api(accessPath, {
        method: 'PATCH',
        body: { role: 'ADMIN', scope: 'USER_MANAGER', reason }
      });
      await api(`/admin/users/${id('user:14')}/warn`, {
        method: 'POST',
        auth: staff,
        body: { reason }
      });
      const scopedAudit = (await api('/admin/audit', { auth: staff })).data;
      assert.ok(scopedAudit.length);
      assert.ok(scopedAudit.every((a) => a.actor_id === userId));
      await api(accessPath, { method: 'PATCH', body: { role: 'READER', reason } });
      await api('/admin/access', { auth: staff, status: 403 });
      await api(accessPath, {
        method: 'PATCH',
        body: { role: 'ADMIN', scope: 'SUPER_ADMIN', reason }
      });
      // Both actors race to demote the other. Serialized protection preserves one full admin.
      const base = 'http://localhost:4110/api/v1';
      const rootToken = await page.evaluate(() => localStorage.getItem('ephurin_access_token'));
      const results = await Promise.all(
        [
          [userId, rootToken],
          [id('user:0'), staff]
        ].map(([target, auth]) =>
          fetch(`${base}/admin/users/${target}/access`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${auth}` },
            body: JSON.stringify({ role: 'ADMIN', scope: 'MODERATOR', reason })
          })
        )
      );
      assert.equal(results.filter((r) => r.status === 200).length, 1);
      assert.ok(results.some((r) => [403, 409].includes(r.status)));
      assert.equal(
        (
          await pg.query(
            "select count(*)::int n from users u left join admin_access a using(user_id) where u.role='ADMIN' and u.status='ACTIVE' and coalesce(a.scope,'SUPER_ADMIN')='SUPER_ADMIN'"
          )
        ).rows[0].n,
        1
      );
      // Restore the harness principal using whichever administrator won the race.
      if (
        (
          await pg.query(
            "select coalesce(a.scope,'SUPER_ADMIN') as scope from users u left join admin_access a using(user_id) where user_id=$1",
            [id('user:0')]
          )
        ).rows[0]?.scope !== 'SUPER_ADMIN'
      )
        await api(`/admin/users/${id('user:0')}/access`, {
          method: 'PATCH',
          auth: staff,
          body: { role: 'ADMIN', scope: 'SUPER_ADMIN', reason }
        });
      await api(accessPath, { method: 'PATCH', body: { role: 'READER', reason } });
    }
  );
  await t.test(
    'browser operations: user warning, locked-safe appeal login and admin review',
    async () => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await goto(`/admin/users/${id('user:14')}`);
      await page.getByRole('button', { name: 'Cảnh báo', exact: true }).click();
      await page
        .getByRole('dialog')
        .getByLabel('Lý do xử lý')
        .fill('Cảnh báo kiểm tra luồng khiếu nại trên giao diện');
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Lưu thay đổi', exact: true })
        .click();
      await page.getByRole('alert').filter({ hasText: 'Đã lưu thay đổi.' }).waitFor();
      await goto('/appeals');
      await page.getByRole('button', { name: 'Đổi tài khoản', exact: true }).click();
      await page.getByLabel('Email hoặc tên đăng nhập').fill('admin_seed_14');
      await page.getByLabel('Mật khẩu').fill('AdminDemo@2026');
      await page.getByRole('button', { name: 'Đăng nhập để khiếu nại', exact: true }).click();
      const decision = page
        .locator('.admin-panel')
        .filter({ hasText: 'Cảnh báo kiểm tra luồng khiếu nại trên giao diện' });
      await decision.getByRole('button', { name: 'Gửi khiếu nại', exact: true }).click();
      assert.equal(await page.getByRole('dialog').getByRole('button',{name:'Gửi để xem xét',exact:true}).isDisabled(),true);
      await page
        .getByRole('dialog')
        .getByLabel('Nội dung khiếu nại')
        .fill('Đề nghị xem xét lại cảnh báo này với bằng chứng bổ sung.');
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Gửi để xem xét', exact: true })
        .click();
      await decision.getByText('Chờ xem xét', { exact: true }).waitFor();
      for (const theme of ['light', 'dark'])
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: 1000 });
          await page.evaluate((theme) => {
            window.storycraftTheme.write(theme);
            window.storycraftTheme.apply();
          }, theme);
          await page.waitForFunction(
            (theme) => document.documentElement.dataset.theme === theme,
            theme
          );
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
          );
          await page.screenshot({
            path: `${output}/account-appeals-${theme}-${width}.png`,
            fullPage: true
          });
        }
      await page.setViewportSize({ width: 1440, height: 1000 });
      await goto('/admin/appeals');
      const item = page
        .locator('.admin-case')
        .filter({ hasText: 'Cảnh báo kiểm tra luồng khiếu nại trên giao diện' });
      await item.getByRole('button', { name: 'Chấp nhận khiếu nại', exact: true }).click();
      await page
        .getByRole('dialog')
        .getByLabel('Lý do xử lý')
        .fill('Đã kiểm tra bằng chứng và thu hồi cảnh báo.');
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Lưu kết quả', exact: true })
        .click();
      await page
        .getByRole('alert')
        .filter({ hasText: 'Đã lưu kết quả xử lý khiếu nại.' })
        .waitFor();
      await goto('/appeals');
      await decision.getByText('Đã chấp nhận', { exact: true }).waitFor();
    }
  );
  await t.test(
    'browser operations: taxonomy edits and manual payout confirmation/history',
    async () => {
      const tag = (
        await api('/admin/taxonomy/tags', {
          method: 'POST',
          body: { name: 'UI Operations Tag' },
          status: 201
        })
      ).data;
      await goto('/admin/taxonomy');
      const row = page.locator('.admin-taxonomy-row').filter({ hasText: 'UI Operations Tag' });
      await row.getByRole('button', { name: 'Sửa', exact: true }).click();
      await page
        .getByRole('dialog')
        .getByLabel('Tên', { exact: true })
        .fill('UI Operations Tag Updated');
      await page.getByRole('dialog').getByLabel('Lý do xử lý').fill(reason);
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Lưu thay đổi', exact: true })
        .click();
      await page
        .locator('.admin-taxonomy-row')
        .getByText('# UI Operations Tag Updated', { exact: true })
        .waitFor();
      await api(`/admin/taxonomy/tags/${tag.tagId}`, {
        method: 'DELETE',
        body: { confirm: true, reason }
      });
      const candidate = (
        await pg.query(
          "select wr.withdraw_request_id from withdraw_requests wr left join withdraw_reconciliation r using(withdraw_request_id) where wr.status='SUCCESS' and r.withdraw_request_id is null limit 1"
        )
      ).rows[0];
      assert.ok(candidate);
      await goto(`/admin/withdraws/${candidate.withdraw_request_id}`);
      await page.getByRole('textbox',{name:/Cập nhật đối soát/}).click();
      await page.getByRole('option', { name: 'Đã xác nhận thanh toán', exact: true }).click();
      await page.getByLabel('Mã giao dịch ngân hàng').fill('UI-BANK-RECONCILE-1');
      await page.getByRole('button', { name: 'Xem lại & xác nhận', exact: true }).click();
      await page
        .getByRole('dialog')
        .getByLabel('Lý do xử lý')
        .fill('Đã đối chiếu sao kê thanh toán thủ công.');
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Lưu đối soát', exact: true })
        .click();
      await page.getByRole('alert').filter({ hasText: 'Đã lưu đối soát.' }).waitFor();
      assert.equal(
        (await api(`/admin/withdraw-requests/${candidate.withdraw_request_id}/reconciliation`)).data
          .state.reference,
        'UI-BANK-RECONCILE-1'
      );
      assert.equal(await page.getByRole('textbox',{name:/Cập nhật đối soát/}).count(), 0);
    }
  );
}

// api asserts statuses; concurrent duplicates are read without assuming which wins.
async function fetchAppeal(api, auth, auditId, message) {
  const response = await fetch('http://localhost:4110/api/v1/account/appeals', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${auth}` },
    body: JSON.stringify({ auditId, message })
  });
  return { status: response.status };
}
