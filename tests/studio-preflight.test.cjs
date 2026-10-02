const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { configuration, database, status, run } = require('../lib/studio-preflight.cjs');
const settings = Object.fromEntries(['BASIC_AUTH_USER','BASIC_AUTH_PASS','AUTH_SECRET','OPENAI_API_KEY','OPENAI_MODEL','NOTION_TOKEN'].map(n => [n, 'test-only-canary']));
settings.DATABASE_URL = 'postgresql://test:canary-password@localhost/studio';
settings.NOTION_TASK_DATA_SOURCE_ID = '57b086f6-5c52-483f-8530-8991a0d6846d';
test('offline checks required values, PostgreSQL URL and exact data source ID; no network', async () => {
  assert.equal((await run(settings)).ok, true);
  assert.equal((await run(settings)).database, 'skipped');
  for (const name of Object.keys(settings)) assert.equal(configuration({ ...settings, [name]: ' ' }).every(c => c.ok), false);
  for (const id of ['https://notion.so/' + settings.NOTION_TASK_DATA_SOURCE_ID, 'collection://' + settings.NOTION_TASK_DATA_SOURCE_ID, 'bad', settings.NOTION_TASK_DATA_SOURCE_ID + 'x']) assert.equal((await run({...settings, NOTION_TASK_DATA_SOURCE_ID:id})).ok, false);
  assert.equal((await run({...settings, NOTION_TASK_DATA_SOURCE_ID:settings.NOTION_TASK_DATA_SOURCE_ID.replaceAll('-','')})).ok, true);
  for (const url of ['https://test.example/db','postgresql://test@localhost/','not a url']) assert.equal((await run({...settings,DATABASE_URL:url})).ok,false);
});
test('schema check on isolated PostgreSQL engine rejects missing table, column, type, PK and privileges', async () => {
  const { PGlite } = require('@electric-sql/pglite');
  const pg = new PGlite();
  const sql = [];
  const client = { query: async q => { sql.push(q); return pg.query(q); } };
  try {
    await assert.rejects(() => database(client));
    await pg.exec(readFileSync(require.resolve('../scripts/studio-schema.sql'),'utf8'));
    assert.ok((await database(client)).every(c=>c.ok));
    await pg.exec('ALTER TABLE studio_documents DROP COLUMN usage');
    assert.equal((await database(client)).find(c=>c.name==='DB_COLUMN_usage').ok,false);
    await pg.exec('ALTER TABLE studio_documents ADD COLUMN usage text; ALTER TABLE studio_documents DROP CONSTRAINT studio_documents_pkey');
    const checks = await database(client);
    assert.equal(checks.find(c=>c.name==='DB_COLUMN_usage').ok,false);
    assert.equal(checks.find(c=>c.name==='DB_ID_PRIMARY_KEY').ok,false);
    await pg.exec('CREATE ROLE preflight_test; GRANT SELECT ON studio_documents TO preflight_test; SET ROLE preflight_test');
    assert.equal((await database(client)).find(c=>c.name==='DB_APP_PRIVILEGES').ok,false);
    assert.ok(sql.every(q => /^(BEGIN READ ONLY|SET LOCAL|SELECT|ROLLBACK)/.test(q)));
    assert.equal(sql.at(-1),'ROLLBACK');
  } finally { await pg.close(); }
});
test('status requires authenticated JSON, no-store and all ready fields; redirects never followed', async () => {
  const url = 'https://preview.example/api/studio?action=status';
  const body = { ai:true,notion:true,tasks:true,storage:'可用' };
  const response = (patch={}) => ({status:200,headers:new Headers({'content-type':'application/json','cache-control':'private, no-store'}),json:async()=>body,...patch});
  assert.equal(await status(url,'sm_auth=test-only',async (u,o)=>{assert.equal(o.redirect,'manual');assert.equal(o.headers.Cookie,'sm_auth=test-only');return response();}),true);
  for (const r of [response({status:302}),response({status:401}),response({headers:new Headers({'content-type':'text/html'})}),response({json:async()=>({...body,storage:'連線或資料表未就緒'})}),response({json:async()=>({...body,tasks:false})})]) assert.equal(await status(url,'sm_auth=test',async()=>r),false);
  for (const u of ['http://preview.example/api/studio?action=status','https://preview.example/login','https://user:pass@preview.example/api/studio?action=status']) assert.equal(await status(u,'sm_auth=test',()=>{throw Error('must not fetch');}),false);
});
test('failures close connections and never serialize secrets, URLs, cookies or raw errors', async () => {
  let ended = false;
  const result = await run({...settings,STUDIO_PREFLIGHT_COOKIE:'canary-cookie'}, {database:true,statusURL:'https://preview.example/api/studio?action=status'}, {client:{connect:async()=>{throw Error(settings.DATABASE_URL);},end:async()=>{ended=true;}},fetcher:async()=>{throw Error('canary-cookie');}});
  assert.equal(ended,true); assert.equal(result.ok,false);
  assert.doesNotMatch(JSON.stringify(result),/canary|postgresql|preview.example/);
  const cli = spawnSync(process.execPath,['scripts/studio-preflight.cjs'],{env:{PATH:process.env.PATH},encoding:'utf8'});
  assert.equal(cli.status,1); assert.equal(JSON.parse(cli.stdout).ok,false);
  const success = spawnSync(process.execPath,['scripts/studio-preflight.cjs'],{env:{...settings,PATH:process.env.PATH},encoding:'utf8'});
  assert.equal(success.status,0); assert.doesNotMatch(success.stdout,/canary|postgresql/);
});
