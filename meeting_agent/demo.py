"""APIキーを一切使わずに、エージェントの処理の流れを再現するデモ。

LLMも外部APIも呼ばない。ツール（カレンダー/Chatwork）はダミーに差し替え、
LLMが組み立てるはずの手順を決め打ちでなぞる。

セットアップが終わる前に「何がどう動くのか」「送られる文面はどんな形か」を
確認するためのもの。

    python demo.py
"""

import datetime
import os
import sys

os.environ["DEMO_MODE"] = "1"
# デモでは2つのカレンダーに同じ予定を入れる様子を見せる
os.environ.setdefault("CALENDAR_IDS", "primary,work@example.com")

import chatwork  # noqa: E402  DEMO_MODE を立ててから読み込む
import fakes  # noqa: E402
import gcal  # noqa: E402

WEEKDAYS = "月火水木金土日"


def confirm(room_id: int, message: str) -> bool:
    print("\n--- Chatwork送信の確認 ---")
    print(f"送信先: {chatwork.room_label(room_id)}")
    print("本文:")
    print(message)
    print("--------------------------")
    if not sys.stdin.isatty():
        print("この内容で送信しますか？ [y/N]: y（非対話実行のため自動承認）")
        return True
    try:
        return input("この内容で送信しますか？ [y/N]: ").strip().lower() in {"y", "yes"}
    except (EOFError, KeyboardInterrupt):
        print()
        return False


def step(number: int, title: str):
    print(f"\n=== {number}. {title} ===")


def main():
    chatwork.set_confirm_hook(confirm)
    tz = gcal._tz()

    print("Meet URL共有エージェントのデモ（実際の送信は行いません）")

    step(1, "使えるカレンダーと、今後の予定を確認する")
    print(gcal.list_calendars())
    print()
    print(gcal.list_meetings(days=7))

    step(2, "予定を作成する（設定した2つのカレンダー両方に入る／Meet URLは1つ）")
    start = (datetime.datetime.now(tz=tz) + datetime.timedelta(days=1)).replace(
        hour=15, minute=0, second=0, microsecond=0
    )
    result = gcal.create_meeting(
        title="A社 定例MTG",
        start=start.strftime("%Y-%m-%d %H:%M"),
        duration_minutes=60,
    )
    print(result)
    meet_url = next(
        (line.split(": ", 1)[1] for line in result.splitlines() if line.startswith("Meet URL")),
        "",
    )

    step(3, "送信先のChatworkルームを探す")
    print(chatwork.list_chatwork_rooms())

    room_id = 11110001
    step(4, f"room_id={room_id} のメンバーを見てメンション先を決める")
    print(chatwork.list_chatwork_members(room_id))

    step(5, "文面を組み立てて送信する（送信前に人間の確認が入る）")
    body = (
        "[To:9001 山田 太郎さん]\n"
        "お世話になっております。\n"
        # %-m のような書式はWindowsで動かないため、数値を直接埋め込む
        f"{start.month}/{start.day}({WEEKDAYS[start.weekday()]}) {start:%H:%M}-"
        f"{start + datetime.timedelta(hours=1):%H:%M} の定例のURLです。\n"
        f"{meet_url}\n"
        "よろしくお願いいたします。"
    )
    print(chatwork.send_chatwork_message(room_id, body))

    print("\n=== デモ終了 ===")
    print(f"送信された（ことにした）メッセージ数: {len(fakes.sent_messages)}")
    print(
        "本番では、上の1〜5をLLMが会話の流れから自分で判断して実行します。\n"
        "送信の可否だけは、常に人間の y/N で決まります。"
    )


if __name__ == "__main__":
    main()
