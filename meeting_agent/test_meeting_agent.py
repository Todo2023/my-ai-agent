"""ネットワークもAPIキーも使わないテスト。

    pytest

確認したいのは主に次の2点。
- 日時の解釈や文面整形といった決定的な処理が正しいか
- LLMが暴走しても、人間の承認なしにChatworkへ送信されないか
"""

import datetime
from zoneinfo import ZoneInfo

import pytest

import chatwork
import fakes
import gcal


@pytest.fixture(autouse=True)
def demo_mode(monkeypatch):
    monkeypatch.setenv("DEMO_MODE", "1")
    monkeypatch.delenv("CHATWORK_DRY_RUN", raising=False)
    chatwork.set_confirm_hook(None)
    fakes.reset()
    yield
    chatwork.set_confirm_hook(None)
    fakes.reset()


# --- 日時の解釈 -------------------------------------------------------------


@pytest.mark.parametrize(
    "text", ["2026-08-07 15:00", "2026/08/07 15:00", "2026-08-07T15:00:00"]
)
def test_parse_datetime_accepts_common_formats(text):
    dt = gcal._parse_datetime(text)
    assert (dt.year, dt.month, dt.day, dt.hour) == (2026, 8, 7, 15)
    assert dt.tzinfo is not None  # タイムゾーンなしのまま API に渡さない


def test_parse_datetime_rejects_vague_input():
    # 「あした」のような曖昧な入力はLLM側で日付に直させる。ここで黙って通さない
    with pytest.raises(ValueError):
        gcal._parse_datetime("あした")


# --- 予定の整形 -------------------------------------------------------------


def test_format_event_includes_meet_url():
    text = gcal._format_event(
        {
            "id": "abc",
            "summary": "A社 定例",
            "start": {"dateTime": "2026-08-07T15:00:00+09:00"},
            "hangoutLink": "https://meet.google.com/xxx-yyyy-zzz",
        }
    )
    assert "https://meet.google.com/xxx-yyyy-zzz" in text
    assert "A社 定例" in text


def test_format_event_without_meet_link_says_so():
    text = gcal._format_event(
        {"id": "abc", "summary": "歯医者", "start": {"dateTime": "2026-08-07T18:00:00+09:00"}}
    )
    assert "Meetリンクなし" in text


def test_list_meetings_respects_days_window():
    # デモデータの3件目は10日後。7日指定では入らない
    assert "歯医者" not in gcal.list_meetings(days=7)
    assert "歯医者" in gcal.list_meetings(days=14)


# --- 予定の作成 -------------------------------------------------------------


def test_create_meeting_returns_meet_url_and_end_time():
    result = gcal.create_meeting("A社 定例MTG", "2026-08-07 15:00", duration_minutes=30)
    assert "https://meet.google.com/" in result
    assert "15:00 - 15:30" in result


def test_created_meeting_appears_in_list():
    tz = ZoneInfo(gcal.TIMEZONE)
    start = datetime.datetime.now(tz=tz) + datetime.timedelta(days=2)
    gcal.create_meeting("新規MTG", start.strftime("%Y-%m-%d %H:%M"))
    assert "新規MTG" in gcal.list_meetings(days=7)


# --- 送信の承認ゲート -------------------------------------------------------


def test_send_is_blocked_when_human_declines():
    chatwork.set_confirm_hook(lambda room_id, message: False)
    result = chatwork.send_chatwork_message(11110001, "送ってはいけない文面")
    assert "送信していません" in result
    assert fakes.sent_messages == []


def test_send_goes_through_when_human_approves():
    chatwork.set_confirm_hook(lambda room_id, message: True)
    chatwork.send_chatwork_message(11110001, "こんにちは")
    assert fakes.sent_messages == [{"room_id": 11110001, "body": "こんにちは"}]


def test_confirm_hook_receives_exact_room_and_body():
    seen = {}

    def hook(room_id, message):
        seen["room_id"] = room_id
        seen["message"] = message
        return False

    chatwork.set_confirm_hook(hook)
    chatwork.send_chatwork_message(11110002, "[To:9001] 本文")
    # 人間が確認する内容と、実際に送られる内容が一致していること
    assert seen == {"room_id": 11110002, "message": "[To:9001] 本文"}


def test_dry_run_does_not_send(monkeypatch):
    monkeypatch.delenv("DEMO_MODE", raising=False)
    monkeypatch.setenv("CHATWORK_DRY_RUN", "1")
    chatwork.set_confirm_hook(lambda room_id, message: True)
    result = chatwork.send_chatwork_message(11110001, "テスト")
    assert "DRY RUN" in result


# --- Chatwork のルーム/メンバー取得 -----------------------------------------


def test_list_rooms_and_members():
    assert "A社_定例プロジェクト" in chatwork.list_chatwork_rooms()
    members = chatwork.list_chatwork_members(11110001)
    assert "9001" in members and "山田 太郎" in members


def test_missing_token_raises_clear_error(monkeypatch):
    monkeypatch.delenv("DEMO_MODE", raising=False)
    monkeypatch.delenv("CHATWORK_API_TOKEN", raising=False)
    with pytest.raises(RuntimeError, match="CHATWORK_API_TOKEN"):
        chatwork.list_chatwork_rooms()
