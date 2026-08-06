"""デモモード用のダミーデータ。

DEMO_MODE=1 のとき、gcal.py / chatwork.py は実APIの代わりにここを使う。
Google Cloud の認可情報も Chatwork のトークンも無い状態で、
エージェントの動き・文面・確認フローを一通り確かめられるようにするためのもの。

送信したメッセージは sent_messages に貯まるだけで、外部には一切出ていかない。
"""

import datetime
import os
import uuid
from zoneinfo import ZoneInfo

# 実際に送られた（ことにした）メッセージ。テストとデモの検証用
sent_messages = []

DEMO_ROOMS = [
    {"room_id": 11110001, "name": "A社_定例プロジェクト", "type": "group"},
    {"room_id": 11110002, "name": "山田 太郎", "type": "direct"},
    {"room_id": 11110003, "name": "社内_開発チーム", "type": "group"},
]

DEMO_MEMBERS = {
    11110001: [
        {"account_id": 9001, "name": "山田 太郎", "role": "admin"},
        {"account_id": 9002, "name": "鈴木 花子", "role": "member"},
        {"account_id": 9003, "name": "自分", "role": "member"},
    ],
    11110002: [
        {"account_id": 9001, "name": "山田 太郎", "role": "member"},
        {"account_id": 9003, "name": "自分", "role": "member"},
    ],
    11110003: [
        {"account_id": 9003, "name": "自分", "role": "admin"},
        {"account_id": 9004, "name": "佐藤 次郎", "role": "member"},
    ],
}

# デモモード中に作成された予定（create_meeting の結果がここに入る）
_created_events = []


def is_demo() -> bool:
    return os.environ.get("DEMO_MODE") == "1"


def reset():
    """テスト用。デモの状態を初期化する。"""
    sent_messages.clear()
    _created_events.clear()


def demo_events(days: int, tz: ZoneInfo) -> list:
    """今後 days 日以内の「既存の予定」を Calendar API と同じ形で返す。"""
    now = datetime.datetime.now(tz=tz)
    base = [
        {
            "id": "demo-event-0001",
            "summary": "A社 定例MTG",
            "start": {
                "dateTime": (now + datetime.timedelta(days=1)).replace(
                    hour=15, minute=0, second=0, microsecond=0
                ).isoformat()
            },
            "hangoutLink": "https://meet.google.com/demo-aaaa-001",
            "attendees": [{"email": "yamada@example.com"}],
        },
        {
            "id": "demo-event-0002",
            "summary": "社内 週次ふりかえり",
            "start": {
                "dateTime": (now + datetime.timedelta(days=3)).replace(
                    hour=10, minute=30, second=0, microsecond=0
                ).isoformat()
            },
            "hangoutLink": "https://meet.google.com/demo-bbbb-002",
        },
        {
            "id": "demo-event-0003",
            "summary": "歯医者（Meetなし）",
            "start": {
                "dateTime": (now + datetime.timedelta(days=10)).replace(
                    hour=18, minute=0, second=0, microsecond=0
                ).isoformat()
            },
        },
    ]
    horizon = now + datetime.timedelta(days=days)
    events = base + _created_events
    within = [
        e
        for e in events
        if now <= datetime.datetime.fromisoformat(e["start"]["dateTime"]) <= horizon
    ]
    return sorted(within, key=lambda e: e["start"]["dateTime"])


def create_demo_event(body: dict) -> dict:
    """Calendar API の insert 相当。Meet URL を発行したことにして返す。"""
    event = dict(body)
    event["id"] = f"demo-event-{uuid.uuid4().hex[:8]}"
    event["hangoutLink"] = f"https://meet.google.com/demo-{uuid.uuid4().hex[:8]}"
    _created_events.append(event)
    return event
