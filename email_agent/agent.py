"""自然文の指示からメールを作成して送信するエージェント。

やっていることはシンプル（ゲート1: まず動くもの）。
1. ユーザーの自然文（例:「taro@example.com に明日の会議はリスケになったと伝えて」）をLLMに渡す
2. LLMは「宛先・件名・本文」を組み立て、send_email_tool というツールを呼び出す
3. ツールの中身（mailer.py の send_email）が実際のSMTP送信を行う

LLMは「どのツールを、どんな引数で呼ぶか」を決めるだけで、
実際の送信処理（SMTP接続など）には一切関与しない。

安全対策として、mailer.py はデフォルトで DRY_RUN=true になっており、
.env で明示的に DRY_RUN=false にしない限り実際のメールは送信されない。
"""

import os
import sys
import time

from dotenv import load_dotenv

load_dotenv()

from google import genai
from google.genai import errors, types

from mailer import send_email

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

SYSTEM_PROMPT = (
    "あなたはメール送信アシスタントです。ユーザーの指示から送信先メールアドレス・件名・本文を"
    "組み立て、send_email_tool を呼び出してメールを送信してください。"
    "本文は指示の意図を汲んだ自然な日本語のビジネス文にしてください。"
    "宛先のメールアドレスが指示に含まれていない場合は、ツールを呼ばずにその旨を伝えてください。"
)

# ゲート2の検証用: 実際にツールが呼ばれた記録を残す
sent_emails: list[dict] = []


def send_email_tool(to: str, subject: str, body: str) -> str:
    """メールを作成して送信する。

    Args:
        to: 送信先のメールアドレス
        subject: 件名
        body: 本文
    """
    try:
        send_email(to, subject, body)
        sent_emails.append({"to": to, "subject": subject, "ok": True})
        return f"{to} 宛にメールを送信しました（件名: {subject}）"
    except Exception as e:
        sent_emails.append({"to": to, "subject": subject, "ok": False, "error": str(e)})
        raise


def run(instruction: str, max_retries: int = 5) -> str:
    sent_emails.clear()
    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(
                model="gemma-4-26b-a4b-it",
                contents=instruction,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                    tools=[send_email_tool],
                ),
            )
            return response.text
        except errors.ClientError as e:
            if e.code == 429 and attempt < max_retries - 1:
                # 無料枠のレート制限に達した。少し待って再試行する
                time.sleep(20)
                continue
            raise


if __name__ == "__main__":
    instruction = " ".join(sys.argv[1:]) or (
        "taro@example.com 宛に、件名「会議リスケ」本文「明日の会議は木曜に変更になりました」でメールを送って"
    )
    print(f"指示: {instruction}")
    print(run(instruction))
