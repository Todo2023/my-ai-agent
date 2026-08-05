"""対話しながら旅行プランを提案するエージェント。

invoice_agent と同様、無料枠のあるGemini APIを使う。
無料枠はレート制限（429）に当たりやすいため、指数バックオフ的な単純リトライを入れている。
"""

import os
import time

from google import genai
from google.genai import errors, types

DEFAULT_MODEL = "gemma-4-26b-a4b-it"
MAX_RETRIES = 5
RETRY_WAIT_SECONDS = 20

SYSTEM_PROMPT = """あなたは経験豊富な旅行プランナー「トラベルエージェント」です。
ユーザーと対話しながら、以下の情報をヒアリングしてください（すでに分かっている情報は聞き直さない）。

- 目的地（未定なら希望のエリアや雰囲気）
- 旅行日数・時期
- 予算感（一人あたり、または総額）
- 同行者（一人旅・カップル・家族・友人など）
- 興味関心（グルメ、自然、歴史、アクティビティ、リラックスなど）

必要な情報が集まったら、具体的な旅程（日程表形式）を提案してください。
提案には以下を含めてください。

- 日ごとのスケジュール（訪問先・アクティビティの目安）
- 予算の目安（内訳が分かるとなお良い）
- 移動手段や滞在エリアの提案
- 注意点やおすすめの持ち物・ベストシーズンなどの補足

現時点では外部の検索APIには接続していないため、具体的な店名やホテル名を断定せず、
「〇〇エリアのホテル」「地元で人気のレストラン」のように一般的な提案をし、
最新の価格・空室状況はユーザー自身の確認が必要である旨を伝えてください。
常に親しみやすく、簡潔で分かりやすい日本語で応答してください。"""


class TravelAgent:
    def __init__(self, model: str = None, api_key: str = None):
        self.model = model or os.environ.get("GEMINI_MODEL", DEFAULT_MODEL)
        # keep a reference to the client: genai.Client closes its httpx
        # connection pool on GC, which would kill self.chat if unreferenced
        self.client = genai.Client(api_key=api_key or os.environ["GEMINI_API_KEY"])
        self.chat = self.client.chats.create(
            model=self.model,
            config=types.GenerateContentConfig(system_instruction=SYSTEM_PROMPT),
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
