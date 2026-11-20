import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ReaderNovel } from './reader-api';
import { HomeNovelCover } from './HomeNovelCover';

const count = (value = 0) => value.toLocaleString('vi-VN');
const statusLabels: Record<string, string> = { ONGOING: 'Đang ra', COMPLETED: 'Hoàn thành', HIATUS: 'Tạm ngưng' };
const primaryGenre = (novel: ReaderNovel) => novel.genres?.[0] || novel.genre || null;
const isCompletedNovel = (novel: ReaderNovel) => (novel.serialStatus ?? novel.status) === 'COMPLETED';
const novelStatusLabel = (novel: ReaderNovel) => statusLabels[novel.serialStatus ?? novel.status ?? ''] ?? 'Đang ra';

type GenreTheme = {
  id: 'cultivation' | 'slice' | 'fantasy' | 'scifi' | 'martial' | 'adventure' | 'mystery' | 'romance' | 'school' | 'default';
  tone: 'peach' | 'cream' | 'sand' | 'terra' | 'warm';
  tagline: string;
};

const GENRE_THEMES: Array<{ match: RegExp; theme: GenreTheme }> = [
  { match: /cultivation|tu tiên|tiên hiệp/i, theme: { id: 'cultivation', tone: 'warm', tagline: 'Vân du & tu luyện' } },
  { match: /đời thường|slice/i, theme: { id: 'slice', tone: 'cream', tagline: 'Nhẹ nhàng & gần gũi' } },
  { match: /fantasy|huyền ảo|kỳ ảo/i, theme: { id: 'fantasy', tone: 'peach', tagline: 'Ma pháp & thế giới lạ' } },
  { match: /khoa học|sci-fi|viễn tưởng/i, theme: { id: 'scifi', tone: 'sand', tagline: 'Tương lai & tinh tú' } },
  { match: /kiếm hiệp|hành động|võ/i, theme: { id: 'martial', tone: 'terra', tagline: 'Giang hồ & khí phách' } },
  { match: /phiêu lưu|hành trình/i, theme: { id: 'adventure', tone: 'warm', tagline: 'Viễn du & khám phá' } },
  { match: /trinh thám|bí ẩn/i, theme: { id: 'mystery', tone: 'sand', tagline: 'Suy luận & dấu vết' } },
  { match: /romcom|lãng mạn|ngôn tình/i, theme: { id: 'romance', tone: 'peach', tagline: 'Cảm xúc & rung động' } },
  { match: /học đường/i, theme: { id: 'school', tone: 'cream', tagline: 'Thanh xuân & kỷ niệm' } },
];

function resolveGenreTheme(name: string): GenreTheme {
  return GENRE_THEMES.find(item => item.match.test(name))?.theme ?? { id: 'default', tone: 'warm', tagline: 'Tuyển chọn đọc hay' };
}

function Icon({ name }: { name: string }) {
  return <span className="material-symbols-outlined" aria-hidden="true">{name}</span>;
}

function GenreArtwork({ id }: { id: GenreTheme['id'] }) {
  switch (id) {
    case 'cultivation':
      return (
        <svg viewBox="0 0 140 96" fill="none" aria-hidden="true">
          <circle cx="104" cy="24" r="14" fill="currentColor" opacity=".14" />
          <path d="M12 88L46 36L72 64L96 30L132 88H12Z" fill="currentColor" opacity=".12" />
          <path d="M26 88L60 44L84 72L108 42L134 88" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity=".45" />
          <path d="M18 34C28 28 42 28 52 34C60 30 70 31 76 36" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".38" />
          <path d="M84 52C92 48 104 48 112 52" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity=".35" />
        </svg>
      );
    case 'slice':
      return (
        <svg viewBox="0 0 140 96" fill="none" aria-hidden="true">
          <rect x="78" y="14" width="46" height="54" rx="6" fill="currentColor" opacity=".08" stroke="currentColor" strokeWidth="1.3" strokeOpacity=".28" />
          <path d="M101 14V68M78 41H124" stroke="currentColor" strokeWidth="1.2" opacity=".24" />
          <path d="M44 48H86V62C86 71 78.8 78 70 78H60C51.2 78 44 71 44 62V48Z" fill="currentColor" opacity=".15" stroke="currentColor" strokeWidth="1.5" strokeOpacity=".55" />
          <path d="M86 53H93C96.5 53 99 55.8 99 59C99 62.2 96.5 65 93 65H86" stroke="currentColor" strokeWidth="1.5" strokeOpacity=".5" />
          <path d="M56 39C56 33 61 33 61 27M69 39C69 33 74 33 74 27" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".45" />
          <path d="M34 82H96" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".35" />
        </svg>
      );
    case 'fantasy':
      return (
        <svg viewBox="0 0 140 96" fill="none" aria-hidden="true">
          <path d="M98 16C88 18.5 82 28 84 38C86 48 95.5 54 105.5 52C98 57.5 87.5 56.5 80.5 49.5C73.5 42.5 73 31 79.5 23.5C84 18.2 91.5 15.5 98 16Z" fill="currentColor" opacity=".18" stroke="currentColor" strokeWidth="1.4" strokeOpacity=".45" />
          <path d="M36 86V52L46 38L56 52V86M62 86V46L74 30L86 46V86M92 86V58L102 46L112 58V86" fill="currentColor" opacity=".1" stroke="currentColor" strokeWidth="1.3" strokeOpacity=".36" />
          <path d="M114 26L116 31L121 33L116 35L114 40L112 35L107 33L112 31L114 26Z" fill="currentColor" opacity=".5" />
          <circle cx="52" cy="24" r="2.2" fill="currentColor" opacity=".4" />
        </svg>
      );
    case 'scifi':
      return (
        <svg viewBox="0 0 140 96" fill="none" aria-hidden="true">
          <circle cx="84" cy="48" r="20" fill="currentColor" opacity=".14" stroke="currentColor" strokeWidth="1.5" strokeOpacity=".45" />
          <ellipse cx="84" cy="48" rx="44" ry="15" transform="rotate(-18 84 48)" stroke="currentColor" strokeWidth="1.5" opacity=".5" />
          <circle cx="116" cy="30" r="4" fill="currentColor" opacity=".45" />
          <circle cx="40" cy="68" r="2.5" fill="currentColor" opacity=".35" />
          <circle cx="54" cy="24" r="2" fill="currentColor" opacity=".35" />
        </svg>
      );
    case 'martial':
      return (
        <svg viewBox="0 0 140 96" fill="none" aria-hidden="true">
          <circle cx="88" cy="46" r="26" fill="currentColor" opacity=".1" />
          <path d="M54 78L114 20M102 20H114V32" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity=".58" />
          <path d="M114 78L54 20M66 20H54V32" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity=".35" />
          <path d="M30 82V36M30 56L20 48M30 46L39 40" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".34" />
        </svg>
      );
    case 'adventure':
      return (
        <svg viewBox="0 0 140 96" fill="none" aria-hidden="true">
          <circle cx="88" cy="46" r="26" fill="currentColor" opacity=".1" stroke="currentColor" strokeWidth="1.4" strokeOpacity=".42" />
          <path d="M88 26L94 46L88 66L82 46L88 26Z" fill="currentColor" opacity=".4" />
          <path d="M68 46H108" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity=".4" />
          <path d="M22 76C34 70 46 70 58 76C70 82 82 82 94 76C106 70 118 70 130 76" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".32" />
        </svg>
      );
    case 'mystery':
      return (
        <svg viewBox="0 0 140 96" fill="none" aria-hidden="true">
          <circle cx="76" cy="42" r="20" fill="currentColor" opacity=".12" stroke="currentColor" strokeWidth="1.7" strokeOpacity=".52" />
          <path d="M91 57L112 78" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" opacity=".55" />
          <path d="M68 36C71 32 77 30.5 82 33" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".48" />
          <circle cx="42" cy="68" r="2.2" fill="currentColor" opacity=".32" />
          <circle cx="52" cy="74" r="2.2" fill="currentColor" opacity=".26" />
        </svg>
      );
    case 'romance':
      return (
        <svg viewBox="0 0 140 96" fill="none" aria-hidden="true">
          <path d="M84 74C84 74 56 57.5 56 38.5C56 29.8 62.8 23.5 71 23.5C76.6 23.5 81.2 26.5 84 30.8C86.8 26.5 91.4 23.5 97 23.5C105.2 23.5 112 29.8 112 38.5C112 57.5 84 74 84 74Z" fill="currentColor" opacity=".15" stroke="currentColor" strokeWidth="1.5" strokeOpacity=".45" strokeLinejoin="round" />
          <circle cx="44" cy="34" r="4" fill="currentColor" opacity=".2" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 140 96" fill="none" aria-hidden="true">
          <path d="M46 28C59 24.5 73 27 84 33C95 27 109 24.5 122 28V72C109 68.5 95 71 84 77C73 71 59 68.5 46 72V28Z" fill="currentColor" opacity=".13" stroke="currentColor" strokeWidth="1.5" strokeOpacity=".45" strokeLinejoin="round" />
          <path d="M84 33V77" stroke="currentColor" strokeWidth="1.4" opacity=".4" />
        </svg>
      );
  }
}

function AuthorAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  const [failed, setFailed] = useState(false);
  const initial = name.trim().slice(0, 1).toUpperCase() || 'T';
  return (
    <span className="sc-home-author-monogram" aria-hidden="true">
      {avatarUrl && !failed ? (
        <img src={avatarUrl} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        initial
      )}
    </span>
  );
}

export function GenreShowcase({
  genres,
  catalogNovels,
  catalogPath,
}: {
  genres: string[];
  catalogNovels: ReaderNovel[];
  catalogPath: string;
}) {
  const items = useMemo(() => {
    const counts = new Map<string, number>();
    for (const novel of catalogNovels) {
      const list = novel.genres?.length ? novel.genres : novel.genre ? [novel.genre] : [];
      for (const g of list) counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    return genres.slice(0, 8).map(name => ({
      name,
      count: counts.get(name) ?? 0,
      theme: resolveGenreTheme(name),
    }));
  }, [genres, catalogNovels]);

  if (items.length === 0) return null;

  return (
    <section className="sc-home-genre-showcase" aria-label="Danh mục thể loại">
      <div className="sc-home-section-heading">
        <div>
          <h2><Icon name="category" />Khám phá theo thể loại</h2>
          <p className="sc-home-section-sub">Mỗi thể loại là một sắc thái đọc khác nhau trong thư viện StoryCraft.</p>
        </div>
        <Link className="sc-home-more" to={catalogPath}>Tất cả thể loại<Icon name="arrow_forward" /></Link>
      </div>
      <div className="sc-home-genre-cards" data-count={Math.min(items.length, 4)}>
        {items.map(item => (
          <Link
            key={item.name}
            className={`sc-home-genre-card is-${item.theme.tone}${item.count === 0 ? ' is-quiet' : ''}`}
            to={`${catalogPath}?genre=${encodeURIComponent(item.name)}`}
          >
            <span className="sc-home-genre-artwork" aria-hidden="true">
              <GenreArtwork id={item.theme.id} />
            </span>
            <span className="sc-home-genre-copy">
              <strong translate="no">{item.name}</strong>
              <span className="sc-home-genre-tagline">{item.theme.tagline}</span>
              <span className="sc-home-genre-count">
                {item.count > 0 ? `${count(item.count)} tác phẩm` : 'Chưa có truyện'}
                <Icon name="arrow_forward" />
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function CuratedShelves({
  catalogNovels,
  excludeIds,
  catalogPath,
}: {
  catalogNovels: ReaderNovel[];
  excludeIds: Set<string>;
  catalogPath: string;
}) {
  const [batch, setBatch] = useState(0);

  const pool = useMemo(() => {
    const fresh = catalogNovels.filter(novel => !excludeIds.has(novel.novelId));
    const source = fresh.length >= 2 ? fresh : catalogNovels;
    return source.slice().sort((a, b) => {
      const scoreA = (a.coverImageUrl ? 2 : 0) + (a.synopsis?.trim() ? 1 : 0);
      const scoreB = (b.coverImageUrl ? 2 : 0) + (b.synopsis?.trim() ? 1 : 0);
      if (scoreB !== scoreA) return scoreB - scoreA;
      return (b.chaptersCount ?? 0) - (a.chaptersCount ?? 0) || (a.viewsCount ?? 0) - (b.viewsCount ?? 0);
    });
  }, [catalogNovels, excludeIds]);

  const selection = useMemo(() => {
    if (pool.length < 2) return null;
    const size = Math.min(5, pool.length);
    const offset = pool.length > size ? (batch * 3) % pool.length : 0;
    const rotated = [...pool.slice(offset), ...pool.slice(0, offset)].slice(0, size);
    const [lead, ...rest] = rotated;
    return { lead, rest };
  }, [pool, batch]);

  if (!selection) return null;

  const { lead, rest } = selection;
  const leadGenre = primaryGenre(lead);
  const canRotate = pool.length > 5;

  return (
    <section className="sc-home-curated" aria-label="Kệ truyện tuyển chọn">
      <div className="sc-home-section-heading">
        <div>
          <h2><Icon name="auto_stories" />Kệ truyện tuyển chọn</h2>
          <p className="sc-home-section-sub">Một tác phẩm nổi bật cùng những gợi ý đọc khác biệt từ thư viện hiện có.</p>
        </div>
        <div className="sc-home-curated-actions">
          {canRotate && (
            <button type="button" className="sc-home-shuffle" onClick={() => setBatch(value => value + 1)}>
              <Icon name="refresh" />
              Đổi tuyển chọn
            </button>
          )}
          <Link className="sc-home-more" to={catalogPath}>Xem thêm<Icon name="arrow_forward" /></Link>
        </div>
      </div>

      <div className="sc-home-curated-layout">
        <article className="sc-home-curated-lead">
          <Link className="sc-home-curated-lead-link" to={`${catalogPath}/novels/${lead.novelId}`}>
            <div className="sc-home-curated-lead-media"><HomeNovelCover novel={lead} size="lead" /></div>
            <div className="sc-home-curated-lead-body">
              <div className="sc-home-curated-lead-tags">
                <span className="sc-home-eyebrow">Tuyển chọn hôm nay</span>
                <span className="sc-home-status-pill" data-completed={isCompletedNovel(lead) || undefined}>{novelStatusLabel(lead)}</span>
                {leadGenre && <span className="sc-home-feature-genre" translate="no">· {leadGenre}</span>}
              </div>
              <h3>{lead.title}</h3>
              {lead.authorName && <p className="sc-home-curated-author">Tác giả: <strong>{lead.authorName}</strong></p>}
              <p className="sc-home-curated-synopsis">
                {lead.synopsis?.trim() || 'Mở trang truyện để đọc chương mới nhất và theo dõi hành trình của tác phẩm này.'}
              </p>
              <div className="sc-home-curated-lead-foot">
                <div className="sc-home-feature-stats">
                  <span><Icon name="menu_book" />{count(lead.chaptersCount)} chương</span>
                  <span><Icon name="visibility" />{count(lead.viewsCount)} lượt đọc</span>
                </div>
                <span className="sc-home-curated-read">Đọc ngay<Icon name="arrow_forward" /></span>
              </div>
            </div>
          </Link>
        </article>

        <div className="sc-home-curated-list">
          {rest.map(novel => {
            const genreName = primaryGenre(novel);
            return (
              <article key={novel.novelId} className="sc-home-curated-item">
                <Link className="sc-home-curated-item-link" to={`${catalogPath}/novels/${novel.novelId}`}>
                  <span className="sc-home-curated-thumb"><HomeNovelCover novel={novel} size="thumb" /></span>
                  <div className="sc-home-curated-item-info">
                    <span className="sc-home-compact-status">
                      <span data-completed={isCompletedNovel(novel) || undefined}>{novelStatusLabel(novel)}</span>
                      {genreName && <span className="sc-home-compact-genre" translate="no"> · {genreName}</span>}
                    </span>
                    <h4>{novel.title}</h4>
                    <span className="sc-home-compact-metrics">
                      {count(novel.chaptersCount)} chương<span>·</span>{count(novel.viewsCount)} lượt đọc
                    </span>
                  </div>
                  <span className="sc-home-genre-arrow" aria-hidden="true"><Icon name="chevron_right" /></span>
                </Link>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function AuthorSpotlight({ catalogNovels }: { catalogNovels: ReaderNovel[] }) {
  const authors = useMemo(() => {
    const byId = new Map<string, {
      authorId: string;
      authorName: string;
      novelsCount: number;
      totalViews: number;
      primaryGenre: string | null;
      standoutTitle: string;
      standoutViews: number;
    }>();

    for (const novel of catalogNovels) {
      if (!novel.authorId || !novel.authorName?.trim()) continue;
      const existing = byId.get(novel.authorId);
      const views = novel.viewsCount ?? 0;
      const genre = primaryGenre(novel);
      if (!existing) {
        byId.set(novel.authorId, {
          authorId: novel.authorId,
          authorName: novel.authorName.trim(),
          novelsCount: 1,
          totalViews: views,
          primaryGenre: genre,
          standoutTitle: novel.title,
          standoutViews: views,
        });
      } else {
        existing.novelsCount += 1;
        existing.totalViews += views;
        if (!existing.primaryGenre && genre) existing.primaryGenre = genre;
        if (views > existing.standoutViews) {
          existing.standoutTitle = novel.title;
          existing.standoutViews = views;
        }
      }
    }

    return [...byId.values()]
      .sort((a, b) => b.novelsCount - a.novelsCount || b.totalViews - a.totalViews)
      .slice(0, 4);
  }, [catalogNovels]);

  if (authors.length === 0) return null;

  return (
    <section className="sc-home-author-strip" aria-label="Gặp gỡ tác giả">
      <div className="sc-home-author-strip-head">
        <div>
          <span className="sc-home-eyebrow">Những người kể chuyện</span>
          <h2>Phía sau mỗi câu chuyện là một người viết.</h2>
          <p className="sc-home-section-sub">Khám phá những cây bút và thế giới riêng mà họ đang tạo nên tại StoryCraft.</p>
        </div>
        <span className="sc-home-author-strip-quill" aria-hidden="true">
          <svg viewBox="0 0 40 40" fill="none">
            <path d="M31 9C24 9.5 16.5 14.5 13 23.5L10 31L17.5 28C26.5 24.5 31.5 17 31 9Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M10 31L23 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
      </div>
      <div className="sc-home-author-strip-row" data-count={authors.length}>
        {authors.map(author => (
          <Link key={author.authorId} className="sc-home-author-pill" to={`/authors/${author.authorId}`}>
            <AuthorAvatar name={author.authorName} />
            <strong className="sc-home-author-name">{author.authorName}</strong>
            <span className="sc-home-author-meta">
              {count(author.novelsCount)} tác phẩm
              {author.primaryGenre ? ` · ${author.primaryGenre}` : ''}
            </span>
            <span className="sc-home-author-work-note" title={author.standoutTitle}>
              “{author.standoutTitle}”
            </span>
            <span className="sc-home-author-cta">
              Xem hồ sơ<Icon name="arrow_forward" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function StudioIllustration() {
  return (
    <svg className="sc-home-studio-svg" viewBox="0 0 320 184" fill="none" aria-hidden="true">
      <defs>
        <radialGradient id="sc-studio-sun" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(244 38) rotate(135) scale(130 96)">
          <stop stopColor="var(--sc-primary)" stopOpacity=".24" />
          <stop offset="1" stopColor="var(--sc-primary)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sc-studio-page" x1="34" y1="28" x2="224" y2="146" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--sc-surface)" />
          <stop offset="1" stopColor="var(--sc-surface-subtle)" />
        </linearGradient>
      </defs>
      {/* Warm sunlit ambiance echoing Books & Tea hero */}
      <rect x="8" y="6" width="304" height="172" rx="16" fill="url(#sc-studio-sun)" />
      <ellipse cx="146" cy="154" rx="116" ry="13" fill="var(--sc-primary)" opacity=".13" />
      {/* Subtle window sunbeams */}
      <path d="M210 10L286 10L248 92L178 92Z" fill="var(--sc-primary)" opacity=".06" />
      {/* Open hardcover notebook */}
      <rect x="26" y="34" width="198" height="116" rx="12" fill="var(--sc-primary)" opacity=".18" />
      <rect x="30" y="28" width="190" height="114" rx="10" fill="url(#sc-studio-page)" stroke="var(--sc-border)" strokeWidth="1.5" />
      {/* Center binding & subtle page depth */}
      <path d="M125 28V142" stroke="var(--sc-border)" strokeWidth="1.5" />
      <path d="M121 30V140" stroke="var(--sc-primary)" strokeWidth="1" opacity=".16" />
      <path d="M36 135C68 129 98 131 125 139C152 131 182 129 214 135" stroke="var(--sc-border)" strokeWidth="1.2" opacity=".7" />
      {/* Left page: chapter header + manuscript lines */}
      <rect x="46" y="46" width="34" height="4" rx="2" fill="var(--sc-primary)" opacity=".55" />
      <rect x="46" y="55" width="60" height="6" rx="3" fill="var(--sc-text)" opacity=".22" />
      <rect x="46" y="70" width="64" height="3.5" rx="1.75" fill="var(--sc-text-muted)" opacity=".26" />
      <rect x="46" y="80" width="54" height="3.5" rx="1.75" fill="var(--sc-text-muted)" opacity=".22" />
      <rect x="46" y="90" width="62" height="3.5" rx="1.75" fill="var(--sc-text-muted)" opacity=".22" />
      <rect x="46" y="100" width="46" height="3.5" rx="1.75" fill="var(--sc-text-muted)" opacity=".18" />
      <rect x="46" y="114" width="58" height="3.5" rx="1.75" fill="var(--sc-text-muted)" opacity=".16" />
      {/* Right page: ongoing draft + ink flourish */}
      <rect x="140" y="46" width="62" height="3.5" rx="1.75" fill="var(--sc-text-muted)" opacity=".25" />
      <rect x="140" y="56" width="56" height="3.5" rx="1.75" fill="var(--sc-text-muted)" opacity=".22" />
      <rect x="140" y="66" width="64" height="3.5" rx="1.75" fill="var(--sc-text-muted)" opacity=".22" />
      <rect x="140" y="76" width="44" height="3.5" rx="1.75" fill="var(--sc-primary)" opacity=".45" />
      <path d="M140 96C152 90 162 102 174 95C182 90 190 94 196 92" stroke="var(--sc-primary)" strokeWidth="1.6" strokeLinecap="round" opacity=".55" />
      {/* Terracotta ribbon bookmark */}
      <path d="M182 28V60L190 52L198 60V28H182Z" fill="var(--sc-primary)" opacity=".85" />
      {/* Fountain pen resting gracefully */}
      <g transform="rotate(-24 246 98)">
        <rect x="237" y="28" width="16" height="98" rx="8" fill="var(--sc-primary)" />
        <rect x="237" y="50" width="16" height="5" fill="var(--sc-surface)" opacity=".65" />
        <rect x="242" y="34" width="3" height="22" rx="1.5" fill="var(--sc-surface)" opacity=".35" />
        <path d="M237 118L245 142L253 118H237Z" fill="var(--sc-text)" opacity=".82" />
        <path d="M245 124V142" stroke="var(--sc-surface)" strokeWidth="1.2" opacity=".7" />
        <circle cx="245" cy="124" r="1.8" fill="var(--sc-surface)" />
      </g>
      {/* Delicate floating ink/light motes */}
      <circle cx="272" cy="48" r="3" fill="var(--sc-primary)" opacity=".36" />
      <circle cx="288" cy="74" r="2" fill="var(--sc-primary)" opacity=".28" />
      <circle cx="18" cy="52" r="2.5" fill="var(--sc-primary)" opacity=".3" />
    </svg>
  );
}

export function WritingStudioBanner({
  isWriter,
  isSignedIn,
  catalogPath,
}: {
  isWriter: boolean;
  isSignedIn: boolean;
  catalogPath: string;
}) {
  const primaryTo = isWriter ? '/author/projects' : isSignedIn ? '/profile/me' : '/login';
  const primaryLabel = isWriter ? 'Mở không gian sáng tác' : isSignedIn ? 'Bắt đầu sáng tác' : 'Bắt đầu sáng tác';

  return (
    <section className="sc-home-studio-cta" aria-label="Không gian sáng tác">
      <div className="sc-home-studio-copy">
        <span className="sc-home-eyebrow">Không gian sáng tác</span>
        <h2>Viết tiếp câu chuyện của riêng bạn</h2>
        <p>
          StoryCraft mang đến trình soạn thảo tập trung, quản lý chương và cẩm nang thế giới truyện giúp tác giả giữ nhịp sáng tác mượt mà hơn.
        </p>
        <div className="sc-home-studio-actions">
          <Link className="sc-button sc-button-primary" to={primaryTo}>
            <Icon name="edit_note" />
            <span>{primaryLabel}</span>
          </Link>
          <Link className="sc-button" to={isWriter ? '/author/ide' : catalogPath}>
            <span>{isWriter ? 'Viết tiếp ngay' : 'Khám phá thêm'}</span>
          </Link>
        </div>
      </div>
      <div className="sc-home-studio-art" aria-hidden="true">
        <StudioIllustration />
      </div>
    </section>
  );
}
