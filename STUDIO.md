# AI 工作室

入口 `/studio`。沿用現有公司共用登入；這不是個人分權系統，同一登入可讀寫所有工作室文件。

## 部署

1. 在 Vercel 設定 `.env.example` 所列變數。OPENAI_MODEL 必須是帳戶可用且支援 Chat Completions JSON object 的模型。
2. 使用受保護的 PostgreSQL 連線，設定 DATABASE_URL，執行 `pnpm studio:init`。資料表初始化不在每次請求中執行。
3. 將 Notion 會議頁面與任務資料來源分享給對應 integration。NOTION_TASK_DATA_SOURCE_ID 是 data source ID，不是 database ID。Notion API 版本為 2026-03-11。
4. 合併到 production 分支後 Vercel 部署。`/api/studio?action=status` 在登入後顯示設定狀態；AI／Notion 的「已設定」只代表有設定值，不代表上游驗證成功。
5. 以非正式敏感資料完成一次實際 AI 產出與任務寫入驗收，再用正式會議。

Notion MCP 的聊天連線不會自動變成網站的 NOTION_TOKEN。不要把 MCP 憑證、公司範本、價目、會議記錄或生成文件放進 Git repository/data JSON。

## 功能

- 月／週報：匯入 UTF-8 TXT、Markdown、CSV、TSV，或貼上文字；指定期間，呼叫真實 OpenAI API。第一版不解析 XLSX、PDF、DOCX。
- 報價：必須提供範本與價目依據。AI 產出可編輯草稿；尚未支援原版 Word/Excel 版型重製，也不自動寫入收入。
- 企劃：會議內容產生企劃草稿。支持從有權限的 Notion 會議頁讀取普通文字、巢狀段落及已完成的 AI meeting notes 內容。
- 任務包：AI 產生 1–40 個結構化子項目；確認並保存後，在設定的 Notion Tasks 資料來源建立一筆任務包頁面，子項目以 to-do 清單保存。負責人、期限與驗收條件為子項目文字，第一版不自動指定 Notion 成員、不建立各子項目的獨立資料列。於 projectM 按鈕讀取 Notion 最新勾選進度。
- 所有產出保存在 PostgreSQL，含請求 ID、來源、模型、token usage 與時間；可透過 `/studio?id=UUID` 載入。文件可編輯，版本號防止舊分頁覆蓋新內容，但第一版不保存每一次編輯歷史。
- 匯出 Markdown，或透過瀏覽器列印／另存 PDF（文字排版，非原報價版型）。資料庫未就緒時禁止生成，沒有展示資料回退。

## 失敗與重試

相同生成請求 ID 不再次呼叫 AI。失敗或執行中請求保留紀錄；檢查狀態後修改輸入重新生成會建立新請求並可能再次計費。

Notion 寫入先以 PostgreSQL 原子更新取得送出權。相同文件不重建任務；送出逾時或 DB 回寫失敗會留下 sending/uncertain 狀態，禁止自動重送。管理者需以頁面中的 projectM 文件 ID 到 Notion 核對，找到頁面後在資料庫補上 notion_id 並將 publish_status 設為 complete；只有確認 Notion 沒有建頁才能設回 none。這避免重複，但不宣稱跨服務 exactly-once。

已送到 Notion 的任務以 Notion 為主要來源，工作室原始草稿鎖定。複製文件重新生成會建立不同任務包，使用者應確認是否真的需要新包。

## 測試

`pnpm test` 使用 PGlite PostgreSQL 引擎測試 SQL 保存、版本衝突、權限隔離、併發送出與不確定結果。AI／Notion 在測試中使用 stub；這些測試不是正式服務端到端驗收，也不會寫入真實工作區。
