"""承認依頼メールと紹介メールの文面作成・送信。

メール送信は取り消しが効かない操作で、しかも相手の個人情報（メールアドレス）が
第三者に見える瞬間でもある。したがって:

- 文面はテンプレートで決定的に作る。LLMが作るのは「マッチ理由」の1〜2文だけ
- 送信直前に confirm_hook（CLI側で人間に y/N を聞く関数）を必ず通す
- 双方の承認が揃うまで、相手のメールアドレスは絶対に相手に見せない
- 断られた側の意思表示は相手に伝えない（「タイミングが合わなかった」までしか書かない）

PAWTOWN_EMAIL_DRY_RUN=1 のときは送らずに文面を表示するだけ。
DEMO_MODE=1 のときは fakes.sent_emails に貯めるだけで外部には出ない。
"""

from __future__ import annotations

import os
import smtplib
import ssl
from email.message import EmailMessage

import fakes
from models import Match, Member

SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 465
COMPANY = "合同会社To do"
SERVICE_NAME = os.environ.get("PAWTOWN_SERVICE_NAME", "Pawtown（仮）")

# CLI から set_confirm_hook() で差し込む。未設定なら送信前確認なしで送る
_confirm_hook = None


def set_confirm_hook(hook):
    """送信直前に呼ばれる確認関数を設定する。False を返すと送信を中止する。"""
    global _confirm_hook
    _confirm_hook = hook


def _footer() -> str:
    policy = os.environ.get("PAWTOWN_PRIVACY_URL", "")
    lines = [
        "----",
        f"{SERVICE_NAME}（運営: {COMPANY}）",
        "このメールは、ご登録いただいたプロフィールに基づいてお送りしています。",
    ]
    if policy:
        lines.append(f"プライバシーポリシー: {policy}")
    lines.append("配信を停止したい場合は、このメールにその旨ご返信ください。")
    return "\n".join(lines)


def approval_request(member: Member, partner: Member, match: Match, side: str) -> tuple[str, str]:
    """「紹介してよいですか」と本人に確認するメール。

    相手のメールアドレスも、相手が誰に紹介されているかも書かない。
    """
    token = match.token_a if side == "a" else match.token_b
    subject = f"[{SERVICE_NAME}] {partner.nickname}さんとマッチしそうです"
    body = f"""{member.nickname}さん

いつも{SERVICE_NAME}をご利用いただきありがとうございます。
{member.nickname}さんと相性が良さそうな飼い主さんが見つかりました。

--------------------------------
お相手: {partner.nickname}さん
ペット: {"犬" if partner.pet_type == "dog" else "猫"} / {partner.breed or "種類は未登録"}
悩んでいること: {"、".join(partner.concern_tags) or "未登録"}
エリア: {partner.area or "未登録"}

マッチ理由:
{match.match_reason}
--------------------------------

{partner.nickname}さんに紹介メッセージを送ってもよろしいですか？

このメールに「はい」または「いいえ」とご返信ください。
お二人とも「はい」とお答えになった場合にのみ、双方にご紹介のメールをお送りします。
どちらかが「いいえ」の場合、お相手にその旨が伝わることはありません。

（受付番号: {token[:8]}）

{_footer()}
"""
    return subject, body


def introduction(match: Match, member_a: Member, member_b: Member) -> tuple[str, str]:
    """双方の承認が揃ったときの引き合わせメール。両者を宛先に入れて送る。"""
    subject = (
        f"[{SERVICE_NAME}] {member_a.nickname}さんと{member_b.nickname}さんのご紹介"
    )
    body = f"""{member_a.nickname}さん、{member_b.nickname}さん

お二人ともご承諾いただけましたので、ご紹介いたします。
このメールにそのまま返信いただければ、お二人でやりとりができます。

--------------------------------
{member_a.nickname}さん
 ペット: {"犬" if member_a.pet_type == "dog" else "猫"} / {member_a.breed or "種類は未登録"}\
{f" / {member_a.pet_age:g}歳" if member_a.pet_age else ""}
 性格: {"、".join(member_a.personality_tags) or "未登録"}
 悩んでいること: {"、".join(member_a.concern_tags) or "未登録"}
 エリア: {member_a.area or "未登録"}

{member_b.nickname}さん
 ペット: {"犬" if member_b.pet_type == "dog" else "猫"} / {member_b.breed or "種類は未登録"}\
{f" / {member_b.pet_age:g}歳" if member_b.pet_age else ""}
 性格: {"、".join(member_b.personality_tags) or "未登録"}
 悩んでいること: {"、".join(member_b.concern_tags) or "未登録"}
 エリア: {member_b.area or "未登録"}
--------------------------------

お二人が合いそうだと考えた理由:
{match.match_reason}

まずは、共通の悩みについて情報交換されてはいかがでしょうか。
どうぞよろしくお願いいたします。

{_footer()}
"""
    return subject, body


def send_email(to: list[str], subject: str, body: str) -> str:
    """メールを送る。デモ・ドライラン・確認フックをここで一括で見る。"""
    recipients = [address for address in to if address]
    if not recipients:
        raise ValueError("宛先が空です。")

    if _confirm_hook is not None and not _confirm_hook(recipients, subject, body):
        return "[中止] 送信を取りやめました（人間の承認が得られませんでした）。"

    record = {"to": recipients, "subject": subject, "body": body}

    if fakes.is_demo():
        fakes.sent_emails.append(record)
        return f"[デモ] 送信したことにしました: {', '.join(recipients)} / {subject}"

    if os.environ.get("PAWTOWN_EMAIL_DRY_RUN") == "1":
        return f"[DRY RUN] 送信していません: {', '.join(recipients)} / {subject}"

    sender = os.environ.get("GMAIL_ADDRESS")
    password = os.environ.get("GMAIL_APP_PASSWORD")
    if not sender or not password:
        raise RuntimeError(
            "環境変数 GMAIL_ADDRESS / GMAIL_APP_PASSWORD が設定されていません。"
            "（送信せずに文面だけ見たい場合は PAWTOWN_EMAIL_DRY_RUN=1 を設定してください）"
        )

    message = EmailMessage()
    message["From"] = f"{SERVICE_NAME} <{sender}>"
    message["To"] = ", ".join(recipients)
    message["Subject"] = subject
    message.set_content(body)

    try:
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=ssl.create_default_context()) as smtp:
            smtp.login(sender, password)
            smtp.send_message(message)
    except smtplib.SMTPAuthenticationError as e:
        raise RuntimeError(
            "Gmailの認証に失敗しました。GMAIL_APP_PASSWORD には通常のパスワードではなく"
            "アプリパスワードを設定してください。"
        ) from e
    fakes.sent_emails.append(record)
    return f"送信しました: {', '.join(recipients)} / {subject}"
