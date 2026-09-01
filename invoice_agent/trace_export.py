"""ゲート5: 実行トレースを画面用のJSONに書き出す（`docs/agent_office.html` が読む）。

なぜこれを別ファイルにしたか:
`graph_agent.py` 本体には手を入れたくないため、LangGraph の `graph.stream()` で
外側からノードの実行順を観測する方式にしている。本番の処理系はそのまま動く。

承認ゲート（interrupt）はシナリオごとに回答を台本として与える。人が座っていなくても
一通り流し切るための割り切りで、**本番の承認を自動化するものではない**。

使い方:
    uv run trace_export.py            # docs/trace_data.js を書き出す
    uv run trace_export.py --dry      # LLMを呼ばずに、書き出し先と台本だけ確認する

出力先に `trace_data.js` が無ければ、画面は同梱の再現データで動く（実ログは任意）。
"""

import argparse
import datetime as dt
import json
from pathlib import Path

OUTPUT = Path(__file__).resolve().parent.parent / "docs" / "trace_data.js"

# 画面の表示用メタ情報。ノード名 → (種別, 処理の流れの行番号, 吹き出し, 説明)
# 種別: llm=LLM判断 / code=決定的な処理 / ext=外部I/O / human=人間の承認
NODE_META: dict[str, tuple[str, int, str, str]] = {
    "parse": ("llm", 0, "指示を解析中", "自然文から顧客名・対応外要求・範囲外フラグをJSONで抽出"),
    "resolve_customer": ("code", 1, "顧客マスタと照合", "Excelの顧客名と突き合わせ（difflibで表記ゆれを吸収）"),
    "ask_customer": ("human", 2, "どの顧客ですか？", "顧客が特定できないので推測せず聞き返す（interrupt）"),
    "ask_confirm": ("human", 2, "社長、確認をお願いします", "未対応の要求があるため、PDF確定の前に人へ確認する（interrupt）"),
    "generate": ("ext", 3, "PDF作成", "invoice.py が計算してPDFを書き出す（LLMは登場しない）"),
    "out_of_scope": ("code", -1, "定型文で返答", "業務範囲外。断り文は固定文字列で返す"),
    "cancelled": ("code", -1, "中止しました", "承認されなかったので何も作らずに終了する"),
}

# 実行するシナリオ。answers は interrupt が来た順に使う台本。
SCENARIOS: list[dict] = [
    {"input": "A社の請求書を作って", "answers": []},
    {"input": "a社様の請求書、割引10%つけて作って", "answers": ["はい"]},
    {"input": "請求書を作っておいて", "answers": ["B社"]},
    {"input": "今日の札幌の天気を教えて", "answers": []},
    {"input": "全顧客分の請求書を、消費税10%込みで作って", "answers": ["いいえ"]},
]


def _step_from_node(node: str, update: dict, llm_trace: dict | None) -> dict:
    """1ノード分の実行結果を、画面が読む形に変換する。"""
    kind, bi, say, desc = NODE_META.get(node, ("code", -1, node, ""))
    step = {
        "node": node,
        "kind": kind,
        "bi": bi,
        "say": say,
        "desc": desc,
        "log": f"{node}: " + ", ".join(f"{k}={v!r}" for k, v in update.items() if k != "message"),
        "detail": {
            "src": f"graph_agent.py :: {node}_node",
            "in": "（実行時の入力）",
            "out": json.dumps(update, ensure_ascii=False, indent=1),
        },
    }
    if llm_trace:
        step["detail"]["src"] += (
            f"／実測 {llm_trace['latency_sec']}秒・{llm_trace['total_tokens']}トークン"
            f"（{llm_trace['model']}）"
        )
        step["detail"]["in"] = llm_trace["instruction"]
    return step


def run_scenario(scenario: dict, index: int) -> dict:
    """1シナリオを実行し、ノードの並びをステップ列として記録する。"""
    from langgraph.types import Command

    import graph_agent
    from graph_agent import graph

    graph_agent.traces.clear()
    seen_traces = 0
    thread_id = f"trace-{dt.datetime.now():%Y%m%d%H%M%S}-{index}"
    config = {"configurable": {"thread_id": thread_id}}

    state = {
        "instruction": scenario["input"],
        "customer_name": None,
        "all_customers": False,
        "unsupported_requests": [],
        "out_of_scope": False,
        "resolved_customer": None,
        "approved": False,
        "message": "",
    }

    steps: list[dict] = []
    answers = list(scenario["answers"])
    payload = state
    message = ""
    cancelled = False

    while True:
        interrupted = None
        for chunk in graph.stream(payload, config=config, stream_mode="updates"):
            for node, update in chunk.items():
                if node == "__interrupt__":
                    interrupted = update
                    continue
                llm_trace = None
                if len(graph_agent.traces) > seen_traces:
                    llm_trace = graph_agent.traces[-1]
                    seen_traces = len(graph_agent.traces)
                step = _step_from_node(node, update or {}, llm_trace)
                if node in ("ask_customer", "ask_confirm"):
                    step["ask"] = interrupted[0].value["question"] if interrupted else ""
                if node == "cancelled":
                    cancelled = True
                steps.append(step)
                if update and update.get("message"):
                    message = update["message"]

        if interrupted is None:
            break
        if not answers:
            raise SystemExit(
                f"承認の台本が足りません: {scenario['input']}\n"
                f"聞かれた内容: {interrupted[0].value['question']}"
            )
        answer = answers.pop(0)
        # interrupt の質問文と台本の回答を、画面の承認カードに出す
        for s in reversed(steps):
            if s["kind"] == "human" and "ask" not in s:
                s["ask"] = interrupted[0].value["question"]
                break
        steps[-1]["detail"]["out"] = f"人間の回答: {answer}"
        payload = Command(resume=answer)

    return {
        "input": scenario["input"],
        "steps": steps,
        "done": message,
        "cancelled": message if cancelled else "",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry", action="store_true", help="LLMを呼ばずに設定だけ表示する")
    args = parser.parse_args()

    if args.dry:
        print(f"書き出し先: {OUTPUT}")
        for s in SCENARIOS:
            print(f"- {s['input']}（承認の台本: {s['answers'] or 'なし'}）")
        return

    import graph_agent

    runs = [run_scenario(s, i) for i, s in enumerate(SCENARIOS)]
    payload = {
        "generated_at": f"{dt.datetime.now():%Y-%m-%d %H:%M}",
        "model": graph_agent.MODEL,
        "runs": runs,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        "/* trace_export.py が自動生成。手で編集しない。 */\n"
        "window.TRACE_DATA = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )
    print(f"{OUTPUT} に {len(runs)} シナリオ・{sum(len(r['steps']) for r in runs)} ステップを書き出しました")


if __name__ == "__main__":
    main()
