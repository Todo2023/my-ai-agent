"""Pawtown マッチングエージェントの運用コマンド。

    python cli.py members                  会員一覧
    python cli.py match <email|id>         その人のマッチ候補を探して登録・確認メール送信
    python cli.py round                    まだ候補が出ていない全員に対して一括実行
    python cli.py pending                  承認待ちのマッチ一覧
    python cli.py respond <ID|受付番号> a|b yes|no   賛否を記録（揃えば紹介メール）
    python cli.py stats                    件数の表示

メール送信の直前には必ず y/N を聞く。LLMの判断だけでは1通も出さない。
"""

from __future__ import annotations

import argparse
import os
import sys

from dotenv import load_dotenv

import fakes
import flow
import notify
import store
from dashboard import print_stats

DEMO_BANNER = (
    "※ デモモードです。会員データはダミーで、メールは実際には送信されません。\n"
)
DRY_RUN_BANNER = (
    "※ ドライランです（PAWTOWN_EMAIL_DRY_RUN=1）。メールは実際には送信されません。\n"
)


def confirm_send(recipients: list[str], subject: str, body: str) -> bool:
    """送信直前に人間へ確認する（個人情報が動く操作なので必ず通す）。"""
    print("\n--- メール送信の確認 ---")
    print(f"宛先: {', '.join(recipients)}")
    print(f"件名: {subject}")
    print("本文:")
    print(body)
    print("------------------------")
    try:
        answer = input("この内容で送信しますか？ [y/N]: ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        print()
        return False
    return answer in {"y", "yes"}


def _resolve_member(key: str):
    member = store.find_member_by_email(key) if "@" in key else store.get_member(key)
    if member is None:
        raise SystemExit(f"会員が見つかりません: {key}")
    return member


def cmd_members(args):
    for member in store.list_members():
        pet = "犬" if member.pet_type == "dog" else "猫"
        print(
            f"{member.id[:8]}  {member.nickname:<12} {pet}/{member.breed or '不明':<12} "
            f"{member.area or '不明':<12} 悩み: {'、'.join(member.concern_tags) or '未登録'}"
        )


def cmd_match(args):
    member = _resolve_member(args.member)
    created = flow.propose_matches(member.id, top_n=args.top)
    if not created:
        print(f"{member.nickname}さんに紹介できそうな相手は見つかりませんでした。")
        return
    print(f"{member.nickname}さんのマッチ候補 {len(created)}件:")
    for match in created:
        partner_id = (
            match.member_b_id if match.member_a_id == member.id else match.member_a_id
        )
        partner = store.get_member(partner_id)
        print(f"  [{match.id[:8]}] {partner.nickname}（スコア {match.match_score:g}）")
        print(f"      {match.match_reason}")
    if not args.send:
        print("\n確認メールを送るには --send を付けて実行してください。")
        return
    for match in created:
        for message in flow.send_approval_requests(match):
            print(message)


def cmd_round(args):
    result = flow.run_round(top_n=args.top)
    print(f"新しく登録したマッチ候補: {result['proposed']}件")
    for message in result["messages"]:
        print(message)


def cmd_pending(args):
    matches = store.list_matches(["pending", "approved_a", "approved_b"])
    if not matches:
        print("承認待ちのマッチはありません。")
        return
    for match in matches:
        member_a = store.get_member(match.member_a_id)
        member_b = store.get_member(match.member_b_id)
        print(
            f"[{match.id[:8]}] {member_a.nickname}(a) × {member_b.nickname}(b)  "
            f"スコア {match.match_score:g}  状態 {match.status}"
        )


def cmd_respond(args):
    found = store.find_match_by_token(args.match)
    if found:
        match, side = found
        if args.side and args.side != side:
            raise SystemExit(f"受付番号 {args.match} は {side} 側のものです。")
    else:
        match = store.find_match(args.match)
        if match is None:
            raise SystemExit(f"マッチが見つかりません: {args.match}")
        if not args.side:
            raise SystemExit("どちら側の返信かを a / b で指定してください。")
        side = args.side
    approved = args.answer in {"yes", "y", "はい"}
    updated, messages = flow.record_response(match, side, approved)
    print(f"状態: {updated.status}")
    for message in messages:
        print(message)


def cmd_stats(args):
    print_stats()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Pawtown マッチングエージェント")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("members", help="会員一覧").set_defaults(func=cmd_members)

    match_parser = sub.add_parser("match", help="指定した会員のマッチ候補を探す")
    match_parser.add_argument("member", help="メールアドレス または 会員ID")
    match_parser.add_argument("--top", type=int, default=3, help="候補の人数（既定: 3）")
    match_parser.add_argument("--send", action="store_true", help="確認メールまで送る")
    match_parser.set_defaults(func=cmd_match)

    round_parser = sub.add_parser("round", help="未マッチの会員をまとめて処理する")
    round_parser.add_argument("--top", type=int, default=3)
    round_parser.set_defaults(func=cmd_round)

    sub.add_parser("pending", help="承認待ち一覧").set_defaults(func=cmd_pending)

    respond_parser = sub.add_parser("respond", help="賛否を記録する")
    respond_parser.add_argument("match", help="マッチID（先頭8桁でも可）または受付番号")
    respond_parser.add_argument("side", nargs="?", choices=["a", "b"], help="どちら側の返信か")
    respond_parser.add_argument("answer", choices=["yes", "no", "y", "n", "はい", "いいえ"])
    respond_parser.set_defaults(func=cmd_respond)

    sub.add_parser("stats", help="件数の表示").set_defaults(func=cmd_stats)
    return parser


def main():
    load_dotenv()
    args = build_parser().parse_args()

    if not fakes.is_demo() and not os.environ.get("SUPABASE_URL"):
        print("エラー: 環境変数 SUPABASE_URL / SUPABASE_SERVICE_KEY が設定されていません。")
        print("DEMO_MODE=1 を設定すると、ダミーデータで一連の流れを試せます（.env.example 参照）。")
        sys.exit(1)

    notify.set_confirm_hook(confirm_send)
    if fakes.is_demo():
        print(DEMO_BANNER)
    elif os.environ.get("PAWTOWN_EMAIL_DRY_RUN") == "1":
        print(DRY_RUN_BANNER)

    args.func(args)


if __name__ == "__main__":
    main()
