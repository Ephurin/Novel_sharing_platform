import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createApp } from '../../app.js';
import { getPostgresPool, disconnectPostgres } from '../../core/database/postgres.js';

test('internal revision HTTP authorization fails closed before repository access', async t => {
  // HTTP/router/controller/service are real; SQL reads are controlled unit fixtures.
  // This unit test never connects to a database or a model provider.
  const revisionId=randomUUID(), chapterId=randomUUID(), novelId=randomUUID();
  const content='Internal revision authorization fixture 🔒';
  const hash=createHash('sha256').update(content).digest('hex');
  const secret=randomUUID();
  const pool=getPostgresPool(), originalQuery=pool.query;
  const originalToken=process.env.PLATFORM_SERVICE_TOKEN;
  let reads=0;
  pool.query=(async (sql: string, values: unknown[]) => {
    reads++;
    if (sql.toLowerCase().includes('from chapter_revisions')) return {rowCount:values[0]===revisionId ? 1 : 0,rows:values[0]===revisionId ? [{revision_id:revisionId,novel_id:novelId,chapter_id:chapterId,content,content_hash:hash,source_type:'BOOTSTRAP',word_count:6,created_by:randomUUID(),created_at:new Date()}] : []};
    if (sql.toLowerCase().includes('from chapters')) return {rows:[{chapter_id:chapterId,novel_id:novelId,chapter_number:1}]};
    throw new Error('Unexpected repository access');
  }) as typeof pool.query;
  const server=createApp().listen(0,'127.0.0.1');
  await new Promise<void>(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/internal/v1/revisions/`;
  const matrix: unknown[]=[];
  try {
    for (const configuration of ['missing','empty','whitespace','configured']) {
      if(configuration==='missing') delete process.env.PLATFORM_SERVICE_TOKEN;
      else process.env.PLATFORM_SERVICE_TOKEN=configuration==='empty' ? '' : configuration==='whitespace' ? '   ' : secret;
      for (const scenario of [
        {name:'anonymous',headers:{},valid:false},
        {name:'arbitrary_Bearer',headers:{Authorization:'Bearer arbitrary-test-token'},valid:false},
        {name:'empty_Bearer',headers:{Authorization:'Bearer '},valid:false},
        {name:'wrong_service_token',headers:{'X-Service-Token':'wrong-test-token'},valid:false},
        {name:'empty_service_token',headers:{'X-Service-Token':''},valid:false},
        {name:'correct_Bearer',headers:{Authorization:`Bearer ${secret}`},valid:true},
        {name:'correct_service_header',headers:{'X-Service-Token':secret},valid:true},
        {name:'correct_legacy_header',headers:{'X-Internal-Service-Key':secret},valid:true},
      ]) await t.test(`${configuration}/${scenario.name}`,async()=>{
        const before=reads;
        const response=await fetch(base+revisionId,{headers:scenario.headers as Record<string,string>});
        const body=await response.json() as any;
        const expected=configuration==='configured' && scenario.valid ? 200 : 401;
        matrix.push({configuration,scenario:scenario.name,expected,status:response.status,repository_reads:reads-before,error_code:body.error?.code??null,content_returned:body.data?.content===content});
        assert.equal(response.status,expected);
        if(expected===401){assert.equal(reads,before);assert.equal(body.error.code,'AUTH_002');assert.equal(body.data,null);}
        else assert.deepEqual(body.data,{revision_id:revisionId,novel_id:novelId,chapter_id:chapterId,chapter_number:1,content,content_hash:hash});
      });
    }
    await t.test('valid token missing revision is 404; invalid token missing revision is 401',async()=>{
      process.env.PLATFORM_SERVICE_TOKEN=secret;
      for(const valid of [true,false]){
        const before=reads;const response=await fetch(base+randomUUID(),{headers:{Authorization:`Bearer ${valid?secret:'wrong-test-token'}`}});
        const body=await response.json() as any;
        matrix.push({configuration:'configured',scenario:valid?'missing_revision_valid':'missing_revision_invalid',expected:valid?404:401,status:response.status,repository_reads:reads-before});
        assert.equal(response.status,valid?404:401);assert.equal(body.error.code,valid?'REVISION_NOT_FOUND':'AUTH_002');assert.equal(reads-before,valid?1:0);
      }
    });
  } finally {
    if(originalToken===undefined)delete process.env.PLATFORM_SERVICE_TOKEN;else process.env.PLATFORM_SERVICE_TOKEN=originalToken;
    pool.query=originalQuery;
    server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await disconnectPostgres();
    const out=process.env.INTERNAL_AUTHZ_UNIT_EVIDENCE;
    if(out){await mkdir(out,{recursive:false});await writeFile(out+'/http-matrix.json',JSON.stringify({tested_sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),proof:'HTTP unit: real router/controller/service, stubbed SQL, no database/model network',matrix},null,2)+'\n');}
  }
});
