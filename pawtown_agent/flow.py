"""Human-in-the-loop の承認フロー（副次機能）。

v2 で主軸は物語に移ったが、「実際に人と人を引き合わせる」ときは
今までどおり必ず双方の承認を挟む。ここは v1 から変えていない。

status の遷移はここだけで管理する。LLMは status を触らない。

    pending ──(aが承認)──> approved_a ──(bが承認)──> matched
        │  └─(bが承認)──> approved_b ──(aが承認)──> matched
        └──(どちらかが拒否)──────────────────────> rejected

matched になったときだけ、双方を宛先にした紹介メールを送る。
つまり「両者の承認が揃うまで、相手のメールアドレスは相手に渡らない」ことを
この1か所で保証している。
"""

from __future__ import annotations

import store
from models import Match
from notify import approval_request, introduction, send_email

TERMINAL = ("matched", "rejected")


def next_status(current: str, side: str, approved: bool) -> str:
    """承認/拒否を1件受け取ったあとの status を返す（副作用なし）。"""
    if side not in ("a", "b"):
        raise ValueError(f"side は 'a' か 'b' です: {side!r}")
    if current in TERMINAL:
        # すでに確定済み。返信が二重に来ても状態は動かさない
        return current
    if not approved:
        return "rejected"
    already = {"a": "approved_a", "b": "approved_b"}[side]
    other = {"a": "approved_b", "b": "approved_a"}[side]
    if current == other:
        return "matched"
    return already


def propose_matches(target_id: str, top_n: int = 3) -> list[Match]:
    """新規登録者に対して候補を探し、pending のマッチとして登録する。

    すでに一度候補に出した相手（成立・不成立を問わず）は除外する。
    """
    import matcher  # LLMクライアントの読み込みを、実際に使うときまで遅らせる

    members = store.list_members()
    target = next((m for m in members if m.id == target_id), None)
    if target is None:
        raise RuntimeError(f"会員 {target_id} が見つかりません。")

    seen = store.paired_member_ids(target.id)
    candidates = [m for m in members if m.id != target.id and m.id not in seen]
    created = []
    for result in matcher.find_matches(target, candidates, top_n=top_n):
        created.append(
            store.create_match(
                target.id, result["candidate_id"], result["score"], result["reason"]
            )
        )
    return created


def send_approval_requests(match: Match) -> list[str]:
    """マッチの両者に「紹介してよいですか」と確認メールを送る。"""
    if match.status in TERMINAL:
        return [f"マッチ {match.id[:8]} はすでに {match.status} です。送信しません。"]

    member_a = store.get_member(match.member_a_id)
    member_b = store.get_member(match.member_b_id)
    if member_a is None or member_b is None:
        return [f"マッチ {match.id[:8]}: 会員が見つからないため送信しません。"]

    results = []
    for member, partner, side in ((member_a, member_b, "a"), (member_b, member_a, "b")):
        subject, body = approval_request(member, partner, match, side)
        results.append(send_email([member.email], subject, body))
    return results


def record_response(match: Match, side: str, approved: bool) -> tuple[Match, list[str]]:
    """片方の賛否を1件記録し、必要なら紹介メールまで進める。

    戻り値: (更新後のマッチ, 送信結果のメッセージ)
    """
    if match.status in TERMINAL:
        return match, [f"マッチ {match.id[:8]} はすでに {match.status} です。変更しません。"]

    updated = store.update_match(match.id, status=next_status(match.status, side, approved))

    if updated.status == "matched":
        member_a = store.get_member(updated.member_a_id)
        member_b = store.get_member(updated.member_b_id)
        subject, body = introduction(updated, member_a, member_b)
        # 双方の承認が揃ったのでここで初めて両者を同じ宛先に入れる
        return updated, [send_email([member_a.email, member_b.email], subject, body)]

    if updated.status == "rejected":
        # 断った事実は相手に伝えない。次の候補へ回す
        return updated, ["不成立として記録しました。お相手には通知しません。"]

    return updated, ["片方の承認を記録しました。もう片方の返信を待ちます。"]


def respond_by_token(token: str, approved: bool) -> tuple[Match, list[str]]:
    """承認トークンから賛否を記録する（将来のワンクリック承認リンク用）。"""
    found = store.find_match_by_token(token)
    if found is None:
        raise RuntimeError("この受付番号のマッチが見つかりません。")
    match, side = found
    return record_response(match, side, approved)


def run_round(top_n: int = 3) -> dict:
    """定期実行用。まだ候補が1件も無い会員に対して候補探しと確認メール送信を行う。"""
    members = store.list_members()
    proposed, sent = 0, []
    for member in members:
        if store.paired_member_ids(member.id):
            continue  # すでに何らかの候補が出ている人は今回は対象外
        for match in propose_matches(member.id, top_n=top_n):
            proposed += 1
            sent.extend(send_approval_requests(match))
    return {"proposed": proposed, "messages": sent}
