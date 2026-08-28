#!/usr/bin/env python3
"""秘書担当の日次サマリーを、items.json から1本の一覧に整形して出す。

外部への通信はしない。APIキーも要らない。標準ライブラリだけで動く。
費用はゼロ（CLAUDE.md の第一ルール）。

    python3 hisho/daily.py                  # 全件（既定）
    python3 hisho/daily.py --state 判断待ち  # 状態でしぼる
    python3 hisho/daily.py --business match # 事業でしぼる
    python3 hisho/daily.py --brief          # 1行ずつの短い版
    python3 hisho/daily.py --out today.md   # ファイルに書き出す
"""

import argparse
import datetime
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ITEMS = os.path.join(HERE, "items.json")

# 日次で見るときの並び。手が要るものを上に置く。
STATE_ORDER = ["判断待ち", "止まっている", "手つかず", "進行中", "順調", "完了"]


def load(path):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    biz = {b["key"]: b for b in data["businesses"]}
    problems = []
    for it in data["items"]:
        if it["business"] not in biz:
            problems.append("%s: 知らない business キー %r" % (it["id"], it["business"]))
        if it["state"] not in STATE_ORDER:
            problems.append("%s: 知らない state %r" % (it["id"], it["state"]))
    if problems:
        sys.exit("items.json がおかしい:\n  " + "\n  ".join(problems))

    return data, biz


def sort_key(item, biz):
    return (STATE_ORDER.index(item["state"]), biz[item["business"]]["priority"], item["id"])


def render(data, biz, items, brief=False):
    today = datetime.date.today().isoformat()
    out = []
    out.append("# 日次サマリー %s" % today)
    out.append("")
    out.append("全事業を1本にまとめた一覧。元データは `hisho/items.json`（更新日 %s）。" % data["updated"])
    out.append("")

    # 数の内訳。まず「何件、代表の手が要るか」が分かるようにする。
    counts = {}
    for it in items:
        counts[it["state"]] = counts.get(it["state"], 0) + 1
    breakdown = " / ".join("%s %d件" % (s, counts[s]) for s in STATE_ORDER if s in counts)
    waiting = sum(1 for it in items if it["owner"] == "代表" and it["state"] != "完了")
    out.append("**%d件**（%s）" % (len(items), breakdown))
    out.append("")
    out.append("うち **代表の判断・作業が要るもの：%d件**" % waiting)
    out.append("")
    out.append("---")
    out.append("")

    if brief:
        for it in items:
            out.append("- **[%s] %s**（%s）" % (it["state"], it["title"], biz[it["business"]]["label"]))
            out.append("  → %s（%s）" % (it["next_action"], it["owner"]))
        out.append("")
        return "\n".join(out)

    for i, it in enumerate(items, 1):
        out.append("## %d. [%s] %s" % (i, it["state"], it["title"]))
        out.append("")
        out.append("**事業**：%s　／　**動かす人**：%s" % (biz[it["business"]]["label"], it["owner"]))
        out.append("")
        out.append("**背景**　%s" % it["background"])
        out.append("")
        out.append("**根拠**　%s" % it["evidence"])
        out.append("")
        out.append("**次アクション**　%s" % it["next_action"])
        out.append("")
        out.append("<sub>出どころ：%s</sub>" % it["source"])
        out.append("")

    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser(description="秘書担当の日次サマリーを出す")
    ap.add_argument("--state", help="状態でしぼる（%s）" % " / ".join(STATE_ORDER))
    ap.add_argument("--business", help="事業キーでしぼる（items.json の businesses を参照）")
    ap.add_argument("--brief", action="store_true", help="1行ずつの短い版")
    ap.add_argument("--out", help="書き出し先のファイル")
    args = ap.parse_args()

    data, biz = load(ITEMS)
    items = data["items"]

    if args.state:
        if args.state not in STATE_ORDER:
            sys.exit("知らない状態: %s（使えるのは %s）" % (args.state, " / ".join(STATE_ORDER)))
        items = [it for it in items if it["state"] == args.state]
    if args.business:
        if args.business not in biz:
            sys.exit("知らない事業キー: %s（使えるのは %s）" % (args.business, " / ".join(biz)))
        items = [it for it in items if it["business"] == args.business]

    items = sorted(items, key=lambda it: sort_key(it, biz))
    text = render(data, biz, items, brief=args.brief)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(text + "\n")
        print("書き出した: %s（%d件）" % (args.out, len(items)))
    else:
        print(text)


if __name__ == "__main__":
    main()
