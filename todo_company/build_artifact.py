#!/usr/bin/env python3
"""index.html と同じ中身を、Artifact 用の1枚 HTML（断片）に固める。

Artifact は <head> を書けないので、body の中身＋インラインの style/script だけを出力する。
map.css / map.js / _body.html を直したら、これを実行して artifact.html を更新する。
"""
from pathlib import Path

here = Path(__file__).parent
body = (here / "_body.html").read_text(encoding="utf-8").strip()
css = (here / "map.css").read_text(encoding="utf-8").rstrip()
js = (here / "map.js").read_text(encoding="utf-8").rstrip()

out = (
    "<title>合同会社To do の脳内マップ</title>\n"
    f"<style>\n{css}\n</style>\n\n{body}\n\n<script>\n{js}\n</script>\n"
)
(here / "artifact.html").write_text(out, encoding="utf-8")
print(f"artifact.html: {len(out)} bytes")
