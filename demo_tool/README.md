# デモ体験ツール

入力された曖昧な問いを、意思決定に直結する鋭い問いに書き換えて返します。
9月21日のデモで、各自が好きな時間にアクセスして体験するためのものです。

- 画面: `docs/demo.html`（GitHub Pages から配信）
- サーバ: `worker.js`（Cloudflare Workers）

## なぜこの構成か

GitHub Pages は静的ファイルしか置けないため、**APIキーを隠す場所がありません**。
ブラウザに書けば誰でも読めてしまいます。そこで、鍵を持つ処理だけを Cloudflare Workers に置きます。

| | 選んだもの | 理由 |
| --- | --- | --- |
| AI | **Gemini API の無料枠** | Claude API は従量課金で無料枠が無い。お支払い情報を登録していないため課金は発生しない |
| サーバ | **Cloudflare Workers** | 無料枠は1日10万リクエスト。Netlify は 2026-08-18 にビルド枠切れで公開が止まった前例がある |
| 保存 | **Cloudflare KV** | Supabase の無料プロジェクトは7日間無操作で一時停止する。デモ当日に止まる事故を避けた |

## 設計の切り分け

CLAUDE.md の設計ルールに従っています。

- **LLM がやるのは、問いの書き換えとその説明だけ。**
- **合否の判定はコードが行う**（`worker.js` の `check`）。金額・「必ず」「保証」などの約束・
  個人名が混ざった出力は、画面に出す前に落とします。一度表示された文言は取り消せないためです。
- 検査に落ちたら1回だけ作り直させ、それでも駄目なら「うまく書き換えられませんでした」と正直に返します。

試験は `node test_worker.mjs` で走ります（**19件**／ネットワークもGeminiも使いません）。
Geminiへの通信を差し替えて、返ってきた内容ごとに何が起きるかを確かめています。
「2回とも検査に落ちた場合、落とした内容が画面に漏れないこと」もここで見ています。

## 無料枠と、止まる可能性

Gemini の無料枠には **1分あたり**と**1日あたり**の上限があります。超えると 429 が返ります。
**デモ当日は同時アクセスが重なるため、ここが一番止まりやすい場所です。**

そのため 429 は異常ではなく想定内として扱い、画面には
「いま混み合っています。**20秒ほど**待ってから、もう一度送ってください」と出します。黙って失敗させません。

アクセスコードで人数を絞れるので、配る枚数で負荷を調整できます。

## デプロイ手順

Cloudflare のアカウントが要ります（無料）。

### 1. wrangler を入れる

```
npm install -g wrangler
wrangler login
```

### 2. 利用回数とログの置き場所を作る

```
wrangler kv namespace create DEMO_KV
```

表示された `id` を `wrangler.toml` の該当箇所に貼ります。

### 3. 鍵とアクセスコードを登録する

**この2つは `wrangler.toml` に書かないでください。** GitHub に入ってしまいます。

```
wrangler secret put GEMINI_API_KEY
```

続けて、アクセスコードを登録します。JSON を1行で貼ります。

```
wrangler secret put ACCESS_CODES
```

貼る内容の例（コードは推測されにくい文字列にする）:

```json
{"TODO-G1-HHVA3":{"audience":"student","max_uses":null},"TODO-G2-NDN4R":{"audience":"student","max_uses":null},"TODO-G3-7VVGU":{"audience":"student","max_uses":null},"TODO-G4-9LMVJ":{"audience":"student","max_uses":null},"TODO-PR-4DHTL":{"audience":"pro","max_uses":null}}
```

**学年ごとに1本ずつ、計5本**です。どの学年から使われたかが利用ログで分かります。
`max_uses` は `null`（無制限）。デモの目的は体験してもらうことなので、途中で止めません。

コードは見間違えやすい文字（`0` `O` `1` `I` `S` `5` `B` `8`）を避けて作ってあります。
口頭やスクリーンショットで伝えても取り違えにくくするためです。

`max_uses` を `null` にすると無制限、`3` にすると3回までです。
**あとから `wrangler secret put ACCESS_CODES` をやり直すだけで変えられます。**

### 4. 公開する

```
wrangler deploy
```

表示された URL（`https://todo-demo-tool.〇〇.workers.dev`）を、
`docs/demo.html` の `API_URL` に貼ります。

### 5. 動作を確かめる

PowerShell では次のように打ちます（`〇〇` は自分のURLに置き換える）。

```
curl.exe -X POST https://todo-demo-tool.〇〇.workers.dev -H "Content-Type: application/json" -d '{\"code\":\"TODO-G1-HHVA3\",\"audience\":\"student\",\"text\":\"AIって結局何に使えるんですか\"}'
```

書き換えた問いと説明が返れば成功です。

## 資料ページからの質問を Slack で受け取る

受講者が `lesson-NN.html` のスライドの下から質問を送ると、**その質問と「どのスライドを見ていたか」がSlackに届きます。**

### 1. Slack で受け口を作る

1. https://api.slack.com/apps を開き、**Create New App → From scratch**
2. 名前は「講座の質問」など。ワークスペースは自分のものを選ぶ
3. 左の **Incoming Webhooks** を開き、スイッチを **On**
4. **Add New Webhook to Workspace** → 質問を流したいチャンネルを選ぶ
5. 出てきた `https://hooks.slack.com/services/...` をコピーする

無料プランで使えます。

### 2. Worker に登録する

```
wrangler secret put SLACK_WEBHOOK_URL
```

貼り付けて Enter。続けて、溜まった質問を後から読むための合鍵も入れておきます（好きな文字列で構いません）。

```
wrangler secret put ASK_ADMIN_KEY
```

```
wrangler deploy
```

### 3. 動作を確かめる

```
curl.exe -X POST https://todo-demo-tool.〇〇.workers.dev/ask -H "Content-Type: application/json" -d '{\"lesson\":\"第1回\",\"slide\":\"3\",\"name\":\"テスト\",\"text\":\"届いていますか\"}'
```

Slackに出れば成功です。

### ワークと質問で、届け先を分ける

ワークの提出と質問が同じチャンネルに混ざると、どちらも読み飛ばされます。
**ワーク用のチャンネルをもう1つ作って**、そのWebhookを登録してください。

1. Slackで、ワーク提出用のチャンネル（例：`#work`）を作る
2. さきほどのアプリの **Incoming Webhooks** → **Add New Webhook to Workspace** → そのチャンネルを選ぶ
3. 出てきたURLを登録する

```
wrangler secret put SLACK_WORK_WEBHOOK_URL --name todo-demo-tool
```

| 何が | どこに届くか |
| --- | --- |
| スライドからの質問 | `SLACK_WEBHOOK_URL` のチャンネル |
| ワークの提出 | `SLACK_WORK_WEBHOOK_URL` のチャンネル |

**`SLACK_WORK_WEBHOOK_URL` を登録しなければ、ワークも質問側に届きます。**
分けるまでの間も、黙って消えることはありません。

### みんなの質問

資料ページの右側に、**同じ回に寄せられた質問**が出ます。**名前は出しません。**
自分に開いていない回の質問は返しません（本文と同じ扱いです）。

見せたくない質問が出たときは、取り下げられます。`id` は資料ページの
右側に出ている質問のもので、`GET /ask?key=…` でも確認できます。

```
Invoke-RestMethod -Uri "https://todo-demo-tool.〇〇.workers.dev/question/hide?key=（合鍵）" -Method Post -ContentType "application/json" -Body '{\"id\":\"q:lesson-01:1234567890\"}'
```

**受講者どうしに見えるものなので、投稿された質問はそのまま出ます。**
不適切なものが出たときに気づけるよう、質問はSlackにも同時に届きます。

### Slack が使えないときも、質問は消えません

質問は**Slackに送る前にKVへ保存**しています。Slackが未設定でも、落ちていても、質問そのものは残ります。読むときは合鍵をつけてブラウザで開いてください。

```
https://todo-demo-tool.〇〇.workers.dev/ask?key=（ASK_ADMIN_KEYに入れた文字列）
```

直近100件が新しい順に出ます。保存期間は180日です。

### 迷惑投稿への備え

- 人には見えない空欄を1つ置いてあり、そこが埋まっていれば機械とみなして捨てます
- 同じ回線からは1時間に10件まで
- 600文字まで

資料ページ自体にパスワードがかかっていますが、**この入り口自体は誰でも叩けます**（静的サイトのため隠せません）。上の3つは、荒らしを減らすためのもので、完全に防ぐものではありません。

## 教材の配信と、提出で次が開く仕組み

教材の本文とスライドは、**非公開リポジトリ `Todo2023/todo-curriculum`** にあります。
公開サイトには置きません（置くと、パスワードをかけてもURLを知る人には読めるため）。

`todo-curriculum` で `uv run upload.py` を実行すると、本文とスライドがKVに載ります。
受講者が資料ページを開くと、この Worker が**その人に開いている回だけ**を返します。

### 開く条件

次の**小さいほう**まで開きます。

1. 提出した回 ＋ 1
2. `paidThrough`（支払いで解放された回まで）

デモと「はじめに」は提出を求めません。開き方の詳しい説明と、受講者の登録方法は
`todo-curriculum/README.md` にあります。

### 入り口

| 道 | 何を返すか |
| --- | --- |
| `POST /me` | 一覧と、どの回が開いているか。**本文は返さない** |
| `POST /lesson` | その回の本文。開いていなければ 403 |
| `GET /slide` | スライド画像1枚。開いていなければ 403 |
| `POST /submit` | ワークの提出。次の回が開く |
| `POST /member?key=…` | 受講者の登録・支払い範囲の更新（合鍵が要る） |

**画像も本文と同じ鍵で守っています。**画像だけ抜かれては意味がないためです。

## 商談用のコードを1つ作っておく

法人の打ち合わせで、その場で体験ツールを触ってもらうためのコードです。
**受講者ごとのコードとは別に、使い回せるものを1つ用意しておきます。**

```
Invoke-RestMethod -Uri "https://todo-demo-tool.todo-inc-2023-10-13.workers.dev/member?key=$KEY" -Method Post -ContentType "application/json" -Body '{"code":"TODO-DEMO","name":"shodan","paidThrough":1,"audience":"pro"}'
```

`$KEY` は `ASK_ADMIN_KEY` に登録した合鍵です。PowerShell を開き直したときは、
先に `$KEY = "（合鍵）"` を実行してください。

**`paidThrough` を 1 にしているのは意図です。** デモと「はじめに」までしか開かないので、
商談相手に本編の教材が渡ることはありません。体験ツールは問題なく使えます。

打ち合わせでお渡しするリンク：

```
https://todo2023.github.io/my-ai-agent/demo.html?audience=pro&code=TODO-DEMO
```

## 未確定のまま残しているもの

仕様書の「今後詰める必要がある項目」です。どちらも**あとから変えられる形**にしてあります。

- アクセスコードの届け方（メール／Slack）— コードの検証だけ実装済み
- 利用回数の上限 — `max_uses` と `DEFAULT_MAX_USES` で設定するだけ

## 学年ごとに例を変える

申し込みのときに学年を聞くので、**配るリンクに学年を入れておきます。** 開いた人は選ばずに始められます。

**そのまま配るリンク**（問い合わせの返信に、相手の学年のものを1行貼るだけ）:

| 相手 | 貼るリンク |
| --- | --- |
| 大学1年 | `https://todo2023.github.io/my-ai-agent/demo.html?audience=g1&code=TODO-G1-HHVA3` |
| 大学2年 | `https://todo2023.github.io/my-ai-agent/demo.html?audience=g2&code=TODO-G2-NDN4R` |
| 大学3年 | `https://todo2023.github.io/my-ai-agent/demo.html?audience=g3&code=TODO-G3-7VVGU` |
| 大学4年・院 | `https://todo2023.github.io/my-ai-agent/demo.html?audience=g4&code=TODO-G4-9LMVJ` |
| 社会人・個人事業主 | `https://todo2023.github.io/my-ai-agent/demo.html?audience=pro&code=TODO-PR-4DHTL` |

出てくる例文は学年で変わります（1年＝履修・サークル・バイト、3年＝就活・ES、社会人＝提案書・業務改善など）。

**学年を付けずに配ると、開いた本人に選んでもらう欄が出ます**（初期値は大学1年）。
学年が分からない相手に送るときは、こちらで構いません。

書き換えの考え方はサーバ側の1つのプロンプトで共通です。学年で変わるのは、
**どの場面の言葉で書き換えるか**だけです。1年生に就活の例を出しても遠く、
4年生に履修の例を出しても遅いためです。
