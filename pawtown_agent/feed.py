"""物語フィードと、その合間へのレコメンド差し込み。

v2 の方針は「マッチング機能を前面に出さない」こと。
独立したマッチング画面は作らず、物語を読んでいる流れの中で
「〇〇ちゃんも同じことで悩んでいました」とだけ差し込む。

LLMの呼び出しはフィード1回につき最大1回。
読んでいる物語（anchor）と、候補になった子の直近の物語だけを渡す。
候補の絞り込みは scoring.py が決定的に行うので、
会員が増えてもLLMに渡す量は増えない。
"""

from __future__ import annotations

import json

import llm
import matcher
import scoring
import store
from models import Member, Post

# 何本の物語ごとにレコメンドを1枚挟むか
RECOMMEND_EVERY = 3
MAX_RECOMMENDS = 2

# ハンドオフ資料 3-2 のプロンプト案に合わせている
RECOMMEND_PROMPT = """以下は複数のペット飼い主のプロフィールと直近の物語です。
新規物語(target_post)を読んでいるユーザーに対して、
共感しそうな他メンバーの物語を1-2件選び、
「なぜおすすめか」を1文(日本語、さりげない口調)で添えてJSON出力してください。
出力は JSON のみ、前置きや説明文は一切不要です。

理由の書き方:
- 「〇〇ちゃんも実は同じ悩みを抱えていました」のような、そっと教える口調にする
- 共通点は物語とプロフィールに書かれている範囲でだけ挙げる
- 勧誘や煽りの文言は書かない。健康・医療の助言もしない

target_post: {target_post}
candidates: {candidates}

出力フォーマット:
[{{"candidate_post_id": "...", "reason": "..."}}]
"""


def _template_recommend_reason(reader: Member, other: Member, prescore: dict) -> str:
    """LLMを呼べないときの一文。共通点だけを根拠にする。"""
    if prescore["shared_concerns"]:
        topic = "「" + "」「".join(prescore["shared_concerns"]) + "」"
        return f"{other.display_name}ちゃんも、実は{topic}のことで悩んでいました。"
    if reader.breed and reader.breed == other.breed:
        return f"{other.display_name}ちゃんも、同じ{reader.breed}です。"
    if prescore["same_prefecture"]:
        return f"{other.display_name}ちゃんは、同じ{scoring.prefecture(reader.area)}に住んでいます。"
    return f"{other.display_name}ちゃんの物語も、近いところがあるかもしれません。"


def recommend(reader: Member, anchor: Post | None,
              limit: int = MAX_RECOMMENDS) -> list[dict]:
    """読んでいる物語（anchor）に対して、共感しそうな他の子の物語を返す。

    戻り値: [{"post", "member", "reason", "prescore"}, ...]
    候補がいなければ空リスト（このときLLMは呼ばない）。
    """
    members = {member.id: member for member in store.list_members()}
    reader_member = members.get(reader.id, reader)
    latest = store.latest_post_by_member()

    prescored = [
        item for item in scoring.shortlist(reader_member, list(members.values()))
        if item["candidate_id"] in latest
    ]
    if not prescored:
        return []

    by_post_id = {}
    for item in prescored:
        member = members[item["candidate_id"]]
        by_post_id[latest[member.id].id] = {
            "post": latest[member.id],
            "member": member,
            "prescore": item,
        }

    if not llm.available() or anchor is None:
        picks = list(by_post_id.values())[:limit]
        return [
            dict(pick, reason=_template_recommend_reason(
                reader_member, pick["member"], pick["prescore"]))
            for pick in picks
        ]

    prompt = RECOMMEND_PROMPT.format(
        target_post=json.dumps(
            {"pet_name": reader_member.display_name, "story": anchor.generated_story,
             "concern_tags": reader_member.concern_tags},
            ensure_ascii=False,
        ),
        candidates=json.dumps(
            [
                {
                    "candidate_post_id": post_id,
                    "pet_name": entry["member"].display_name,
                    "breed": entry["member"].breed,
                    "concern_tags": entry["member"].concern_tags,
                    "story": entry["post"].generated_story,
                }
                for post_id, entry in by_post_id.items()
            ],
            ensure_ascii=False,
        ),
    )
    results = []
    for item in llm.extract_json(llm.call(prompt)):
        post_id = str(item.get("candidate_post_id", ""))
        # 存在しない物語をLLMが作ることがある。フィードに出す前に捨てる
        entry = by_post_id.get(post_id)
        if entry is None:
            continue
        reason = str(item.get("reason", "")).strip() or _template_recommend_reason(
            reader_member, entry["member"], entry["prescore"]
        )
        results.append(dict(entry, reason=reason))
        if len(results) >= limit:
            break
    return results


def build_feed(reader: Member | None = None, limit: int = 12,
               every: int = RECOMMEND_EVERY) -> list[dict]:
    """物語フィードを組み立てる。

    戻り値の各要素は次のどちらか。
      {"kind": "post",      "post": Post, "member": Member}
      {"kind": "recommend", "post": Post, "member": Member, "reason": str}

    reader を渡さないときは、ただの新着一覧（レコメンドなし）を返す。
    """
    members = {member.id: member for member in store.list_members()}
    posts = store.list_posts(limit=limit)

    recommends = []
    if reader is not None:
        own = store.list_posts(member_id=reader.id, limit=1)
        recommends = recommend(reader, own[0] if own else None)

    # レコメンドで見せる物語は、通常の新着としては出さない（同じ物語を二度出さない）
    recommended_ids = {item["post"].id for item in recommends}
    feed = []
    pending = list(recommends)
    shown = 0
    for post in posts:
        if post.id in recommended_ids:
            continue
        member = members.get(post.member_id)
        if member is None:
            continue
        feed.append({"kind": "post", "post": post, "member": member})
        shown += 1
        if pending and shown % every == 0:
            item = pending.pop(0)
            feed.append(dict(item, kind="recommend"))
    for item in pending:
        feed.append(dict(item, kind="recommend"))
    return feed


def connect(reader: Member, other: Member) -> dict:
    """フィードで気になった相手と繋がりたくなったときの入り口。

    ここではまだメールを送らない。マッチを pending で作るだけで、
    実際の紹介は flow.send_approval_requests → 双方の承認を経てから。
    """
    prescore = scoring.score(reader, other)
    reason = matcher.template_reason(reader, other, prescore)
    match = store.create_match(reader.id, other.id, prescore["score"], reason)
    return {"match": match, "prescore": prescore}
