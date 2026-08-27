import { ObjectId } from 'mongodb';
import { getMongoDatabase } from '../../core/database/mongo.js';
import type { MatchedRule, ModerationSource, ModerationTargetType } from './content-control.types.js';

const collectionName = 'moderation_evidence';

export async function createModerationEvidence(input: {
  targetType: ModerationTargetType;
  targetId: string;
  riskLevel: string;
  source: ModerationSource;
  matchedRules: MatchedRule[];
  summary: string;
}) {
  const result = await getMongoDatabase().collection(collectionName).insertOne({
    targetType: input.targetType,
    targetId: input.targetId,
    riskLevel: input.riskLevel,
    source: input.source,
    matchedRules: input.matchedRules.map((rule) => rule.name),
    categories: [...new Set(input.matchedRules.map((rule) => rule.category))],
    highlights: input.matchedRules.map((rule) => ({
      pattern: rule.pattern,
      reason: `${rule.category}:${rule.severity}`
    })),
    summary: input.summary,
    createdAt: new Date()
  });

  return result.insertedId.toString();
}

export async function findModerationEvidence(evidenceId: string | null) {
  if (!evidenceId) {
    return null;
  }

  return getMongoDatabase()
    .collection(collectionName)
    .findOne({ _id: new ObjectId(evidenceId) });
}
