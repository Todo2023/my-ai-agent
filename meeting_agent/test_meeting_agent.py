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
    monkeypatch.setattr(gcal, "DEFAULT_CALENDAR_IDS", "primary")
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


# --- 複数カレンダーへの登録 -------------------------------------------------


def test_create_meeting_writes_to_all_configured_calendars(monkeypatch):
    monkeypatch.setattr(gcal, "DEFAULT_CALENDAR_IDS", "primary,work@example.com")
    result = gcal.create_meeting("A社 定例MTG", "2026-08-07 15:00")

    created = fakes.created_events()
    assert [e["_calendar_id"] for e in created] == ["primary", "work@example.com"]
    assert "primary: 作成しました" in result
    assert "work@example.com: 作成しました" in result


def test_meet_url_is_issued_once_and_shared_by_both_calendars(monkeypatch):
    monkeypatch.setattr(gcal, "DEFAULT_CALENDAR_IDS", "primary,work@example.com")
    gcal.create_meeting("A社 定例MTG", "2026-08-07 15:00")

    primary_event, copied_event = fakes.created_events()
    meet_url = primary_event["hangoutLink"]
    # 2つ目のカレンダーで別のMeetを発行してしまうと、相手に渡すURLが割れる
    assert "hangoutLink" not in copied_event
    assert copied_event["location"] == meet_url
    assert meet_url in copied_event["description"]


def test_copied_event_shows_meet_url_in_listing(monkeypatch):
    monkeypatch.setattr(gcal, "DEFAULT_CALENDAR_IDS", "primary,work@example.com")
    tz = ZoneInfo(gcal.TIMEZONE)
    start = datetime.datetime.now(tz=tz) + datetime.timedelta(days=2)
    # デモの既存予定と紛れないよう固有のタイトルにする
    gcal.create_meeting("B社 キックオフ", start.strftime("%Y-%m-%d %H:%M"))

    listing = gcal.list_meetings(days=7)
    # 両方のカレンダーに出て、どちらも同じMeet URLが見えること
    assert listing.count("B社 キックオフ") == 2
    assert "Meetリンクなし" not in listing


def test_explicit_calendar_ids_override_the_default(monkeypatch):
    monkeypatch.setattr(gcal, "DEFAULT_CALENDAR_IDS", "primary")
    gcal.create_meeting(
        "臨時MTG", "2026-08-07 15:00", calendar_ids="work@example.com"
    )
    assert [e["_calendar_id"] for e in fakes.created_events()] == ["work@example.com"]


def test_list_calendars_marks_writable_ones():
    text = gcal.list_calendars()
    assert "仕事用カレンダー" in text and "書き込み可" in text
    assert "日本の祝日" in text and "閲覧のみ" in text


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
    # LLMが「送信しました」と誤報告しないよう、送っていないことを明示する
    assert "送信していません" in result


def test_demo_send_result_states_it_was_not_sent():
    chatwork.set_confirm_hook(lambda room_id, message: True)
    result = chatwork.send_chatwork_message(11110001, "テスト")
    assert "送信していません" in result


# --- LLMに渡す前提情報 -------------------------------------------------------


def test_system_instruction_tells_the_model_todays_date():
    # 今日の日付が無いと、LLMは「明日」を勝手な日付に解釈してしまう
    import agent

    now = gcal.current_datetime()
    instruction = agent._system_instruction()
    assert f"{now:%Y-%m-%d}" in instruction
    assert "月火水木金土日"[now.weekday()] in instruction


# --- Chatwork のルーム/メンバー取得 -----------------------------------------


def test_list_rooms_and_members():
    assert "A社_定例プロジェクト" in chatwork.list_chatwork_rooms()
    members = chatwork.list_chatwork_members(11110001)
    assert "9001" in members and "山田 太郎" in members


def test_room_label_shows_the_room_name():
    # room_id の数字だけでは、送信先の取り違えに人間が気づけない
    assert chatwork.room_label(11110001) == "A社_定例プロジェクト（room_id: 11110001）"


def test_room_label_falls_back_to_id_when_name_is_unknown():
    assert chatwork.room_label(99999999) == "room_id: 99999999"


def test_missing_token_raises_clear_error(monkeypatch):
    monkeypatch.delenv("DEMO_MODE", raising=False)
    monkeypatch.delenv("CHATWORK_API_TOKEN", raising=False)
    with pytest.raises(RuntimeError, match="CHATWORK_API_TOKEN"):
        chatwork.list_chatwork_rooms()
