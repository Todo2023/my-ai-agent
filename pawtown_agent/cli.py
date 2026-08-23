"""Pawtown の運用コマンド。

町（投稿）:
    python cli.py map                         町の施設と投稿数
    python cli.py members                     会員一覧
    python cli.py ask <email>                 今日の質問を出す（ひろば・方式B）
    python cli.py post <email> --text "…"     ひろばに投稿（AIが物語にする）
    python cli.py post <email> --type C --image photo.jpg
    python cli.py post <email> --category question --text "…"   そうだん所に投稿
    python cli.py feed [<email>] [--category question]          施設の投稿一覧

つながり（副次機能）:
    python cli.py connect <email> <email> [--send]   気になった相手とのマッチを作る
    python cli.py match <email> [--send]             候補を探して確認メールを送る
    python cli.py round                              未マッチの会員をまとめて処理
    python cli.py pending                            承認待ち一覧
    python cli.py respond <ID|受付番号> [a|b] yes|no  賛否を記録
    python cli.py stats                              件数の表示

メール送信の直前には必ず y/N を聞く。LLMの判断だけでは1通も出さない。
"""

from __future__ import annotations

import argparse
import os
import sys
import textwrap

from dotenv import load_dotenv

import fakes
import feed as feed_module
import flow
import notify
import stories
import store
import town
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


def _headline(text: str, width: int = 28) -> str:
    """一覧に出す見出し。本文の書き出しから作る。"""
    first = text.strip().splitlines()[0] if text.strip() else ""
    return first if len(first) <= width else first[:width] + "…"


def _wrap(text: str, indent: str = "  ") -> str:
    lines = []
    for paragraph in text.splitlines():
        lines.extend(textwrap.wrap(paragraph, width=60,
                                   initial_indent=indent, subsequent_indent=indent)
                     or [indent.rstrip()])
    return "\n".join(lines)


# --- 物語 -------------------------------------------------------------------


def cmd_map(args):
    print("Pawtown の町")
    for place in town.map_counts():
        print(f"\n  【{place['place']}】{place['callout']}")
        print(f"    {place['label']}（{place['count']}件）  --category {place['id']}")
        print(f"    例: {place['example']}")


def cmd_members(args):
    for member in store.list_members():
        pet = "犬" if member.pet_type == "dog" else "猫"
        print(
            f"{member.id[:8]}  {member.display_name:<6}（{member.nickname:<10}）"
            f"{pet}/{member.breed or '不明':<12} 既定の投稿方式: "
            f"{member.default_post_type} {stories.POST_TYPES[member.default_post_type]}"
        )


def cmd_ask(args):
    member = _resolve_member(args.member)
    print(f"{member.display_name}ちゃんへの今日の質問:")
    print(f"  {stories.question_for(member)}")
    print(f"\n答えたら: python cli.py post {member.email} --text \"…\"")


def cmd_post(args):
    member = _resolve_member(args.member)
    category = town.normalize(args.category)
    first_post = not store.list_posts(member_id=member.id, limit=1)
    post_type = stories.normalize_post_type(args.type or member.default_post_type)

    question = ""
    if town.writes_story(category):
        # ひろばだけ、AIがペット目線の物語にする
        if post_type == "B":
            question = stories.question_for(member)
            if not args.text:
                raise SystemExit(f"今日の質問「{question}」への回答を --text で渡してください。")
    elif not args.text:
        raise SystemExit(
            f"「{town.place(category)}」への投稿には --text が必要です。"
            f"（例: {town.CATEGORIES[category]['example']}）"
        )

    raw_input_text, body = stories.compose(
        member, category, text=args.text or "", post_type=post_type,
        question=question, image_path=args.image,
    )
    title = args.title or ("" if town.writes_story(category) else _headline(body))
    post = store.create_post(member.id, post_type, raw_input_text, body,
                             question, category=category, title=title)

    print(f"【{town.place(category)}】{member.display_name}ちゃん / {member.nickname}さん")
    if town.writes_story(category):
        print(f"  方式{post_type}: {stories.POST_TYPES[post_type]}")
    if question:
        print(f"  質問: {question}")
    if title:
        print(f"  見出し: {title}")
    print()
    print(_wrap(body))
    print(f"\n  投稿ID: {post.id[:8]}")

    # 初回に選んだ方式を既定として覚える。2回目以降は --remember を付けたときだけ
    if args.type and town.writes_story(category) and stories.should_remember_default(
            member, post_type, first_post, args.remember):
        store.update_member(member.id, default_post_type=post_type)
        print(f"  次からは方式{post_type}を既定にします（変更は --type で）。")


def cmd_feed(args):
    reader = _resolve_member(args.member) if args.member else None
    category = town.normalize(args.category) if args.category else None
    items = feed_module.build_feed(reader, limit=args.limit, category=category)
    if category:
        print(f"【{town.place(category)}】{town.CATEGORIES[category]['callout']}")
    if not items:
        print("まだ投稿がありません。")
        return
    for item in items:
        member = item["member"]
        if item["kind"] == "recommend":
            print(f"\n  ── {item['reason']}")
            print(f"     {member.display_name}ちゃんの物語:")
            print(_wrap(item["post"].generated_story, indent="     "))
            print(f"     つながりたい: python cli.py connect "
                  f"{reader.email if reader else '<あなたのemail>'} {member.email}")
        else:
            post = item["post"]
            who = (f"{member.display_name}ちゃん（{member.breed}）"
                   if post.category == "showcase" else f"{member.nickname}さん")
            tail = f"  方式{post.post_type}" if post.category == "showcase" else ""
            print(f"\n{who}  {post.created_at[:10]}  【{town.place(post.category)}】{tail}")
            if post.title:
                print(f"  {post.title}")
            print(_wrap(post.generated_story))


# --- つながり ---------------------------------------------------------------


def _send_requests(match):
    for message in flow.send_approval_requests(match):
        print(message)


def cmd_connect(args):
    reader = _resolve_member(args.member)
    partner = _resolve_member(args.partner)
    if partner.id in store.paired_member_ids(reader.id):
        print(f"{partner.nickname}さんとは、すでにマッチ候補として登録済みです。")
        return
    result = feed_module.connect(reader, partner)
    match = result["match"]
    print(f"マッチ候補を登録しました [{match.id[:8]}] "
          f"スコア {match.match_score:g}")
    print(_wrap(match.match_reason))
    if args.send:
        _send_requests(match)
    else:
        print("\n確認メールを送るには --send を付けて実行してください。")


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
        print(_wrap(match.match_reason, indent="      "))
    if not args.send:
        print("\n確認メールを送るには --send を付けて実行してください。")
        return
    for match in created:
        _send_requests(match)


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
    parser = argparse.ArgumentParser(
        description="Pawtown（4つの施設がある町 + さりげないマッチング）"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("map", help="町の施設と投稿数").set_defaults(func=cmd_map)
    sub.add_parser("members", help="会員一覧").set_defaults(func=cmd_members)

    ask_parser = sub.add_parser("ask", help="今日の質問を出す（方式B）")
    ask_parser.add_argument("member", help="メールアドレス または 会員ID")
    ask_parser.set_defaults(func=cmd_ask)

    post_parser = sub.add_parser("post", help="物語を作って保存する")
    post_parser.add_argument("member", help="メールアドレス または 会員ID")
    post_parser.add_argument("--category", choices=list(town.CATEGORIES),
                             default="showcase", help="どの施設に投稿するか（既定: showcase＝ひろば）")
    post_parser.add_argument("--title", default="", help="見出し（省略時は本文の書き出し）")
    post_parser.add_argument("--type", choices=["A", "B", "C"],
                             help="投稿方式（既定は会員ごとの default_post_type）")
    post_parser.add_argument("--text", default="", help="一言 または 質問への回答")
    post_parser.add_argument("--image", help="方式Cで使う写真のパス")
    post_parser.add_argument("--remember", action="store_true",
                             help="この方式を次回以降の既定にする")
    post_parser.set_defaults(func=cmd_post)

    feed_parser = sub.add_parser("feed", help="施設の投稿一覧")
    feed_parser.add_argument("member", nargs="?", help="読む人（省略すると新着一覧のみ）")
    feed_parser.add_argument("--category", choices=list(town.CATEGORIES),
                             help="施設を絞る（省略すると町ぜんぶ）")
    feed_parser.add_argument("--limit", type=int, default=12)
    feed_parser.set_defaults(func=cmd_feed)

    connect_parser = sub.add_parser("connect", help="気になった相手とのマッチを作る")
    connect_parser.add_argument("member", help="あなた")
    connect_parser.add_argument("partner", help="お相手")
    connect_parser.add_argument("--send", action="store_true", help="確認メールまで送る")
    connect_parser.set_defaults(func=cmd_connect)

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
