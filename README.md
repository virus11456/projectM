# 營運管理 · 營運中台 Dashboard (FY2026)

公司內部營運中台，整合「日記帳 + Notion 看板」，掌握 **進度 / 進帳 / 現金流 / 收款狀態**。
已啟用登入保護（公司內部機密）。部署於 Vercel。

---

## 頁面

| 路徑 | 內容 |
|---|---|
| `/`（index.html） | 入口頁，連到下列各 live 頁面 |
| `/compare`（compare.html） | **主要看板**：專案時間軸／現金流、每月入帳·淨額、預計收入·應收帳款·應付帳款、應收未收清單、薪資固定成本 |
| `/delivery`（delivery.html） | 交付／Delay 雷達：逾期、14 天內到期、續約雷達 |
| `/pmonth`（pmonth.html） | 專案 × 月份實際進帳明細 |
| `/login`（login.html） | 登入頁（自訂樣式，非瀏覽器原生彈窗） |
| Notion 看板 | 外部連結，於 Notion 編輯專案 → 隔天自動同步回中台 |

全站有 8-bit 像素小助手 **Club**（藍色機器人，`club.js`），閒置時會釣魚/抓蝴蝶/喝手搖/睡覺/打電動/澆花/抽菸；登入頁也會出現打招呼。

---

## 資料來源與流程（全自動、資料驅動）

```
公開 Google Sheet「日記帳」 ──▶ scripts/build_data.py  ──▶ data/projects_monthly.json
Notion「同步看板 FY2026」   ──▶ scripts/fetch_notion.py ──▶ data/notion_projects.json
                                                              │
                                          前端 compare.html 讀 JSON 算收款狀態
```

- **收款狀態完全依真實日記帳判定，不手填、不猜**：
  - 轉入「應收帳款」→ 應收未收
  - 轉入「預計收入」→ 預計
  - 轉入銀行等 → 已收
  - 任何「轉出 應收/預計」分錄（含雙分錄記法）→ 該筆視為已實現，自動沖銷 / 改標已收
- **請款排程**：Notion「請款排程」欄位 `月:金額:標籤;...`，搭配「對帳關鍵字」(`jkey`) 對應日記帳描述，頭尾款自動連動。

---

## 每日自動同步（不用人工提醒）

`.github/workflows/sync.yml`：

- 排程：`cron: 0 1 * * *`（UTC 01:00 = 台灣每天 **09:00**），也可在 Actions 手動觸發。
- 步驟：`checkout ref: main` → 跑 `build_data.py`（日記帳）→ 跑 `fetch_notion.py`（Notion）→ 有變更就 commit → `git push` 到 `main` → Vercel 的 GitHub 整合自動部署。
- **提交身份必須用擁有者 email**（見下方「維運注意事項」）。

> 若要更頻繁（例如每 3 小時），改 cron 即可；免費額度足夠（每次執行約 15 秒）。

---

## 登入保護

`middleware.js`（Vercel Edge Middleware）：

- 保護所有路徑（含 `data/*.json`）；只放行 `/login` 與 `/club.js`。
- Cookie session（`sm_auth`，30 天），HMAC-SHA256 簽章 + 到期時間、timing-safe 比對、`HttpOnly; Secure; SameSite=Lax`。
- 需要的環境變數（設在 Vercel 專案 Environment Variables）：
  - `BASIC_AUTH_USER`、`BASIC_AUTH_PASS`（帳密）
  - `AUTH_SECRET`（簽 cookie 用的密鑰）
- 未設齊會回傳 503。

---

## ⚠️ 維運注意事項（踩過的坑，務必保留）

1. **Vercel 會擋「作者 email 未綁定 Git 帳號」的 production 部署。**
   - 症狀：部署狀態 `BLOCKED`，錯誤訊息 `commit email ... could not be matched to a Git account`。preview 正常、只有 production 被擋。
   - 對策：**所有要部署的 commit，作者 email 必須是擁有者帳號的 email**（建議使用已驗證的 GitHub noreply 信箱）。`sync.yml` 的 `git config user.email` 已設為此值，切勿改回 `auto-sync[bot]` 之類。

2. **`NOTION_TOKEN` 必須設在 GitHub Repo Secrets**，否則每日 Notion 同步會被跳過（log 出現「⚠️ 未設定 NOTION_TOKEN，略過 Notion 同步」），Notion 卡片不會自動更新。
   - 設定位置：GitHub → Settings → Secrets and variables → Actions → New repository secret，Name = `NOTION_TOKEN`。

3. `VERCEL_TOKEN` 未設沒關係 —— 部署是靠 Vercel 的 GitHub 整合（push 觸發），workflow 裡的 `vercel deploy` 步驟只是備援。

---

## 檢查紀錄

部署與登入保護的驗證紀錄請保存在內部文件，勿在公開文件附上客戶名稱、個人聯絡資料或實際帳務數字。

---

## 本機開發

```bash
# 重抓日記帳資料
python3 scripts/build_data.py
# 重抓 Notion（需 NOTION_TOKEN）
NOTION_TOKEN=secret_xxx python3 scripts/fetch_notion.py
```

部署：推到 `main` 由 Vercel 自動部署（記得 commit 作者用擁有者 email）。
