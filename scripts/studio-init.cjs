const { readFileSync } = require("node:fs");
const { db } = require("../lib/store.cjs");
(async () => {
  const pool = db();
  try {
    await pool.query(readFileSync(__dirname + "/studio-schema.sql", "utf8"));
    console.log("AI 工作室資料表已就緒");
  } finally {
    await pool.end();
  }
})().catch(() => {
  console.error("無法初始化，請檢查 DATABASE_URL 與資料庫權限");
  process.exitCode = 1;
});
