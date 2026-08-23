"""デモモード用のダミーデータ。

DEMO_MODE=1 のとき、store.py / notify.py / llm.py は
Supabase・SMTP・Gemini API の代わりにここを使う。
プロジェクトもAPIキーも無い状態で、物語生成から承認フローまで
一通り確かめられるようにするためのもの。

送ったことにしたメールは sent_emails に貯まるだけで、外部には一切出ていかない。
会員・物語・マッチは、コマンドをまたいで続きを試せるように
小さなJSONファイル（既定 .demo_state.json）に保存する。
"""

import datetime
import json
import os
import uuid

# 実際に送られた（ことにした）メール。テストとデモの検証用
sent_emails = []

BASE_MEMBERS = [
    {
        "id": "11111111-1111-4111-8111-111111111111",
        "nickname": "モカママ", "email": "mocha@example.com",
        "pet_name": "モカ", "pet_type": "dog", "breed": "トイプードル", "pet_age": 2,
        "personality_tags": ["甘えん坊", "人見知り"],
        "concern_tags": ["しつけ", "留守番"],
        "area": "東京都世田谷区", "default_post_type": "B", "points": 12,
    },
    {
        "id": "22222222-2222-4222-8222-222222222222",
        "nickname": "そらパパ", "email": "sora@example.com",
        "pet_name": "そら", "pet_type": "dog", "breed": "トイプードル", "pet_age": 3,
        "personality_tags": ["甘えん坊", "やんちゃ"],
        "concern_tags": ["しつけ", "留守番", "多頭飼い"],
        "area": "東京都杉並区", "default_post_type": "A", "points": 8,
    },
    {
        "id": "33333333-3333-4333-8333-333333333333",
        "nickname": "こむぎ飼い主", "email": "komugi@example.com",
        "pet_name": "こむぎ", "pet_type": "dog", "breed": "柴犬", "pet_age": 9,
        "personality_tags": ["警戒心強め"],
        "concern_tags": ["老犬老猫ケア", "健康"],
        "area": "神奈川県横浜市", "default_post_type": "A", "points": 20,
    },
    {
        "id": "44444444-4444-4444-8444-444444444444",
        "nickname": "たま姉", "email": "tama@example.com",
        "pet_name": "たま", "pet_type": "cat", "breed": "アメリカンショートヘア", "pet_age": 5,
        "personality_tags": ["マイペース"],
        "concern_tags": ["多頭飼い", "健康"],
        "area": "大阪府吹田市", "default_post_type": "C", "points": 3,
    },
    {
        "id": "55555555-5555-4555-8555-555555555555",
        "nickname": "ルナの家", "email": "luna@example.com",
        "pet_name": "ルナ", "pet_type": "cat", "breed": "ロシアンブルー", "pet_age": 1,
        "personality_tags": ["人見知り", "マイペース"],
        "concern_tags": ["多頭飼い", "しつけ"],
        "area": "大阪府大阪市", "default_post_type": "B", "points": 5,
    },
]

# 既に投稿されている物語。フィードとレコメンドの見た目を確かめるために入れてある。
BASE_POSTS = [
    {
        "id": "aaaa1111-0000-4000-8000-000000000001",
        "member_id": "22222222-2222-4222-8222-222222222222",
        "post_type": "B",
        "question": "今日、いちばん甘えてきたのはいつでしたか？",
        "raw_input": "夕方、留守番のあと足元にずっとまとわりついていた",
        "generated_story": (
            "きょうも、うちの人は朝からいなくなった。玄関のにおいが遠くなって、"
            "ぼくはソファのはしっこでずっと待っていた。カギの音がした瞬間、"
            "しっぽが勝手に動いた。足元にくっついて、しばらく離れなかった。"
            "ぼくは、待つのがまだ少し苦手だ。でも、帰ってきてくれるのは知っている。"
        ),
        "created_at": "2026-08-21T19:12:00+09:00",
    },
    {
        "id": "aaaa1111-0000-4000-8000-000000000002",
        "member_id": "11111111-1111-4111-8111-111111111111",
        "post_type": "A",
        "question": None,
        "raw_input": "はじめてのトリミング。緊張しっぱなしだった",
        "generated_story": (
            "きょうは知らない場所に連れていかれた。知らないにおい、知らない音。"
            "台の上でじっとしているあいだ、うちの人はずっと見えるところにいてくれた。"
            "終わったら、体が軽くなっていた。がんばったね、と言われて、"
            "ちょっとだけ得意な気持ちになった。"
        ),
        "created_at": "2026-08-22T11:30:00+09:00",
    },
    {
        "id": "aaaa1111-0000-4000-8000-000000000003",
        "member_id": "33333333-3333-4333-8333-333333333333",
        "post_type": "A",
        "question": None,
        "raw_input": "9歳の定期健診。階段をゆっくり上がるようになった",
        "generated_story": (
            "きょうは病院の日だった。若いころは一段とばしで駆け上がった階段を、"
            "いまはゆっくり、一段ずつ。うちの人は先に上って、いつも待っていてくれる。"
            "急かされたことは一度もない。ぼくの速さに合わせてくれる人がいる。"
            "それが、いちばんありがたい。"
        ),
        "created_at": "2026-08-22T16:45:00+09:00",
    },
    {
        "id": "aaaa1111-0000-4000-8000-000000000004",
        "member_id": "55555555-5555-4555-8555-555555555555",
        "post_type": "B",
        "question": "今日は誰か（人でも動物でも）に会いましたか？その時の反応は？",
        "raw_input": "先住猫と初めて同じ部屋で寝られた",
        "generated_story": (
            "この家に来てから、わたしにはずっと気になる相手がいる。"
            "きょう、その子と同じ部屋で眠れた。近づきすぎず、離れすぎず、"
            "ちょうどいい距離。うちの人は何も言わずに、そっとしておいてくれた。"
            "あわてなくていい、と言われている気がした。"
        ),
        "created_at": "2026-08-23T09:05:00+09:00",
    },
]

_state = None


def is_demo() -> bool:
    return os.environ.get("DEMO_MODE") == "1"


def now_iso() -> str:
    return datetime.datetime.now().astimezone().isoformat(timespec="seconds")


def _state_path() -> str:
    return os.environ.get("PAWTOWN_DEMO_STATE", ".demo_state.json")


def _load() -> dict:
    """保存済みの状態を読む。無ければ初期データから作る。"""
    global _state
    if _state is not None:
        return _state
    if os.path.exists(_state_path()):
        with open(_state_path(), encoding="utf-8") as file:
            _state = json.load(file)
    else:
        _state = {
            "members": [dict(member) for member in BASE_MEMBERS],
            "posts": [dict(post) for post in BASE_POSTS],
            "matches": [],
        }
    return _state


def _save():
    with open(_state_path(), "w", encoding="utf-8") as file:
        json.dump(_load(), file, ensure_ascii=False, indent=2)


def reset():
    """テスト用。デモの状態を初期化する。"""
    global _state
    sent_emails.clear()
    _state = None
    if os.path.exists(_state_path()):
        os.remove(_state_path())


def demo_members() -> list[dict]:
    """会員一覧のコピー（読み取り用）。"""
    return [dict(member) for member in _load()["members"]]


def demo_members_raw() -> list[dict]:
    """会員一覧の実体（更新用）。変更後は save_members() を呼ぶ。"""
    return _load()["members"]


def demo_posts() -> list[dict]:
    return _load()["posts"]


def demo_matches() -> list[dict]:
    return _load()["matches"]


save_members = _save
save_posts = _save
save_matches = _save


def new_token() -> str:
    return uuid.uuid4().hex
