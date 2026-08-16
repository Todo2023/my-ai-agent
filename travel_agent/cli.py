import os
import sys

from dotenv import load_dotenv

from agent import TravelAgent

GREETING = (
    "こんにちは！旅行プランをご提案するAIエージェントです。\n"
    "行き先や日数、予算など、思いついたことから教えてください。\n"
    "（終了するには 'exit' または 'quit' と入力してください）\n"
)


def main():
    load_dotenv()

    if not os.environ.get("GEMINI_API_KEY"):
        print("エラー: 環境変数 GEMINI_API_KEY が設定されていません。")
        print(".env ファイルを作成するか、環境変数を設定してください（.env.example を参照）。")
        sys.exit(1)

    agent = TravelAgent()
    print(GREETING)

    while True:
        try:
            user_input = input("あなた: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n旅行の計画、頑張ってください！またいつでもどうぞ。")
            break

        if not user_input:
            continue
        if user_input.lower() in {"exit", "quit"}:
            print("旅行の計画、頑張ってください！またいつでもどうぞ。")
            break

        print("エージェント: ", end="", flush=True)
        print(agent.send(user_input))
        print()


if __name__ == "__main__":
    main()
