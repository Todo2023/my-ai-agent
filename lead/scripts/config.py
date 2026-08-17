"""リード獲得自動化の設定。

**変えたいものは、ぜんぶこのファイルにある。** 他のファイルは触らなくてよい。
外部ライブラリは使わない（Python 3.9 以上の標準ライブラリだけ）。
"""

from datetime import date
from pathlib import Path

# --- 置き場所 ---------------------------------------------------------------

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
OUTPUT_DIR = ROOT / "output"

TERMS_BANK = DATA_DIR / "terms_bank.csv"  # ネタ帳（人が書く）
UTM_LINKS = DATA_DIR / "utm_links.json"  # generate_utm_links.py が作る
POST_LOG = DATA_DIR / "post_log.csv"  # daily_post_generator.py が追記する

# --- リンク -----------------------------------------------------------------

BASE_URL = "https://todo-llc.netlify.app/contact/"  # 無料相談ページ
CAMPAIGN = "claudecode_series"  # シリーズが増えたらここを変える

# 投稿先ごとの utm_medium。投稿先を足すときはここに1行足す。
PLATFORMS = {
    "x": "sns",
    "note": "article",
    "zenn": "article",
}

# --- CTA（投稿の末尾に付ける1行） -------------------------------------------

CTA_TEMPLATES = {
    "a": "業務の自動化・仕組み化のご相談はこちら → {link}",  # 事業者向け
    "b": "もっと知りたい方はこちら → {link}",  # 個人学習者向け
}

# A/B を交互に割り当てる起点。この日（平日）が A。
AB_EPOCH = date(2026, 1, 1)

# --- 投稿本文 ---------------------------------------------------------------

# ネタ帳の category。この順で交互に選ぶ。
CATEGORIES = ("用語", "コマンド")

POST_TEMPLATE = "{title}\n\n{body}\n\n{cta}\n"
