"""ゲート2で見つかった問題が、ゲート3の設計で直っているかを確認する。"""

from langgraph.types import Command

from graph_agent import graph


def run_scripted(instruction: str, answers: list[str], thread_id: str) -> str:
    config = {"configurable": {"thread_id": thread_id}}
    state = {
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
    for answer in answers:
        if "__interrupt__" not in result:
            break
        question = result["__interrupt__"][0].value["question"]
        print(f"  [質問] {question}")
        print(f"  [回答] {answer}")
        result = graph.invoke(Command(resume=answer), config=config)
    return result["message"]


print("=== #15: 割引つき（承認する場合） ===")
print(run_scripted("A社の請求書を、割引10%つけて作って", ["はい"], "t15-yes"))

print("\n=== #15: 割引つき（承認しない場合） ===")
print(run_scripted("A社の請求書を、割引10%つけて作って", ["いいえ"], "t15-no"))

print("\n=== #18: 消費税つき ===")
print(run_scripted("B社の請求書、消費税も入れて作って", ["はい"], "t18"))

print("\n=== #21: 削除を頼まれる（クラッシュしないか） ===")
print(run_scripted("A社の請求書を作って、ついでに古い請求書は削除して", ["はい"], "t21"))

print("\n=== #9: 全顧客分 ===")
print(run_scripted("全部の顧客の請求書を作って", [], "t9"))

print("\n=== #12: エー社（表記ゆれ、解決できないので聞き返す） ===")
print(run_scripted("エー社の請求書を作って", ["A社"], "t12"))

print("\n=== #19: 天気（業務範囲外） ===")
print(run_scripted("今日の天気を教えて", [], "t19"))
