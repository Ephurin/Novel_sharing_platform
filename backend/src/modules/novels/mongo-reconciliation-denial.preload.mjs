// Test-only instrumentation: no network connection or durable mutation is permitted.
import pg from 'pg';
import { MongoClient, Collection } from 'mongodb';
import { writeFileSync } from 'node:fs';
const calls = { identity: 0, mongoConnect: 0, mongoClose: 0, pgEnd: 0, writes: [], reads: [] };
pg.Pool.prototype.query = async function (sql) {
  if (!String(sql).includes('current_database()')) throw new Error('Unexpected SQL in denied fixture');
  calls.identity++;
  return { rowCount: 1, rows: [{ current_db: process.env.G03_PG_IDENTITY, server_addr: '127.0.0.1', server_port: 9 }] };
};
pg.Pool.prototype.end = async function () { calls.pgEnd++; };
MongoClient.prototype.connect = async function () { calls.mongoConnect++; throw new Error('Denied fixture attempted Mongo connection'); };
MongoClient.prototype.close = async function () { calls.mongoClose++; };
for (const method of ['deleteMany', 'deleteOne', 'insertOne', 'insertMany', 'updateOne', 'updateMany', 'replaceOne', 'bulkWrite', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace', 'createIndex', 'createIndexes', 'drop']) {
  Collection.prototype[method] = async function () { calls.writes.push(method); return { deletedCount: 0 }; };
}
Collection.prototype.countDocuments = async function () { calls.reads.push('countDocuments'); return 0; };
process.on('exit', () => writeFileSync(process.env.G03_CALL_LOG, JSON.stringify(calls)));
