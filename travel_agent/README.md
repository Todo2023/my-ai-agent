# 旅行プラン提案エージェント

Google Gemini API（無料枠あり）を使った、対話形式で旅行プランを提案するCLIエージェントです。
予算・日数・目的地の好みなどをヒアリングしながら、具体的な旅程を提案します。

`invoice_agent` と同様、無料枠のあるGemini APIを使う構成にしています。無料枠はレート制限
（429エラー）に当たりやすいため、一定時間待って自動リトライする処理を入れています。

現時点では外部API（フライト・ホテル検索など）とは連携しておらず、LLMの知識をもとに
一般的な提案を行います。将来的に外部API連携を追加できるよう、エージェントのロジック
(`agent.py`)とCLI表示(`cli.py`)を分離した構成にしています。

## セットアップ

1. [Google AI Studio](https://aistudio.google.com/apikey) でGemini APIキーを無料で発行する
2. 依存関係をインストール
   ```bash
   cd travel_agent
   pip install -r requirements.txt
   ```
3. APIキーを設定
   ```bash
   cp .env.example .env
   # .env を編集して GEMINI_API_KEY を設定
   ```

## 実行

```bash
python cli.py
```

対話形式で行き先・日数・予算などを聞かれるので、思いついたことから答えてください。
十分な情報が集まると、日程表形式の旅行プランが提案されます。

終了するには `exit` または `quit` と入力してください。

無料枠のレート制限（429）に頻繁に当たる場合は、環境変数 `GEMINI_MODEL` で
`gemma-4-26b-a4b-it` など別モデルに切り替えると改善することがあります
（`invoice_agent` でも同様の理由でモデルを切り替えています）。

## 構成

```
agent.py       # Gemini API とのやり取り・会話履歴管理（リトライ処理含む）
cli.py         # コマンドラインの対話ループ（エントリーポイント）
requirements.txt
.env.example
```

## 今後の拡張案

- フライト・ホテル検索APIとの連携（実際の空席・料金の取得）
- 観光地情報のリアルタイム検索（RAGやWeb検索ツールの統合）
- 予算配分やパッキングリストの自動生成
- Web UI / Slack Bot 化
