"""Chatwork 連携ツール。

Chatwork API v2 を叩いて、チャットルームの一覧・メンバー一覧の取得と、
メッセージ送信を行う。

送信は取り消しが効かない操作なので、LLMの判断だけで飛ばさない。
送信直前に confirm_hook（CLI側で人間に y/N を聞く関数）を必ず通す設計にしている。
CHATWORK_DRY_RUN=1 のときは実際には送らず、送信内容を表示するだけにする。
"""

import os

import requests

import fakes

API_BASE = "https://api.chatwork.com/v2"
TIMEOUT_SECONDS = 15

# CLI から set_confirm_hook() で差し込む。未設定なら送信前確認なしで送る
_confirm_hook = None


def set_confirm_hook(hook):
    """送信直前に呼ばれる確認関数を設定する。False を返すと送信を中止する。"""
    global _confirm_hook
    _confirm_hook = hook


def _headers() -> dict:
    token = os.environ.get("CHATWORK_API_TOKEN")
    if not token:
        raise RuntimeError("環境変数 CHATWORK_API_TOKEN が設定されていません。")
    return {"X-ChatWorkToken": token}


def _check(response: requests.Response):
    """Chatwork APIのエラーを、原因が分かる文言にしてから投げ直す。"""
    if response.status_code == 401:
        raise RuntimeError(
            "Chatworkの認証に失敗しました（401）。CHATWORK_API_TOKEN の値を確認してください。"
        )
    if response.status_code == 403:
        raise RuntimeError(
            "Chatworkへのアクセスが拒否されました（403）。"
            "そのチャットルームに参加しているか、APIの利用が管理者に許可されているか確認してください。"
        )
    if response.status_code == 429:
        raise RuntimeError(
            "ChatworkのAPI利用制限に達しました（429）。しばらく待ってから再実行してください。"
        )
    response.raise_for_status()


def _get(path: str) -> list:
    response = requests.get(
        f"{API_BASE}{path}", headers=_headers(), timeout=TIMEOUT_SECONDS
    )
    _check(response)
    return response.json()


def list_chatwork_rooms() -> str:
    """Chatworkのチャットルーム一覧（room_idと名前）を返す。

    「〇〇さんに送って」と言われたとき、送り先の room_id を特定するために使う。
    """
    rooms = fakes.DEMO_ROOMS if fakes.is_demo() else _get("/rooms")
    if not rooms:
        return "参加しているチャットルームがありません。"
    lines = [
        f"- room_id: {r['room_id']} / {r['name']} (type: {r.get('type', '')})"
        for r in rooms
    ]
    return "\n".join(lines)


def list_chatwork_members(room_id: int) -> str:
    """指定したチャットルームのメンバー一覧（account_idと名前）を返す。

    [To:account_id] 形式のメンション付きメッセージを作るときに使う。

    Args:
        room_id: 対象のチャットルームID
    """
    if fakes.is_demo():
        members = fakes.DEMO_MEMBERS.get(int(room_id), [])
    else:
        members = _get(f"/rooms/{room_id}/members")
    if not members:
        return "メンバーが取得できませんでした。"
    return "\n".join(
        f"- account_id: {m['account_id']} / {m['name']} ({m.get('role', '')})"
        for m in members
    )


def send_chatwork_message(room_id: int, message: str) -> str:
    """Chatworkの指定チャットルームにメッセージを送信する。

    Google Meet の URL を仕事先の相手に共有するときに使う。
    メンションしたい場合は本文の先頭に [To:account_id] を付ける。
    送信前に人間の確認が入るので、確認で拒否された場合はその旨が返る。

    Args:
        room_id: 送信先のチャットルームID
        message: 送信する本文
    """
    if _confirm_hook is not None and not _confirm_hook(room_id, message):
        return "ユーザーが送信を承認しなかったため、送信していません。文面や送信先を確認してください。"

    if fakes.is_demo():
        fakes.sent_messages.append({"room_id": int(room_id), "body": message})
        return (
            f"[デモ] room_id={room_id} に送信しました（実際には送られていません）。\n{message}"
        )

    if os.environ.get("CHATWORK_DRY_RUN") == "1":
        return f"[DRY RUN] room_id={room_id} に送信したつもりの本文:\n{message}"

    response = requests.post(
        f"{API_BASE}/rooms/{room_id}/messages",
        headers=_headers(),
        data={"body": message, "self_unread": "0"},
        timeout=TIMEOUT_SECONDS,
    )
    _check(response)
    message_id = response.json().get("message_id", "")
    return f"room_id={room_id} に送信しました（message_id: {message_id}）。"
