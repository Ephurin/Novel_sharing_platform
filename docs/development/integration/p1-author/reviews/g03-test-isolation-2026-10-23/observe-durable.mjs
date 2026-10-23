import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require=createRequire(path.resolve('package.json'));
const {Pool}=require('pg');const mongo=require('mongodb');
function record(value){if(process.env.ACCEPTANCE_DURABLE_LOG)fs.appendFileSync(process.env.ACCEPTANCE_DURABLE_LOG,JSON.stringify({suite:process.env.ACCEPTANCE_SUITE_NAME,...value})+'\n');}
const query=Pool.prototype.query;
Pool.prototype.query=function(...args){const result=query.apply(this,args);const sql=typeof args[0]==='string'?args[0]:args[0]?.text;
 if(result&&typeof result.then==='function')return result.then(r=>{if(/^\s*(select|with)/i.test(sql??''))record({store:'PG',sql,values:args[1],rows:r.rows,rowCount:r.rowCount});return r;});return result;};
const count=mongo.Collection.prototype.countDocuments;
mongo.Collection.prototype.countDocuments=async function(...args){const result=await count.apply(this,args);record({store:'Mongo',operation:'countDocuments',collection:this.collectionName,filter:args[0],count:result});return result;};
const array=mongo.FindCursor.prototype.toArray;
mongo.FindCursor.prototype.toArray=async function(...args){const result=await array.apply(this,args);record({store:'Mongo',operation:'find.toArray',documents:result});return result;};
