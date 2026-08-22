"""マッチ候補の最終順位付けと紹介理由の生成（LLMに任せる部分）。

分担:
- 誰を候補に残すか、スコアの土台 → scoring.py（決定的）
- 上位候補の中での順位付けと「なぜ合いそうか」の日本語 → ここ（LLM）

LLMには最大でも shortlist の人数しか渡さない。全会員を毎回渡すと
会員が増えるほどトークン代と遅延が線形に増えるため。

無料枠のあるGemini APIを使う（travel_agent / meeting_agent と同じ）。
レート制限（429）に当たりやすいので単純なリトライを入れている。
DEMO_MODE=1 のときはAPIを呼ばず、共通タグから機械的に理由文を組み立てる。
"""

from __future__ import annotations

import json
import os
import re
import time

import fakes
import scoring
from models import Member

DEFAULT_MODEL = "gemini-3.6-flash"
MAX_RETRIES = 5
RETRY_WAIT_SECONDS = 20

# 出力させる形式はハンドオフ資料のプロンプト案に合わせている
PROMPT_TEMPLATE = """以下は複数のペット飼い主のプロフィールです。
新規登録者(target)に対して、既存メンバー(candidates)の中から
マッチ度が高い上位{top_n}名を選び、それぞれについて
「マッチスコア(0-100)」と「マッチ理由(1-2文、日本語)」をJSONで出力してください。
出力は JSON のみ、前置きや説明文は一切不要です。

マッチ理由は、本人たちにそのまま見せる文章です。次の点を守ってください。
- 共通点（犬種・猫種、悩み、エリア）を具体的に挙げる
- プロフィールに書かれていないことを推測で書かない
- ニックネームで呼ぶ。断定的な決めつけや、健康・医療に関する助言はしない

candidates には事前計算のスコア(prescore)と共通タグを添えてあります。
参考にして構いませんが、順位はプロフィール全体を見て判断してください。
candidates に無いIDを出力してはいけません。

target: {target}
candidates: {candidates}

出力フォーマット:
[{{"candidate_id": "...", "score": 0-100, "reason": "..."}}, ...]
"""


def _demo_reason(target: Member, candidate: Member, prescore: dict) -> str:
    """デモ・APIキー無しのときの理由文（LLMを呼ばない）。"""
    parts = []
    if prescore["shared_concerns"]:
        parts.append("「" + "」「".join(prescore["shared_concerns"]) + "」の悩みが共通しています")
    if target.breed and target.breed == candidate.breed:
        parts.append(f"どちらも{target.breed}を飼っています")
    elif scoring.breed_group(target.breed) and \
            scoring.breed_group(target.breed) == scoring.breed_group(candidate.breed):
        parts.append(f"どちらも{scoring.breed_group(target.breed)}の飼い主です")
    if prescore["same_prefecture"]:
        parts.append(f"お住まいのエリアも近い（{scoring.prefecture(target.area)}）です")
    if not parts:
        parts.append("ペットの種類が同じで、話が合いそうです")
    return f"{candidate.nickname}さんとは、" + "、".join(parts) + "。"


def _extract_json(text: str) -> list:
    """LLMの応答からJSON配列を取り出す。

    「出力はJSONのみ」と指示してもコードフェンスや前置きが付くことがある。
    ここで落とすと運用が止まるので、緩く拾ってから検証する。
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


def _call_llm(prompt: str, model: str) -> str:
    from google import genai
    from google.genai import errors

    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    for attempt in range(MAX_RETRIES):
        try:
            return client.models.generate_content(model=model, contents=prompt).text
        except errors.ClientError as e:
            if e.code == 429 and attempt < MAX_RETRIES - 1:
                # 無料枠のレート制限に達した。少し待って再試行する
                time.sleep(RETRY_WAIT_SECONDS)
                continue
            if e.code == 404:
                # モデルは提供終了になることがある。使えるモデルの調べ方を案内する
                raise RuntimeError(
                    f"モデル '{model}' が使えません。"
                    "環境変数 GEMINI_MODEL で別のモデルを指定してください。"
                ) from e
            raise
    raise RuntimeError("LLMの呼び出しに繰り返し失敗しました。")


def find_matches(target: Member, candidates: list[Member], top_n: int = 3,
                 model: str | None = None) -> list[dict]:
    """target に合いそうな相手を上位 top_n 名まで返す。

    戻り値: [{"candidate_id", "score", "reason", "prescore"}, ...] のスコア降順。
    候補が1人もいなければ空リスト（このときLLMは呼ばない）。
    """
    by_id = {candidate.id: candidate for candidate in candidates}
    prescored = scoring.shortlist(target, candidates)
    if not prescored:
        return []

    if fakes.is_demo() or not os.environ.get("GEMINI_API_KEY"):
        return [
            {
                "candidate_id": item["candidate_id"],
                "score": item["score"],
                "reason": _demo_reason(target, by_id[item["candidate_id"]], item),
                "prescore": item,
            }
            for item in prescored[:top_n]
        ]

    payload = [
        dict(
            by_id[item["candidate_id"]].to_prompt_dict(),
            prescore=item["score"],
            shared_concerns=item["shared_concerns"],
        )
        for item in prescored
    ]
    prompt = PROMPT_TEMPLATE.format(
        top_n=top_n,
        target=json.dumps(target.to_prompt_dict(), ensure_ascii=False),
        candidates=json.dumps(payload, ensure_ascii=False),
    )
    raw = _call_llm(prompt, model or os.environ.get("GEMINI_MODEL", DEFAULT_MODEL))

    prescore_by_id = {item["candidate_id"]: item for item in prescored}
    results = []
    for item in _extract_json(raw):
        candidate_id = str(item.get("candidate_id", ""))
        # 候補に無いIDをLLMが作ることがある。存在しない相手を紹介しないよう捨てる
        if candidate_id not in prescore_by_id:
            continue
        try:
            llm_score = float(item.get("score", 0))
        except (TypeError, ValueError):
            llm_score = 0.0
        reason = str(item.get("reason", "")).strip()
        if not reason:
            reason = _demo_reason(target, by_id[candidate_id], prescore_by_id[candidate_id])
        results.append({
            "candidate_id": candidate_id,
            "score": max(0.0, min(100.0, llm_score)),
            "reason": reason,
            "prescore": prescore_by_id[candidate_id],
        })
    results.sort(key=lambda item: item["score"], reverse=True)
    return results[:top_n]
