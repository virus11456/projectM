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

## 可重複執行的上線前驗收

使用 Node 24，先 `pnpm install --frozen-lockfile`，再 `pnpm test`。測試使用本機 PGlite 與 HTTP 替身，不接觸正式資料、AI 或 Notion。

1. 由安全的環境注入方式提供設定（Node 24 可使用 `node --env-file=/受保護路徑/studio.env scripts/studio-preflight.cjs`）。不要把密鑰貼在命令列、PR、Notion 或提交 `.env`。`pnpm studio:preflight` 不會自動載入 `.env`。
2. 執行 `pnpm studio:preflight`：只檢查八個必要環境變數、PostgreSQL URL 前置格式、Notion data source ID 的完整 UUID／32 位 hex 格式。預設不連任何服務；`database/status: skipped` 不等於已驗證。
3. 在隔離的測試資料庫先明確執行 `pnpm studio:init`，再 `pnpm studio:preflight --database`。後者只使用 READ ONLY transaction 與系統 metadata，檢查應用程式 search_path 下的全部欄位型別、必要 NOT NULL、id 主鍵及 SELECT/INSERT/UPDATE 權限；不讀文件、不建表、不寫入、不呼叫 AI/Notion。缺表或連線失敗需由管理者處理；此工具不會自動修復。連線／查詢有逾時限制並關閉連線。初始化需要 DDL 權限，與執行期 DML 權限不同。
4. 在允許檢查的部署登入後，以安全方式將該站 session 的完整 `sm_auth=...` cookie 注入 `STUDIO_PREFLIGHT_COOKIE`，執行 `pnpm studio:preflight --status-url https://YOUR-HOST/api/studio?action=status`。只送一次 GET、不跟隨重導向、不自動登入。必須 HTTP 200、JSON、Cache-Control no-store，以及 `ai/notion/tasks=true`、`storage="可用"` 才通過。登入頁 HTML、302、401、過期 cookie、未就緒 payload 均失敗。cookie 是祕密，使用後移除，不能提交。

可合併兩個選項。輸出只含固定檢查名稱及通過／失敗，不包含設定值、URL、cookie 或上游錯誤。exit 0 表示已執行檢查全部通過，exit 1 表示失敗或參數錯誤，可作為 CI gate。`upstream: not_verified` 永遠提醒：這不證明 OpenAI 模型可用、Notion ID 指向正確資料來源或 integration 權限有效。status 的 storage 只驗證連線及 id 欄位可讀；完整 schema 請另跑 `--database`。格式合格的 UUID 仍可能是錯誤的 database/page ID。

### Vercel 仍需人工提供／確認

| 設定 | 必要人工操作 |
| --- | --- |
| BASIC_AUTH_USER、BASIC_AUTH_PASS、AUTH_SECRET | 確認公司共用登入設定；用安全方式提供密碼與簽章祕密 |
| DATABASE_URL | 提供受保護 PostgreSQL 的應用程式連線，依供應商要求配置 TLS；由管理者在正確目標初始化 schema |
| OPENAI_API_KEY、OPENAI_MODEL | 提供可計費帳戶的 key 與實際可用、支援 Chat Completions JSON object 的模型 |
| NOTION_TOKEN | 提供網站專用 integration token；Notion MCP 連線不會自動提供此 token |
| NOTION_TASK_DATA_SOURCE_ID | Notion 設定頁目前記錄 `57b086f6-5c52-483f-8530-8991a0d6846d`；人工核對為 Tasks data source，並分享目的地與測試會議頁給 integration |

請在 Vercel 確認變數的 Production／Preview scope、production branch 與版本。此 PR 不部署，也不讀取或修改 Vercel 憑證。Notion 的會議資料來源 ID 不需新增為環境變數，網站讀取的是使用者指定會議頁。正式報價範本與標準價目仍需公司確認。

### 真實服務 E2E 最小驗收（由管理者另行執行）

使用明確標示「驗收」的非敏感會議與隔離 Tasks 目的地，預先同意 AI 費用與測試頁寫入；不要使用正式業務資料。

1. 未登入訪問 `/studio` 與 status 必須被登入保護；登入後執行上述 status gate 與 database gate。
2. 在網站讀取已分享的測試 Notion 會議頁，確認文字與來源；以該內容產生一個任務包，核對標題、1–40 個子項目、負責人、期限與驗收條件。確認是真實模型結果，文件 ID、model、usage 與時間已保存，重新載入 `/studio?id=UUID` 仍可讀取。
3. 編輯並保存，重新載入確認版本；舊分頁保存應出現版本衝突。以相同生成請求 ID 重送應返回原文件，不再次呼叫 AI／計費。
4. 明確確認後送到測試 Tasks，只建立一筆任務包頁，含 projectM 文件 ID 與來源會議連結；再次送出不得重建。於 Notion 勾選一項，再於網站讀取最新進度；已送出草稿應鎖定。
5. 記錄驗收時間、部署 commit、測試文件 ID、Notion 測試頁連結及每項通過／失敗，不能記錄密鑰或 cookie。遇 sending/uncertain，依「失敗與重試」人工核對，不盲目重送。驗收測試頁與文件由管理者按既定清理政策處理。

### 2026-10-02 分支與設定核對

Notion「projectM AI 工作室｜整合設定」最後編輯仍為 2026-09-29：PR #4 已合併且部署，服務憑證、PostgreSQL 初始化及正式 E2E 尚待完成。GitHub 實際 default branch 是 `claude/zealous-ride-c2zua5`（`9ee963d`），其已透過 PR #5 納入 main 的工作室程式。main 為 `9f398bf`，2026-10-01 仍有每日資料同步 commit，因此「9/29 後沒有新 commit」不適用於 main。main 與 default 的差異位於資料 JSON，此變更以 default branch 為基底，不修改那些資料。合併 PR 前應再次確認 Vercel 真正使用的 production branch；合併可能由既有 Git integration 觸發部署，需由管理者安排。
