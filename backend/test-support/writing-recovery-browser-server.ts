import jwt from 'jsonwebtoken';
import { writingRecoveryFixture } from '../src/modules/ai/writing-drafts.test-fixture.js';
import { env } from '../src/core/config/env.js';
import { createApp } from '../src/app.js';
import { disconnectPostgres } from '../src/core/database/postgres.js';
import { disconnectMongo } from '../src/core/database/mongo.js';
import { disconnectChapterWriter } from '../src/modules/novels/chapter-writer.js';

const f=await writingRecoveryFixture();
const chapter=await f.chapter(); await f.job(chapter);
const token=(userId:string)=>jwt.sign({sub:userId,role:'AUTHOR'},env.JWT_ACCESS_SECRET);
const server=createApp().listen(0,'127.0.0.1');
await new Promise<void>(r=>server.once('listening',r));
process.send?.({ready:true,base:`http://127.0.0.1:${(server.address() as any).port}/api/v1`,accounts:[{
  userId:f.userId,novelId:f.novelId,chapterIds:[chapter.chapterId],token:token(f.userId)
}],otherToken:token(f.otherUser)});
process.on('message',async (message:{id:number;action:string})=>{
  try {
    if(message.action==='seed') {
      const revision=(await f.pool.query('select r.* from chapter_revisions r join chapters c on c.latest_revision_id=r.revision_id where c.chapter_id=$1',[chapter.chapterId])).rows[0];
      await f.job({...chapter,revisionId:revision.revision_id,content:revision.content});
    } else if(message.action==='stale') {
      await f.pool.query('update narrative.story_brains set brain_version=3 where novel_id=$1',[f.novelId]);
    } else if(message.action==='close') {
      server.closeAllConnections(); await new Promise<void>(r=>server.close(()=>r()));
      await f.close();await disconnectChapterWriter();await disconnectPostgres();await disconnectMongo();
      process.exit(0);
    }
    process.send?.({id:message.id,state:await f.state(chapter.chapterId)});
  } catch {process.send?.({id:message.id,error:'Fixture operation failed'});}
});
