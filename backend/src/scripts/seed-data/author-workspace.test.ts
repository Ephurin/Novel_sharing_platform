import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { seedAuthors, seedNovels, seedReaders, seedUuid, slugify } from './author-workspace.js';

describe('author workspace seed data', () => {
  test('has the agreed size: 7 authors, 20 readers, 58 novels', () => {
    assert.equal(seedAuthors.length, 7);
    assert.equal(seedReaders.length, 20);
    assert.equal(seedNovels.length, 58);
    assert.ok(seedNovels.flatMap((novel) => novel.chapters).length >= 2000);
    const authorKeys = new Set(seedAuthors.map((author) => author.key));
    for (const author of seedAuthors) {
      assert.ok(seedNovels.some((novel) => novel.authorKey === author.key), `${author.key} owns a novel`);
    }
    for (const novel of seedNovels) {
      assert.ok(authorKeys.has(novel.authorKey), `${novel.key} has a seeded author`);
    }
  });

  test('accounts have unique usernames and emails that fit the schema', () => {
    const users = [...seedAuthors, ...seedReaders];
    assert.equal(new Set(users.map((user) => user.username)).size, users.length);
    assert.equal(new Set(users.map((user) => user.email)).size, users.length);
    for (const user of users) assert.ok(user.username.length <= 50, `${user.username} fits varchar(50)`);
  });

  test('generation is deterministic', async () => {
    const { buildNovels } = await import('./generated-novels.js');
    const again = buildNovels();
    assert.deepEqual(
      again.map((novel) => [novel.title, novel.chapters.length, novel.chapters[novel.chapters.length - 1]?.content]),
      seedNovels.map((novel) => [novel.title, novel.chapters.length, novel.chapters[novel.chapters.length - 1]?.content])
    );
  });

  test('covers the novel and chapter states the author pages show', () => {
    const chapters = seedNovels.flatMap((novel) => novel.chapters);
    assert.ok(seedNovels.some((novel) => novel.status === 'DRAFT'), 'a draft novel');
    assert.ok(seedNovels.some((novel) => novel.serialStatus === 'COMPLETED'), 'a completed novel');
    assert.ok(seedNovels.some((novel) => novel.status === 'PUBLISHED' && novel.serialStatus === 'ONGOING'), 'an ongoing novel');
    assert.ok(chapters.some((chapter) => chapter.priceCoins > 0), 'a VIP chapter');
    assert.ok(
      seedNovels.some((novel) => novel.status === 'PUBLISHED' && novel.chapters.some((chapter) => chapter.status === 'DRAFT')),
      'a draft chapter in a published novel'
    );
    assert.ok(seedNovels.some((novel) => novel.context), 'story context for the IDE');
  });

  test('novels and chapters fit the schema', () => {
    const slugs = new Set<string>();
    const chapterKeys = new Set<string>();
    for (const novel of seedNovels) {
      assert.ok(!slugs.has(novel.slug), `duplicate slug ${novel.slug}`);
      slugs.add(novel.slug);
      assert.equal(novel.slug, slugify(novel.slug), `${novel.key} slug is slug-shaped`);

      for (const [index, chapter] of novel.chapters.entries()) {
        assert.ok(!chapterKeys.has(chapter.key), `duplicate chapter key ${chapter.key}`);
        chapterKeys.add(chapter.key);
        assert.ok(chapter.title.length <= 100, `${chapter.key} title fits varchar(100)`);
        assert.ok(chapter.title.startsWith(`Chương ${index + 1}:`), `${chapter.key} title numbering`);
        assert.ok(chapter.content.trim().length > 0, `${chapter.key} has content`);
        assert.equal(chapter.publishedDaysAgo === null, chapter.status === 'DRAFT', `${chapter.key} publish date`);
        if (novel.status === 'DRAFT') assert.equal(chapter.status, 'DRAFT', `${chapter.key} is draft in a draft novel`);
      }

      const published = novel.chapters.filter((chapter) => chapter.publishedDaysAgo !== null);
      for (let index = 1; index < published.length; index++) {
        assert.ok(
          (published[index].publishedDaysAgo ?? 0) < (published[index - 1].publishedDaysAgo ?? 0),
          `${novel.key} chapters publish in order`
        );
      }
      if (published.length) {
        assert.ok((published[0].publishedDaysAgo ?? 0) < novel.createdDaysAgo, `${novel.key} first chapter after creation`);
      }
    }
  });

  test('story context references existing characters and chapters', () => {
    for (const novel of seedNovels) {
      const context = novel.context;
      if (!context) continue;
      const chapterKeys = new Set(novel.chapters.map((chapter) => chapter.key));
      const characterKeys = new Set(context.characters.map((character) => character.key));
      assert.equal(characterKeys.size, context.characters.length, `${novel.key} character keys are unique`);

      for (const relationship of context.relationships) {
        assert.ok(characterKeys.has(relationship.source) && characterKeys.has(relationship.target), `${novel.key} relationship`);
        assert.notEqual(relationship.source, relationship.target);
      }
      for (const event of context.timeline) {
        assert.ok(chapterKeys.has(event.chapterKey), `${novel.key} timeline chapter ${event.chapterKey}`);
      }
      const arcNames = context.summaries.flatMap((summary) => (summary.scope === 'ARC' ? [summary.arcName] : []));
      assert.equal(new Set(arcNames).size, arcNames.length, `${novel.key} arc names are unique`);
      for (const summary of context.summaries) {
        if (summary.scope === 'CHAPTER') assert.ok(chapterKeys.has(summary.chapterKey), `${novel.key} chapter summary`);
        if (summary.scope === 'ARC') {
          assert.ok(summary.startChapter >= 1 && summary.endChapter <= novel.chapters.length, `${novel.key} arc range`);
        }
      }
      assert.ok(context.summaries.filter((summary) => summary.scope === 'NOVEL').length <= 1);
    }
  });

  test('seedUuid is deterministic and UUID-shaped', () => {
    assert.equal(seedUuid('novel:gio-thoang'), seedUuid('novel:gio-thoang'));
    assert.notEqual(seedUuid('novel:gio-thoang'), seedUuid('novel:dem-mua'));
    assert.match(seedUuid('x'), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  test('slugify strips Vietnamese diacritics', () => {
    assert.equal(slugify('Huyền bí'), 'huyen-bi');
    assert.equal(slugify('Đô thị'), 'do-thi');
  });
});
