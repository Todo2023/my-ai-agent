"""GeminiのAPIキーがちゃんと使えるかを確認するだけの使い捨てスクリプト。"""

import os

from dotenv import load_dotenv
from google import genai

load_dotenv()

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

response = client.models.generate_content(
    model="gemini-flash-latest",
    contents="こんにちは、と一言だけ返して",
)

print(response.text)
