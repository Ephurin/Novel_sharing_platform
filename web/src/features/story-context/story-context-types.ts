export type CharacterRole = 'PROTAGONIST' | 'ANTAGONIST' | 'SUPPORTING' | 'MINOR';
export type ContextSource = 'AUTHOR_MANUAL' | 'AICOPILOT_SUGGESTION';
export type PlotSummaryScope = 'NOVEL' | 'ARC' | 'CHAPTER';

export type CharacterProfile = {
  characterId: string;
  novelId: string;
  name: string;
  role: CharacterRole;
  personality: string | null;
  description: string | null;
  notes: string | null;
  source: ContextSource;
  createdAt: string;
  updatedAt: string;
};

export type CharacterRelationship = {
  relationshipId: string;
  novelId: string;
  sourceCharacterId: string;
  sourceCharacterName: string;
  targetCharacterId: string;
  targetCharacterName: string;
  relationshipType: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StoryTimelineEvent = {
  eventId: string;
  novelId: string;
  chapterId: string | null;
  chapterNumber: number | null;
  chapterTitle: string | null;
  title: string;
  eventOrder: number;
  summary: string;
  source: ContextSource;
  createdAt: string;
  updatedAt: string;
};

export type PlotSummary = {
  summaryId: string;
  novelId: string;
  chapterId: string | null;
  chapterNumber: number | null;
  chapterTitle: string | null;
  scope: PlotSummaryScope;
  arcName: string | null;
  startChapterNumber: number | null;
  endChapterNumber: number | null;
  summary: string;
  source: ContextSource;
  createdAt: string;
  updatedAt: string;
};
