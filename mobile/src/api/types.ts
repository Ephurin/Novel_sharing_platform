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
  contentVersion?: string;
  paragraphs?: { paragraphId: string; paragraphIndex: number; text: string }[];
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
  audience: 'PUBLIC' | 'FRIENDS_ALL' | 'FRIENDS_SELECTED' | 'AUTHOR_PRIVATE';
  novelId: string;
  displayName: string;
  parentCommentId: string | null;
  repliesCount: number;
  canReply: boolean;
  canDelete: boolean;
  isSpoiler?: boolean;
  imageUrl?: string | null;
  anchor?: { quote: string; detached: boolean; currentParagraphId: string | null; paragraphId: string } | null;
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
  content?: string;
  payload?: Record<string, unknown>;
  notificationId: string;
  type: string;
  title: string;
  body?: string | null;
  status: 'UNREAD' | 'READ';
  createdAt: string;
};
