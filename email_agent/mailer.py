"""メール送信の実処理（決定的な処理）。

LLMはここに一切関与しない。SMTP経由で実際にメールを送るだけの関数。
"""

import os
import smtplib
from email.mime.text import MIMEText


def send_email(to: str, subject: str, body: str) -> None:
    """指定した宛先にメールを送信する。

    DRY_RUN=true（デフォルト）の場合は実際には送信せず、内容を標準出力に表示するだけ。
    本当に送信するには .env で DRY_RUN=false にし、SMTP_* を設定する。
    """
    dry_run = os.environ.get("DRY_RUN", "true").lower() in ("1", "true", "yes")
    if dry_run:
        print("--- DRY RUN: メールは送信されません（.env の DRY_RUN=false で送信有効化） ---")
        print(f"To: {to}\nSubject: {subject}\n\n{body}")
        print("--------------------------------------------------------------------")
        return

    host = os.environ["SMTP_HOST"]
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ["SMTP_USER"]
    password = os.environ["SMTP_PASSWORD"]
    from_addr = os.environ.get("FROM_EMAIL", user)

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to

    with smtplib.SMTP(host, port) as server:
        server.starttls()
        server.login(user, password)
        server.sendmail(from_addr, [to], msg.as_string())
