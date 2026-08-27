import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { disconnectPostgres, getPostgresPool } from '../core/database/postgres.js';

type ChapterSeed = {
  title: string;
  content: string;
};

type StorySeed = {
  directoryName: string;
  title: string;
  slug: string;
  synopsis: string;
  genre: string;
  tags: string[];
};

const currentFile = fileURLToPath(import.meta.url);
const backendDirectory = path.resolve(path.dirname(currentFile), '..', '..');
const workspaceDirectory = path.resolve(backendDirectory, '..');
const assetsDirectory = path.join(workspaceDirectory, 'docs', 'Assets');

const storySeeds: StorySeed[] = [
  {
    directoryName: 'test_story',
    title: 'Ashenhold - Sample Story',
    slug: 'sample-ashenhold-test-story',
    synopsis:
      'A sample fantasy novel used for local reader and author workflow testing. It follows Kael Draven after the fall of Ashenhold, with published chapters available for search, detail, chapter reading, history, library, and interaction checks.',
    genre: 'Fantasy',
    tags: ['sample', 'fantasy', 'test-story']
  },
  {
    directoryName: 'test_story_2',
    title: 'Thanh Van Sword Path - Sample Story',
    slug: 'sample-thanh-van-test-story',
    synopsis:
      'A second sample cultivation fantasy novel used for local reader workflow testing. It provides a smaller published story set for validating search, reader detail, chapter content, comments, library, and reading history flows.',
    genre: 'Cultivation',
    tags: ['sample', 'cultivation', 'test-story']
  }
];

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function countWords(content: string) {
  return content.trim().split(/\s+/).filter(Boolean).length;
}

function parseChapters(markdown: string) {
  const matches = [...markdown.matchAll(/^#\s+(.+)$/gm)];

  if (!matches.length) {
    return [];
  }

  return matches.map((match, index) => {
    const startIndex = match.index ?? 0;
    const endIndex = matches[index + 1]?.index ?? markdown.length;
    const rawContent = markdown.slice(startIndex, endIndex).trim();

    return {
      title: match[1].trim(),
      content: rawContent
    };
  });
}

function chapterNumberFromFileName(fileName: string) {
  const match = fileName.match(/chapter(?:s)?_(\d+)/);
  return match ? Number(match[1]) : 9999;
}

async function readStoryChapters(directoryName: string) {
  const storyDirectory = path.join(assetsDirectory, directoryName);
  const fileNames = (await readdir(storyDirectory))
    .filter((fileName) => fileName.endsWith('.md'))
    .sort((left, right) => chapterNumberFromFileName(left) - chapterNumberFromFileName(right));
  const chapters: ChapterSeed[] = [];

  for (const fileName of fileNames) {
    const markdown = await readFile(path.join(storyDirectory, fileName), 'utf8');
    chapters.push(...parseChapters(markdown));
  }

  return chapters;
}

async function findSeedAuthorId() {
  const result = await getPostgresPool().query(
    `
      select user_id
      from users
      where deleted_at is null
        and status = 'ACTIVE'
      order by case role when 'AUTHOR' then 0 when 'ADMIN' then 1 else 2 end, created_at asc
      limit 1
    `
  );

  if (result.rows[0]?.user_id) {
    return result.rows[0].user_id as string;
  }

  const created = await getPostgresPool().query(
    `
      insert into users (email, username, role, status)
      values ('sample-author@example.com', 'sample_author', 'AUTHOR', 'ACTIVE')
      on conflict (username) do update set role = 'AUTHOR', status = 'ACTIVE', updated_at = now()
      returning user_id
    `
  );

  await getPostgresPool().query(
    `
      insert into user_profiles (user_id, display_name, bio)
      values ($1, 'Sample Author', 'Seed author for local demo stories.')
      on conflict (user_id) do nothing
    `,
    [created.rows[0].user_id]
  );

  await getPostgresPool().query(
    `
      insert into wallets (user_id)
      values ($1)
      on conflict (user_id) do nothing
    `,
    [created.rows[0].user_id]
  );

  return created.rows[0].user_id as string;
}

async function upsertGenre(name: string) {
  const result = await getPostgresPool().query(
    `
      insert into genres (name, slug)
      values ($1, $2)
      on conflict (slug) do update set name = excluded.name
      returning genre_id
    `,
    [name, slugify(name)]
  );

  return result.rows[0].genre_id as string;
}

async function upsertTag(name: string) {
  const result = await getPostgresPool().query(
    `
      insert into tags (name, slug)
      values ($1, $2)
      on conflict (slug) do update set name = excluded.name
      returning tag_id
    `,
    [name, slugify(name)]
  );

  return result.rows[0].tag_id as string;
}

async function seedStory(story: StorySeed, authorId: string) {
  const chapters = await readStoryChapters(story.directoryName);

  if (!chapters.length) {
    throw new Error(`No chapters found in docs/Assets/${story.directoryName}`);
  }

  const pool = getPostgresPool();
  const client = await pool.connect();

  try {
    await client.query('begin');

    const genreId = await upsertGenre(story.genre);
    const novelResult = await client.query(
      `
        insert into novels (
          author_id, title, slug, synopsis, genre_id, serial_status, status,
          age_rating, chapters_count, published_at, updated_at
        )
        values ($1, $2, $3, $4, $5, 'ONGOING', 'PUBLISHED', 'TEEN', 0, now(), now())
        on conflict (slug) do update
        set author_id = excluded.author_id,
            title = excluded.title,
            synopsis = excluded.synopsis,
            genre_id = excluded.genre_id,
            serial_status = 'ONGOING',
            status = 'PUBLISHED',
            age_rating = 'TEEN',
            published_at = coalesce(novels.published_at, now()),
            deleted_at = null,
            updated_at = now()
        returning novel_id
      `,
      [authorId, story.title, story.slug, story.synopsis, genreId]
    );
    const novelId = novelResult.rows[0].novel_id as string;

    await client.query('delete from novel_tags where novel_id = $1', [novelId]);
    for (const tagName of story.tags) {
      const tagId = await upsertTag(tagName);
      await client.query(
        'insert into novel_tags (novel_id, tag_id) values ($1, $2) on conflict do nothing',
        [novelId, tagId]
      );
    }

    await client.query('delete from chapters where novel_id = $1', [novelId]);

    for (const [index, chapter] of chapters.entries()) {
      await client.query(
        `
          insert into chapters (
            novel_id, title, chapter_number, content, word_count,
            is_vip, price_coins, status, published_at, updated_at
          )
          values ($1, $2, $3, $4, $5, false, 0, 'PUBLISHED', now(), now())
        `,
        [novelId, chapter.title.slice(0, 100), index + 1, chapter.content, countWords(chapter.content)]
      );
    }

    await client.query(
      `
        update novels
        set chapters_count = $2,
            status = 'PUBLISHED',
            published_at = coalesce(published_at, now()),
            updated_at = now()
        where novel_id = $1
      `,
      [novelId, chapters.length]
    );

    await client.query('commit');
    return { novelId, chaptersCount: chapters.length };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const authorId = await findSeedAuthorId();
  const seededStories = [];

  for (const story of storySeeds) {
    seededStories.push({
      title: story.title,
      ...(await seedStory(story, authorId))
    });
  }

  console.table(seededStories);
  console.log(`Seed author: ${authorId}`);
}

try {
  await main();
} finally {
  await disconnectPostgres();
}
