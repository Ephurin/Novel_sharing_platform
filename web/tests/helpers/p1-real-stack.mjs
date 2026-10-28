import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { resolve, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer, request as proxyRequest } from 'node:http';
import { spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { chromium } from '@playwright/test';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const requireBackend = createRequire(join(ROOT, 'backend/package.json'));
const { Pool } = requireBackend('pg');
const { MongoClient } = requireBackend('mongodb');
export const hash = value => createHash('sha256').update(typeof value === 'string' || ArrayBuffer.isView(value) ? value : JSON.stringify(value)).digest('hex');
export async function until(fn, message, timeout = 30000) {
  const stop = Date.now() + timeout;
  let result;
  while (Date.now() < stop) {
    result = await fn();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw Error(message);
}

export async function createHarness() {
  assert.ok(process.env.P1_ACCEPTANCE_CONFIG, 'Provide a fresh owned stack config, never a historical hardcoded project');
  assert.ok(process.env.P1_EVIDENCE_DIR, 'Provide a new evidence directory');
  const cfg = JSON.parse(await readFile(process.env.P1_ACCEPTANCE_CONFIG, 'utf8'));
  const v = cfg.values;
  assert.match(cfg.project, /^codex-p1-final-[a-f0-9]{10}$/);
  assert.match(v.POSTGRES_DB, /^ephurin_test_p1_final_[a-f0-9]{10}$/);
  const out = resolve(process.env.P1_EVIDENCE_DIR);
  await mkdir(out); // Refuse to overwrite a prior run, including failed runs.
  await mkdir(join(out, 'screenshots'));
  const secrets = new Set(Object.entries(v).filter(([key]) => /password|secret|token|key/i.test(key)).map(([, value]) => value));
  const registerSecret = s => { if (s && typeof s === 'string' && s.length >= 6) secrets.add(s); };
  registerSecret('SENTINEL_NOTE_CONFIDENTIAL_LORE_7749_SECRET');
  const requests = [], readbacks = [], steps = [], browserErrors = [], browserConsole = [], blockedExternal = [], sqlCommands = [];
  let trackedNovels = [];
  const sensitive = /password|authorization|cookie|access.?token|refresh.?token|secret|api.?key|author_notes|private_author_notes|audit_snapshot|prompt_text/i;
  const clean = value => {
    if (value instanceof Date) return value.toISOString();
    if (value && typeof value.toHexString === 'function') return { $oid: value.toHexString() };
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      if (/author_notes|private_author_notes/i.test(key)) {
        if (typeof item === 'string') secrets.add(item);
        return [key, '[REDACTED_PRIVATE_NOTE]'];
      }
      if (sensitive.test(key) && typeof item === 'string') { secrets.add(item); return [key, '[REDACTED]']; }
      return [key, clean(item)];
    }));
    if (typeof value !== 'string') return value;
    let safe = value;
    for (const secret of secrets) if (secret.length >= 6) safe = safe.replaceAll(secret, '[REDACTED]');
    safe = safe.replace(/Bearer\s+[A-Za-z0-9_\-\.]{15,}/gi, 'Bearer [REDACTED_TOKEN]');
    return safe.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]');
  };
  const save = (name, data) => writeFile(join(out, name), JSON.stringify(clean(data), null, 2), 'utf8');

  function sanitizeHttpPayload(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(sanitizeHttpPayload).slice(0, 10);
    const ALLOWED_KEYS = new Set([
      'success', 'version', 'brain_version', 'profile_version', 'effective_from_chapter',
      'status', 'job_id', 'novelId', 'chapterId', 'revisionId', 'entity_id', 'id',
      'candidate_id', 'verdict', 'entity_type', 'canonical_name', 'code', 'error',
      'count', 'total', 'page', 'pageSize', 'expected_version', 'expected_brain_version',
      'operation', 'reason', 'finalize', 'progress'
    ]);
    const sanitized = {};
    for (const [k, v] of Object.entries(obj)) {
      const lk = k.toLowerCase();
      if (lk.includes('note') || lk.includes('prompt') || lk.includes('audit') ||
          lk.includes('snapshot') || lk.includes('password') || lk.includes('token') ||
          lk.includes('secret') || lk.includes('auth') || lk.includes('cookie') ||
          lk === 'content' || lk === 'synopsis' || lk === 'prose' || lk === 'before' || lk === 'after') {
        continue;
      }
      if (ALLOWED_KEYS.has(k)) {
        sanitized[k] = (typeof v === 'object' && v !== null) ? sanitizeHttpPayload(v) : v;
      } else if (typeof v === 'string') {
        sanitized[k + '_present'] = true;
        sanitized[k + '_len'] = v.length;
      }
    }
    return sanitized;
  }

  const pg = new Pool({ host: '127.0.0.1', port: Number(v.WAVE1D_PG_PORT), user: v.POSTGRES_USER,
    password: v.POSTGRES_PASSWORD, database: v.POSTGRES_DB });
  const mongoClient = new MongoClient(`mongodb://127.0.0.1:${v.WAVE1D_MONGO_PORT}`);
  await mongoClient.connect();
  const mongo = mongoClient.db(v.POSTGRES_DB);
  const origin = `http://127.0.0.1:${v.WAVE1D_WEB_PORT}`;
  const gateway = `http://127.0.0.1:${v.WAVE1D_BACKEND_PORT}`;
  const actor = authorization => {
    try { return JSON.parse(Buffer.from(authorization.split(' ')[1].split('.')[1], 'base64url')).sub; }
    catch { return 'anonymous'; }
  };
  const parse = raw => { try { return JSON.parse(raw); } catch { return raw; } };
  async function api(method, path, body, token, expected = [200, 201, 202], customHeaders = {}) {
    const started = new Date().toISOString();
    const headers = {
      'Content-Type': 'application/json',
      'Idempotency-Key': randomUUID(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...customHeaders
    };
    const response = await fetch(gateway + '/api/v1' + path, { method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const json = parse(await response.text());
    requests.push(clean({ transport: 'fixture-or-negative-api', method, path,
      body: sanitizeHttpPayload(body), actor: actor('Bearer ' + token),
      started, status: response.status, response: sanitizeHttpPayload(json) }));
    assert.ok(expected.includes(response.status), clean(`${method} ${path} ${response.status} ${JSON.stringify(json)}`));
    return { status: response.status, json, data: json?.data };
  }
  async function sql(query, params = []) {
    sqlCommands.push({ query, params: clean(params), at: new Date().toISOString() });
    return (await pg.query(query, params)).rows;
  }
  async function account(role) {
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
    const email = `${role.toLowerCase()}-${suffix}@example.invalid`;
    const password = 'Local!' + randomUUID(); secrets.add(password);
    const registration = await api('POST', '/auth/register', { username: 'p1_' + suffix, email, password });
    const userId = registration.data.user.userId;
    await sql('UPDATE users SET role=$1 WHERE user_id=$2', [role, userId]);
    const login = await api('POST', '/auth/login', { identifier: email, password });
    secrets.add(login.data.accessToken);
    return { userId, email, password, token: login.data.accessToken, role };
  }
  async function snapshot(stage, novels) {
    trackedNovels = [...novels];
    const data = {};
    const tables = await sql("SELECT table_schema,table_name FROM information_schema.columns WHERE table_schema IN ('public','narrative') AND column_name='novel_id' ORDER BY table_schema,table_name");
    for (const { table_schema: schema, table_name: table } of tables) {
      if (schema === 'narrative' && table === 'entities') {
        // Redact raw private_author_notes and author_notes from public readbacks
        data[`${schema}.${table}`] = await sql(`SELECT id, story_brain_id, novel_id, entity_type, canonical_name, normalized_name, description, author_profile - 'author_notes' AS author_profile, profile_version, source_type, confirmation_status, confidence, is_locked, created_at, updated_at FROM narrative.entities WHERE novel_id=ANY($1::uuid[]) ORDER BY to_jsonb(id)::text`, [novels]);
      } else if (schema === 'narrative' && table === 'writing_generations') {
        data[`${schema}.${table}`] = await sql(`SELECT id, job_id, novel_id, chapter_id, operation, status, stage, context_summary, created_at FROM narrative.writing_generations WHERE novel_id=ANY($1::uuid[]) ORDER BY created_at`, [novels]);
      } else {
        data[`${schema}.${table}`] = await sql(`SELECT * FROM ${schema}.${table} t WHERE novel_id=ANY($1::uuid[]) ORDER BY to_jsonb(t)::text`, [novels]);
      }
    }
    data['narrative.proposal_decisions'] = await sql('SELECT d.* FROM narrative.proposal_decisions d JOIN narrative.proposals p ON p.id=d.proposal_id WHERE p.novel_id=ANY($1::uuid[]) ORDER BY d.id', [novels]);
    data['narrative.event_participants'] = await sql('SELECT p.* FROM narrative.event_participants p JOIN narrative.events e ON e.id=p.event_id WHERE e.novel_id=ANY($1::uuid[]) ORDER BY p.event_id,p.entity_id', [novels]);
    // For entity_profile_audits: omit raw before/after snapshots from public readbacks
    data['narrative.entity_profile_audits'] = await sql(`SELECT id, tenant_id, novel_id, entity_id, actor_id, request_key, input_hash, (after->>'version')::int AS version, created_at FROM narrative.entity_profile_audits WHERE novel_id=ANY($1::uuid[]) ORDER BY id`, [novels]);
    const chapters = data['public.chapters']?.map(c => c.chapter_id) ?? [];
    // For mongo chapters: metadata only, omit raw private drafts
    data['mongo.draft_chapters'] = (await mongo.collection('draft_chapters').find({ chapterId: { $in: chapters } }, { projection: { content: 0 } }).sort({ chapterId: 1 }).toArray()).map(clean);
    readbacks.push({ stage, at: new Date().toISOString(), data: clean(data) });
    await save('durable-readbacks.json', readbacks);
    return JSON.parse(JSON.stringify(data));
  }
  const dist = resolve(ROOT, 'web/dist');
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
  const server = createServer(async (req, res) => {
    if (req.url.startsWith('/api/v1/')) {
      const chunks = []; req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        const body = Buffer.concat(chunks), started = new Date().toISOString();
        const downstream = proxyRequest(gateway + req.url, { method: req.method,
          headers: { ...req.headers, host: new URL(gateway).host, 'accept-encoding': 'identity' } }, upstream => {
          const parts = []; upstream.on('data', part => parts.push(part));
          upstream.on('end', () => {
            const bytes = Buffer.concat(parts), json = parse(bytes.toString());
            const parsedBody = body.length ? parse(body.toString()) : undefined;
            requests.push(clean({ transport: 'production-spa-browser', method: req.method, path: req.url,
              body: sanitizeHttpPayload(parsedBody), actor: actor(req.headers.authorization),
              started, finished: new Date().toISOString(), status: upstream.statusCode, response: sanitizeHttpPayload(json) }));
            res.writeHead(upstream.statusCode, upstream.headers); res.end(bytes);
          });
        });
        downstream.on('error', error => { browserErrors.push({ proxy: error.message }); res.writeHead(502); res.end('Owned backend unavailable'); });
        downstream.end(body);
      });
      return;
    }
    try {
      let path = resolve(dist, '.' + new URL(req.url, origin).pathname);
      assert.ok(path.startsWith(dist + sep) || path === dist);
      let bytes;
      try { bytes = await readFile(path); } catch { path = join(dist, 'index.html'); bytes = await readFile(path); }
      res.setHeader('Content-Type', mime[extname(path)] ?? 'application/octet-stream'); res.end(bytes);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(Number(v.WAVE1D_WEB_PORT), '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin || url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();
    blockedExternal.push({ host: url.host, path: url.pathname }); return route.abort('blockedbyclient');
  });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  context.on('page', page => {
    page.on('pageerror', error => browserErrors.push(error.message));
    page.on('console', message => browserConsole.push({ type: message.type(), text: clean(message.text()), location: message.location() }));
  });
  const page = await context.newPage();
  async function shot(name, target = page) {
    await target.evaluate(() => {
      const textareas = document.querySelectorAll('textarea');
      textareas.forEach(ta => {
        const label = ta.getAttribute('aria-label') || ta.id || ta.name || '';
        if (/note|ghi chú/i.test(label) || /SENTINEL/i.test(ta.value)) {
          ta.value = '[REDACTED_AUTHOR_NOTE_MASKED]';
        }
      });
    }).catch(() => {});
    await target.screenshot({ path: join(out, 'screenshots', name + '.png'), fullPage: true });
  }
  async function step(name, fn) {
    const result = { name, started: new Date().toISOString(), status: 'FAIL' };
    try { await fn(); result.status = 'PASS'; }
    catch (error) {
      result.error = clean(error.message); await shot('failure-' + steps.length).catch(() => {});
      await save('failure-dom-' + steps.length + '.json', {
        url: page.url(), visible_text: await page.locator('body').innerText().catch(() => ''),
        textareas: await page.locator('textarea').evaluateAll(nodes => nodes.map(n => ({ id: n.id, value: n.value }))).catch(() => [])
      }).catch(() => {});
      if (trackedNovels.length) await snapshot('failure-' + steps.length, trackedNovels).catch(e => { result.snapshot_error = clean(e.message); });
      throw error;
    }
    finally { result.finished = new Date().toISOString(); steps.push(result); await save('browser-steps.json', steps); }
  }
  async function finish() {
    const raw = join(out, 'trace.private.zip'), trace = join(out, 'playwright-trace.zip');
    try {
    await context.tracing.stop({ path: raw });
    await browser.close();
    const sanitized = spawnSync(process.env.PYTHON || 'python', [join(ROOT, 'scripts/p1_sanitize_trace.py'), raw, trace], {
      input: JSON.stringify([...secrets]), encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
    assert.equal(sanitized.status, 0, clean(sanitized.stderr));
    await unlink(raw);
    await save('trace-sanitization.json', JSON.parse(sanitized.stdout));
    } finally {
    await browser.close().catch(() => {});
    await new Promise(resolve => server.close(resolve));
    await save('http-requests-responses.json', requests);
    await save('browser-errors.json', browserErrors); await save('browser-console.json', browserConsole); await save('blocked-external.json', blockedExternal);
    await save('sql-commands.json', sqlCommands);
    await save('http-counts.json', { total: requests.length, browser: requests.filter(r => r.transport === 'production-spa-browser').length,
      statuses: Object.fromEntries([...new Set(requests.map(r => r.status))].sort().map(s => [s, requests.filter(r => r.status === s).length])) });
    const screenshots = [];
    for (const name of await readdir(join(out, 'screenshots'))) screenshots.push({ path: 'screenshots/' + name, sha256: hash(await readFile(join(out, 'screenshots', name))) });
    await save('screenshot-manifest.json', screenshots);
    await pg.end(); await mongoClient.close();
    }
  }
  return { cfg, v, out, pg, mongo, api, sql, account, snapshot, browser, context, page, origin, requests,
    readbacks, steps, browserErrors, blockedExternal, save, clean, secrets, registerSecret, shot, step, finish };
}
