#!/usr/bin/env python3
"""脳内マップを、Obsidian の保管庫に入れられる Markdown 一式に書き出す。

    python3 obsidian_export.py            # obsidian/ に書き出す
    python3 obsidian_export.py ~/vault    # 保管庫の中に直接書き出す

丸ひとつが1枚のノートになり、線が [[リンク]] になる。
出どころ・確かさは frontmatter に入るので、Obsidian 側で絞り込める。

中身は map.data.js だけが持っている。ここは形を変えるだけで、事実は足さない。
"""
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
OUT = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else HERE / "obsidian"
ROOT = "竹田彩香の脳内マップ"

# Obsidian のファイル名に使えない文字
BAD = r'[\\/:*?"<>|#^\[\]]'


def load():
    """map.data.js を node に読ませて、そのまま受け取る。写し間違いが起きない。"""
    out = subprocess.run(
        ["node", "-e", "process.stdout.write(JSON.stringify(require('./map.data.js')))"],
        cwd=HERE, capture_output=True, text=True, check=True,
    )
    return json.loads(out.stdout)


def fname(label):
    return re.sub(BAD, "-", label).strip()


def front(pairs):
    lines = ["---"]
    for k, v in pairs:
        if v is None or v == []:
            continue
        if isinstance(v, list):
            lines.append(f"{k}:")
            lines += [f"  - {x}" for x in v]
        else:
            lines.append(f"{k}: {v}")
    lines.append("---")
    return "\n".join(lines)


def main():
    data = load()
    nodes = {n["id"]: n for n in data["NODES"]}
    cats, sure = data["CATS"], data["SURE"]

    # 隣り合う丸をひろう
    near = {i: [] for i in nodes}
    for a, b in data["LINKS"]:
        if a in nodes and b in nodes:
            near[a].append(b)
            near[b].append(a)

    OUT.mkdir(parents=True, exist_ok=True)
    written = []

    for n in data["NODES"]:
        key = n.get("sure") or ("site" if n.get("src") else "guess")
        body = n.get("body") or "（まだ短い言葉しか入っていません）"

        text = front([
            ("種類", cats[n["cat"]]["label"]),
            ("確かさ", sure[key]["label"]),
            ("出どころ", n.get("src")),
            ("tags", ["脳内マップ", "確かさ/" + key, "種類/" + n["cat"]]),
        ])
        text += f"\n\n# {n['label']}\n\n{body}\n"

        if n.get("link"):
            text += f"\n[{n.get('linkLabel') or n['link']}]({n['link']})\n"

        if n.get("waiting"):
            text += f"\n> [!note] まだ埋まっていない\n> {n['waiting']}\n"

        if near[n["id"]]:
            text += "\n## つながっている丸\n\n"
            text += "".join(f"- [[{fname(nodes[m]['label'])}]]\n" for m in sorted(set(near[n["id"]])))

        text += f"\n---\n{sure[key]['note']}\n"

        path = OUT / (fname(n["label"]) + ".md")
        path.write_text(text, encoding="utf-8")
        written.append(n)

    # 入口のノート。種類ごとに並べる
    idx = front([("tags", ["脳内マップ", "MOC"])]) + f"\n\n# {ROOT}\n\n"
    idx += "頭の中にあるものを丸にして並べた地図を、ノートに開いたもの。\n"
    idx += "`obsidian_export.py` が作っているので、手で直すと次の書き出しで消える。\n"
    for cid, c in cats.items():
        group = [n for n in written if n["cat"] == cid]
        if not group:
            continue
        idx += f"\n## {c['label']}\n\n"
        idx += "".join(f"- [[{fname(n['label'])}]]\n" for n in group)

    guess = [n for n in written if (n.get("sure") or ("site" if n.get("src") else "guess")) == "guess"]
    idx += "\n## 未確認（こちらで補ったもの）\n\n"
    idx += "事実として扱わないこと。違っていたら直す。\n\n"
    idx += "".join(f"- [[{fname(n['label'])}]]\n" for n in guess)

    (OUT / (ROOT + ".md")).write_text(idx, encoding="utf-8")

    # 丸の名前が変わったり消えたりしたときに、前の名前のノートが残らないようにする。
    # 前回この書き出しが作ったファイルだけを控えてあり、そこに載っているものしか
    # 消さない。保管庫へ直接書き出しても、自分で作ったノートには触れない。
    made = sorted([fname(n["label"]) + ".md" for n in written] + [ROOT + ".md"])
    manifest = OUT / ".export-manifest.txt"
    removed = []
    if manifest.exists():
        before = manifest.read_text(encoding="utf-8").splitlines()
        for old in before:
            if old and old not in made and (OUT / old).exists():
                (OUT / old).unlink()
                removed.append(old)
    manifest.write_text("\n".join(made) + "\n", encoding="utf-8")

    note = f"／ 前の名前のノートを{len(removed)}枚消した" if removed else ""
    print(f"{OUT} に {len(made)} 枚（入口1枚 + 丸{len(written)}枚）{note}")
    for r in removed:
        print(f"  消した: {r}")


if __name__ == "__main__":
    main()
