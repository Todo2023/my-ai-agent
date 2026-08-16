# えほんの棚（仮）

絵本を えらんで、そのまま読める棚。子ども向けプラットフォームの Phase 0。

設計の意図は [`../docs/platform-kids.md`](../docs/platform-kids.md) にある。

| | |
| --- | --- |
| 棚 | https://todo2023.github.io/my-ai-agent/ehon/ |
| ビューア | `read.html?book=（フォルダ名）` |

**いまは投稿を受け付けていない。** 絵本はこのリポジトリの中にあるものだけ。
費用はゼロ（GitHub Pages のみ）。PWAなので、ホーム画面に入れて圏外でも読める。

## この作りにした理由

| | |
| --- | --- |
| 子どものアカウントを作らない | 個人情報を集めなければ、規制の面倒の大半が消える。読んだ位置も端末の中だけ |
| コメント欄がない | 見知らぬ大人と子どもが直接つながる形にしない |
| PWAでキャッシュする | 絵本は同じものを何度も読む。2回目から通信ゼロになり、配信の帯域を使わない |
| 読み上げは端末の音声 | 通信も費用も発生しない。対応していない端末ではボタンを隠す |
| ふりがなを切り替えられる | 4歳と9歳で要るものが違う |

## 絵本の作り方

作る場所は2つある。どちらでも同じ `book.json` になる。

| | |
| --- | --- |
| **[つくる画面](https://todo2023.github.io/my-ai-agent/ehon/make.html)**（`make.html`） | ページを足しながら作る。ふりがなの見た目と読み上げをその場で確かめられる |
| エディタで直接 | `book.json` を手で書く |

**つくる画面はまだどこにも送らない。** 端末の中（localStorage）だけに残り、
`book.json` を落として使う。絵はファイル名だけを持つので、
**絵そのものは自分で `books/（フォルダ名）/` に置く。**

`node tools/build-index.mjs` を走らせると棚に並ぶ。

```json
{
  "title": "つきのパンやさん",
  "author": "編集部",
  "age_min": 3,
  "age_max": 6,
  "reading_minutes": 4,
  "cover": "p01.svg",
  "summary": "よるだけあいている、ちいさなパンやさんのおはなし。",
  "pages": [
    { "image": "p01.svg", "alt": "月の下に立つ小さなパン屋さん", "text": "よるに なると あかりが つく、｜小《ちい》さな パンやさんが あります。" }
  ]
}
```

| 項目 | 要否 | 中身 |
| --- | --- | --- |
| `title` | **必須** | だいめい |
| `pages` | **必須** | ページの配列。1ページに絵1枚と文 |
| `pages[].image` | **必須** | 同じフォルダの中のファイル名 |
| `pages[].alt` | 入れる | 絵の説明。ないと `build-index.mjs` が注意を出す |
| `pages[].text` | 任意 | そのページの文。空でもよい |
| `age_min` / `age_max` | 任意 | 対象年齢。棚のしぼりこみに使う |
| `reading_minutes` | 任意 | よみきかせの目安。**親が選ぶときに最初に見るところ** |
| `cover` | 任意 | 表紙。省くと1ページ目 |

### ふりがな

本文に青空文庫と同じ書き方で入れる。

| 書き方 | 出るもの |
| --- | --- |
| `｜小《ちい》さな` | 「小」に「ちい」 |
| `月《つき》あかり` | 直前の漢字のまとまりに振る（`｜` を省いた形） |

表示のオン・オフは読む人が切り替える。**記法は本文に書き込むが、出し分けは表示側でやる。**

### 絵について

- 縦横の比は **16:10** にそろえる（そろっていないと、めくるたびに大きさが変わる）
- **1枚150KB以内**を目安に。長辺1600pxで足りる。WebPかSVGにする
- いま入っているサンプルはSVGで描いてある（軽く、拡大しても荒れない）

`build-index.mjs` が絵の合計サイズと枚数を出す。**増えてきたらそこを見る。**

## ファイル

| | |
| --- | --- |
| `index.html` / `app.js` | 棚。対象年齢でしぼりこむ |
| `read.html` / `reader.js` | ビューア。めくる・ふりがな・読み上げ |
| `make.html` / `make.js` | つくる画面。作りかけは端末の中だけ |
| `config.js` | **接続先の設定。いまは空**。ここを埋めるとつながる |
| `supa.js` | Supabase とのやりとり。ライブラリは使わず REST を直接叩く |
| `ruby.js` | ふりがなの記法を読む |
| `style.css` | 3つの画面で共通 |
| `books/*/` | 絵本1冊ぶん（`book.json` と絵） |
| `books.json` | 棚用のまとめ。**手で書かない。生成物** |
| `tools/build-index.mjs` | `books.json` を作る。絵の重さも出す |
| `sw.js` / `manifest.webmanifest` | PWA。読んだ絵本を端末に残す |
| `_icon.html` / `_build_icons.js` | アイコンの元絵と書き出し。絵を変えたときだけ走らせる |

## つなぐ手順（Phase 1）

**まだつないでいない。** `config.js` が空なので、つくる画面は端末の中だけで動く。
つなぐと「審査に出す」が使えるようになる。**絵そのものは送られない（ファイル名だけ）。****費用はゼロのまま**（Supabase 無料プラン・カード登録不要）。

### 1. Supabase

1. プロジェクトを作る（無料プラン）
2. SQL Editor に [`../supabase/community.sql`](../supabase/community.sql) を貼って実行
3. 続けて、自分を管理者と招待に入れる

```sql
insert into admins  (email, note) values ('あなた@example.com', '代表');
insert into invites (email, site) values ('あなた@example.com', 'both');
```

4. Project Settings > Data API から **Project URL** と **anon public** キーを控える

### 2. `config.js` を埋める

```js
window.TODO_EHON_CONFIG = {
  SUPABASE_URL: "https://xxxxxxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi..."
};
```

anon キーはブラウザから見える。それで正しい。読み書きは RLS で止めてある。
**service_role キーは絶対に書かない。**

### 3. ログインのリンクが戻る先を登録する

Authentication > URL Configuration の **Redirect URLs** につくる画面のURLを足す。

```
https://todo2023.github.io/my-ai-agent/ehon/make.html
```

### 4. つないだあとに確認すること

- [ ] anon キーで `select * from works` → **0行**（下書きが漏れていない）
- [ ] `select * from public_works` → 公開したものだけ出る
- [ ] `invites` にないアドレスでログインして「審査に出す」→ **弾かれる**
- [ ] 出した絵本が `status = 'review'` で入っている
- [ ] **管理者以外が `status` を `published` に変えようとすると弾かれる**（いちばん大事）
- [ ] 絵本に `comments` を insert しようとすると弾かれる
- [ ] 通信を切って「審査に出す」→ 失敗が出て、作りかけは残る


## 読むときの操作

| | |
| --- | --- |
| めくる | 「つぎ」「まえ」／左右スワイプ／キーボードの ← → とスペース |
| ふりがな | 右上のボタン。選んだ状態は端末に残る |
| 読み上げ | 右上のボタン。端末の音声合成を使う |
| 途中から | 前に読んだページから開く（端末の中だけに記録） |

## 動作確認（手元）

```bash
python3 -m http.server 8000
# 棚       → http://localhost:8000/ehon/
# ビューア → http://localhost:8000/ehon/read.html?book=tsuki-no-pan
```

更新が反映されないときは、`sw.js` の `CACHE` の版数を上げる。

## いまできないこと

Phase 0 なので、次はまだない。順番は [`../docs/README.md`](../docs/README.md#3-段階全部ゼロ円) にある。

- 審査の画面（Phase 1 の残り）。DBは人が通すまで公開しない作りになっているが、
  **通すための画面がまだない**
- 保護者アカウント・応援の記録（Phase 1）
- 検索エンジンへの掲載（Phase 2。いまは `noindex`）
- 有料販売・応援（Phase 3。**購入は保護者アカウントのみ**）

## 公開前にやること

- [ ] `index.html` と `read.html` の `<meta name="robots" content="noindex">` を外す
      （`make.html` の `noindex` は**外さない**）
- [ ] `index.html` の `<div class="demo-bar">`（試作中の帯）を消す
- [ ] サンプルの絵本を、本物と入れ替えるか消す
- [ ] 「おうちの方へ」の説明を、実際の運用に合わせて直す

**投稿を受け付ける前に、審査を誰がいつやるかを決める。**
決まっていないと開けない。理由は [`../docs/platform-kids.md`](../docs/platform-kids.md) にある。
