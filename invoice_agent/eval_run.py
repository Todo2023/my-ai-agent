"""ゲート4: 評価データセットを実行し、成功率・レイテンシ・トークン数を測る。

使い方: uv run eval_run.py <モデル名>
"""

import json
import sys
import time

from langgraph.types import Command

import graph_agent
from graph_agent import graph


def classify_message(message: str) -> str:
    if message.startswith("このエージェントは請求書作成専用です"):
        return "out_of_scope"
    if message.startswith("作成をキャンセルしました"):
        return "cancelled"
    if message.startswith("全顧客分の請求書を作成しました"):
        return "generate_all"
    if "の請求書を作成しました（" in message:
        return "generate"
    return "unknown"


def run_case(case: dict) -> dict:
    thread_id = f"eval-{case['id']}"
    config = {"configurable": {"thread_id": thread_id}}
    state = {
        "instruction": case["instruction"],
        "customer_name": None,
        "all_customers": False,
        "unsupported_requests": [],
        "out_of_scope": False,
        "resolved_customer": None,
        "approved": False,
        "message": "",
    }

    start = time.perf_counter()
    try:
        result = graph.invoke(state, config=config)

        if "__interrupt__" in result:
            question = result["__interrupt__"][0].value["question"]
            if question.startswith("どの顧客"):
                actual_outcome = "ask_customer"
            else:
                actual_outcome = "ask_confirm"
                # ask_confirm は承認して最後まで進め、顧客名まで検証できるようにする
                result = graph.invoke(Command(resume="はい"), config=config)
        else:
            actual_outcome = classify_message(result["message"])
    except Exception as e:  # noqa: BLE001 モデルの不安定さ自体を測定対象にする
        result = {"message": ""}
        actual_outcome = f"error: {type(e).__name__}"

    total_latency = time.perf_counter() - start

    customer_ok = True
    if case.get("expected_customer") and "message" in result:
        customer_ok = case["expected_customer"] in result["message"]

    passed = (actual_outcome == case["expected_outcome"]) and customer_ok

    return {
        "id": case["id"],
        "instruction": case["instruction"],
        "expected_outcome": case["expected_outcome"],
        "actual_outcome": actual_outcome,
        "passed": passed,
        "total_latency_sec": round(total_latency, 3),
        "final_message": result.get("message", ""),
    }


def main() -> None:
    model = sys.argv[1] if len(sys.argv) > 1 else graph_agent.MODEL
    graph_agent.MODEL = model
    graph_agent.traces.clear()

    dataset = json.load(open("eval_dataset.json", encoding="utf-8"))

    results = []
    for case in dataset:
        r = run_case(case)
        mark = "OK" if r["passed"] else "NG"
        print(f"[{mark}] #{r['id']} {r['instruction']!r} -> {r['actual_outcome']} (期待: {r['expected_outcome']})")
        results.append(r)

    n_pass = sum(1 for r in results if r["passed"])
    llm_traces = list(graph_agent.traces)
    total_tokens = sum(t["total_tokens"] for t in llm_traces)
    avg_llm_latency = sum(t["latency_sec"] for t in llm_traces) / len(llm_traces)
    avg_total_latency = sum(r["total_latency_sec"] for r in results) / len(results)

    summary = {
        "model": model,
        "n_cases": len(dataset),
        "n_pass": n_pass,
        "success_rate": round(n_pass / len(dataset), 3),
        "avg_llm_call_latency_sec": round(avg_llm_latency, 3),
        "avg_total_latency_sec": round(avg_total_latency, 3),
        "total_tokens_all_cases": total_tokens,
        "avg_tokens_per_case": round(total_tokens / len(llm_traces), 1),
    }

    print("\n=== 集計 ===")
    print(json.dumps(summary, ensure_ascii=False, indent=2))

    safe_model_name = model.replace("/", "_")
    with open(f"eval_results_{safe_model_name}.json", "w", encoding="utf-8") as f:
        json.dump({"summary": summary, "results": results, "traces": llm_traces}, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
