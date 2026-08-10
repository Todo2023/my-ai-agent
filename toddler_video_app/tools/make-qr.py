"""共有用のQRコード（qr.png）を作る。

    pip install segno && python3 tools/make-qr.py

URL を変えたときは URL を直して実行し直す。
"""

from pathlib import Path

import segno

URL = "https://todo2023.github.io/todo-wanwan/"
OUT = Path(__file__).resolve().parent.parent / "qr.png"

qr = segno.make(URL, error="h")  # 少し汚れても読めるように誤り訂正は最高レベル
qr.save(OUT, scale=12, border=3, dark="#4a3b2f", light="#ffffff")

print(f"{OUT.name} を作りました（{URL}）")
