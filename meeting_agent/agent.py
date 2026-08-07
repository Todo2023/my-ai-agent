"""Googleカレンダーの Google Meet URL を Chatwork に共有するエージェント。

travel_agent と同様、無料枠のあるGemini APIを使う。
無料枠はレート制限（429）に当たりやすいため、単純なリトライを入れている。
"""

import os
import time

from google import genai
from google.genai import errors, types

from chatwork import (
    list_chatwork_members,
    list_chatwork_rooms,
    send_chatwork_message,
)
import gcal
from gcal import create_meeting, list_calendars, list_meetings

WEEKDAYS = "月火水木金土日"

DEFAULT_MODEL = "gemini-3.6-flash"
MAX_RETRIES = 5
RETRY_WAIT_SECONDS = 20

SYSTEM_PROMPT = """あなたは打ち合わせ調整を代行するアシスタントです。
Googleカレンダーの予定（Google Meet URL付き）を確認・作成し、Chatworkの仕事相手に共有します。

使えるツール:
- list_meetings: 今後の予定とMeet URLを一覧する
- list_calendars: 予定を入れられるカレンダーの一覧（カレンダーID）を確認する
- create_meeting: Google Meet付きの予定を新規作成し、Meet URLを得る
- list_chatwork_rooms: Chatworkのチャットルーム一覧（room_id）を取得する
- list_chatwork_members: ルームのメンバー一覧（account_id）を取得する
- send_chatwork_message: 指定ルームにメッセージを送信する

進め方:
1. どの予定を共有するのかを確定する。既存の予定なら list_meetings で探し、
   まだ無ければ日時・タイトル・所要時間を確認してから create_meeting で作る。
   create_meeting は設定されたすべてのカレンダーに同じ予定を入れる（Meet URLは1つ）。
   どのカレンダーに入るか聞かれたら list_calendars で現在の設定を確認して答える。
2. 送信先が名前でしか分からない場合は list_chatwork_rooms で room_id を特定する。
   候補が複数あって絞り切れないときは、勝手に決めずユーザーに確認する。
3. 送信する本文を必ず先にユーザーに見せ、送ってよいか確認してから
   send_chatwork_message を呼ぶ。
4. 送信後は、send_chatwork_message が返した結果をそのまま踏まえて報告する。
   結果に [DRY RUN] や [デモ] が含まれる場合は、実際には送信されていないことを
   必ず明記する。「送信しました」と報告してよいのは、本当に送信された場合だけ。
   送信が拒否された場合も、送っていないことをはっきり伝える。

本文の作り方:
- 日本語のビジネスチャットとして自然な、簡潔な文面にする
- 日時（曜日を含む）、タイトル、Meet URL を必ず含める
- 特定の相手に宛てる場合は list_chatwork_members で account_id を調べ、
  本文の先頭に [To:account_id 名前] を付ける
- Chatworkでは Markdown は使えないため、装飾記法（**、#、```、> など）は使わない。
  箇条書きも記号ではなく素の文章か「・」で書く
- 社外の相手（取引先・顧客）か社内かで書き出しを変える:
  - 社外 → 「お世話になっております。」で始める。「お疲れ様です」は使わない
  - 社内 → 「お疲れ様です。」で始める
  判断がつかないときは社外として扱う（社内向けの口調を社外に送る方が失礼になるため）
- 相手の会社名・氏名・肩書きは、こちらが把握している情報だけを書く。推測で補わない
- 長文にしない。日時・URL・一言があれば十分

推測で日時や送信先を埋めないこと。分からないことはユーザーに聞いてください。
ただし「明日」「来週火曜」などの相対的な日付は、冒頭に示された現在日時を基準に
自分で計算すること（今日が何日かをユーザーに聞き返さない）。
常に簡潔で分かりやすい日本語で応答してください。"""


def _is_daily_quota(error) -> bool:
    """429が「1日あたりの上限」によるものか（分あたりの制限ではないか）を判定する。"""
    return "PerDay" in str(error)


def _system_instruction() -> str:
    """現在日時を添えたシステムプロンプト。

    LLMは今日の日付を知らないため、これが無いと「明日」を勝手な日付に解釈する。
    """
    now = gcal.current_datetime()
    return (
        f"現在日時: {now:%Y-%m-%d}({WEEKDAYS[now.weekday()]}) {now:%H:%M} "
        f"({gcal.TIMEZONE})\n\n" + SYSTEM_PROMPT
    )

TOOLS = [
    list_meetings,
    list_calendars,
    create_meeting,
    list_chatwork_rooms,
    list_chatwork_members,
    send_chatwork_message,
]


class MeetingShareAgent:
    def __init__(self, model: str = None, api_key: str = None):
        self.model = model or os.environ.get("GEMINI_MODEL", DEFAULT_MODEL)
        # keep a reference to the client: genai.Client closes its httpx
        # connection pool on GC, which would kill self.chat if unreferenced
        self.client = genai.Client(api_key=api_key or os.environ["GEMINI_API_KEY"])
        self.chat = self.client.chats.create(
            model=self.model,
            config=types.GenerateContentConfig(
                system_instruction=_system_instruction(),
                tools=TOOLS,
            ),
        )

    def send(self, user_message: str) -> str:
        for attempt in range(MAX_RETRIES):
            try:
                response = self.chat.send_message(user_message)
                return response.text
            except errors.ClientError as e:
                if e.code == 429 and _is_daily_quota(e):
                    # 1日あたりの上限。待っても当日中は空かないので即座に案内する
                    raise RuntimeError(
                        f"モデル '{self.model}' の無料枠の1日あたり上限に達しました。"
                        "別のモデルに切り替えると、そのモデルの枠でまた使えます"
                        "（上限はモデルごとに別枠です）。\n"
                        "例: GEMINI_MODEL=gemini-2.0-flash\n"
                        "使えるモデルは `python list_models.py` で確認できます。"
                    ) from e
                if e.code == 429 and attempt < MAX_RETRIES - 1:
                    # 分あたりのレート制限。少し待って再試行する
                    time.sleep(RETRY_WAIT_SECONDS)
                    continue
                if e.code == 404:
                    # モデルは提供終了になることがある。使えるモデルの調べ方を案内する
                    raise RuntimeError(
                        f"モデル '{self.model}' が使えません。"
                        "環境変数 GEMINI_MODEL で別のモデルを指定してください。"
                        "使えるモデルは `python list_models.py` で確認できます。"
                    ) from e
                raise
