import os

from anthropic import Anthropic

DEFAULT_MODEL = "claude-sonnet-5"
MAX_TOKENS = 2048

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
        self.model = model or os.environ.get("ANTHROPIC_MODEL", DEFAULT_MODEL)
        self.client = Anthropic(api_key=api_key or os.environ.get("ANTHROPIC_API_KEY"))
        self.history = []

    def reset(self):
        self.history = []

    def send(self, user_message: str) -> str:
        self.history.append({"role": "user", "content": user_message})

        reply_text = ""
        with self.client.messages.stream(
            model=self.model,
            max_tokens=MAX_TOKENS,
            system=SYSTEM_PROMPT,
            messages=self.history,
        ) as stream:
            for chunk in stream.text_stream:
                print(chunk, end="", flush=True)
                reply_text += chunk
            print()

        self.history.append({"role": "assistant", "content": reply_text})
        return reply_text
