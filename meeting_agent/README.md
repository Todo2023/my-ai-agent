# Meet URL 共有エージェント

Googleカレンダーと連携し、Google Meet の URL を Chatwork の仕事相手に送るCLIエージェントです。

```
あなた: 明日15時からA社と定例。Meetを作って、A社のルームに送っておいて
エージェント: （カレンダーに予定を作成 → Meet URL取得 → 送信文面を提示）
--- Chatwork送信の確認 ---
送信先 room_id: 12345678
本文:
[To:98765 山田様]
明日8/7(金) 15:00-16:00 の定例のURLです。
https://meet.google.com/xxx-yyyy-zzz
--------------------------
この内容で送信しますか？ [y/N]:
```

`travel_agent` と同様、無料枠のあるGemini APIとFunction Callingを使い、
外部ツール（Googleカレンダー / Chatwork）をエージェント自身に呼ばせる構成です。

## 設計の考え方

- **判断はLLM、送信は人間の承認を通す**。予定の特定・文面の作成・宛先の推定はLLMに任せますが、
  Chatworkへの送信は取り消しが効かないため、`send_chatwork_message` の内部で必ず
  CLI側の確認プロンプト（`confirm_send`）を通します。LLMが暴走しても、y を押さない限り送信されません。
- **推測させない**。送信先ルームが特定できないときや日時が曖昧なときは、
  勝手に決めずユーザーに聞き返すようシステムプロンプトで指示しています。
- 文面の下書きだけ試したいときは `CHATWORK_DRY_RUN=1` で送信をスキップできます。

## セットアップ

### 1. Gemini APIキー

[Google AI Studio](https://aistudio.google.com/apikey) で無料発行します。

### 2. Googleカレンダーの認可情報

1. [Google Cloud コンソール](https://console.cloud.google.com/) でプロジェクトを作成
2. 「APIとサービス」→「ライブラリ」から **Google Calendar API** を有効化
3. 「OAuth同意画面」を設定（外部／テストユーザーに自分のGoogleアカウントを追加）
4. 「認証情報」→「OAuthクライアントID」→ アプリの種類 **デスクトップアプリ** を作成
5. ダウンロードしたJSONを `meeting_agent/credentials.json` として配置

初回実行時にブラウザが開いて認可を求められ、成功すると `token.json` が作られます。
以降は自動で再認証されます（`credentials.json` / `token.json` はGit管理外です）。

> Meetリンクの自動発行は、通常のGoogleアカウント・Google Workspaceアカウントのどちらでも利用できます。
> 組織のポリシーでMeetが無効な場合はURLが発行されないことがあります。

### 3. Chatwork APIトークン

Chatwork にログインし、右上のアカウント名 →「サービス連携」→「API Token」から発行します。

### 4. 依存関係と環境変数

```bash
cd meeting_agent
pip install -r requirements.txt
cp .env.example .env
# .env を編集して GEMINI_API_KEY と CHATWORK_API_TOKEN を設定
```

## 実行

```bash
python cli.py
```

終了するには `exit` または `quit` と入力してください。

無料枠のレート制限（429）に頻繁に当たる場合は、環境変数 `GEMINI_MODEL` で別モデルに
切り替えると改善することがあります（`travel_agent` / `invoice_agent` と同様）。

## エージェントが使えるツール

| ツール | 説明 |
| --- | --- |
| `list_meetings(days)` | 今後N日間のカレンダー予定をMeet URL付きで一覧 |
| `create_meeting(title, start, duration_minutes, attendees, description)` | Meet付き予定を作成しURLを返す |
| `list_chatwork_rooms()` | チャットルーム一覧（room_id の特定用） |
| `list_chatwork_members(room_id)` | メンバー一覧（`[To:account_id]` メンション用） |
| `send_chatwork_message(room_id, message)` | メッセージ送信（送信前に人間の確認） |

## 構成

```
agent.py       # Gemini API とのやり取り・ツール定義・会話履歴管理（リトライ処理含む）
gcal.py        # Googleカレンダー連携（OAuth、予定一覧、Meet付き予定作成）
chatwork.py    # Chatwork API 連携（ルーム/メンバー取得、送信＋確認フック）
cli.py         # コマンドラインの対話ループ（エントリーポイント）
requirements.txt
.env.example
```

## 今後の拡張案

- 定例MTGの繰り返し予定への対応（RRULE）
- 予定開始のN分前に自動でリマインドを送る常駐モード
- 相手の氏名 → Chatworkルームの対応表をマスタデータとして持つ（`invoice_agent` の顧客マスタと同様）
- Slack / Teams など他チャットツールへの送信先追加
