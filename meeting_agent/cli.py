import os
import sys

from dotenv import load_dotenv

import chatwork
from agent import MeetingShareAgent

GREETING = (
    "こんにちは！GoogleカレンダーのMeet URLをChatworkに共有するAIエージェントです。\n"
    "例:「明日15時からA社と打ち合わせ。Meetを作って山田さんのルームに送って」\n"
    "（終了するには 'exit' または 'quit' と入力してください）\n"
)


def confirm_send(room_id: int, message: str) -> bool:
    """Chatwork送信の直前に人間へ確認する（LLMの判断だけでは送らせない）。"""
    print("\n--- Chatwork送信の確認 ---")
    print(f"送信先 room_id: {room_id}")
    print("本文:")
    print(message)
    print("--------------------------")
    try:
        answer = input("この内容で送信しますか？ [y/N]: ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        print()
        return False
    return answer in {"y", "yes"}


def main():
    load_dotenv()

    missing = [
        name
        for name in ("GEMINI_API_KEY", "CHATWORK_API_TOKEN")
        if not os.environ.get(name)
    ]
    if missing:
        print(f"エラー: 環境変数 {', '.join(missing)} が設定されていません。")
        print(".env ファイルを作成するか、環境変数を設定してください（.env.example を参照）。")
        sys.exit(1)

    chatwork.set_confirm_hook(confirm_send)
    agent = MeetingShareAgent()
    print(GREETING)

    while True:
        try:
            user_input = input("あなた: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nまたいつでもどうぞ。")
            break

        if not user_input:
            continue
        if user_input.lower() in {"exit", "quit"}:
            print("またいつでもどうぞ。")
            break

        print("エージェント: ", end="", flush=True)
        print(agent.send(user_input))
        print()


if __name__ == "__main__":
    main()
