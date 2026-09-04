#!/usr/bin/env python3
"""_body.html から、公開用の index.html と Artifact 用の artifact.html を作る。

本文は _body.html だけが持っている。中身を直したら必ずこれを実行する。
（index.html を直接さわると、次の実行で上書きされる）

  python3 build.py
"""
import segno
from pathlib import Path

TITLE = "辰巳彩香｜合同会社To do"
DESC = "合同会社To do・辰巳彩香のオンライン名刺。連絡先はそのまま電話帳に入れられます。"
URL = "https://todo2023.github.io/my-ai-agent/todo_meishi/"

here = Path(__file__).parent
body = (here / "_body.html").read_text(encoding="utf-8").strip()
css = (here / "card.css").read_text(encoding="utf-8").rstrip()
js = (here / "card.js").read_text(encoding="utf-8").rstrip()

# このページ自身のQR。外のファイルにせず本文に埋めるので、Artifact でも出る
qr = segno.make(URL, error="m")
svg = qr.svg_inline(scale=1, border=2, dark="#12362f", omitsize=True)
svg = svg.replace("<svg ", '<svg role="img" aria-label="この名刺のQRコード" ', 1)
body = body.replace("<!--QR-->", svg + f'\n        <p class="qr__url">{URL}</p>')

# Artifact は <head> を書けないので、body の中身＋インラインの style/script だけ
artifact = f"<title>{TITLE}</title>\n<style>\n{css}\n</style>\n\n{body}\n\n<script>\n{js}\n</script>\n"
(here / "artifact.html").write_text(artifact, encoding="utf-8")

index = f"""<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>{TITLE}</title>
<meta name="description" content="{DESC}" />
<meta name="color-scheme" content="light dark" />
<meta property="og:title" content="{TITLE}" />
<meta property="og:description" content="{DESC}" />
<meta property="og:type" content="profile" />
<meta property="og:url" content="{URL}" />
<!-- このページは _body.html から build.py が作っている。直接さわらない -->
<link rel="stylesheet" href="card.css" />
</head>
<body>

{body}

<script src="card.js"></script>

</body>
</html>
"""
(here / "index.html").write_text(index, encoding="utf-8")

print(f"artifact.html: {len(artifact):,} bytes")
print(f"index.html:    {len(index):,} bytes")
print(f"QR: {qr.symbol_size(scale=1, border=2)[0]}x マス / {URL}")
