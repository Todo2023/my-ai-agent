"""マッチ候補の順位付けと紹介理由の生成（副次機能）。

v2 で主軸は物語（stories.py / feed.py）に移った。ここは
「物語を読んでいて気になった相手と、実際に引き合わせる」段になったときに使う。

分担:
- 誰を候補に残すか、スコアの土台 → scoring.py（決定的）
- 上位候補の中での順位付けと「なぜ合いそうか」の日本語 → ここ（LLM）

LLMには最大でも shortlist の人数しか渡さない。全会員を毎回渡すと
会員が増えるほどトークン代と遅延が線形に増えるため。
LLMを呼べないときは共通タグから機械的に理由文を組み立てる。
"""

from __future__ import annotations

import json

import llm
import scoring
from models import Member

# 出力させる形式はハンドオフ資料のプロンプト案に合わせている
PROMPT_TEMPLATE = """以下は複数のペット飼い主のプロフィールです。
新規登録者(target)に対して、既存メンバー(candidates)の中から
マッチ度が高い上位{top_n}名を選び、それぞれについて
「マッチスコア(0-100)」と「マッチ理由(1-2文、日本語)」をJSONで出力してください。
出力は JSON のみ、前置きや説明文は一切不要です。

マッチ理由は、本人たちにそのまま見せる文章です。次の点を守ってください。
- 共通点（ペットの種類・犬種/猫種、悩み、エリア）を具体的に挙げる
- プロフィールに書かれていないことを推測で書かない
- 飼い主はニックネーム、ペットは pet_name で呼ぶ
- 断定的な決めつけや、健康・医療に関する助言はしない

candidates には事前計算のスコア(prescore)と共通タグを添えてあります。
参考にして構いませんが、順位はプロフィール全体を見て判断してください。
candidates に無いIDを出力してはいけません。

target: {target}
candidates: {candidates}

出力フォーマット:
[{{"candidate_id": "...", "score": 0-100, "reason": "..."}}, ...]
"""


def template_reason(target: Member, candidate: Member, prescore: dict) -> str:
    """LLMを呼べないときの理由文。共通タグだけを根拠にする。"""
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
    return f"{candidate.nickname}さん（{candidate.display_name}ちゃん）とは、" + "、".join(parts) + "。"


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

    if not llm.available():
        return [
            {
                "candidate_id": item["candidate_id"],
                "score": item["score"],
                "reason": template_reason(target, by_id[item["candidate_id"]], item),
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
    raw = llm.call(prompt, model=model)

    prescore_by_id = {item["candidate_id"]: item for item in prescored}
    results = []
    for item in llm.extract_json(raw):
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
            reason = template_reason(target, by_id[candidate_id], prescore_by_id[candidate_id])
        results.append({
            "candidate_id": candidate_id,
            "score": max(0.0, min(100.0, llm_score)),
            "reason": reason,
            "prescore": prescore_by_id[candidate_id],
        })
    results.sort(key=lambda item: item["score"], reverse=True)
    return results[:top_n]
