"""体重計の写真から数字を読み取る（OCR）。

方針は「読み取りはLLM、採否は決定的な処理」。
7セグメントの数字は既存OCRライブラリが苦手なのでLLMのvisionに任せるが、
LLMは平気で桁や小数点を間違えるので、返ってきた値は必ず validate() を通す。
validate() は範囲外を捨て、前回値と離れすぎていれば警告を付けて人間に確認させる。
保存はUI側で人間が確認してから行う（このモジュールは保存しない）。
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field

DEFAULT_MODEL = "gemini-3.6-flash"
MAX_RETRIES = 5
RETRY_WAIT_SECONDS = 20

# 体重計の表示としてありえる範囲。ここを外れた値は採用しない。
WEIGHT_MIN, WEIGHT_MAX = 20.0, 250.0
BODY_FAT_MIN, BODY_FAT_MAX = 3.0, 60.0
# 前回からこれ以上動いていたら読み間違いを疑って確認を促す
SUSPICIOUS_DIFF_KG = 3.0

PROMPT = """この画像は体重計（または体組成計）の表示部分です。
表示されている数字をそのまま読み取ってください。

- weight_kg: 体重（kg）。「kg」と書かれている、いちばん大きい数字。
- body_fat_pct: 体脂肪率（%）。表示が無ければ null。
- raw_text: 画面に見えている文字をそのまま書き写したもの。
- confidence: 読み取りの自信（0.0〜1.0）。ぼやけている、桁が欠けて見える、
  複数の数字のどれが体重か判断できない場合は 0.5 未満にすること。

小数点の位置に注意してください。体重計の表示は通常 小数第1位まで（例: 62.4）です。
推測で埋めないこと。読めない項目は null にし、confidence を下げてください。"""

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "weight_kg": {"type": "number", "nullable": True},
        "body_fat_pct": {"type": "number", "nullable": True},
        "raw_text": {"type": "string"},
        "confidence": {"type": "number"},
    },
    "required": ["weight_kg", "raw_text", "confidence"],
}


@dataclass
class ScaleReading:
    """写真から読み取った候補値。まだ保存されていない。"""

    weight_kg: float | None = None
    body_fat_pct: float | None = None
    raw_text: str = ""
    confidence: float = 0.0
    warnings: list[str] = field(default_factory=list)

    @property
    def needs_check(self) -> bool:
        """人間が数字を見直すべきか。UIはこのときフォームを目立たせる。"""
        return bool(self.warnings) or self.weight_kg is None or self.confidence < 0.6

    def as_dict(self) -> dict:
        return {
            "weight_kg": self.weight_kg,
            "body_fat_pct": self.body_fat_pct,
            "raw_text": self.raw_text,
            "confidence": round(self.confidence, 2),
            "warnings": self.warnings,
            "needs_check": self.needs_check,
        }


def validate(reading: ScaleReading, previous_weight: float | None = None) -> ScaleReading:
    """LLMの出力を決定的にチェックする。値を書き換える場合は必ず警告を残す。"""
    warnings: list[str] = []

    weight = reading.weight_kg
    if weight is not None:
        weight = float(weight)
        # 「62.4」を「624」と読むのはよくある失敗。10で割って収まるなら直す。
        if weight > WEIGHT_MAX and WEIGHT_MIN <= weight / 10 <= WEIGHT_MAX:
            warnings.append(
                f"{weight:g} を小数点の読み落としとみなして {weight / 10:g}kg に補正しました。確認してください"
            )
            weight = weight / 10
        if not WEIGHT_MIN <= weight <= WEIGHT_MAX:
            warnings.append(f"読み取った体重 {weight:g}kg は想定範囲外です。手入力してください")
            weight = None

    fat = reading.body_fat_pct
    if fat is not None:
        fat = float(fat)
        if not BODY_FAT_MIN <= fat <= BODY_FAT_MAX:
            warnings.append(f"読み取った体脂肪率 {fat:g}% は想定範囲外なので採用しませんでした")
            fat = None

    if weight is None and not warnings:
        warnings.append("体重を読み取れませんでした。手入力してください")

    if weight is not None and previous_weight is not None:
        diff = weight - previous_weight
        if abs(diff) >= SUSPICIOUS_DIFF_KG:
            warnings.append(
                f"前回 {previous_weight:g}kg から {diff:+.1f}kg 動いています。読み間違いでないか確認してください"
            )

    if weight is not None and reading.confidence < 0.6:
        warnings.append("読み取りの自信が低めです。数字が合っているか確認してください")

    return ScaleReading(
        weight_kg=round(weight, 2) if weight is not None else None,
        body_fat_pct=round(fat, 2) if fat is not None else None,
        raw_text=reading.raw_text,
        confidence=reading.confidence,
        warnings=warnings,
    )


def parse_response(text: str) -> ScaleReading:
    """モデルのJSON出力を ScaleReading にする。壊れたJSONでも落とさない。"""
    try:
        data = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return ScaleReading(raw_text=str(text)[:200], confidence=0.0)
    if not isinstance(data, dict):
        return ScaleReading(raw_text=str(text)[:200], confidence=0.0)

    def number(key: str) -> float | None:
        value = data.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, float, str)):
            return None
        try:
            return float(value)
        except ValueError:
            return None

    confidence = number("confidence")
    return ScaleReading(
        weight_kg=number("weight_kg"),
        body_fat_pct=number("body_fat_pct"),
        raw_text=str(data.get("raw_text") or ""),
        confidence=min(max(confidence, 0.0), 1.0) if confidence is not None else 0.0,
    )


def read_scale_photo(
    image_bytes: bytes,
    mime_type: str = "image/jpeg",
    previous_weight: float | None = None,
    model: str | None = None,
    api_key: str | None = None,
) -> ScaleReading:
    """写真1枚をGeminiに読ませ、検証済みの候補値を返す。"""
    from google import genai
    from google.genai import errors, types

    model = model or os.environ.get("GEMINI_MODEL", DEFAULT_MODEL)
    client = genai.Client(api_key=api_key or os.environ["GEMINI_API_KEY"])

    contents = [
        types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
        types.Part.from_text(text=PROMPT),
    ]
    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=RESPONSE_SCHEMA,
        temperature=0.0,
    )

    # 無料枠は 429 に当たりやすいので、他のエージェントと同じく単純にリトライする
    for attempt in range(MAX_RETRIES):
        try:
            response = client.models.generate_content(
                model=model, contents=contents, config=config
            )
            break
        except errors.ClientError as exc:
            if getattr(exc, "code", None) != 429 or attempt == MAX_RETRIES - 1:
                raise
            time.sleep(RETRY_WAIT_SECONDS)
    else:  # pragma: no cover - ループは必ず break か raise で抜ける
        raise RuntimeError("Gemini API の呼び出しに失敗しました")

    return validate(parse_response(response.text), previous_weight)


class FakeReader:
    """APIキー無しでUIを動かすためのダミー。demo.py とテストで使う。"""

    def __init__(self, readings: list[ScaleReading] | None = None):
        self.readings = readings or [
            ScaleReading(weight_kg=62.4, body_fat_pct=18.2, raw_text="62.4kg 18.2%", confidence=0.93)
        ]
        self.calls = 0

    def __call__(
        self,
        image_bytes: bytes,
        mime_type: str = "image/jpeg",
        previous_weight: float | None = None,
        **_kwargs,
    ) -> ScaleReading:
        reading = self.readings[min(self.calls, len(self.readings) - 1)]
        self.calls += 1
        return validate(reading, previous_weight)
