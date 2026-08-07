"""どのモデルが「いま実際に使えるか」を調べる。

モデル一覧に出ていても、無料枠の対象外（limit: 0）だったり、その日の上限を
使い切っていたりする。名前だけでは判断できないので、極小のリクエストを
実際に投げて確かめる。

各モデルにつき1リクエスト消費する。

    python check_models.py
"""

import os

from dotenv import load_dotenv
from google import genai
from google.genai import errors, types

# 対話用途の候補。軽いものから順に試す
CANDIDATES = [
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-flash-latest",
    "gemini-flash-lite-latest",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
]

load_dotenv()
client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

print("各モデルに極小のリクエストを投げて、実際に使えるか確認します。\n")
usable = []

for model in CANDIDATES:
    try:
        client.models.generate_content(
            model=model,
            contents="hi",
            config=types.GenerateContentConfig(max_output_tokens=1),
        )
        print(f"[OK]        {model}  ← 使えます")
        usable.append(model)
    except errors.ClientError as e:
        text = str(e)
        if e.code == 429 and "limit: 0" in text:
            print(f"[無料枠外]  {model}")
        elif e.code == 429:
            print(f"[上限到達]  {model}  ← 今日の分を使い切っています")
        elif e.code == 404:
            print(f"[提供終了]  {model}")
        else:
            print(f"[エラー]    {model}: {e.code}")

print()
if usable:
    print("使えるモデル:", ", ".join(usable))
    print(f'次のコマンドで切り替えられます: $env:GEMINI_MODEL="{usable[0]}"')
else:
    print("いま使えるモデルがありません。日付が変わると無料枠は回復します。")
