"""ゲート3: LangGraphでワークフローを分解したエージェント。

設計の要点（ゲート2で見つかった問題への対応）:

- LLMの仕事は「自然文から情報を抜き出すこと」だけに限定する（parse_node）。
  実行するツールをLLM自身に選ばせない。これにより #21（存在しないツール呼び出しでの
  クラッシュ）と #18/#24（対応してない機能を「対応した」と嘘の報告をする）を
  構造的に防ぐ。最終的にユーザーに見せる文章は必ずコード側で組み立てる。

- 顧客名の解決（表記ゆれの吸収）はコード側の決定的な処理で行う（resolve_customer_node）。
  #10（"a社"→"A社"）や #11（"A社様"）はここで吸収する。

- ツールが対応していない要求（割引・消費税など）が見つかった場合、
  実行前に必ず人に確認を取る（ask_confirm_node）。#15（無確認で実行してしまった問題）
  への対応。これは「不可逆な操作（PDF確定）の前の承認ゲート」にあたる。

- 顧客名が分からない・曖昧な場合も、推測で実行せず人に聞く（ask_customer_node）。

- 「全顧客分をまとめて作る」に対応するツールを追加した（#9への対応）。
"""

import difflib
import json
import os
import sqlite3
import time
from typing import TypedDict

from dotenv import load_dotenv
from google import genai
from google.genai import types
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt

from invoice import create_invoice_pdf, list_customer_names

load_dotenv()

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
EXCEL_PATH = "sample_data.xlsx"
MODEL = "gemma-4-26b-a4b-it"

# ゲート4の検証用: LLM呼び出し1回ごとの実測値を記録する
traces: list[dict] = []

PARSE_SCHEMA = {
    "type": "object",
    "properties": {
        "customer_name": {"type": "string", "nullable": True},
        "all_customers": {"type": "boolean"},
        "unsupported_requests": {"type": "array", "items": {"type": "string"}},
        "out_of_scope": {"type": "boolean"},
    },
    "required": ["customer_name", "all_customers", "unsupported_requests", "out_of_scope"],
}


class State(TypedDict):
    instruction: str
    customer_name: str | None
    all_customers: bool
    unsupported_requests: list[str]
    out_of_scope: bool
    resolved_customer: str | None
    approved: bool
    message: str


def parse_node(state: State) -> dict:
    """LLMが担当: 自然文から情報を抜き出すだけ。ツールは呼ばせない。"""
    prompt = f"""以下はユーザーからの請求書作成に関する指示です。JSON形式で情報を抜き出してください。

指示: {state["instruction"]}

抜き出す情報:
- customer_name: 請求書の宛先となる顧客名1件。読み取れなければ null
- all_customers: 「全顧客分」「全部」のように、特定の1件ではなく全顧客分をまとめて求めていれば true
- unsupported_requests: 「顧客名を指定して標準フォーマットの請求書を1件（または全件）作る」以外の
  追加要求（割引・消費税・支払期限・品目の追加変更・出力形式の変更・送信・削除など）があれば、
  日本語で短く列挙する（無ければ空リスト）
- out_of_scope: 請求書作成と無関係な指示（雑談・天気など）なら true
"""
    start = time.perf_counter()
    response = client.models.generate_content(
        model=MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=PARSE_SCHEMA,
        ),
    )
    latency = time.perf_counter() - start
    usage = response.usage_metadata
    traces.append(
        {
            "model": MODEL,
            "instruction": state["instruction"],
            "latency_sec": round(latency, 3),
            "input_tokens": usage.prompt_token_count,
            "output_tokens": usage.candidates_token_count,
            "total_tokens": usage.total_token_count,
        }
    )

    parsed = json.loads(response.text)
    return {
        "customer_name": parsed.get("customer_name"),
        "all_customers": parsed.get("all_customers", False),
        "unsupported_requests": parsed.get("unsupported_requests", []),
        "out_of_scope": parsed.get("out_of_scope", False),
    }


def _normalize(name: str) -> str:
    return name.strip().rstrip("様").strip().lower()


def resolve_customer_node(state: State) -> dict:
    """コードが担当: 表記ゆれを吸収して、実在する顧客名に解決する。"""
    raw = state.get("customer_name")
    if not raw:
        return {"resolved_customer": None}

    candidates = list_customer_names(EXCEL_PATH)
    normalized = _normalize(raw)

    for c in candidates:
        if _normalize(c) == normalized:
            return {"resolved_customer": c}

    close = difflib.get_close_matches(normalized, [_normalize(c) for c in candidates], n=1, cutoff=0.6)
    if close:
        for c in candidates:
            if _normalize(c) == close[0]:
                return {"resolved_customer": c}

    return {"resolved_customer": None}


def ask_customer_node(state: State) -> dict:
    candidates = list_customer_names(EXCEL_PATH)
    answer = interrupt(
        {"question": f"どの顧客の請求書を作成しますか？（登録済み: {', '.join(candidates)}）"}
    )
    return {"customer_name": answer}


def ask_confirm_node(state: State) -> dict:
    items = "、".join(state["unsupported_requests"])
    target = "全顧客" if state["all_customers"] else state["resolved_customer"]
    answer = interrupt(
        {
            "question": (
                f"次の要求には対応していません: {items}\n"
                f"{target}の標準フォーマットの請求書（これらを反映しないもの）を作成してよいですか？"
                "（はい/いいえ）"
            )
        }
    )
    return {"approved": str(answer).strip() in ("はい", "yes", "y", "ok", "OK")}


def generate_node(state: State) -> dict:
    note = ""
    if state["unsupported_requests"]:
        items = "、".join(state["unsupported_requests"])
        note = f"\n\nなお、次の要求には対応していないため反映されていません: {items}"

    if state["all_customers"]:
        created = []
        for customer in list_customer_names(EXCEL_PATH):
            output_path = f"invoice_{customer}.pdf"
            create_invoice_pdf(customer, EXCEL_PATH, output_path)
            created.append(output_path)
        return {"message": f"全顧客分の請求書を作成しました（{', '.join(created)}）。{note}"}

    customer = state["resolved_customer"]
    output_path = f"invoice_{customer}.pdf"
    create_invoice_pdf(customer, EXCEL_PATH, output_path)
    return {"message": f"{customer}の請求書を作成しました（{output_path}）。{note}"}


def out_of_scope_node(state: State) -> dict:
    return {
        "message": "このエージェントは請求書作成専用です。「A社の請求書を作って」のように指示してください。"
    }


def cancelled_node(state: State) -> dict:
    return {"message": "作成をキャンセルしました。"}


def route_after_resolve(state: State) -> str:
    if state["out_of_scope"]:
        return "out_of_scope"
    if state["all_customers"]:
        return "ask_confirm" if state["unsupported_requests"] else "generate"
    if not state["resolved_customer"]:
        return "ask_customer"
    if state["unsupported_requests"]:
        return "ask_confirm"
    return "generate"


def route_after_confirm(state: State) -> str:
    return "generate" if state.get("approved") else "cancelled"


builder = StateGraph(State)
builder.add_node("parse", parse_node)
builder.add_node("resolve_customer", resolve_customer_node)
builder.add_node("ask_customer", ask_customer_node)
builder.add_node("ask_confirm", ask_confirm_node)
builder.add_node("generate", generate_node)
builder.add_node("out_of_scope", out_of_scope_node)
builder.add_node("cancelled", cancelled_node)

builder.add_edge(START, "parse")
builder.add_edge("parse", "resolve_customer")
builder.add_conditional_edges(
    "resolve_customer",
    route_after_resolve,
    {
        "out_of_scope": "out_of_scope",
        "ask_customer": "ask_customer",
        "ask_confirm": "ask_confirm",
        "generate": "generate",
    },
)
builder.add_edge("ask_customer", "resolve_customer")
builder.add_conditional_edges(
    "ask_confirm", route_after_confirm, {"generate": "generate", "cancelled": "cancelled"}
)
builder.add_edge("generate", END)
builder.add_edge("out_of_scope", END)
builder.add_edge("cancelled", END)

_conn = sqlite3.connect("checkpoints.sqlite", check_same_thread=False)
graph = builder.compile(checkpointer=SqliteSaver(_conn))


def run_interactive(instruction: str, thread_id: str = "cli") -> None:
    """人間が実際にターミナルで使う用（確認が必要なら input() で聞く）。"""
    config = {"configurable": {"thread_id": thread_id}}
    state: State = {
        "instruction": instruction,
        "customer_name": None,
        "all_customers": False,
        "unsupported_requests": [],
        "out_of_scope": False,
        "resolved_customer": None,
        "approved": False,
        "message": "",
    }
    result = graph.invoke(state, config=config)
    while "__interrupt__" in result:
        question = result["__interrupt__"][0].value["question"]
        print(question)
        answer = input("> ")
        result = graph.invoke(Command(resume=answer), config=config)
    print(result["message"])


if __name__ == "__main__":
    import sys

    instruction = " ".join(sys.argv[1:]) or "A社の請求書を作って"
    print(f"指示: {instruction}")
    run_interactive(instruction)
