#!/usr/bin/env python3
"""_body.html から、公開用の index.html と Artifact 用の artifact.html を作る。

本文は _body.html だけが持っている。中身を直したら必ずこれを実行する。
（index.html を直接さわると、次の実行で上書きされる）

  python3 build_artifact.py
"""
from pathlib import Path

TITLE = "辰巳彩香の脳内マップ"
DESC = "辰巳彩香の頭の中にあるものを、動かせる地図にした1枚。いまは合同会社To doのぶんが埋まっている。"

here = Path(__file__).parent
body = (here / "_body.html").read_text(encoding="utf-8").strip()
css = (here / "map.css").read_text(encoding="utf-8").rstrip()
js = (here / "map.js").read_text(encoding="utf-8").rstrip()

# Artifact は <head> を書けないので、body の中身＋インラインの style/script だけ
artifact = f"<title>{TITLE}</title>\n<style>\n{css}\n</style>\n\n{body}\n\n<script>\n{js}\n</script>\n"
(here / "artifact.html").write_text(artifact, encoding="utf-8")

# 公開用は普通の1枚。PWA ではないので manifest も Service Worker も置かない
index = f"""<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>{TITLE}</title>
<meta name="description" content="{DESC}" />
<meta name="theme-color" content="#0a100e" />
<meta name="color-scheme" content="dark" />
<!-- このページは _body.html から build_artifact.py が作っている。直接さわらない -->
<link rel="stylesheet" href="map.css" />
</head>
<body>

{body}

<script src="map.js"></script>

</body>
</html>
"""
(here / "index.html").write_text(index, encoding="utf-8")

print(f"artifact.html: {len(artifact):,} bytes")
print(f"index.html:    {len(index):,} bytes")
