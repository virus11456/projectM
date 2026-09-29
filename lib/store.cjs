const { Pool } = require("pg");
const { check } = require("./studio.cjs");
let pool;
function db() {
  check(process.env.DATABASE_URL, "文件資料庫尚未設定", 503);
  return (pool ||= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    idleTimeoutMillis: 1000,
    connectionTimeoutMillis: 5000,
  }));
}
module.exports = { db };
