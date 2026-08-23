"""members / posts / matches の読み書き。

本番は Supabase の REST API（PostgREST）を叩く。DEMO_MODE=1 のときは
fakes.py のメモリ上のデータを使うので、Supabaseプロジェクトが無くても動く。

呼び出し側（matcher / flow / cli）はどちらを使っているか意識しなくていいように、
同じ関数名で切り替える形にしている。
"""

from __future__ import annotations

import os
import uuid

import requests

import fakes
from models import Match, Member, Post

TIMEOUT_SECONDS = 15


def _config() -> tuple[str, str]:
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        raise RuntimeError(
            "環境変数 SUPABASE_URL / SUPABASE_SERVICE_KEY が設定されていません。"
            "（Supabaseを用意せずに動きを見たい場合は DEMO_MODE=1 を設定してください）"
        )
    return url, key


def _headers() -> dict:
    _, key = _config()
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _check(response: requests.Response):
    """PostgRESTのエラーを、原因が分かる文言にしてから投げ直す。"""
    if response.status_code in (401, 403):
        raise RuntimeError(
            f"Supabaseへのアクセスが拒否されました（{response.status_code}）。"
            "SUPABASE_SERVICE_KEY が service_role キーになっているか確認してください"
            "（anon キーは RLS により members / matches を読み書きできません）。"
        )
    if response.status_code == 404:
        raise RuntimeError(
            "Supabaseのテーブルが見つかりません（404）。schema.sql を実行済みか確認してください。"
        )
    if response.status_code >= 400:
        raise RuntimeError(f"Supabase API エラー（{response.status_code}）: {response.text}")


def _request(method: str, path: str, **kwargs) -> list:
    url, _ = _config()
    response = requests.request(
        method, f"{url}/rest/v1{path}", headers=_headers(),
        timeout=TIMEOUT_SECONDS, **kwargs
    )
    _check(response)
    return response.json() if response.content else []


# --- members ---------------------------------------------------------------


def list_members() -> list[Member]:
    """有効な会員を全件返す。"""
    if fakes.is_demo():
        rows = fakes.demo_members()
    else:
        rows = _request("GET", "/members?active=eq.true&select=*")
    return [Member.from_row(row) for row in rows]


def get_member(member_id: str) -> Member | None:
    for member in list_members():
        if member.id == member_id:
            return member
    return None


def find_member_by_email(email: str) -> Member | None:
    for member in list_members():
        if member.email.lower() == email.lower():
            return member
    return None


def update_member(member_id: str, **fields) -> Member:
    """プロフィールの一部を更新する（投稿方式の記憶など）。"""
    if fakes.is_demo():
        for row in fakes.demo_members_raw():
            if row["id"] == member_id:
                row.update(fields)
                fakes.save_members()
                return Member.from_row(row)
        raise RuntimeError(f"会員 {member_id} が見つかりません。")
    updated = _request("PATCH", f"/members?id=eq.{member_id}", json=fields)
    if not updated:
        raise RuntimeError(f"会員 {member_id} が見つかりません。")
    return Member.from_row(updated[0])


# --- posts -----------------------------------------------------------------


def create_post(member_id: str, post_type: str, raw_input: str,
                generated_story: str, question: str = "",
                category: str = "showcase", title: str = "") -> Post:
    row = {
        "member_id": member_id,
        "category": category,
        "post_type": post_type,
        "title": title or None,
        "question": question or None,
        "raw_input": raw_input,
        "generated_story": generated_story,
    }
    if fakes.is_demo():
        row = dict(row, id=str(uuid.uuid4()), created_at=fakes.now_iso())
        fakes.demo_posts().append(row)
        fakes.save_posts()
        return Post.from_row(row)
    created = _request("POST", "/posts", json=row)
    return Post.from_row(created[0])


def list_posts(member_id: str | None = None, limit: int = 50,
               category: str | None = None) -> list[Post]:
    """新しい順に投稿を返す。category を渡すとその施設の投稿だけ。"""
    if fakes.is_demo():
        rows = sorted(fakes.demo_posts(), key=lambda row: row.get("created_at", ""), reverse=True)
        if member_id:
            rows = [row for row in rows if row["member_id"] == member_id]
        if category:
            rows = [row for row in rows if row.get("category", "showcase") == category]
        rows = rows[:limit]
    else:
        query = f"/posts?select=*&order=created_at.desc&limit={limit}"
        if member_id:
            query += f"&member_id=eq.{member_id}"
        if category:
            query += f"&category=eq.{category}"
        rows = _request("GET", query)
    return [Post.from_row(row) for row in rows]


def latest_post_by_member() -> dict[str, Post]:
    """会員ごとの最新の物語。レコメンドの材料に使う。

    レコメンドで見せるのは「ひろば」の物語だけ。質問やグッズ紹介を
    「同じ悩みの子がいます」と差し込んでも意味が通らないため。
    """
    latest: dict[str, Post] = {}
    for post in list_posts(limit=500, category="showcase"):
        latest.setdefault(post.member_id, post)
    return latest


# --- matches ---------------------------------------------------------------


def _pair_key(a_id: str, b_id: str) -> tuple[str, str]:
    """同じ2人が (a,b) と (b,a) で二重登録されないよう順序を固定する。"""
    return (a_id, b_id) if a_id <= b_id else (b_id, a_id)


def list_matches(statuses: list[str] | None = None) -> list[Match]:
    if fakes.is_demo():
        rows = fakes.demo_matches()
    else:
        query = "/matches?select=*"
        if statuses:
            query += f"&status=in.({','.join(statuses)})"
        rows = _request("GET", query)
    matches = [Match.from_row(row) for row in rows]
    if statuses and fakes.is_demo():
        matches = [match for match in matches if match.status in statuses]
    return matches


def paired_member_ids(member_id: str) -> set[str]:
    """すでに候補として出した相手のID。

    断られた相手も含める（同じ相手を何度も出し直さないため）。
    """
    partners = set()
    for match in list_matches():
        if match.member_a_id == member_id:
            partners.add(match.member_b_id)
        elif match.member_b_id == member_id:
            partners.add(match.member_a_id)
    return partners


def create_match(member_a_id: str, member_b_id: str, score: float, reason: str) -> Match:
    a_id, b_id = _pair_key(member_a_id, member_b_id)
    row = {
        "member_a_id": a_id,
        "member_b_id": b_id,
        "match_score": score,
        "match_reason": reason,
        "status": "pending",
    }
    if fakes.is_demo():
        row = dict(
            row,
            id=str(uuid.uuid4()),
            token_a=fakes.new_token(),
            token_b=fakes.new_token(),
        )
        fakes.demo_matches().append(row)
        fakes.save_matches()
        return Match.from_row(row)
    created = _request("POST", "/matches", json=row)
    return Match.from_row(created[0])


def update_match(match_id: str, **fields) -> Match:
    if fakes.is_demo():
        for row in fakes.demo_matches():
            if row["id"] == match_id:
                row.update(fields)
                fakes.save_matches()
                return Match.from_row(row)
        raise RuntimeError(f"マッチ {match_id} が見つかりません。")
    updated = _request("PATCH", f"/matches?id=eq.{match_id}", json=fields)
    if not updated:
        raise RuntimeError(f"マッチ {match_id} が見つかりません。")
    return Match.from_row(updated[0])


def find_match(match_id: str) -> Match | None:
    for match in list_matches():
        if match.id == match_id or match.id.startswith(match_id):
            return match
    return None


def find_match_by_token(token: str) -> tuple[Match, str] | None:
    """承認トークンから (マッチ, 'a' or 'b') を引く。"""
    for match in list_matches():
        if token and token == match.token_a:
            return match, "a"
        if token and token == match.token_b:
            return match, "b"
    return None


def stats() -> dict:
    """ダッシュボード用の件数。"""
    matches = list_matches()
    posts = list_posts(limit=1000)
    counts = {
        f"{category}_count": sum(1 for post in posts if post.category == category)
        for category in ("showcase", "question", "learn", "goods")
    }
    return {
        "member_count": len(list_members()),
        "post_count": len(posts),
        "writer_count": len({post.member_id for post in posts}),
        **counts,
        "matched_count": sum(1 for m in matches if m.status == "matched"),
        "awaiting_count": sum(
            1 for m in matches if m.status in ("pending", "approved_a", "approved_b")
        ),
        "rejected_count": sum(1 for m in matches if m.status == "rejected"),
    }
