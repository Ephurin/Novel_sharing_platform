/** POST /api/v1/ai/proposal-groups/{groupId}/reject, active owning author JWT. */
export interface RejectDependencyGroupRequest {
  expected_brain_version: number;
  reason?: string | null;
}
export interface RejectDependencyGroupResult {
  group_id: string;
  proposal_ids: string[];
  status: 'rejected';
  /** Current Canon version; rejection does not advance it. */
  brain_version: number;
}
export type RejectDependencyGroupResponse = {
  success: true;
  data: RejectDependencyGroupResult;
  error: null;
  meta: Record<string, unknown>;
} | {
  success: false;
  data: null;
  error: { code: string; message: string; details?: unknown };
  meta: Record<string, unknown>;
};
