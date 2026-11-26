export type NovelStatus = 'DRAFT' | 'PENDING_MODERATION' | 'PUBLISHED' | 'REJECTED';

export type PublicationReview = {
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVISION_REQUIRED';
  reason: string | null;
};

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
  publicationReview?: PublicationReview | null;
  serialStatus: 'ONGOING' | 'COMPLETED' | 'HIATUS';
  storyFormat?: 'SHORT_STORY' | null;
  selectionEnabled?: boolean;
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
  publishedChaptersCount?: number;
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
  pendingPublicationRevision?: boolean;
  publicationReview?: PublicationReview | null;
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
