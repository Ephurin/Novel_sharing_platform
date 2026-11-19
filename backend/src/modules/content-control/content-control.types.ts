export type ModerationTargetType = 'NOVEL' | 'CHAPTER' | 'COMMENT' | 'USER';
export type ModerationSource = 'KEYWORD_FILTER' | 'PUBLICATION_REQUEST' | 'USER_REPORT';
export type ModerationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVISION_REQUIRED';

export type ModerationSnapshot = {
  title: string;
  content: string;
  wordCount?: number;
  gifId?: string | null;
};

export type ContentControlResult = {
  result: 'PASS' | 'NEED_ADMIN_REVIEW';
  moderationRequired: boolean;
  moderationReviewId: string | null;
};

export type MatchedRule = {
  ruleId: string;
  name: string;
  pattern: string;
  category: string;
  severity: string;
};
