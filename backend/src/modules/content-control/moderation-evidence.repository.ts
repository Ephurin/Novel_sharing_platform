import { ObjectId } from 'mongodb';
import type { PoolClient } from 'pg';
import { getPostgresPool } from '../../core/database/postgres.js';
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
}, client?: PoolClient) {
  const evidence = {
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
  };

  if (client) {
    const id = new ObjectId().toString();
    await client.query('insert into moderation_evidence(evidence_id,payload) values($1,$2)', [id, evidence]);
    return id;
  }
  const result = await getMongoDatabase().collection(collectionName).insertOne(evidence);

  return result.insertedId.toString();
}

export async function findModerationEvidence(evidenceId: string | null) {
  if (!evidenceId) {
    return null;
  }

  const stored = await getPostgresPool().query('select payload from moderation_evidence where evidence_id=$1', [evidenceId]);
  if (stored.rows[0]) return stored.rows[0].payload;

  return getMongoDatabase()
    .collection(collectionName)
    .findOne({ _id: new ObjectId(evidenceId) });
}
