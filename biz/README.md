# ハタラク文庫（仮）

マーケティング・事業づくりの記事を、Markdownで書いて置く場所。
Zennのマーケ版として作るものの、いちばん最初の形（Phase 0）。

設計の意図は [`../docs/platform-marketing.md`](../docs/platform-marketing.md) にある。

| | |
| --- | --- |
| 一覧 | https://todo2023.github.io/my-ai-agent/biz/ |
| 記事 | `article.html?slug=（ファイル名）` |

**いまは投稿を受け付けていない。** 記事はこのリポジトリの中にあるものだけ。
費用はゼロ（GitHub Pages のみ）。

## 記事の書き方

`articles/` に `.md` を置いて、`node tools/build-index.mjs` を走らせる。それだけ。

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
| `article.html` / `article.js` | 記事ページ |
| `md.js` | Markdown→HTML。外部ライブラリを入れない決まりなので自前 |
| `style.css` | 一覧と記事で共通 |
| `articles/*.md` | 記事の本文 |
| `articles.json` | 一覧用のまとめ。**手で書かない。生成物** |
| `tools/build-index.mjs` | `articles.json` を作る。手元で走らせる |

## 動作確認（手元）

```bash
python3 -m http.server 8000
# → http://localhost:8000/biz/
```

`file://` で直接開くと記事を読み込めない（`fetch` が使えないため）。必ずサーバー越しに開く。

## いまできないこと

Phase 0 なので、次はまだない。順番は [`../docs/README.md`](../docs/README.md#3-段階全部ゼロ円) にある。

- 投稿フォーム・ログイン（Phase 1）
- いいね・コメント・フォロー（Phase 1）
- 検索エンジンへの掲載（Phase 2。いまは `noindex`）
- 投げ銭・有料販売（Phase 3）

**URLに `?slug=` が付いているのは、まだビルドを持たないから。**
検索に載せる段（Phase 2）で、記事ごとの静的HTMLを吐く形に変える。
そのときURLも変わるので、**外に出すのはそのあとにする**。

## 公開前にやること

- [ ] `index.html` と `article.html` の `<meta name="robots" content="noindex">` を外す
- [ ] 両ページの `<div class="demo-bar">`（試作中の帯）を消す
- [ ] 記事ごとの静的HTMLに切り替える（`?slug=` をやめる）
- [ ] サンプル記事（`編集部` 名義の3本）を、本物と入れ替えるか消す

**有料販売を始めるなら、その前に GitHub Pages から出る。**
GitHub Pages はECに使えない決まりになっている。詳しくは
[`../docs/README.md`](../docs/README.md#github-pages-に有料販売を載せてはいけない)。
