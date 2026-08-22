"""デモモード用のダミーデータ。

DEMO_MODE=1 のとき、store.py / notify.py は Supabase と SMTP の代わりにここを使う。
Supabaseプロジェクトもメールの送信設定も無い状態で、
スコアリング・承認フロー・メール文面を一通り確かめられるようにするためのもの。

送ったことにしたメールは sent_emails に貯まるだけで、外部には一切出ていかない。
マッチだけは、`cli.py match` と `cli.py respond` を別々に実行しても続きから
試せるように、小さなJSONファイル（既定 .demo_state.json）に保存する。
"""

import json
import os
import uuid

# 実際に送られた（ことにした）メール。テストとデモの検証用
sent_emails = []

DEMO_MEMBERS = [
    {
        "id": "11111111-1111-4111-8111-111111111111",
        "nickname": "モカママ",
        "email": "mocha@example.com",
        "pet_type": "dog",
        "breed": "トイプードル",
        "pet_age": 2,
        "personality_tags": ["甘えん坊", "人見知り"],
        "concern_tags": ["しつけ", "留守番"],
        "area": "東京都世田谷区",
    },
    {
        "id": "22222222-2222-4222-8222-222222222222",
        "nickname": "そらパパ",
        "email": "sora@example.com",
        "pet_type": "dog",
        "breed": "トイプードル",
        "pet_age": 3,
        "personality_tags": ["甘えん坊", "やんちゃ"],
        "concern_tags": ["しつけ", "留守番", "多頭飼い"],
        "area": "東京都杉並区",
    },
    {
        "id": "33333333-3333-4333-8333-333333333333",
        "nickname": "こむぎ飼い主",
        "email": "komugi@example.com",
        "pet_type": "dog",
        "breed": "柴犬",
        "pet_age": 9,
        "personality_tags": ["警戒心強め"],
        "concern_tags": ["老犬老猫ケア", "健康"],
        "area": "神奈川県横浜市",
    },
    {
        "id": "44444444-4444-4444-8444-444444444444",
        "nickname": "たま姉",
        "email": "tama@example.com",
        "pet_type": "cat",
        "breed": "アメリカンショートヘア",
        "pet_age": 5,
        "personality_tags": ["マイペース"],
        "concern_tags": ["多頭飼い", "健康"],
        "area": "大阪府吹田市",
    },
    {
        "id": "55555555-5555-4555-8555-555555555555",
        "nickname": "ルナの家",
        "email": "luna@example.com",
        "pet_type": "cat",
        "breed": "ロシアンブルー",
        "pet_age": 1,
        "personality_tags": ["人見知り", "マイペース"],
        "concern_tags": ["多頭飼い", "しつけ"],
        "area": "大阪府大阪市",
    },
]

# デモモード中に作られたマッチ（store.DemoStore がここに書き込む）
_matches = []


def is_demo() -> bool:
    return os.environ.get("DEMO_MODE") == "1"


def _state_path() -> str:
    return os.environ.get("PAWTOWN_DEMO_STATE", ".demo_state.json")


def reset():
    """テスト用。デモの状態を初期化する。"""
    sent_emails.clear()
    _matches.clear()
    if os.path.exists(_state_path()):
        os.remove(_state_path())


def demo_members() -> list[dict]:
    return [dict(member) for member in DEMO_MEMBERS]


def demo_matches() -> list[dict]:
    """デモのマッチ一覧。初回アクセス時に保存ファイルから読み戻す。"""
    if not _matches and os.path.exists(_state_path()):
        with open(_state_path(), encoding="utf-8") as file:
            _matches.extend(json.load(file))
    return _matches


def save_matches():
    """demo_matches() への変更をファイルに書き戻す。"""
    with open(_state_path(), "w", encoding="utf-8") as file:
        json.dump(_matches, file, ensure_ascii=False, indent=2)


def new_token() -> str:
    return uuid.uuid4().hex
