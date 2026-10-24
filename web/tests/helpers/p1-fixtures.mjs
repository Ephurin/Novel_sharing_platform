import assert from 'node:assert/strict';
import { until, hash } from './p1-real-stack.mjs';

export function fixtures(h) {
  const { api, sql, page } = h;
  const editor = () => page.locator('textarea.sc-manuscript');
  const ide = (novel, chapter) => `${h.origin}/author/ide?novelId=${novel}${chapter ? '&chapterId=' + chapter : ''}`;
  const login = async account => {
    await page.goto(h.origin + '/login');
    await page.getByLabel('Email or username', { exact: true }).fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill(account.password);
    const response = page.waitForResponse(r => r.url().endsWith('/api/v1/auth/login') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    assert.equal((await response).status(), 200);
    await page.waitForURL(/\/(author|reader|admin)(?:\/|$)/);
  };
  const chapterState = async id => ({
    draft: await h.mongo.collection('draft_chapters').findOne({ chapterId: id }),
    chapter: (await sql('SELECT chapter_id,novel_id,latest_revision_id FROM chapters WHERE chapter_id=$1', [id]))[0],
    revisions: await sql('SELECT * FROM chapter_revisions WHERE chapter_id=$1 ORDER BY created_at,revision_id', [id]),
    outbox: await sql('SELECT * FROM revision_outbox_events WHERE chapter_id=$1 ORDER BY created_at,event_id', [id]),
  });
  const changed = async (id, content, previous) => {
    await until(async () => (await chapterState(id)).draft?.content === content, 'Mongo draft did not persist');
    await until(async () => (await chapterState(id)).outbox.every(event => event.status === 'COMPLETED'),
      'Outbox must finish before capturing a negative-case durable baseline');
    const value = await chapterState(id);
    assert.equal(value.draft.content, content);
    assert.equal(value.draft.version, previous.draft.version + 1);
    assert.equal(value.revisions.length, previous.revisions.length + 1);
    const revision = value.revisions.find(r => r.revision_id === value.chapter.latest_revision_id);
    assert.equal(revision.content, content); assert.equal(revision.content_hash, hash(content));
    assert.equal(revision.parent_revision_id, previous.chapter.latest_revision_id);
    assert.deepEqual(value.revisions.filter(r => r.revision_id !== revision.revision_id), previous.revisions);
    assert.equal(value.outbox.filter(o => o.revision_id === revision.revision_id).length, 1);
    assert.equal(value.outbox.length, previous.outbox.length + 1);
    const event = value.outbox.find(o => o.revision_id === revision.revision_id);
    assert.equal(event.event_type, 'INCREMENTAL_ANALYSIS'); assert.equal(event.content_hash, revision.content_hash);
    assert.equal(event.novel_id, value.chapter.novel_id); assert.equal(event.created_by, revision.created_by);
    assert.deepEqual(value.outbox.filter(o => o.revision_id !== revision.revision_id), previous.outbox);
    return value;
  };
  const patchResponse = id => page.waitForResponse(r => r.url().endsWith('/api/v1/chapters/' + id) && r.request().method() === 'PATCH');
  const leave = () => page.once('dialog', dialog => dialog.accept());
  async function seed() {
    await api('GET', '/health');
    const a = await h.account('AUTHOR'), b = await h.account('AUTHOR');
    const novel = async (title, account) => (await api('POST', '/novels', { title, synopsis: 'Owned offline fixture' }, account.token)).data.novelId;
    const novelA = await novel('P1 primary manuscript ' + a.userId.slice(0, 8), a);
    const novelOther = await novel('P1 other manuscript ' + a.userId.slice(0, 8), a);
    const novelB = await novel('P1 foreign manuscript ' + b.userId.slice(0, 8), b);
    const chapter = async (id, title, content, account) => (await api('POST', `/novels/${id}/chapters`, { title, content }, account.token)).data.chapterId;
    const first = await chapter(novelA, 'Chapter Alpha', 'bản thảo ban đầu.', a);
    const second = await chapter(novelA, 'Chapter Beta', 'chương thứ hai.', a);
    const foreign = await chapter(novelB, 'Foreign Chapter', 'bản thảo tác giả khác.', b);
    await chapter(novelOther, 'Other Chapter', 'bản thảo tác phẩm khác.', a);
    const revision = (await api('POST', `/chapters/${first}/revisions/snapshot`, { content: 'bản thảo ban đầu.', purpose: 'MANUSCRIPT_BOOTSTRAP' }, a.token)).data;
    const boot = (await api('POST', '/ai/story-brains/bootstrap/from-manuscript', { novel_id: novelA,
      revisions: [{ chapter_id: first, revision_id: revision.revisionId, content_hash: revision.contentHash }] }, a.token)).data;
    await until(async () => {
      const job = (await api('GET', '/ai/jobs/' + boot.job_id, undefined, a.token)).data;
      assert.notEqual(job.status, 'failed', JSON.stringify(job)); return job.status === 'waiting_review';
    }, 'Empty baseline bootstrap did not reach review');
    const reviews = (await api('GET', `/ai/story-brains/${novelA}/entity-reviews`, undefined, a.token)).data;
    for (const review of reviews) {
      assert.equal(review.candidates.length, 0, 'Fixture baseline must have no named identities; UI acceptance follows later');
      await api('POST', `/ai/story-brains/${novelA}/entity-reviews/${review.analysis_run_id}/review`,
        { expected_version: review.review_version, decisions: [], finalize: true }, a.token);
      await api('POST', `/ai/story-brains/${novelA}/entity-reviews/${review.analysis_run_id}/continue`, {}, a.token);
    }
    await api('POST', `/ai/story-brains/${novelA}/baseline/activate`, { job_id: boot.job_id }, a.token);
    const memory = (await api('GET', `/ai/story-brains/${novelA}/memory`, undefined, a.token)).data;
    assert.deepEqual(memory.entities, []); assert.deepEqual(memory.events, []); assert.equal(memory.brain_version, 1);
    return { a, b, novelA, novelOther, novelB, first, second, foreign, owned: [novelA, novelOther, novelB] };
  }
  return { seed, login, chapterState, changed, patchResponse, leave, editor, ide };
}
