"""AI Topics の**候補**を集める。毎日1回、GitHub Actions から動く。

なぜ候補だけなのか:
いま載せている1本には「なぜ取り上げたか」と、そこから立てられる問いが
付いている。これは講座の中身を知らないと書けない。AIに書かせれば
毎日出せるが、CLAUDE.md の「自動実行・定期実行を作らない」に当たる。
そこで **探すところだけ機械にやらせ、選ぶのと書くのは人が持つ。**

お金について:
使うのは Google ニュースの RSS だけ。**鍵も契約も要らない。**
公開リポジトリの GitHub Actions は無料で時間の上限もない。
**費用はゼロ。**

出すもの:
topics-inbox.json（リポジトリの中だけ。配信はしない）
    { "updated": "...", "items": [ {date, title, url, source, q} ... ] }
古いものは自動で落とす（KEEP_DAYS 日）。溜め込まない。

使い方:
    python tools/topics_inbox.py          集めて topics-inbox.json を更新
    python tools/topics_inbox.py --show   いま溜まっている候補を読む
"""

import json
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
OUT = HERE / "topics-inbox.json"

JST = timezone(timedelta(hours=9))

# 何日ぶん取っておくか。読まれずに残ったものは落とす
KEEP_DAYS = 21
# 1回にためる上限。多すぎると読む気が失せる
MAX_ITEMS = 60

# 探す言葉。**講座の話につながるもの**に寄せてある。
# 「AIの新機能」ではなく「AIが当たり前になった先で何に価値が置かれるか」
QUERIES = [
    "生成AI 大学 教育",
    "生成AI 就活 学生",
    "AI 採用 スキル 変化",
    "生成AI ガイドライン 文部科学省",
    "AIエージェント 企業 導入",
    "AI 思考力 問い",
]

UA = "todo-topics-inbox/1.0 (+https://github.com/Todo2023/my-ai-agent)"


def feed(query: str) -> str:
    q = urllib.parse.quote(query)
    return (f"https://news.google.com/rss/search?q={q}"
            "&hl=ja&gl=JP&ceid=JP:ja")


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def clean(s: str) -> str:
    s = re.sub(r"<[^>]+>", "", s or "")
    return re.sub(r"\s+", " ", s).strip()


def collect() -> list[dict]:
    out, seen = [], set()
    for q in QUERIES:
        try:
            root = ET.fromstring(fetch(feed(q)))
        except Exception as e:                      # 1つ落ちても止めない
            print(f"  ! {q}: {e}")
            continue
        for item in root.iter("item"):
            title = clean(item.findtext("title", ""))
            link = (item.findtext("link", "") or "").strip()
            if not title or not link or link in seen:
                continue
            seen.add(link)
            src = item.findtext("{*}source") or item.findtext("source") or ""
            out.append({
                "date": (item.findtext("pubDate", "") or "")[:16],
                "title": title,
                "url": link,
                "source": clean(src),
                "q": q,
            })
        print(f"  {q}  {len(out)}件（累計）")
    return out


def load() -> dict:
    if not OUT.exists():
        return {"updated": "", "items": []}
    try:
        return json.loads(OUT.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"updated": "", "items": []}


def main() -> None:
    if "--show" in sys.argv:
        data = load()
        items = data.get("items", [])
        print(f"{len(items)}件（更新 {data.get('updated', '—')}）\n")
        for i, x in enumerate(items[:30], 1):
            print(f"{i:>3}. {x['title']}")
            print(f"     {x.get('source', '')}  {x['url']}")
        return

    old = load()
    fresh = collect()

    # 既にあるものは残す。URLで見分ける
    have = {x["url"] for x in old.get("items", [])}
    added = [x for x in fresh if x["url"] not in have]

    items = added + old.get("items", [])

    # 古いものを落とす。読まれないまま溜まると、探せなくなる
    limit = (datetime.now(JST) - timedelta(days=KEEP_DAYS)).strftime("%Y-%m-%d")
    kept = []
    for x in items:
        seen_on = x.get("seen", "")
        if not seen_on:
            x["seen"] = datetime.now(JST).strftime("%Y-%m-%d")
            seen_on = x["seen"]
        if seen_on >= limit:
            kept.append(x)

    kept = kept[:MAX_ITEMS]
    OUT.write_text(json.dumps({
        "updated": datetime.now(JST).strftime("%Y-%m-%d %H:%M"),
        "items": kept,
    }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    print(f"\n新しく {len(added)}件。いま {len(kept)}件たまっています。")
    print("読むには: python tools/topics_inbox.py --show")


if __name__ == "__main__":
    main()
