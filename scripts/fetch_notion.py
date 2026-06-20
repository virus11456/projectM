#!/usr/bin/env python3
"""
從 Notion「📥 Trello 同步看板（FY2026）」抓取所有專案卡片，
輸出 data/notion_projects.json，供中台的「交付/Delay 雷達」與「重點提醒」使用。

需要環境變數 NOTION_TOKEN（Notion 內部整合 token，且該整合要被加到此資料庫的 Connections）。

用法：NOTION_TOKEN=secret_xxx python3 scripts/fetch_notion.py
"""
import os, json, datetime, urllib.request

TOKEN = os.environ["NOTION_TOKEN"]
DB = "51e7d8bdea014a32ad1fb7c8d13c0384"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "notion_projects.json")
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
}

def _title(p):
    return "".join(t["plain_text"] for t in p.get("title", [])) if p else ""

def _sel(p):
    v = p.get("select") if p else None
    return v["name"] if v else None

def _date(p):
    v = p.get("date") if p else None
    return v["start"][:10] if v and v.get("start") else None

def _text(p):
    return "".join(t["plain_text"] for t in p.get("rich_text", [])) if p else ""

def main():
    cards, cursor = [], None
    while True:
        body = {"page_size": 100}
        if cursor:
            body["start_cursor"] = cursor
        req = urllib.request.Request(
            f"https://api.notion.com/v1/databases/{DB}/query",
            data=json.dumps(body).encode(), method="POST", headers=HEADERS)
        d = json.load(urllib.request.urlopen(req))
        for pg in d["results"]:
            pr = pg["properties"]
            name = _title(pr.get("專案名稱"))
            if not name:
                continue
            cards.append({
                "name": name,
                "status": _sel(pr.get("狀態")),
                "due": _date(pr.get("截止日期")),
                "priority": _sel(pr.get("優先級")),
                "customer": _text(pr.get("客戶")),
                "note": _text(pr.get("備註")),
                "last": _date(pr.get("最後活動")),
            })
        if d.get("has_more"):
            cursor = d["next_cursor"]
        else:
            break
    out = {
        "updated": datetime.date.today().isoformat(),
        "source": "Notion 同步看板（FY2026）",
        "db": f"https://app.notion.com/p/{DB}",
        "cards": cards,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=0)
    print(f"✓ 寫入 {OUT}：{len(cards)} 張卡片，{sum(1 for c in cards if c['due'])} 張有截止日期")

if __name__ == "__main__":
    main()
