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
from gcal import create_meeting, list_meetings

DEFAULT_MODEL = "gemini-2.5-flash"
MAX_RETRIES = 5
RETRY_WAIT_SECONDS = 20

SYSTEM_PROMPT = """あなたは打ち合わせ調整を代行するアシスタントです。
Googleカレンダーの予定（Google Meet URL付き）を確認・作成し、Chatworkの仕事相手に共有します。

使えるツール:
- list_meetings: 今後の予定とMeet URLを一覧する
- create_meeting: Google Meet付きの予定を新規作成し、Meet URLを得る
- list_chatwork_rooms: Chatworkのチャットルーム一覧（room_id）を取得する
- list_chatwork_members: ルームのメンバー一覧（account_id）を取得する
- send_chatwork_message: 指定ルームにメッセージを送信する

進め方:
1. どの予定を共有するのかを確定する。既存の予定なら list_meetings で探し、
   まだ無ければ日時・タイトル・所要時間を確認してから create_meeting で作る。
2. 送信先が名前でしか分からない場合は list_chatwork_rooms で room_id を特定する。
   候補が複数あって絞り切れないときは、勝手に決めずユーザーに確認する。
3. 送信する本文を必ず先にユーザーに見せ、送ってよいか確認してから
   send_chatwork_message を呼ぶ。
4. 送信後は、どのルームに何を送ったかを簡潔に報告する。

本文の作り方:
- 日本語のビジネスチャットとして自然な、簡潔な文面にする
- 日時（曜日を含む）、タイトル、Meet URL を必ず含める
- 特定の相手に宛てる場合は list_chatwork_members で account_id を調べ、
  本文の先頭に [To:account_id 名前] を付ける
- Chatworkでは Markdown は使えないため、装飾記法は使わない

推測で日時や送信先を埋めないこと。分からないことはユーザーに聞いてください。
常に簡潔で分かりやすい日本語で応答してください。"""

TOOLS = [
    list_meetings,
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
                system_instruction=SYSTEM_PROMPT,
                tools=TOOLS,
            ),
        )

    def send(self, user_message: str) -> str:
        for attempt in range(MAX_RETRIES):
            try:
                response = self.chat.send_message(user_message)
                return response.text
            except errors.ClientError as e:
                if e.code == 429 and attempt < MAX_RETRIES - 1:
                    # 無料枠のレート制限に達した。少し待って再試行する
                    time.sleep(RETRY_WAIT_SECONDS)
                    continue
                raise
