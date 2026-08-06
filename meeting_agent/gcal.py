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

# 予定の読み取りと作成の両方を行うため events スコープを使う
SCOPES = ["https://www.googleapis.com/auth/calendar.events"]

CREDENTIALS_FILE = os.environ.get("GOOGLE_CREDENTIALS_FILE", "credentials.json")
TOKEN_FILE = os.environ.get("GOOGLE_TOKEN_FILE", "token.json")
TIMEZONE = os.environ.get("TIMEZONE", "Asia/Tokyo")

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


def _explain_http_error(e: HttpError) -> str:
    """Calendar API のエラーを、セットアップのどこを直せばよいかが分かる文言にする。"""
    status = getattr(e.resp, "status", None)
    if status == 403:
        return (
            "Googleカレンダーにアクセスできませんでした（403）。"
            "Google Cloud コンソールで対象プロジェクトの Google Calendar API が"
            "「有効」になっているか確認してください。"
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
    meet_url = event.get("hangoutLink", "")
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


def list_meetings(days: int = 7) -> str:
    """今日から指定日数ぶんのGoogleカレンダーの予定を、Google Meet URL付きで一覧する。

    「明日の打ち合わせのMeet URLを送って」のように、既存の予定のURLを知りたいときに使う。

    Args:
        days: 今日から何日先までの予定を取得するか（既定7日）
    """
    if fakes.is_demo():
        events = fakes.demo_events(days, _tz())
    else:
        now = datetime.datetime.now(tz=_tz())
        time_max = now + datetime.timedelta(days=days)
        try:
            events = (
                _get_service()
                .events()
                .list(
                    calendarId="primary",
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
            return _explain_http_error(e)

    if not events:
        return f"今後{days}日間に予定はありません。"
    return "\n".join(_format_event(e) for e in events)


def create_meeting(
    title: str,
    start: str,
    duration_minutes: int = 60,
    attendees: str = "",
    description: str = "",
) -> str:
    """Google Meet 付きの予定をGoogleカレンダーに作成し、Meet URL を返す。

    新しく打ち合わせを設定してURLを共有したいときに使う。

    Args:
        title: 予定のタイトル（例: "A社 定例MTG"）
        start: 開始日時（例: "2026-08-07 15:00"）
        duration_minutes: 所要時間（分、既定60）
        attendees: 招待するメールアドレスをカンマ区切りで（任意）
        description: 予定の説明（任意）
    """
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

    if fakes.is_demo():
        event = fakes.create_demo_event(body)
    else:
        try:
            event = (
                _get_service()
                .events()
                .insert(
                    calendarId="primary",
                    body=body,
                    conferenceDataVersion=1,
                    sendUpdates="all" if emails else "none",
                )
                .execute()
            )
        except HttpError as e:
            return _explain_http_error(e)

    meet_url = event.get("hangoutLink", "")
    return (
        f"予定を作成しました。\n"
        f"タイトル: {event.get('summary', '')}\n"
        f"日時: {start_dt:%Y-%m-%d %H:%M} - {end_dt:%H:%M} ({TIMEZONE})\n"
        f"Meet URL: {meet_url or '（発行されませんでした）'}\n"
        f"event_id: {event['id']}"
    )
