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
  genres?: string[];
  tags?: string[];
  status?: string;
  serialStatus?: string;
  likesCount?: number;
  viewsCount?: number;
  chaptersCount?: number;
  ratingAverage?: number | null;
  ratingsCount?: number;
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

export type ReadingBackground = 'LIGHT' | 'DARK' | 'SEPIA' | 'MINT' | 'BLUE' | 'ROSE' | 'BLACK';

export type ReadingTextAlign = 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFY';

export type ReadingPreferences = {
  fontFamily: string | null;
  fontSize: number;
  background: ReadingBackground;
  lineHeight: number;
  margin?: number;
  textAlign?: ReadingTextAlign;
};

export type ReaderComment = {
  commentId: string;
  chapterId: string;
  userId: string;
  displayName?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  isAuthor?: boolean;
  paragraphOffset: number | null;
  content: string;
  status: string;
  createdAt: string;
};

export type DepositPackageCode = 'COIN_100' | 'COIN_500' | 'COIN_1000' | 'COIN_5000';

export type Wallet = {
  walletId?: string;
  userId?: string;
  coinsBalance: number;
  lockedCoins?: number;
};

export type WalletTransaction = {
  transactionId: string;
  type: string;
  direction?: 'IN' | 'OUT';
  amountCoins: number;
  balanceChangeCoins?: number;
  status: string;
  description?: string | null;
  createdAt: string;
};

export type NotificationItem = {
  notificationId: string;
  userId?: string;
  type: string;
  title: string;
  content?: string | null;
  body?: string | null;
  payload?: Record<string, unknown> | null;
  status: 'UNREAD' | 'READ';
  createdAt: string;
  readAt?: string | null;
};
