"""APIキーで使えるGeminiモデルの一覧を表示する。

モデルは提供終了になることがある（404 NOT_FOUND）。そのときに
どのモデルへ移ればよいかを調べるためのもの。

    python list_models.py
"""

import os

from dotenv import load_dotenv
from google import genai

load_dotenv()

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
for model in client.models.list():
    # 対話に使えるモデル（generateContent対応）だけに絞る
    actions = getattr(model, "supported_actions", None) or []
    if not actions or "generateContent" in actions:
        print(model.name)
