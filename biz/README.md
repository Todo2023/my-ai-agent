# ハタラク文庫（仮）

マーケティング・事業づくりの記事を、Markdownで書いて置く場所。
Zennのマーケ版として作るものの、いちばん最初の形（Phase 0）。

設計の意図は [`../sekkei/platform-marketing.md`](../sekkei/platform-marketing.md) にある。

| | |
| --- | --- |
| 一覧 | https://todo2023.github.io/my-ai-agent/biz/ |
| 記事 | `a/（ファイル名）/` |

**いまは投稿を受け付けていない。** 記事はこのリポジトリの中にあるものだけ。
費用はゼロ（GitHub Pages のみ）。

## 記事の書き方

書く場所は2つある。どちらでも同じ `.md` になる。

| | |
| --- | --- |
| **[書く画面](https://todo2023.github.io/my-ai-agent/biz/write.html)**（`write.html`） | 見たまま書けて、下書きは端末に残る。書き上がったら `.md` を落とす |
| エディタで直接 | `articles/` に `.md` を置く |

どちらの場合も、最後に `node tools/build-index.mjs` を走らせると一覧に出る。
このコマンドが `articles.json` と `a/<slug>/index.html` の両方を作る。
**出来たものはコミットする**（配信にビルドを持たないため）。

### 書く画面について

**まだどこにも送らない。** 書いたものは端末の中（localStorage）だけに残る。
Phase 1 でつないだあとは、この画面の「ダウンロード」が「保存」に変わるだけで、
書き味の部分はそのまま使う。

- 下書きを何本でも持てる。打つたびに自動で保存される
- 必須の項目が埋まるまで、ダウンロードのボタンは押せない
- トピックは、すでに使われているものを候補に出す（表記ゆれを防ぐため）
- **PR（広告・案件記事）のチェックはここで付ける**

### `.md` を直接書く場合

```markdown
---
title: "記事のタイトル"
emoji: "🔍"
topics: [SEO, コンテンツ]
author: "名前"
published_at: "2026-08-14"
published: true
---

本文をここから書く。
```

| 項目 | 要否 | 中身 |
| --- | --- | --- |
| `title` | **必須** | タイトル |
| `published_at` | **必須** | `YYYY-MM-DD`。この順で並ぶ |
| `emoji` | 任意 | 一覧と記事の頭に出る。省くと 📝 |
| `topics` | 任意 | 一覧のしぼりこみに使う。表記ゆれに注意 |
| `author` | 任意 | 書き手 |
| `published` | 任意 | `false` にすると下書き。一覧にも出ないし、生成もされない |
| `is_pr` | 任意 | `true` で「PR」の札が付く。広告・案件記事には必ず付ける |

`published_at` か `title` が抜けていると `build-index.mjs` が止まる（気づかず公開されるのを防ぐため）。

## つなぐ手順（Phase 1）

**つないである**（2026-08-16）。`config.js` に Supabase の URL と anon キーが入っている。
書く画面から「審査に出す」が使える。**費用はゼロのまま**（Supabase 無料プラン・カード登録不要）。

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
window.TODO_BIZ_CONFIG = {
  SUPABASE_URL: "https://xxxxxxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi..."
};
```

anon キーはブラウザから見える。それで正しい。読み書きは RLS で止めてある。
**service_role キーは絶対に書かない。**

### 3. ログインのリンクが戻る先を登録する

Authentication > URL Configuration の **Redirect URLs** に書く画面のURLを足す。

```
https://todo2023.github.io/my-ai-agent/biz/write.html
```

### 4. つないだあとに確認すること

- [ ] anon キーで `select * from works` → **0行**（下書きが漏れていない）
- [ ] `select * from public_works` → 公開したものだけ出る
- [ ] `invites` にないアドレスでログインして「審査に出す」→ **弾かれる**
- [ ] 出した記事が `status = 'review'` で入っている（`published` になっていない）
- [ ] 通信を切って「審査に出す」→ 失敗が出て、下書きは残る


## 使える記法

| | |
| --- | --- |
| 見出し | `##` 〜 `####`。`##` と `###` は目次に出る |
| 段落 | 空行で区切る。段落の中の改行はそのまま改行になる |
| 箇条書き | `-` / `1.` |
| 表 | `\| A \| B \|` と `\|---\|---\|`。横に長いと表だけ横スクロールする |
| 引用 | `>` |
| コード | `` `行内` `` と ```` ```lang ```` |
| 強調 | `**太字**` `*斜体*` `~~打ち消し~~` |
| リンク | `[文字](URL)`。**外部リンクには自動で `rel="ugc nofollow"` が付く** |
| 画像 | `![説明](パス)` |
| 囲み | `:::message` … `:::` と `:::message alert` … `:::` |

生のHTMLは書けない。書いてもそのまま文字として出る（意図的にそうしてある）。

## ファイル

| | |
| --- | --- |
| `index.html` / `app.js` | 一覧。しぼりこみと検索 |
| `a/<slug>/index.html` | **記事ページ。生成物。手で書かない** |
| `article-page.js` | 生成した記事ページに足すぶん（目次の現在地・いいね） |
| `article.html` / `article.js` | 下書きの下見と、まだ取り込んでいないDB記事を開く画面。**noindex のまま** |
| `article-parts.js` | 上の2つが共有する部品（目次・いいね・通報） |
| `write.html` / `write.js` | 書く画面。下書きは端末の中だけ |
| `config.js` | 接続先の設定。**anonキーが入っている**（公開前提のキー。RLSで守る） |
| `supa.js` | Supabase とのやりとり。ライブラリは使わず REST を直接叩く |
| `md.js` | Markdown→HTML。外部ライブラリを入れない決まりなので自前 |
| `style.css` | 3つの画面で共通 |
| `articles/*.md` | 記事の本文 |
| `articles.json` | 一覧用のまとめ。**手で書かない。生成物** |
| `tools/build-index.mjs` | `articles.json` と記事ページを作る。手元で走らせる |
| `tools/render-page.mjs` | 記事ページのひな形。URLの根と `noindex` の切り替えがここにある |

## 動作確認（手元）

```bash
python3 -m http.server 8000
# → http://localhost:8000/biz/
```

`file://` で直接開くと記事を読み込めない（`fetch` が使えないため）。必ずサーバー越しに開く。

## いまできないこと

Phase 0 なので、次はまだない。順番は [`../sekkei/README.md`](../sekkei/README.md#3-段階全部ゼロ円) にある。

- いいね・コメント（Phase 1 の残り）。DBの表はもうあるが、画面がまだない
- いいね・コメント・フォロー（Phase 1）
- 検索エンジンへの掲載（Phase 2。いまは `noindex`）
- 投げ銭・有料販売（Phase 3）

**記事のURLは `a/<slug>/` で固定した。**（2026-08-16）
拡張子を付けていないので、置き場所を Cloudflare Pages に移しても同じURLのまま運べる。
前に配った `article.html?slug=xxx` は、生成ページへ転送するようにしてある。

## 公開前にやること

- [ ] `index.html` の `<meta name="robots" content="noindex">` を外す
      （`write.html` と `article.html` の `noindex` は**外さない**）
- [ ] `tools/render-page.mjs` の `NOINDEX` を `false` にして、`build-index.mjs` を流し直す
- [ ] `index.html` と `tools/render-page.mjs` の `<div class="demo-bar">`（試作中の帯）を消す
- [ ] サンプル記事（`編集部` 名義の3本）を、本物と入れ替えるか消す

**有料販売を始めるなら、その前に GitHub Pages から出る。**
GitHub Pages はECに使えない決まりになっている。詳しくは
[`../sekkei/README.md`](../sekkei/README.md#github-pages-に有料販売を載せてはいけない)。
