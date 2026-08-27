export type NovelStatus = 'DRAFT' | 'PENDING_MODERATION' | 'PUBLISHED' | 'REJECTED';

export type Novel = {
  novelId: string;
  authorId: string;
  title: string;
  slug: string;
  synopsis: string;
  coverImageUrl: string | null;
  status: NovelStatus;
  serialStatus: 'ONGOING' | 'COMPLETED' | 'HIATUS';
  ageRating: 'EVERYONE' | 'TEEN' | 'MATURE';
  likesCount: number;
  viewsCount: number;
  chaptersCount: number;
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
