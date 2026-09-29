const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createHmac, randomUUID } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");
const core = require("../lib/studio.cjs");
const env = {
  BASIC_AUTH_USER: "test-user",
  BASIC_AUTH_PASS: "test-only-password",
  AUTH_SECRET: "test-only-secret",
};
function cookie(expires = Date.now() + 60000) {
  const p = `v1.${expires}`;
  return `sm_auth=${Buffer.from(p).toString("base64url")}.${createHmac("sha256", env.AUTH_SECRET).update(p).digest("base64url")}`;
}
function req(body, method = "POST") {
  return {
    method,
    headers: {
      host: "localhost:3100",
      origin: "http://localhost:3100",
      "content-type": "application/json",
      cookie: cookie(),
    },
    body,
    query: body,
  };
}
const input = {
  kind: "tasks",
  project: "Test project",
  source: "Prepare the approved deliverable.",
};
const doc = {
  title: "Test pack",
  body: "Test document",
  tasks: [
    {
      title: "Deliver",
      owner: "待確認",
      due: "待確認",
      acceptance: "Reviewed",
    },
  ],
};
test("authentication rejects absent, expired, forged cookies and cross-origin mutations", () => {
  assert.ok(core.authenticate(req({}), env));
  for (const change of [
    { cookie: "" },
    { cookie: cookie(1) },
    { cookie: cookie() + "x" },
    { origin: "https://evil.example" },
  ]) {
    const r = req({});
    Object.assign(r.headers, change);
    assert.throws(() => core.authenticate(r, env));
  }
});
test("input validation requires real source, report period and quotation basis", () => {
  assert.throws(() => core.validateInput({ ...input, source: "" }));
  assert.throws(() => core.validateInput({ ...input, kind: "quotation" }));
  assert.throws(() => core.validateInput({ ...input, kind: "report" }));
  assert.equal(
    core.validateInput({
      ...input,
      kind: "quotation",
      template: "Required fields",
      pricing: "Prices pending approval",
    }).kind,
    "quotation",
  );
  assert.throws(() => core.validateDocument({ ...doc, tasks: [] }, "tasks"));
});
test("Notion URLs are parsed without following arbitrary hosts", () => {
  assert.equal(
    core.pageId(
      "https://app.notion.com/p/12345678123412341234123456789012?pvs=204",
    ),
    "12345678123412341234123456789012",
  );
  assert.throws(() =>
    core.pageId("https://evil.example/12345678123412341234123456789012"),
  );
});
test("Notion traversal paginates and reads completed meeting sections", async () => {
  const root = "12345678123412341234123456789012";
  const calls = [];
  const call = async (path) => {
    calls.push(path);
    if (path.includes("blocks/summary"))
      return {
        results: [
          {
            type: "paragraph",
            paragraph: { rich_text: [{ plain_text: "Confirmed summary" }] },
          },
        ],
      };
    if (path.includes("start_cursor"))
      return {
        results: [
          {
            type: "meeting_notes",
            meeting_notes: {
              status: "notes_ready",
              children: { summary_block_id: "summary" },
            },
          },
        ],
      };
    return {
      results: [
        {
          type: "paragraph",
          paragraph: { rich_text: [{ plain_text: "Notes" }] },
        },
      ],
      has_more: true,
      next_cursor: "next",
    };
  };
  assert.equal(await core.readMeeting(root, call), "Notes\nConfirmed summary");
  assert.equal(calls.length, 3);
  await assert.rejects(
    () =>
      core.readMeeting(root, async () => ({
        results: [
          {
            type: "meeting_notes",
            meeting_notes: { status: "summary_in_progress" },
          },
        ],
      })),
    /尚未完成/,
  );
});
test("AI adapter never substitutes a demo on missing config, upstream error or truncated output", async () => {
  await assert.rejects(() => core.generate(input, {}), /尚未設定/);
  const settings = { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "test-model" };
  await assert.rejects(
    () =>
      core.generate(input, settings, async () => ({ ok: false, status: 429 })),
    /429/,
  );
  await assert.rejects(
    () =>
      core.generate(input, settings, async () => ({
        ok: true,
        json: async () => ({ choices: [{ finish_reason: "length" }] }),
      })),
    /未完整/,
  );
  let sent;
  const result = await core.generate(input, settings, async (url, options) => {
    sent = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        model: "test-model",
        usage: { total_tokens: 12 },
        choices: [
          { finish_reason: "stop", message: { content: JSON.stringify(doc) } },
        ],
      }),
    };
  });
  assert.equal(result.document.title, doc.title);
  assert.equal(result.usage.total_tokens, 12);
  assert.match(sent.messages[1].content, /approved deliverable/);
});
test("API with PostgreSQL engine: persistence, CAS, owner isolation, concurrent publish and uncertain results", async () => {
  Object.assign(process.env, env, {
    DATABASE_URL: "test-only",
    OPENAI_API_KEY: "test-only",
    OPENAI_MODEL: "test-model",
    NOTION_TOKEN: "test-only",
    NOTION_TASK_DATA_SOURCE_ID: "12345678123412341234123456789012",
  });
  const pg = new PGlite();
  await pg.exec(
    readFileSync(require.resolve("../scripts/studio-schema.sql"), "utf8"),
  );
  const sql = {
    query: async (q, p = []) => {
      const result = await pg.query(q, p);
      return { ...result, rowCount: result.affectedRows ?? result.rows.length };
    },
  };
  const storePath = require.resolve("../lib/store.cjs");
  require.cache[storePath] = {
    id: storePath,
    filename: storePath,
    loaded: true,
    exports: { db: () => sql },
  };
  const handler = require("../api/studio.js");
  const invoke = async (body, method = "POST", headers = {}) => {
    let code = 200,
      result;
    const response = {
      setHeader() {},
      status(v) {
        code = v;
        return this;
      },
      json(v) {
        result = v;
      },
    };
    const request = req(body, method);
    Object.assign(request.headers, headers);
    await handler(request, response);
    return { code, result };
  };
  const original = global.fetch;
  let aiCalls = 0,
    notionCreates = 0,
    fail = false;
  global.fetch = async (url) => {
    if (url.includes("openai.com")) {
      aiCalls++;
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              finish_reason: "stop",
              message: { content: JSON.stringify(doc) },
            },
          ],
          usage: { total_tokens: 10 },
        }),
      };
    }
    if (url.includes("data_sources/"))
      return {
        ok: true,
        json: async () => ({ properties: { 任務: { type: "title" } } }),
      };
    notionCreates++;
    if (fail) throw new Error("timeout after send");
    return {
      ok: true,
      json: async () => ({ id: "11111111-1111-1111-1111-111111111111" }),
    };
  };
  try {
    const id = randomUUID();
    let r = await invoke({ action: "generate", id, input });
    assert.equal(r.code, 200);
    assert.equal(r.result.document.title, doc.title);
    r = await invoke({ action: "generate", id, input });
    assert.equal(r.code, 200);
    assert.equal(aiCalls, 1);
    assert.equal(
      (
        await invoke({
          action: "generate",
          id,
          input: { ...input, source: "different" },
        })
      ).code,
      409,
    );
    r = await invoke({
      action: "save",
      id,
      version: 1,
      document: { ...doc, title: "Edited" },
    });
    assert.equal(r.result.version, 2);
    assert.equal(
      (await invoke({ action: "save", id, version: 1, document: doc })).code,
      409,
    );
    assert.equal(
      (await invoke({ action: "get", id }, "GET", { cookie: "" })).code,
      401,
    );
    process.env.BASIC_AUTH_USER = "other";
    assert.equal((await invoke({ action: "get", id }, "GET")).code, 404);
    process.env.BASIC_AUTH_USER = env.BASIC_AUTH_USER;
    const races = await Promise.all([
      invoke({ action: "publish", id, version: 2, confirmed: true }),
      invoke({ action: "publish", id, version: 2, confirmed: true }),
    ]);
    assert.ok(races.some((r) => r.code === 200));
    assert.equal(notionCreates, 1);
    assert.equal(
      (await invoke({ action: "publish", id, version: 2, confirmed: true }))
        .code,
      200,
    );
    assert.equal(notionCreates, 1);
    assert.equal(
      (await invoke({ action: "save", id, version: 2, document: doc })).code,
      409,
    );
    const second = randomUUID();
    await invoke({ action: "generate", id: second, input });
    fail = true;
    assert.equal(
      (
        await invoke({
          action: "publish",
          id: second,
          version: 1,
          confirmed: true,
        })
      ).code,
      500,
    );
    assert.equal(
      (
        await invoke({
          action: "publish",
          id: second,
          version: 1,
          confirmed: true,
        })
      ).code,
      409,
    );
    assert.equal(notionCreates, 2);
    const state = await invoke({ action: "get", id: second }, "GET");
    assert.equal(state.result.publish_status, "uncertain");
  } finally {
    global.fetch = original;
    await pg.close();
  }
});
