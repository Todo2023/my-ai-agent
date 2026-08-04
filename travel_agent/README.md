# 旅行プラン提案エージェント

Claude (Anthropic API) を使った、対話形式で旅行プランを提案するCLIエージェントです。
予算・日数・目的地の好みなどをヒアリングしながら、具体的な旅程を提案します。

現時点では外部API（フライト・ホテル検索など）とは連携しておらず、LLMの知識をもとに
一般的な提案を行います。将来的に外部API連携を追加できるよう、エージェントのロジックと
CLI表示を分離した構成にしています。

## セットアップ

```bash
cd travel_agent
pip install -r requirements.txt
cp .env.example .env
# .env を編集して ANTHROPIC_API_KEY を設定
```

## 実行

```bash
python cli.py
```

対話形式で行き先・日数・予算などを聞かれるので、思いついたことから答えてください。
十分な情報が集まると、日程表形式の旅行プランが提案されます。

終了するには `exit` または `quit` と入力してください。

## 構成

```
agent.py       # Claude API とのやり取り・会話履歴管理
cli.py         # コマンドラインの対話ループ（エントリーポイント）
requirements.txt
.env.example
```

## 今後の拡張案

- フライト・ホテル検索APIとの連携（実際の空席・料金の取得）
- 観光地情報のリアルタイム検索（RAGやWeb検索ツールの統合）
- 予算配分やパッキングリストの自動生成
- Web UI / Slack Bot 化
