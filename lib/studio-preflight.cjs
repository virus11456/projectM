const REQUIRED = ['BASIC_AUTH_USER', 'BASIC_AUTH_PASS', 'AUTH_SECRET', 'DATABASE_URL', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'NOTION_TOKEN', 'NOTION_TASK_DATA_SOURCE_ID'];
const ID = /^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i;
const COLUMNS = { id: 'uuid', owner: 'text', kind: 'text', input: 'jsonb', input_hash: 'text', model: 'text', status: 'text', document: 'jsonb', usage: 'jsonb', version: 'int4', publish_status: 'text', notion_id: 'text', created_at: 'timestamptz', updated_at: 'timestamptz' };
function configuration(env) {
  const checks = REQUIRED.map(name => ({ name, ok: typeof env[name] === 'string' && !!env[name].trim() }));
  let validURL = false;
  try {
    const u = new URL(env.DATABASE_URL);
    validURL = ['postgres:', 'postgresql:'].includes(u.protocol) && !!u.hostname && u.pathname.length > 1 && !!u.username;
  } catch {}
  checks.push({ name: 'DATABASE_URL_FORMAT', ok: validURL });
  checks.push({ name: 'NOTION_DATA_SOURCE_ID_FORMAT', ok: ID.test(env.NOTION_TASK_DATA_SOURCE_ID || '') });
  return checks;
}
// Resolve the same unqualified relation as the API; inspect metadata, never documents.
async function database(client) {
  await client.query('BEGIN READ ONLY');
  try {
    await client.query("SET LOCAL statement_timeout = '5s'");
    const { rows } = await client.query(`SELECT a.attname AS name, t.typname AS type,
      a.attnotnull AS required FROM pg_attribute a JOIN pg_type t ON t.oid=a.atttypid
      WHERE a.attrelid=to_regclass('studio_documents') AND a.attnum>0 AND NOT a.attisdropped`);
    const checks = Object.entries(COLUMNS).map(([name, type]) => ({ name: `DB_COLUMN_${name}`, ok: rows.some(r => r.name === name && r.type === type && (!['document', 'usage', 'notion_id'].includes(name) ? r.required : true)) }));
    const meta = await client.query(`SELECT
      (has_table_privilege('studio_documents','SELECT') AND has_table_privilege('studio_documents','INSERT') AND has_table_privilege('studio_documents','UPDATE')) AS access,
      EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('studio_documents') AND contype='p' AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=to_regclass('studio_documents') AND attname='id')]::smallint[]) AS primary_key`);
    checks.push({ name: 'DB_APP_PRIVILEGES', ok: meta.rows[0]?.access === true }, { name: 'DB_ID_PRIMARY_KEY', ok: meta.rows[0]?.primary_key === true });
    return checks;
  } finally { await client.query('ROLLBACK'); }
}
function statusPayload(body) {
  return !!body && body.ai === true && body.notion === true && body.tasks === true && body.storage === '可用';
}
async function status(url, cookie, fetcher = fetch) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || u.username || u.password || u.hash || u.pathname !== '/api/studio' || u.search !== '?action=status' || !cookie?.trim()) return false;
  const response = await fetcher(u.href, { headers: { Cookie: cookie }, redirect: 'manual', signal: AbortSignal.timeout(10000) });
  return response.status === 200 && /application\/json/i.test(response.headers.get('content-type') || '') && /(?:^|,)\s*no-store\s*(?:,|$)/i.test(response.headers.get('cache-control') || '') && statusPayload(await response.json());
}
async function run(env, options = {}, deps = {}) {
  const checks = configuration(env);
  if (options.database) {
    if (!checks.find(c => c.name === 'DATABASE_URL_FORMAT').ok) checks.push({ name: 'DB_READ_ONLY', ok: false });
    else {
      let client;
      try {
        client = deps.client || new (require('pg').Client)({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5000, query_timeout: 6000 });
        await client.connect();
        checks.push(...await database(client));
      } catch { checks.push({ name: 'DB_READ_ONLY', ok: false }); }
      finally { if (client) { try { await client.end(); } catch {} } }
    }
  }
  if (options.statusURL) {
    try { checks.push({ name: 'AUTHENTICATED_STATUS', ok: await status(options.statusURL, env.STUDIO_PREFLIGHT_COOKIE, deps.fetcher) }); }
    catch { checks.push({ name: 'AUTHENTICATED_STATUS', ok: false }); }
  }
  return { ok: checks.every(c => c.ok), checks, database: options.database ? 'checked' : 'skipped', status: options.statusURL ? 'checked' : 'skipped', upstream: 'not_verified' };
}
module.exports = { configuration, database, statusPayload, status, run };
