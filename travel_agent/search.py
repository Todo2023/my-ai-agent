"""エージェントがゲート1の条件（外部の何かを最低1つ叩く）を満たすためのツール。

APIキー不要のDuckDuckGo検索（ddgs）を使い、営業時間・料金・予約可否など
最新情報が必要な質問にLLMが自分で検索して答えられるようにする。
"""

from ddgs import DDGS

MAX_RESULTS = 5


def web_search(query: str) -> str:
    """ウェブを検索し、上位結果のタイトル・概要・URLを返す。

    営業時間、料金、予約可否、アクセス方法など、学習データだけでは
    分からない最新情報を確認したいときに使う。

    Args:
        query: 検索したいキーワード（例: "古平 港寿し 営業時間"）
    """
    with DDGS() as ddgs:
        results = list(ddgs.text(query, max_results=MAX_RESULTS))

    if not results:
        return "検索結果が見つかりませんでした。"

    lines = [f"- {r['title']}: {r['body']} ({r['href']})" for r in results]
    return "\n".join(lines)
