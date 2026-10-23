export type NovelStatus = 'DRAFT' | 'PENDING_MODERATION' | 'PUBLISHED' | 'REJECTED';

export type Novel = {
  novelId: string;
  authorId: string;
  title: string;
  slug: string;
  synopsis: string;
  authorNote: string | null;
  genres: string[];
  coverImageUrl: string | null;
  status: NovelStatus;
  serialStatus: 'ONGOING' | 'COMPLETED' | 'HIATUS';
  ageRating: 'EVERYONE' | 'TEEN' | 'MATURE';
  likesCount: number;
  viewsCount: number;
  chaptersCount: number;
  genreId: string | null;
  genre: string | null;
  latestChapter?: {
    chapterId: string;
    chapterNumber: number;
    title: string;
    status: ChapterStatus;
    updatedAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type ChapterStatus = 'DRAFT' | 'PENDING_MODERATION' | 'PUBLISHED' | 'REJECTED' | 'ARCHIVED';

export type Chapter = {
  chapterId: string;
  novelId: string;
  title: string;
  chapterNumber: number;
  content: string | null;
  wordCount: number;
  isVip: boolean;
  priceCoins: number;
  status: ChapterStatus;
  updatedAt: string;
  publicationSchedule?: { scheduledAt: string; status: string; error: string | null } | null;
  draft?: {
    title: string;
    content: string;
    wordCount: number;
    version: number;
    autosave: boolean;
    updatedAt: string;
  } | null;
  draftVersion?: number | null;
};
