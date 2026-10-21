import bcrypt from 'bcryptjs';
import type { PoolClient } from 'pg';
import { disconnectPostgres } from '../core/database/postgres.js';
import { withPostgresTransaction } from '../core/database/transaction.js';
import {
  SEED_PASSWORD,
  countWords,
  seedAuthors,
  seedNovels,
  seedReaders,
  seedUuid,
  slugify,
  type SeedNovel,
  type SeedUser
} from './seed-data/author-workspace.js';

// Seeds story data for the author workspace pages: seven authors with 58 novels, their chapters and
// story context, plus 20 plain reader accounts. No views, likes, follows or wallet history; every
// account gets an empty wallet, as registration would create.
// Separate from seed-sample-stories.ts, which backs the frozen defense demo and is not touched.
// Re-runnable: accounts and novels are upserted by fixed IDs; each seeded novel's chapters and
// story context are reset to the seed content.

const DAY_MS = 86_400_000;
const runAt = Date.now();
const daysAgo = (days: number) => new Date(runAt - days * DAY_MS);

async function upsertUser(client: PoolClient, user: SeedUser, passwordHash: string) {
  const userResult = await client.query(
    `
      insert into users (email, username, password_hash, role, status)
      values ($1, $2, $3, $4::user_role, 'ACTIVE')
      on conflict (username) do update
      set email = excluded.email,
          password_hash = excluded.password_hash,
          role = excluded.role,
          status = 'ACTIVE',
          deleted_at = null,
          updated_at = now()
      returning user_id
    `,
    [user.email, user.username, passwordHash, user.role]
  );
  const userId = userResult.rows[0].user_id as string;

  await client.query(
    `
      insert into user_profiles (user_id, display_name, bio, avatar_url)
      values ($1, $2, $3, $4)
      on conflict (user_id) do update
      set display_name = excluded.display_name,
          bio = excluded.bio,
          avatar_url = excluded.avatar_url,
          updated_at = now()
    `,
    [userId, user.displayName, user.bio, user.avatarUrl]
  );
  await client.query('insert into wallets (user_id) values ($1) on conflict (user_id) do nothing', [userId]);

  return userId;
}

async function upsertNamed(client: PoolClient, table: 'genres' | 'tags', name: string) {
  const idColumn = table === 'genres' ? 'genre_id' : 'tag_id';
  const result = await client.query(
    `
      insert into ${table} (name, slug)
      values ($1, $2)
      on conflict (slug) do update set name = excluded.name
      returning ${idColumn} as id
    `,
    [name, slugify(name)]
  );
  return result.rows[0].id as string;
}

async function seedNovel(client: PoolClient, novel: SeedNovel, authorId: string) {
  const novelId = seedUuid(`novel:${novel.key}`);
  const genreId = await upsertNamed(client, 'genres', novel.genre);
  const publishedDays = novel.chapters
    .map((chapter) => chapter.publishedDaysAgo)
    .filter((days): days is number => days !== null);
  const publishedAt = novel.status === 'PUBLISHED' && publishedDays.length ? daysAgo(Math.max(...publishedDays)) : null;
  const updatedAt = publishedDays.length ? daysAgo(Math.min(...publishedDays)) : daysAgo(1);

  await client.query(
    `
      insert into novels (
        novel_id, author_id, title, slug, synopsis, cover_image_url, genre_id, serial_status, status,
        age_rating, published_at, created_at, updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8::novel_serial_status, $9::novel_status, $10::age_rating, $11, $12, $13)
      on conflict (novel_id) do update
      set author_id = excluded.author_id,
          title = excluded.title,
          slug = excluded.slug,
          synopsis = excluded.synopsis,
          cover_image_url = excluded.cover_image_url,
          genre_id = excluded.genre_id,
          serial_status = excluded.serial_status,
          status = excluded.status,
          age_rating = excluded.age_rating,
          published_at = excluded.published_at,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          deleted_at = null
    `,
    [
      novelId,
      authorId,
      novel.title,
      novel.slug,
      novel.synopsis,
      novel.coverImageUrl,
      genreId,
      novel.serialStatus,
      novel.status,
      novel.ageRating,
      publishedAt,
      daysAgo(novel.createdDaysAgo),
      updatedAt
    ]
  );

  await client.query('delete from novel_tags where novel_id = $1', [novelId]);
  for (const tagName of novel.tags) {
    const tagId = await upsertNamed(client, 'tags', tagName);
    await client.query('insert into novel_tags (novel_id, tag_id) values ($1, $2) on conflict do nothing', [novelId, tagId]);
  }

  const chapterIds = new Map(novel.chapters.map((chapter) => [chapter.key, seedUuid(`chapter:${chapter.key}`)]));
  // The seed owns these novels: drop chapters that are not part of the seed content.
  await client.query('delete from chapters where novel_id = $1 and chapter_id <> all($2::uuid[])', [novelId, [...chapterIds.values()]]);

  for (const [index, chapter] of novel.chapters.entries()) {
    const chapterPublishedAt = chapter.publishedDaysAgo === null ? null : daysAgo(chapter.publishedDaysAgo);
    await client.query(
      `
        insert into chapters (
          chapter_id, novel_id, title, chapter_number, content, word_count,
          is_vip, price_coins, status, published_at, created_at, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9::chapter_status, $10, $11, $11)
        on conflict (chapter_id) do update
        set title = excluded.title,
            chapter_number = excluded.chapter_number,
            content = excluded.content,
            word_count = excluded.word_count,
            is_vip = excluded.is_vip,
            price_coins = excluded.price_coins,
            status = excluded.status,
            published_at = excluded.published_at,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at,
            deleted_at = null
      `,
      [
        chapterIds.get(chapter.key),
        novelId,
        chapter.title,
        index + 1,
        chapter.content,
        countWords(chapter.content),
        chapter.priceCoins > 0,
        chapter.priceCoins,
        chapter.status,
        chapterPublishedAt,
        chapterPublishedAt ?? daysAgo(1)
      ]
    );
  }

  await client.query(
    'update novels set chapters_count = (select count(*) from chapters where novel_id = $1 and deleted_at is null) where novel_id = $1',
    [novelId]
  );

  if (novel.context) {
    await seedStoryContext(client, novel, novelId, authorId, chapterIds);
  }
}

async function seedStoryContext(
  client: PoolClient,
  novel: SeedNovel,
  novelId: string,
  authorId: string,
  chapterIds: Map<string, string>
) {
  const context = novel.context;
  if (!context) return;

  // Relationships cascade with character_profiles.
  await client.query('delete from plot_summaries where novel_id = $1', [novelId]);
  await client.query('delete from story_timeline_events where novel_id = $1', [novelId]);
  await client.query('delete from character_profiles where novel_id = $1', [novelId]);

  const characterIds = new Map<string, string>();
  for (const character of context.characters) {
    const characterId = seedUuid(`character:${novel.key}:${character.key}`);
    characterIds.set(character.key, characterId);
    await client.query(
      `
        insert into character_profiles (
          character_id, novel_id, name, role, personality, description, notes, created_by, updated_by
        )
        values ($1, $2, $3, $4::character_role, $5, $6, $7, $8, $8)
      `,
      [
        characterId,
        novelId,
        character.name,
        character.role,
        character.personality,
        `[Thân phận: ${character.customTitle}]\n${character.description}`,
        character.notes,
        authorId
      ]
    );
  }

  const chapterId = (key: string) => {
    const id = chapterIds.get(key);
    if (!id) throw new Error(`Unknown chapter ${key} in ${novel.key} story context`);
    return id;
  };
  const characterId = (key: string) => {
    const id = characterIds.get(key);
    if (!id) throw new Error(`Unknown character ${key} in ${novel.key} story context`);
    return id;
  };

  for (const relationship of context.relationships) {
    await client.query(
      `
        insert into character_relationships (novel_id, source_character_id, target_character_id, relationship_type, description)
        values ($1, $2, $3, $4, $5)
      `,
      [novelId, characterId(relationship.source), characterId(relationship.target), relationship.type, relationship.description]
    );
  }

  for (const [index, event] of context.timeline.entries()) {
    await client.query(
      `
        insert into story_timeline_events (novel_id, chapter_id, title, event_order, summary, created_by, updated_by)
        values ($1, $2, $3, $4, $5, $6, $6)
      `,
      [novelId, chapterId(event.chapterKey), event.title, index + 1, event.summary, authorId]
    );
  }

  for (const summary of context.summaries) {
    await client.query(
      `
        insert into plot_summaries (
          novel_id, chapter_id, scope, arc_name, start_chapter_number, end_chapter_number, summary, created_by, updated_by
        )
        values ($1, $2, $3::plot_summary_scope, $4, $5, $6, $7, $8, $8)
      `,
      [
        novelId,
        summary.scope === 'CHAPTER' ? chapterId(summary.chapterKey) : null,
        summary.scope,
        summary.scope === 'ARC' ? summary.arcName : null,
        summary.scope === 'ARC' ? summary.startChapter : null,
        summary.scope === 'ARC' ? summary.endChapter : null,
        summary.summary,
        authorId
      ]
    );
  }
}

async function main() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);

  const summary = await withPostgresTransaction(async (client) => {
    const userIds = new Map<string, string>();
    for (const user of [...seedAuthors, ...seedReaders]) {
      userIds.set(user.key, await upsertUser(client, user, passwordHash));
    }
    for (const novel of seedNovels) {
      const authorId = userIds.get(novel.authorKey);
      if (!authorId) throw new Error(`Unknown author ${novel.authorKey} for ${novel.key}`);
      await seedNovel(client, novel, authorId);
    }

    const authors = await client.query(
      `
        select u.username,
               count(distinct n.novel_id)::int as novels,
               count(distinct n.novel_id) filter (where n.status = 'DRAFT')::int as draft_novels,
               count(c.chapter_id)::int as chapters,
               count(c.chapter_id) filter (where c.status = 'DRAFT')::int as draft_chapters,
               (select count(*)::int from character_profiles cp join novels n2 on n2.novel_id = cp.novel_id where n2.author_id = u.user_id) as characters
        from users u
        left join novels n on n.author_id = u.user_id and n.deleted_at is null
        left join chapters c on c.novel_id = n.novel_id and c.deleted_at is null
        where u.user_id = any($1::uuid[])
        group by u.user_id, u.username
        order by u.username
      `,
      [seedAuthors.map((author) => userIds.get(author.key))]
    );
    return authors.rows;
  });

  console.table(summary);
  console.log(`Seed accounts: ${seedAuthors.length} authors, ${seedReaders.length} readers`);
}

try {
  await main();
} finally {
  await disconnectPostgres();
}
