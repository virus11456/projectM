const { createHash } = require("node:crypto");
const {
  authenticate,
  check,
  uuid,
  pageId,
  validateInput,
  validateDocument,
  generate,
  notion,
  readMeeting,
  taskBlocks,
} = require("../lib/studio.cjs");
const { db } = require("../lib/store.cjs");
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const owner = authenticate(req);
    check(["GET", "POST"].includes(req.method), "不支援的操作", 405);
    check(
      JSON.stringify(req.body || {}).length <= 160000,
      "輸入過大，請分段處理",
      413,
    );
    const action = req.method === "GET" ? req.query.action : req.body?.action;
    if (action === "status" && req.method === "GET") {
      let storage = "尚未設定";
      if (process.env.DATABASE_URL) {
        try {
          await db().query("SELECT id FROM studio_documents LIMIT 0");
          storage = "可用";
        } catch {
          storage = "連線或資料表未就緒";
        }
      }
      return res.json({
        ai: !!(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL),
        storage,
        notion: !!process.env.NOTION_TOKEN,
        tasks: !!(
          process.env.NOTION_TOKEN && process.env.NOTION_TASK_DATA_SOURCE_ID
        ),
      });
    }
    if (action === "meeting" && req.method === "POST")
      return res.json({ source: await readMeeting(req.body.page) });
    const sql = db();
    if (action === "list" && req.method === "GET") {
      const result = await sql.query(
        "SELECT id,kind,status,document->>'title' AS title,created_at,publish_status FROM studio_documents WHERE owner=$1 ORDER BY created_at DESC LIMIT 100",
        [owner],
      );
      return res.json({ documents: result.rows });
    }
    if (action === "generate" && req.method === "POST") {
      const id = uuid(req.body.id),
        input = validateInput(req.body.input);
      check(
        process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL,
        "AI 尚未設定",
        503,
      );
      const hash = createHash("sha256")
        .update(JSON.stringify(input))
        .digest("hex");
      const inserted = await sql.query(
        "INSERT INTO studio_documents(id,owner,kind,input,input_hash,model) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id",
        [id, owner, input.kind, input, hash, process.env.OPENAI_MODEL],
      );
      if (!inserted.rowCount) {
        const old = (
          await sql.query(
            "SELECT * FROM studio_documents WHERE id=$1 AND owner=$2",
            [id, owner],
          )
        ).rows[0];
        check(
          old && old.input_hash === hash,
          "請求識別碼已使用，請建立新文件",
          409,
        );
        check(
          old.status === "complete",
          "此請求已送出或失敗，請查看歷史紀錄；不會自動再次計費",
          409,
        );
        return res.json(old);
      }
      try {
        const result = await generate(input);
        const saved = await sql.query(
          "UPDATE studio_documents SET status='complete',document=$1,usage=$2,model=$3,updated_at=now() WHERE id=$4 RETURNING *",
          [result.document, result.usage, result.model, id],
        );
        return res.json(saved.rows[0]);
      } catch (error) {
        await sql.query(
          "UPDATE studio_documents SET status='error',updated_at=now() WHERE id=$1",
          [id],
        );
        throw error;
      }
    }
    const id = uuid(req.method === "GET" ? req.query.id : req.body.id);
    const row = (
      await sql.query(
        "SELECT * FROM studio_documents WHERE id=$1 AND owner=$2",
        [id, owner],
      )
    ).rows[0];
    check(row, "找不到文件", 404);
    if (action === "get" && req.method === "GET") return res.json(row);
    check(row.status === "complete", "文件尚未產出完成", 409);
    if (action === "save" && req.method === "POST") {
      const document = validateDocument(req.body.document, row.kind);
      const updated = await sql.query(
        "UPDATE studio_documents SET document=$1,version=version+1,updated_at=now() WHERE id=$2 AND owner=$3 AND version=$4 AND publish_status='none' RETURNING *",
        [document, id, owner, req.body.version],
      );
      check(
        updated.rowCount,
        "文件已更新或送入 Notion，請重新載入；已送出的任務請在 Notion 編輯",
        409,
      );
      return res.json(updated.rows[0]);
    }
    if (action === "publish" && req.method === "POST") {
      check(
        row.kind === "tasks" && req.body.confirmed === true,
        "請先確認任務包",
      );
      check(
        process.env.NOTION_TOKEN && process.env.NOTION_TASK_DATA_SOURCE_ID,
        "Notion 任務包目的頁尚未設定",
        503,
      );
      if (row.publish_status === "complete") return res.json(row);
      const parent = pageId(process.env.NOTION_TASK_DATA_SOURCE_ID);
      const schema = await notion(`data_sources/${parent}`);
      const titleEntry = Object.entries(schema.properties || {}).find(
        ([, p]) => p.type === "title",
      );
      check(titleEntry, "任務資料庫缺少標題欄位", 503);
      // Atomic claim persists before the external call. An uncertain result is never blindly retried.
      const claim = await sql.query(
        "UPDATE studio_documents SET publish_status='sending',updated_at=now() WHERE id=$1 AND owner=$2 AND version=$3 AND publish_status='none' RETURNING *",
        [id, owner, req.body.version],
      );
      check(
        claim.rowCount,
        "任務已送出、版本變更或結果待核對，請重新載入；不會重複建立",
        409,
      );
      try {
        const doc = claim.rows[0].document;
        const page = await notion("pages", {
          method: "POST",
          body: JSON.stringify({
            parent: { data_source_id: parent },
            properties: {
              [titleEntry[0]]: {
                type: "title",
                title: [{ type: "text", text: { content: doc.title } }],
              },
            },
            children: taskBlocks(doc, id, claim.rows[0].input.sourcePage),
          }),
        });
        const saved = await sql.query(
          "UPDATE studio_documents SET publish_status='complete',notion_id=$1,updated_at=now() WHERE id=$2 RETURNING *",
          [page.id, id],
        );
        return res.json(saved.rows[0]);
      } catch (error) {
        await sql.query(
          "UPDATE studio_documents SET publish_status='uncertain',updated_at=now() WHERE id=$1",
          [id],
        );
        throw error;
      }
    }
    if (action === "task-status" && req.method === "GET") {
      check(row.notion_id, "任務尚未寫入 Notion", 409);
      const data = await notion(
        `blocks/${pageId(row.notion_id)}/children?page_size=100`,
      );
      const tasks = (data.results || [])
        .filter((b) => b.type === "to_do")
        .map((b) => ({
          id: b.id,
          checked: b.to_do.checked,
          text: b.to_do.rich_text
            .map((x) => x.plain_text ?? x.text?.content ?? "")
            .join(""),
        }));
      return res.json({ tasks, has_more: !!data.has_more });
    }
    check(false, "不支援的操作", 400);
  } catch (error) {
    res
      .status(error.status || 500)
      .json({
        error: error.status
          ? error.message
          : "服務暫時無法完成，請檢查資料庫設定或稍後再試",
      });
  }
};
