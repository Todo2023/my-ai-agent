"""ホーム画面に「アプリ」として入れられる版（PWA）を作るスクリプト。

なぜ別に作るか：
- claude.ai のアーティファクトはページの <head> を自分で持てないため、manifest も
  Service Worker も置けない。Chrome の「ホーム画面に追加」がブラウザのマーク付きの
  ショートカットになってしまう。
- GitHub Pages に置いた index.html なら manifest と Service Worker を持てるので、
  専用アイコンでインストールでき、一度開けば通信なしでも動く（現地での電波切れ対策）。

本体は ciao-hallo.html の1か所だけを編集し、このスクリプトで index.html を作り直す。
    python3 hallo-app/build_pwa.py
アイコンを変えたら sw.js の VERSION を上げる（古いキャッシュを捨てさせるため）。
"""
from pathlib import Path
import re

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
GREEN, ORANGE, PAPER, INK = (20, 119, 74), (196, 82, 10), (246, 248, 245), (23, 32, 27)


def build_index() -> None:
    body = (HERE / "ciao-hallo.html").read_text(encoding="utf-8")
    title = re.search(r"<title>.*?</title>", body).group(0)
    body = body.replace(title, "", 1).lstrip()
    head = f"""<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
{title}
<meta name="description" content="イタリア語とオランダ語の旅行会話（2026/11/9〜13）">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon-192.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<meta name="theme-color" content="#eef1ee" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#111513" media="(prefers-color-scheme: dark)">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Ciao Hallo">
<style>:root{{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}body{{margin:0}}img{{max-width:100%}}[hidden]{{display:none!important}}</style>
</head>
<body>
"""
    tail = """
<script>if("serviceWorker" in navigator)addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));</script>
</body>
</html>
"""
    (HERE / "index.html").write_text(
        "<!-- 自動生成：編集は ciao-hallo.html で行い build_pwa.py を実行する -->\n" + head + body + tail,
        encoding="utf-8",
    )


def draw_icon(size: int, maskable: bool) -> Image.Image:
    """緑（伊）と橙（蘭）の吹き出しが重なる絵。maskable は丸く切り抜かれても欠けないよう小さめに描く"""
    S = 1024
    im = Image.new("RGB", (S, S), PAPER)
    d = ImageDraw.Draw(im)
    k = 0.78 if maskable else 0.92
    c = S / 2
    u = lambda v: c + (v - 512) * k  # 1024基準の座標を縮小
    font = None
    for name in ("/usr/share/fonts/opentype/inter/InterDisplay-Bold.otf", "Inter-Bold.ttf", "DejaVuSans-Bold.ttf"):
        try:
            font = ImageFont.truetype(name, int(250 * k))
            break
        except OSError:
            continue
    for (x0, y0, x1, y1), tail, col, ch in (
        ((150, 230, 600, 640), [(230, 600), (200, 780), (380, 630)], GREEN, "C"),
        ((424, 384, 874, 794), [(794, 754), (824, 934), (644, 784)], ORANGE, "H"),
    ):
        d.polygon([(u(x), u(y)) for x, y in tail], fill=col)
        d.rounded_rectangle([u(x0), u(y0), u(x1), u(y1)], radius=int(120 * k), fill=col, outline=PAPER, width=int(22 * k))
        if font:
            d.text((u((x0 + x1) / 2), u((y0 + y1) / 2) - 8 * k), ch, font=font, fill=PAPER, anchor="mm")
    return im.resize((size, size), Image.LANCZOS)


def build_icons() -> None:
    draw_icon(192, False).save(HERE / "icon-192.png")
    draw_icon(512, False).save(HERE / "icon-512.png")
    draw_icon(512, True).save(HERE / "icon-maskable-512.png")
    draw_icon(180, False).save(HERE / "apple-touch-icon.png")


if __name__ == "__main__":
    build_index()
    build_icons()
    print("index.html とアイコンを作りました")
