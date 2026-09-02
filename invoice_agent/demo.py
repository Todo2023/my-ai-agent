"""APIキー無しで、エージェントの「判断の部分」を動かして見るためのデモ。

LLMを呼ばない。呼ぶ代わりに、parse（自然文からの情報抽出）の結果を
あらかじめ書いたもので差し替えて、そのあとの決定的な処理を本物のまま動かす。

    python3 demo.py          # 全ケース
    python3 demo.py --list   # ケースの一覧だけ

ここで見えること：

  ゲート2で見つかった問題が、ゲート3の設計でどう塞がれたか。
  「対応していない要求は、確認を取るまでPDFを作らない」が
  LLMの気分ではなく、コードの条件分岐で決まっていること。

なぜこれで意味があるか：
  このエージェントはLLMに「情報を抜き出す」ことしかさせていない。
  実行してよいかの判断も、ユーザーに見せる文章も、すべてコード側にある。
  つまり LLM を止めても、危ない/安全の分かれ目はそのまま再現できる。
"""

import argparse
import os
import sys

# graph_agent は import しただけでは LLM に触らない（get_client() を呼ぶまで）。
from graph_agent import (
    EXCEL_PATH,
    cancelled_node,
    generate_node,
    out_of_scope_node,
    resolve_customer_node,
    route_after_resolve,
)
from invoice import list_customer_names


# 「LLMがこう返したことにする」ぶん。実際の parse_node の出力と同じ形。
# 由来は gate2_findings.md の番号。
CASES = [
    {
        "instruction": "A社の請求書を作って",
        "parsed": {"customer_name": "A社", "all_customers": False,
                   "unsupported_requests": [], "out_of_scope": False},
        "expect": "そのまま作る",
        "note": "ゲート2 #1。素直なケース",
    },
    {
        "instruction": "a社の請求書作って",
        "parsed": {"customer_name": "a社", "all_customers": False,
                   "unsupported_requests": [], "out_of_scope": False},
        "expect": "表記ゆれを吸収して作る",
        "note": "ゲート2 #10。以前はLLMが無言でA社に読み替えていた。いまは difflib が決めている",
    },
    {
        "instruction": "A社様の請求書を作って",
        "parsed": {"customer_name": "A社様", "all_customers": False,
                   "unsupported_requests": [], "out_of_scope": False},
        "expect": "敬称を落として作る",
        "note": "ゲート2 #11",
    },
    {
        "instruction": "A社の請求書を、割引10%つけて作って",
        "parsed": {"customer_name": "A社", "all_customers": False,
                   "unsupported_requests": ["割引10%"], "out_of_scope": False},
        "expect": "確認を取るまで作らない",
        "note": "ゲート2 #15。以前は割引を黙って無視して確定させていた（いちばん危なかった）",
    },
    {
        "instruction": "B社の請求書、消費税も入れて作って",
        "parsed": {"customer_name": "B社", "all_customers": False,
                   "unsupported_requests": ["消費税を入れる"], "out_of_scope": False},
        "expect": "確認を取るまで作らない",
        "note": "ゲート2 #18。以前は「消費税込みで作成した」と嘘の報告をしていた",
    },
    {
        "instruction": "請求書を作って",
        "parsed": {"customer_name": None, "all_customers": False,
                   "unsupported_requests": [], "out_of_scope": False},
        "expect": "誰宛かを聞き返す",
        "note": "ゲート2 #5。推測で作らない",
    },
    {
        "instruction": "エー社の請求書を作って",
        "parsed": {"customer_name": "エー社", "all_customers": False,
                   "unsupported_requests": [], "out_of_scope": False},
        "expect": "聞き返す（カタカナ表記は今も解決できない）",
        "note": "ゲート2 #12。未解決。ただし黙って間違えるのではなく聞き返す側に倒れている",
    },
    {
        "instruction": "全部の顧客の請求書を作って",
        "parsed": {"customer_name": None, "all_customers": True,
                   "unsupported_requests": [], "out_of_scope": False},
        "expect": "全顧客ぶんを作る",
        "note": "ゲート2 #9。当時は手段が無かった。ゲート3で足した",
    },
    {
        "instruction": "今日の天気を教えて",
        "parsed": {"customer_name": None, "all_customers": False,
                   "unsupported_requests": [], "out_of_scope": True},
        "expect": "業務範囲外として断る",
        "note": "ゲート2 #19",
    },
]


def build_state(case):
    st = {"instruction": case["instruction"], "approved": False,
          "resolved_customer": None, "message": ""}
    st.update(case["parsed"])
    return st


def run_case(case, n):
    print("=" * 68)
    print("%d. 指示: %s" % (n, case["instruction"]))
    print("   期待: %s" % case["expect"])
    print("   由来: %s" % case["note"])
    print("-" * 68)

    state = build_state(case)
    print("   [LLMの代わり] 抜き出した情報: %s" % case["parsed"])

    # ここから先は本物のコード。
    state.update(resolve_customer_node(state))
    print("   [コード] 解決した顧客名: %r" % state["resolved_customer"])

    route = route_after_resolve(state)
    print("   [コード] 次に進む先: %s" % route)

    if route == "generate":
        state.update(generate_node(state))
        print("   → %s" % state["message"])

    elif route == "ask_confirm":
        items = "、".join(state["unsupported_requests"])
        print("   → 人に確認する: 「%s には対応していません。" % items)
        print("      この部分を反映せずに作成してよいですか？」")
        print("      ★ ここで止まる。承認するまでPDFは作られない")
        state.update(cancelled_node(state))
        print("      （断った場合）→ %s" % state["message"])

    elif route == "ask_customer":
        print("   → 人に聞き返す: 「どの顧客の請求書を作成しますか？（登録済み: %s）」"
              % ", ".join(list_customer_names(EXCEL_PATH)))

    elif route == "out_of_scope":
        state.update(out_of_scope_node(state))
        print("   → %s" % state["message"])

    print()


def main():
    ap = argparse.ArgumentParser(description="APIキー無しで動かすデモ")
    ap.add_argument("--list", action="store_true", help="ケースの一覧だけ出す")
    args = ap.parse_args()

    if args.list:
        for i, c in enumerate(CASES, 1):
            print("%2d. %-34s → %s" % (i, c["instruction"], c["expect"]))
        return

    if not os.path.exists(EXCEL_PATH):
        sys.exit("%s がありません。先に `python3 make_sample_data.py` を実行してください。" % EXCEL_PATH)

    print()
    print("APIキーを使わないデモ。LLMは呼ばない。")
    print("parse（自然文の読み取り）の結果だけ差し替えて、そのあとは本物のコードを動かす。")
    print()

    for i, case in enumerate(CASES, 1):
        run_case(case, i)

    print("=" * 68)
    print("PDFが作られたケースでは invoice_<顧客名>.pdf がこのフォルダにできている。")
    print("対応していない要求（割引・消費税）を含むケースでは、")
    print("**確認を取るまでPDFが作られない**ことが、LLMではなくコードで決まっている。")


if __name__ == "__main__":
    main()
