"use strict";
const $ = (id) => document.getElementById(id);
const labels = {
  report: "月報／週報",
  quotation: "報價單",
  plan: "行銷企劃",
  tasks: "任務包",
};
const helps = {
  report: "匯入成效數據與執行紀錄，整理本期成果及下期建議。",
  quotation: "依公司範本與價目整理報價草稿，未確認金額不會當作收入。",
  plan: "從會議需求整理策略、交付內容、時程、預算與 KPI。",
  tasks: "將確認後的會議或文件拆成工作清單，核對後寫入 Notion。",
};
let kind = "report",
  current = null,
  busy = false,
  dirty = false,
  services = {},
  generationRequest = null;
async function api(action, body, documentId = current?.id) {
  const response = await fetch(
    body
      ? "/api/studio"
      : `/api/studio?${new URLSearchParams({ action, ...(documentId ? { id: documentId } : {}) })}`,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...body }),
        }
      : {},
  );
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error("登入已過期，請重新登入");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "操作失敗");
  return data;
}
function message(value, error = false) {
  $("message").textContent = value;
  $("message").classList.toggle("error", error);
}
async function run(fn) {
  if (busy) return;
  busy = true;
  document.querySelectorAll("button").forEach((b) => (b.disabled = true));
  try {
    await fn();
  } catch (e) {
    message(e.message, true);
  } finally {
    busy = false;
    updateButtons();
  }
}
function updateButtons() {
  document.querySelectorAll("button").forEach((b) => (b.disabled = false));
  $("generate-button").disabled = !(services.ai && services.storage === "可用");
  $("import-notion").disabled = !services.notion;
  const locked = current?.publish_status !== "none";
  $("save").disabled = !current || locked;
  $("publish").disabled = !current || !services.tasks || locked || dirty;
  $("task-refresh").disabled = !current?.notion_id;
}
function selectKind(value) {
  kind = value;
  $("kind-title").textContent = labels[kind];
  $("kind-help").textContent = helps[kind];
  $("period-label").hidden = kind !== "report";
  $("period").required = kind === "report";
  $("quote-fields").hidden = kind !== "quotation";
  $("template").required = $("pricing").required = kind === "quotation";
  document
    .querySelectorAll("[data-kind]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.kind === kind)),
    );
  generationRequest = null;
}
function render(row) {
  current = row;
  dirty = false;
  $("editor").hidden = !row.document;
  if (!row.document) {
    message(
      row.status === "pending"
        ? "產出尚未完成。請稍後從紀錄重新載入。"
        : "這次產出失敗，沒有可用結果。",
      true,
    );
    return;
  }
  $("doc-title").value = row.document.title;
  $("doc-body").value = row.document.body;
  $("version").textContent = `版本 ${row.version} · ${labels[row.kind]}`;
  $("task-editor").replaceChildren();
  for (const [index, t] of row.document.tasks.entries()) {
    const box = document.createElement("fieldset");
    box.className = "task";
    const legend = document.createElement("legend");
    legend.textContent = `任務 ${index + 1}`;
    box.append(legend);
    for (const [key, label] of Object.entries({
      title: "工作項目",
      owner: "負責人",
      due: "期限",
      acceptance: "驗收條件",
    })) {
      const el = document.createElement("label");
      el.textContent = label;
      const input = document.createElement("input");
      input.dataset.key = key;
      input.value = t[key];
      input.maxLength =
        key === "acceptance" ? 800 : key === "title" ? 200 : 100;
      el.append(input);
      box.append(el);
    }
    $("task-editor").append(box);
  }
  $("publish-area").hidden = row.kind !== "tasks";
  $("confirmed").checked = false;
  $("notion-link").hidden = !row.notion_id;
  if (row.notion_id)
    $("notion-link").href =
      `https://www.notion.so/${row.notion_id.replaceAll("-", "")}`;
  $("task-status").textContent = ["sending", "uncertain"].includes(
    row.publish_status,
  )
    ? "送出結果待核對，為避免重複建立已停止重送。請管理者在 Notion 核對文件識別碼。"
    : row.notion_id
      ? "已寫入 Notion；後續請在 Notion 編輯。"
      : "";
  const locked = row.publish_status !== "none";
  $("editor")
    .querySelectorAll("input:not([type=checkbox]),textarea")
    .forEach((el) => (el.readOnly = locked));
  history.replaceState(null, "", `/studio?id=${row.id}`);
  updateButtons();
}
function edited() {
  return {
    title: $("doc-title").value,
    body: $("doc-body").value,
    tasks: [...$("task-editor").children].map((box) =>
      Object.fromEntries(
        [...box.querySelectorAll("input")].map((el) => [
          el.dataset.key,
          el.value,
        ]),
      ),
    ),
  };
}
function output() {
  const d = edited();
  return (
    `# ${d.title}\n\n${d.body}` +
    (d.tasks.length
      ? "\n\n## 任務明細\n" +
        d.tasks
          .map(
            (t) =>
              `- [ ] ${t.title}\n  負責人：${t.owner}\n  期限：${t.due}\n  驗收：${t.acceptance}`,
          )
          .join("\n")
      : "")
  );
}
async function refresh() {
  const data = await api("list");
  $("history").replaceChildren();
  if (!data.documents.length)
    $("history").textContent = "尚無文件。匯入資料後即可開始。";
  for (const d of data.documents) {
    const b = document.createElement("button");
    b.textContent = `${d.title || labels[d.kind]} · ${{ complete: "已保存", pending: "處理中", error: "失敗" }[d.status] || d.status}`;
    b.onclick = () =>
      run(async () => {
        if (dirty && !confirm("尚有未保存修改，確定切換？")) return;
        render(await api("get", undefined, d.id));
        message("已載入保存文件");
      });
    $("history").append(b);
  }
}
$("kinds").onclick = (e) => {
  const b = e.target.closest("[data-kind]");
  if (b && !busy) selectKind(b.dataset.kind);
};
$("generate").oninput = () => {
  generationRequest = null;
};
$("editor").oninput = (e) => {
  if (e.target.id !== "confirmed") {
    dirty = true;
    updateButtons();
  }
};
$("source-file").onchange = () =>
  run(async () => {
    const file = $("source-file").files[0];
    if (!file) return;
    if (!/\.(txt|md|csv|tsv)$/i.test(file.name) || file.size > 200000)
      throw new Error("請匯入 200 KB 以內的 UTF-8 文字或 CSV 檔");
    const content = new TextDecoder("utf-8", { fatal: true }).decode(
      await file.arrayBuffer(),
    );
    if (content.length > 60000) throw new Error("來源上限 60,000 字");
    $("source").value = content;
    generationRequest = null;
    message(`已匯入 ${file.name}，請核對內容再產出。`);
  });
$("import-notion").onclick = () =>
  run(async () => {
    message("正在讀取 Notion…");
    const data = await api("meeting", { page: $("meeting-url").value });
    $("source").value = data.source;
    generationRequest = null;
    message("已讀取會議文字，請確認後產出。");
  });
$("generate").onsubmit = (e) => {
  e.preventDefault();
  run(async () => {
    if (dirty && !confirm("尚有未保存修改，確定產生新文件？")) return;
    const input = {
      kind,
      project: $("project").value,
      source: $("source").value,
      period: $("period").value,
      template: $("template").value,
      pricing: $("pricing").value,
      sourcePage: $("meeting-url").value,
    };
    generationRequest ||= crypto.randomUUID();
    message("正在呼叫 AI 並保存結果，請稍候…");
    const row = await api("generate", { id: generationRequest, input });
    render(row);
    await refresh();
    message("草稿已保存。請核對內容與數字。");
  });
};
$("save").onclick = () =>
  run(async () => {
    render(
      await api("save", {
        id: current.id,
        version: current.version,
        document: edited(),
      }),
    );
    await refresh();
    message("修改已保存");
  });
$("download").onclick = () => {
  const a = document.createElement("a");
  const url = URL.createObjectURL(
    new Blob([output()], { type: "text/markdown;charset=utf-8" }),
  );
  a.href = url;
  a.download =
    ($("doc-title")
      .value.replace(/[^\p{L}\p{N} _-]/gu, "")
      .slice(0, 80) || "文件") + ".md";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$("print").onclick = () => {
  $("print-output").textContent = output();
  window.print();
};
$("to-tasks").onclick = () => {
  selectKind("tasks");
  $("source").value = output();
  $("project").value = current.input.project;
  generationRequest = null;
  $("generate").scrollIntoView({ behavior: "smooth" });
  message("已帶入目前文件內容，請按產生並保存草稿以拆解任務。");
};
$("publish").onclick = () =>
  run(async () => {
    if (!$("confirmed").checked) throw new Error("請先勾選確認任務內容");
    if (dirty) throw new Error("請先保存修改");
    message("正在寫入 Notion…");
    render(
      await api("publish", {
        id: current.id,
        version: current.version,
        confirmed: true,
      }),
    );
    message("任務包已寫入 Notion");
  });
$("task-refresh").onclick = () =>
  run(async () => {
    const data = await api("task-status");
    $("task-status").textContent =
      data.tasks
        .map((t) => `${t.checked ? "☑" : "☐"} ${t.text}`)
        .join("\n\n") + (data.has_more ? "\n更多項目請至 Notion 檢視" : "");
    message("已讀取 Notion 最新進度");
  });
$("refresh").onclick = () => run(refresh);
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
run(async () => {
  services = await api("status");
  $("service").textContent =
    `AI：${services.ai ? "已設定" : "尚未設定"}　｜　文件保存：${services.storage}　｜　Notion：${services.notion ? "已設定" : "尚未設定"}　｜　任務寫入：${services.tasks ? "已設定" : "尚未設定"}`;
  if (services.storage === "可用") {
    await refresh();
    const id = new URLSearchParams(location.search).get("id");
    if (id) {
      render(await api("get", undefined, id));
    }
  } else $("history").textContent = "資料庫就緒後可查看文件紀錄。";
});
