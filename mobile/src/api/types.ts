export type UserRole = 'READER' | 'AUTHOR' | 'ADMIN';

export type CurrentUser = {
  userId: string;
  email: string;
  username: string;
  role: UserRole;
  status: string;
};

export type ReaderNovel = {
  novelId: string;
  authorId: string;
  authorName?: string;
  title: string;
  synopsis?: string;
  coverImageUrl?: string | null;
  genre?: string | null;
  tags?: string[];
  status?: string;
  serialStatus?: string;
  likesCount?: number;
  viewsCount?: number;
  chaptersCount?: number;
  updatedAt?: string;
};

export type ReaderChapter = {
  chapterId: string;
  novelId: string;
  title: string;
  chapterNumber: number;
  content: string | null;
  isVip: boolean;
  priceCoins: number;
  status?: string;
  wordCount?: number;
  publishedAt?: string;
};

export type ReadingHistoryItem = {
  novelId: string;
  chapterId: string;
  paragraphIndex: number;
  pageOffset: number | null;
  readAt: string;
  novel: {
    title: string;
    coverImageUrl: string | null;
  };
  chapter: {
    title: string;
    chapterNumber: number;
  };
};

export type ReadingPreferences = {
  fontFamily: string | null;
  fontSize: number;
  background: 'LIGHT' | 'DARK' | 'SEPIA';
  lineHeight: number;
};

export type ReaderComment = {
  commentId: string;
  chapterId: string;
  userId: string;
  paragraphOffset: number | null;
  content: string;
  status: string;
  createdAt: string;
};

export type Wallet = {
  userId: string;
  balanceCoins: number;
};

export type WalletTransaction = {
  transactionId: string;
  type: string;
  amountCoins: number;
  status: string;
  createdAt: string;
};

export type NotificationItem = {
  notificationId: string;
  type: string;
  title: string;
  body?: string | null;
  status: 'UNREAD' | 'READ';
  createdAt: string;
};
