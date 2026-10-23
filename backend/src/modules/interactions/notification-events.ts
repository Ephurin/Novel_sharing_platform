import type { PoolClient } from 'pg';
export async function enqueueNotification(client: Pick<PoolClient, 'query'>, input: {
  eventKey: string; userId: string; type: string; title: string; content: string; payload?: Record<string, unknown>;
}) {
  await client.query(`insert into notification_events(event_key,user_id,type,title,content,payload)
    values($1,$2,$3,$4,$5,$6) on conflict do nothing`,
    [input.eventKey,input.userId,input.type,input.title,input.content,input.payload ?? {}]);
}
