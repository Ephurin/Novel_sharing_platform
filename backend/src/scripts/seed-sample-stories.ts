import { withPostgresTransaction } from '../core/database/transaction.js';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { disconnectPostgres, getPostgresPool } from '../core/database/postgres.js';

type ChapterSeed = {
  title: string;
  content: string;
};

type StorySeed = {
  novelId: string;
  directoryName: string;
  title: string;
  slug: string;
  synopsis: string;
  genre: string;
  tags: string[];
  chapterIds: string[];
};

const currentFile = fileURLToPath(import.meta.url);
const backendDirectory = path.resolve(path.dirname(currentFile), '..', '..');
const workspaceDirectory = path.resolve(backendDirectory, '..');
const assetsDirectory = path.join(workspaceDirectory, 'docs', 'Assets');

const storySeeds: StorySeed[] = [
  {
    novelId: '81b923d7-5507-48ea-9a84-5303fd1de5f4',
    directoryName: 'test_story',
    title: 'Ashenhold - Sample Story',
    slug: 'sample-ashenhold-test-story',
    synopsis:
      'A sample fantasy novel used for local reader and author workflow testing. It follows Kael Draven after the fall of Ashenhold, with published chapters available for search, detail, chapter reading, history, library, and interaction checks.',
    genre: 'Fantasy',
    tags: ['sample', 'fantasy', 'test-story'],
    chapterIds: [
      'c660bede-0493-4a46-97f2-6d01c8ddd3db',
      '4332c8ab-b251-4cc0-ac91-329844c73501',
      '667a2512-a046-4775-b41e-9b9d7e283880',
      'ccb10a72-ce54-471e-b74e-2a2a4962a05e',
      '69cfb8d6-49db-4d0a-8f10-9e36e52b5853',
      'ec0f5295-c4dc-4c85-9429-5a8b813f9bfa',
      '111ab376-6c55-4215-8fc3-242b57ba9a4b',
      '72021191-d589-4df4-a948-8dc25f313a2b',
      'f811e73f-45b0-4017-99cc-ef75a6ea97e0',
      'e30f7437-467b-4b3d-94fe-796ed9970499'
    ]
  },
  {
    novelId: '451e1280-214c-4500-980b-34b9af0989eb',
    directoryName: 'test_story_2',
    title: 'Thanh Van Sword Path - Sample Story',
    slug: 'sample-thanh-van-test-story',
    synopsis:
      'A second sample cultivation fantasy novel used for local reader workflow testing. It provides a smaller published story set for validating search, reader detail, chapter content, comments, library, and reading history flows.',
    genre: 'Cultivation',
    tags: ['sample', 'cultivation', 'test-story'],
    chapterIds: [
      'd5dfd32b-a71e-48ce-b665-9d70624e9735',
      '1c9d99b6-215e-41f7-a144-b91eed06ba02',
      '6f42eb9a-1660-429b-8d2a-2ccca8f353f5'
    ]
  }
];

const demoUsers = [
  {
    email: 'reader02@example.com',
    username: 'reader02',
    role: 'ADMIN',
    displayName: 'Reader 02 Admin',
    walletCoins: 0
  },
  {
    email: 'reader03@example.com',
    username: 'reader03',
    role: 'AUTHOR',
    displayName: 'Reader 03 Author',
    walletCoins: 500
  },
  {
    email: 'reader04@example.com',
    username: 'reader04',
    role: 'READER',
    displayName: 'Reader 04 Reader',
    walletCoins: 1000
  },
  {
    email: 'reader05@example.com',
    username: 'reader05',
    role: 'READER',
    displayName: 'Reader 05 Reader',
    walletCoins: 1000
  }
] as const;

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

async function ensureDemoUsers() {
  return withPostgresTransaction(async client=>{
  const passwordHash = await bcrypt.hash('StrongPassword123!', 12);
  let authorId = '';

  for (const user of demoUsers) {
    const result = await client.query(
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
    const userId = result.rows[0].user_id as string;
    if(user.role==='ADMIN')await client.query("insert into admin_access(user_id,scope) values($1,'SUPER_ADMIN') on conflict(user_id) do nothing",[userId]);

    await client.query(
      `
        insert into user_profiles (user_id, display_name, bio)
        values ($1, $2, $3)
        on conflict (user_id) do update
        set display_name = excluded.display_name,
            bio = excluded.bio,
            updated_at = now()
      `,
      [userId, user.displayName, `Demo ${user.role.toLowerCase()} account for Docker/system testing.`]
    );

    await client.query(
      `
        insert into wallets (user_id, coins_balance)
        values ($1, $2)
        on conflict (user_id) do update
        set coins_balance = greatest(wallets.coins_balance, excluded.coins_balance),
            updated_at = now()
      `,
      [userId, user.walletCoins]
    );

    if (user.username === 'reader03') {
      authorId = userId;
    }
  }

  return authorId;
  });
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
    await client.query('delete from novels where slug = $1 and novel_id <> $2', [story.slug, story.novelId]);
    const novelResult = await client.query(
      `
        insert into novels (
          novel_id, author_id, title, slug, synopsis, genre_id, serial_status, status,
          age_rating, chapters_count, published_at, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, 'ONGOING', 'PUBLISHED', 'TEEN', 0, now(), now())
        on conflict (novel_id) do update
        set author_id = excluded.author_id,
            title = excluded.title,
            synopsis = excluded.synopsis,
            slug = excluded.slug,
            genre_id = excluded.genre_id,
            serial_status = 'ONGOING',
            status = 'PUBLISHED',
            age_rating = 'TEEN',
            published_at = coalesce(novels.published_at, now()),
            deleted_at = null,
            updated_at = now()
        returning novel_id
      `,
      [story.novelId, authorId, story.title, story.slug, story.synopsis, genreId]
    );
    const novelId = novelResult.rows[0].novel_id as string;

    await client.query('delete from plot_summaries where novel_id = $1', [novelId]);
    await client.query('delete from story_timeline_events where novel_id = $1', [novelId]);
    await client.query('delete from character_profiles where novel_id = $1', [novelId]);
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
      const chapterId = story.chapterIds[index];
      if (!chapterId) {
        throw new Error(`Missing fixed chapter UUID for ${story.title} chapter ${index + 1}`);
      }

      await client.query(
        `
          insert into chapters (
            chapter_id, novel_id, title, chapter_number, content, word_count,
            is_vip, price_coins, status, published_at, updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, 'PUBLISHED', now(), now())
        `,
        [
          chapterId,
          novelId,
          chapter.title.slice(0, 100),
          index + 1,
          chapter.content,
          countWords(chapter.content),
          story.directoryName === 'test_story' && index === chapters.length - 1,
          story.directoryName === 'test_story' && index === chapters.length - 1 ? 50 : 0
        ]
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

async function seedAuthoringContext() {
  const contextSeedPath = path.join(
    backendDirectory,
    'src',
    'core',
    'database',
    'seeds',
    'phase-9-5-authoring-context-sample.sql'
  );
  const sql = await readFile(contextSeedPath, 'utf8');
  await getPostgresPool().query(sql);
}

async function main() {
  const authorId = await ensureDemoUsers();
  const seededStories = [];

  for (const story of storySeeds) {
    seededStories.push({
      title: story.title,
      ...(await seedStory(story, authorId))
    });
  }

  await seedAuthoringContext();

  console.table(seededStories);
  console.log(`Seed author: ${authorId}`);
}

try {
  await main();
} finally {
  await disconnectPostgres();
}
