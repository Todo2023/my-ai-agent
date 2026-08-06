"""Google カレンダー連携ツール。

OAuth（インストール済みアプリのフロー）でユーザー自身のカレンダーに接続し、
- 予定の一覧取得（Google Meet URL 付き）
- Google Meet 付き予定の新規作成
をエージェントのツールとして提供する。

初回実行時にブラウザが開いて認可を求められ、以降は token.json のリフレッシュトークンで
自動的に再認証される。
"""

import datetime
import os
import uuid
from zoneinfo import ZoneInfo

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

import fakes

# events: 予定の読み取りと作成 / readonly: カレンダー一覧（IDの確認）の取得
SCOPES = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.readonly",
]

CREDENTIALS_FILE = os.environ.get("GOOGLE_CREDENTIALS_FILE", "credentials.json")
TOKEN_FILE = os.environ.get("GOOGLE_TOKEN_FILE", "token.json")
TIMEZONE = os.environ.get("TIMEZONE", "Asia/Tokyo")

# 予定を入れる先。複数指定するとすべてのカレンダーに同じ予定が入る
# 例: CALENDAR_IDS=primary,work@example.com
DEFAULT_CALENDAR_IDS = os.environ.get("CALENDAR_IDS", "primary")

_service = None


def _tz() -> ZoneInfo:
    return ZoneInfo(TIMEZONE)


def _get_service():
    """Calendar API のクライアントを（初回のみ認可フローを通して）返す。"""
    global _service
    if _service is not None:
        return _service

    creds = None
    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists(CREDENTIALS_FILE):
                raise FileNotFoundError(
                    f"{CREDENTIALS_FILE} が見つかりません。"
                    "Google Cloud コンソールでOAuthクライアント（デスクトップアプリ）を作成し、"
                    "JSONをこのファイル名で配置してください（README参照）。"
                )
            flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_FILE, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(TOKEN_FILE, "w") as f:
            f.write(creds.to_json())

    _service = build("calendar", "v3", credentials=creds)
    return _service


def _target_calendar_ids(calendar_ids: str = "") -> list:
    """書き込み先カレンダーIDのリスト。未指定なら環境変数の設定を使う。"""
    source = calendar_ids.strip() or DEFAULT_CALENDAR_IDS
    return [c.strip() for c in source.split(",") if c.strip()]


def _explain_http_error(e: HttpError) -> str:
    """Calendar API のエラーを、セットアップのどこを直せばよいかが分かる文言にする。"""
    status = getattr(e.resp, "status", None)
    if status == 403:
        return (
            "Googleカレンダーにアクセスできませんでした（403）。"
            "Google Cloud コンソールで対象プロジェクトの Google Calendar API が"
            "「有効」になっているか、また対象カレンダーに「予定の変更権限」があるか"
            "確認してください。"
        )
    if status == 404:
        return (
            "指定したカレンダーが見つかりませんでした（404）。"
            "list_calendars でカレンダーIDを確認してください。"
        )
    if status == 401:
        return (
            "Googleの認証が切れています（401）。"
            f"{TOKEN_FILE} を削除してから再実行し、認可をやり直してください。"
        )
    return f"Googleカレンダーの操作に失敗しました: {e}"


def _parse_datetime(value: str) -> datetime.datetime:
    """"2026-08-07 15:00" / ISO8601 のどちらでも受け付ける。"""
    text = value.strip().replace("/", "-")
    try:
        dt = datetime.datetime.fromisoformat(text)
    except ValueError:
        raise ValueError(
            f"日時を解釈できませんでした: {value!r}。"
            "'2026-08-07 15:00' のような形式で指定してください。"
        )
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=_tz())
    return dt


def _format_event(event: dict) -> str:
    start = event["start"].get("dateTime", event["start"].get("date", ""))
    # 複製した予定は hangoutLink を持たないので、場所に入れたURLを拾う
    meet_url = event.get("hangoutLink", "")
    if not meet_url and "meet.google.com" in event.get("location", ""):
        meet_url = event["location"]
    attendees = ", ".join(
        a.get("email", "") for a in event.get("attendees", []) if a.get("email")
    )
    parts = [
        f"- {start} {event.get('summary', '(タイトルなし)')}",
        f"  event_id: {event['id']}",
        f"  Meet: {meet_url or '（Meetリンクなし）'}",
    ]
    if attendees:
        parts.append(f"  参加者: {attendees}")
    return "\n".join(parts)


def _insert(calendar_id: str, body: dict, with_conference: bool, notify: bool) -> dict:
    """1つのカレンダーに予定を作成する。デモモードではダミーに書き込む。"""
    if fakes.is_demo():
        return fakes.create_demo_event(body, calendar_id, with_conference)
    return (
        _get_service()
        .events()
        .insert(
            calendarId=calendar_id,
            body=body,
            conferenceDataVersion=1 if with_conference else 0,
            sendUpdates="all" if notify else "none",
        )
        .execute()
    )


def list_calendars() -> str:
    """アクセスできるGoogleカレンダーの一覧（カレンダーIDと名前）を返す。

    予定を入れる先のカレンダーIDを調べたいときに使う。
    「書き込み可」と表示されたカレンダーにだけ予定を作成できる。
    """
    if fakes.is_demo():
        items = fakes.DEMO_CALENDARS
    else:
        try:
            items = _get_service().calendarList().list().execute().get("items", [])
        except HttpError as e:
            return _explain_http_error(e)

    if not items:
        return "カレンダーが取得できませんでした。"

    lines = []
    for c in items:
        writable = c.get("accessRole") in ("owner", "writer")
        mark = "書き込み可" if writable else "閲覧のみ"
        default = "（既定）" if c.get("primary") else ""
        lines.append(f"- {c.get('summary', '')}{default} [{mark}]\n  calendar_id: {c['id']}")
    current = ", ".join(_target_calendar_ids())
    lines.append(f"\n現在の書き込み先設定（CALENDAR_IDS）: {current}")
    return "\n".join(lines)


def list_meetings(days: int = 7) -> str:
    """今日から指定日数ぶんのGoogleカレンダーの予定を、Google Meet URL付きで一覧する。

    「明日の打ち合わせのMeet URLを送って」のように、既存の予定のURLを知りたいときに使う。

    Args:
        days: 今日から何日先までの予定を取得するか（既定7日）
    """
    calendar_ids = _target_calendar_ids()
    now = datetime.datetime.now(tz=_tz())
    time_max = now + datetime.timedelta(days=days)

    sections = []
    for calendar_id in calendar_ids:
        if fakes.is_demo():
            events = fakes.demo_events(days, _tz(), calendar_id)
        else:
            try:
                events = (
                    _get_service()
                    .events()
                    .list(
                        calendarId=calendar_id,
                        timeMin=now.isoformat(),
                        timeMax=time_max.isoformat(),
                        singleEvents=True,
                        orderBy="startTime",
                        maxResults=20,
                    )
                    .execute()
                    .get("items", [])
                )
            except HttpError as e:
                sections.append(f"[{calendar_id}] {_explain_http_error(e)}")
                continue

        body = (
            "\n".join(_format_event(e) for e in events)
            if events
            else f"今後{days}日間に予定はありません。"
        )
        # カレンダーが1つだけのときは見出しを付けない
        sections.append(body if len(calendar_ids) == 1 else f"[{calendar_id}]\n{body}")

    return "\n\n".join(sections)


def create_meeting(
    title: str,
    start: str,
    duration_minutes: int = 60,
    attendees: str = "",
    description: str = "",
    calendar_ids: str = "",
) -> str:
    """Google Meet 付きの予定をGoogleカレンダーに作成し、Meet URL を返す。

    新しく打ち合わせを設定してURLを共有したいときに使う。
    書き込み先カレンダーが複数設定されている場合は、そのすべてに同じ予定を入れる。
    Meet URL は1つだけ発行し、どのカレンダーからも同じURLになる。

    Args:
        title: 予定のタイトル（例: "A社 定例MTG"）
        start: 開始日時（例: "2026-08-07 15:00"）
        duration_minutes: 所要時間（分、既定60）
        attendees: 招待するメールアドレスをカンマ区切りで（任意）
        description: 予定の説明（任意）
        calendar_ids: 書き込み先カレンダーIDをカンマ区切りで（任意、既定は設定値）
    """
    targets = _target_calendar_ids(calendar_ids)
    start_dt = _parse_datetime(start)
    end_dt = start_dt + datetime.timedelta(minutes=duration_minutes)

    body = {
        "summary": title,
        "description": description,
        "start": {"dateTime": start_dt.isoformat(), "timeZone": TIMEZONE},
        "end": {"dateTime": end_dt.isoformat(), "timeZone": TIMEZONE},
        "conferenceData": {
            "createRequest": {
                # requestId は冪等性のためのキー。毎回新しい会議を作るのでUUIDでよい
                "requestId": uuid.uuid4().hex,
                "conferenceSolutionKey": {"type": "hangoutsMeet"},
            }
        },
    }
    emails = [e.strip() for e in attendees.split(",") if e.strip()]
    if emails:
        body["attendees"] = [{"email": e} for e in emails]

    # 1つ目のカレンダーで Meet を発行し、2つ目以降はそのURLを持つ予定を複製する。
    # カレンダーごとに Meet を作ると URL が複数できてしまうため。
    try:
        event = _insert(targets[0], body, with_conference=True, notify=bool(emails))
    except HttpError as e:
        return _explain_http_error(e)

    meet_url = event.get("hangoutLink", "")
    results = [f"- {targets[0]}: 作成しました（event_id: {event['id']}）"]

    for calendar_id in targets[1:]:
        copy_body = {
            "summary": title,
            # 同じ Meet に参加できるよう、URLを場所と本文の両方に入れる
            "location": meet_url,
            "description": "\n".join(filter(None, [description, meet_url])),
            "start": body["start"],
            "end": body["end"],
        }
        try:
            copy = _insert(calendar_id, copy_body, with_conference=False, notify=False)
            results.append(f"- {calendar_id}: 作成しました（event_id: {copy['id']}）")
        except HttpError as e:
            results.append(f"- {calendar_id}: 失敗しました。{_explain_http_error(e)}")

    return (
        f"予定を作成しました。\n"
        f"タイトル: {title}\n"
        f"日時: {start_dt:%Y-%m-%d %H:%M} - {end_dt:%H:%M} ({TIMEZONE})\n"
        f"Meet URL: {meet_url or '（発行されませんでした）'}\n"
        f"書き込み先カレンダー:\n" + "\n".join(results)
    )
