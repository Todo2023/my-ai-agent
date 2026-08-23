"""LLM呼び出しの一元化。

物語生成（stories.py）・紹介理由（matcher.py）・レコメンド（feed.py）が
すべてここを通る。モデルやベンダーを差し替えるときに触るのはこのファイルだけ。

無料枠のあるGemini APIを使う（travel_agent / meeting_agent と同じ）。
無料枠はレート制限（429）に当たりやすいため、単純なリトライを入れている。

APIキーが無いとき（DEMO_MODE=1 や GEMINI_API_KEY 未設定）は呼び出さない。
呼び出し側は available() を見て、テンプレートによる代替出力に切り替える。
"""

from __future__ import annotations

import json
import mimetypes
import os
import re
import time

import fakes

DEFAULT_MODEL = "gemini-3.6-flash"
# 画像を読む方式C用。vision対応モデルを明示的に分けておく
DEFAULT_VISION_MODEL = "gemini-3.6-flash"
MAX_RETRIES = 5
RETRY_WAIT_SECONDS = 20


def available() -> bool:
    """LLMを呼べる状態かどうか。"""
    return not fakes.is_demo() and bool(os.environ.get("GEMINI_API_KEY"))


def _model(override: str | None, vision: bool) -> str:
    if override:
        return override
    if vision:
        return os.environ.get("GEMINI_VISION_MODEL", DEFAULT_VISION_MODEL)
    return os.environ.get("GEMINI_MODEL", DEFAULT_MODEL)


def call(prompt: str, model: str | None = None, image_path: str | None = None) -> str:
    """プロンプトを投げて本文を返す。image_path があれば画像も一緒に送る。"""
    from google import genai
    from google.genai import errors, types

    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    contents = [prompt]
    if image_path:
        with open(image_path, "rb") as file:
            data = file.read()
        mime_type = mimetypes.guess_type(image_path)[0] or "image/jpeg"
        contents.append(types.Part.from_bytes(data=data, mime_type=mime_type))

    for attempt in range(MAX_RETRIES):
        try:
            response = client.models.generate_content(
                model=_model(model, vision=bool(image_path)), contents=contents
            )
            return (response.text or "").strip()
        except errors.ClientError as e:
            if e.code == 429 and attempt < MAX_RETRIES - 1:
                # 無料枠のレート制限に達した。少し待って再試行する
                time.sleep(RETRY_WAIT_SECONDS)
                continue
            if e.code == 404:
                # モデルは提供終了になることがある。使えるモデルの調べ方を案内する
                raise RuntimeError(
                    f"モデル '{_model(model, vision=bool(image_path))}' が使えません。"
                    "環境変数 GEMINI_MODEL / GEMINI_VISION_MODEL で別のモデルを指定してください。"
                ) from e
            raise
    raise RuntimeError("LLMの呼び出しに繰り返し失敗しました。")


def extract_json(text: str) -> list:
    """応答からJSON配列を取り出す。

    「出力はJSONのみ」と指示してもコードフェンスや前置きが付くことがある。
    ここで落とすと運用が止まるので、緩く拾ってから呼び出し側で検証する。
    """
    cleaned = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        found = re.search(r"\[.*\]", cleaned, flags=re.DOTALL)
        if not found:
            raise ValueError(f"LLMの応答からJSONを取り出せませんでした: {text[:200]!r}")
        parsed = json.loads(found.group())
    if not isinstance(parsed, list):
        raise ValueError(f"JSON配列ではありません: {text[:200]!r}")
    return parsed
