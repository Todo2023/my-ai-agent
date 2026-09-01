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

検査の試験は `node test_worker.mjs` で走ります（ネットワークもAPIキーも使いません）。

## 無料枠と、止まる可能性

Gemini の無料枠には **1分あたり**と**1日あたり**の上限があります。超えると 429 が返ります。
**デモ当日は同時アクセスが重なるため、ここが一番止まりやすい場所です。**

そのため 429 は異常ではなく想定内として扱い、画面には
「いま混み合っています。少し待ってから、もう一度送ってください」と出します。黙って失敗させません。

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
{"TODO-S-4K7Q":{"audience":"student","max_uses":null},"TODO-P-9XR2":{"audience":"pro","max_uses":null}}
```

`max_uses` を `null` にすると無制限、`3` にすると3回までです。
**あとから `wrangler secret put ACCESS_CODES` をやり直すだけで変えられます。**

### 4. 公開する

```
wrangler deploy
```

表示された URL（`https://todo-demo-tool.〇〇.workers.dev`）を、
`docs/demo.html` の `API_URL` に貼ります。

### 5. 動作を確かめる

```
curl -X POST https://todo-demo-tool.〇〇.workers.dev \
  -H "Content-Type: application/json" \
  -d '{"code":"TODO-S-4K7Q","audience":"student","text":"AIって結局何に使えるんですか"}'
```

書き換えた問いと説明が返れば成功です。

## 未確定のまま残しているもの

仕様書の「今後詰める必要がある項目」です。どちらも**あとから変えられる形**にしてあります。

- アクセスコードの届け方（メール／Slack）— コードの検証だけ実装済み
- 利用回数の上限 — `max_uses` と `DEFAULT_MAX_USES` で設定するだけ
