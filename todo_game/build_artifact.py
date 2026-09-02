#!/usr/bin/env python3
"""index.html と同じ中身を、Artifact 用の1枚 HTML（断片）に固める。

Artifact は <head> を書けないので、body の中身＋インラインの style/script だけを出力する。
game.css / game.js を直したら、これを実行して artifact.html を更新する。
"""
from pathlib import Path

here = Path(__file__).parent
body = (here / "_body.html").read_text(encoding="utf-8").strip()
css = (here / "game.css").read_text(encoding="utf-8").rstrip()
js = (here / "game.js").read_text(encoding="utf-8").rstrip()

out = f"<title>トドの晩酌</title>\n<style>\n{css}\n</style>\n\n{body}\n\n<script>\n{js}\n</script>\n"
(here / "artifact.html").write_text(out, encoding="utf-8")
print(f"artifact.html: {len(out)} bytes")
