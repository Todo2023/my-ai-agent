"""町の構成（＝投稿カテゴリ）。

イメージ図の4つの吹き出しをそのまま情報設計にしている。
画面の入口は町のマップで、住人は「どの施設に行くか」で投稿の種類を選ぶ。

    ひろば     うちの子のことをみんなに知ってもらおう！
    そうだん所  疑問はみんなで話し合おう！
    まなび舎   楽しみながら学んじゃおう！
    マーケット  便利なグッズをシェアしよう！

AIがペット目線で物語を書くのは「ひろば」だけ。
質問・学び・グッズは飼い主自身の言葉をそのまま残す。
悩みや相談をAIに書き直させると、事実でないことが混ざって相談として成立しなくなるため。
"""

from __future__ import annotations

import store

CATEGORIES = {
    "showcase": {
        "place": "ひろば",
        "label": "うちの子紹介",
        "callout": "うちの子のことをみんなに知ってもらおう！",
        "example": "今日は誕生日。家族みんなでお祝いしたよ",
        "prompt_hint": "きょうのできごとを一言で",
        "ai_writes": True,   # AIがペット目線の物語にする
    },
    "question": {
        "place": "そうだん所",
        "label": "質問・相談",
        "callout": "疑問はみんなで話し合おう！",
        "example": "みんなは暑さ対策ってどんなことしてる？",
        "prompt_hint": "聞いてみたいこと",
        "ai_writes": False,
    },
    "learn": {
        "place": "まなび舎",
        "label": "学び",
        "callout": "楽しみながら学んじゃおう！",
        "example": "デンタルケアの正しいやり方を学びたい",
        "prompt_hint": "学びたいこと・知ったこと",
        "ai_writes": False,
    },
    "goods": {
        "place": "マーケット",
        "label": "グッズ共有",
        "callout": "便利なグッズをシェアしよう！",
        "example": "最近買ったこのウェア、着せやすくてオススメです",
        "prompt_hint": "おすすめのグッズと、その理由",
        "ai_writes": False,
    },
}

ORDER = list(CATEGORIES)


def normalize(value: str | None) -> str:
    """カテゴリIDを正規化する。不明なら「ひろば」。"""
    text = (value or "").strip().lower()
    return text if text in CATEGORIES else "showcase"


def place(category: str) -> str:
    return CATEGORIES[normalize(category)]["place"]


def label(category: str) -> str:
    return CATEGORIES[normalize(category)]["label"]


def writes_story(category: str) -> bool:
    """AIがペット目線の物語を書く施設かどうか。"""
    return CATEGORIES[normalize(category)]["ai_writes"]


def map_counts() -> list[dict]:
    """町のマップに出す、施設ごとの投稿数。"""
    posts = store.list_posts(limit=1000)
    return [
        dict(
            CATEGORIES[category],
            id=category,
            count=sum(1 for post in posts if post.category == category),
        )
        for category in ORDER
    ]
