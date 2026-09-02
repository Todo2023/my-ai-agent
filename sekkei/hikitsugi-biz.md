# 引き継ぎ：ハタラク文庫（マーケ版）

マーケ版（`biz/`）を別のスレッドで進めるための引き継ぎ。
**これを読めば、前の経緯を知らなくても続きから作業できる。**

絵本版（`ehon/`）は別のスレッドが担当している。**下の「触らない場所」を守ること。**

## いまどこまで出来ているか

| | 状態 |
| --- | --- |
| 記事の一覧・記事ページ | できている。リポジトリの `.md` と、DBで公開されたものの両方を出す |
| **記事URLの静的化** | **できた**（2026-08-16）。`biz/a/<slug>/` に生成する |
| **DB公開ぶんの取り込み** | **できた**（2026-08-16）。`biz/tools/pull-published.mjs` |
| **書き手の欄** | **できた**（2026-08-16）。`biz/profile.html` |
| 書く画面（`biz/write.html`） | できている。下書きは端末の中。「審査に出す」で送る |
| 審査画面（`admin/`） | できている。公開・差し戻しができる |
| いいね・通報 | できている（DBに行がある記事だけ） |
| Supabase | **つないである。動いている**（無料プラン） |
| 検索に出す | **まだ。`noindex` のまま**（理由は下） |

## 決まっていること（変えるときは相談）

- **費用は1円もかけない。** 課金の相談は同じ問いを3回して3回ともOKのときだけ検討（`../CLAUDE.md`）
- **独自ドメインは作らない**（2026-08-16 決定）
- 外部ライブラリ・CDNを読み込まない。Markdown変換も自前（`biz/md.js`）
- 招待された人だけが書ける。**公開は審査を通ったものだけ**

## 出来あがった形（2026-08-16）

記事が site に出るまでの一本道。**どこから来た記事も、最後は静的HTMLになる。**

```
書く画面 ──→ works（DB, status=review）──→ 審査画面で公開
                                              │
                          pull-published.mjs ─┘   DBから .md を落とす
                                  ↓
                        biz/articles/*.md          ← 手で書いた記事もここ
                                  ↓ build-index.mjs
                  biz/a/<slug>/index.html + articles.json
```

- **記事URLは `biz/a/<slug>/`**。拡張子なしなので、Cloudflare Pages に移しても同じURLで運べる
- 前に配った `article.html?slug=xxx` は生成ページへ転送する。古いリンクは死なない
- `article.html` は下書きの下見と、まだ取り込んでいないDB記事の表示用。**noindex のまま**
- 取り込んだ `.md` は `work_id` を持ち、それが生成ページの `data-work-id` になって
  いいね・通報の宛先になる

## 次にやること（優先順）

### 1. `noindex` を外す ← 検索に出す

前提だった静的化・取り込み・書き手の欄は済んだ。**操作は2つだけ。**

```bash
# 1. biz/tools/render-page.mjs の NOINDEX を false にする
node biz/tools/build-index.mjs   # 記事から noindex が消え、sitemap.xml が出る
# 2. biz/index.html の <meta name="robots" content="noindex"> を消す
node biz/tools/check.mjs         # 片方だけだと、ここで止まる
```

`write.html` `article.html` `profile.html` の `noindex` は**外さない**（点検が見張る）。
`robots.txt` はドメイン直下にしか置けないので、いまのURLでは持てない。

**外す前に決めること。**

| | |
| --- | --- |
| サンプル記事 | `編集部` 名義の3本を、本物と入れ替えるか消す |
| 試作中の帯 | `.demo-bar` を消すか、文言を変えるか |
| 置き場所 | **GitHub Pages は規約でECに使えない。** 有料販売に進むなら先に Cloudflare Pages へ移す（`README.md` の「決まったこと：独自ドメインは作らない」の節） |

URLは移設に耐える形にしてあるので、**移すなら検索に載せる前のいまが一番安い。**

### 2. コメント

`comments` の表はあるが画面がない。いいね・通報と同じく、
`work_id` を持つ記事にだけ出す形になる（`biz/article-parts.js` に足す）。

### 3. 書き手の欄を静的に吐く

いまの `profile.html?handle=xxx` はDBを読んで描くので `noindex` にしてある。
書き手のページも検索に出したいなら、記事と同じく `tools/` で静的に吐く。

## 触らない場所（絵本スレッドの担当）

**この3つを直したくなったら、直す前に人に言うこと。**

| | なぜ |
| --- | --- |
| `ehon/` の中身すべて | 絵本スレッドの担当 |
| `admin/` | **両方で使っている。** 記事の表示を直すだけでも絵本側に影響する |
| `supabase/community.sql` | 1つのDBを共有している。列を足すと両方に効く |
| `sekkei/README.md` | 共通の設計メモ |

`biz/supa.js` と `biz/md.js` は **`admin/` からも読まれている**。
関数の名前や返り値を変えるときは `admin/admin.js` も一緒に直すこと。

## 動かしかた

```bash
python3 -m http.server 8000
# 一覧     → http://localhost:8000/biz/
# 記事     → http://localhost:8000/biz/a/kpi-hitotsu/
# 書く     → http://localhost:8000/biz/write.html
# 書き手   → http://localhost:8000/biz/profile.html
# 審査     → http://localhost:8000/admin/
```

記事を足したら `node biz/tools/build-index.mjs` を走らせて、**生成物ごとコミットする**。

審査で公開したものを site に出すときは、その前に取り込む。

```bash
node biz/tools/pull-published.mjs --dry-run   # 何が変わるか見る
node biz/tools/pull-published.mjs             # articles/*.md に落とす
node biz/tools/build-index.mjs                # 一覧と記事ページを作り直す
```

**コミットする前に点検を走らせる。**

```bash
node biz/tools/check.mjs
```

## 落とし穴（実際にはまったもの）

**〔点検〕**が付いたものは `check.mjs` が見つける。付いていないものは目で見るしかない。

- **`config.js` の読み込み忘れ。**〔点検〕新しいページを作ったら `<script src="config.js"></script>` を先に置く。忘れるとDBに繋がらないのに静かに動く
- **生成物のコミット忘れ。**〔点検〕`biz/a/` と `biz/articles.json` は生成物だが、
  配信にビルドを持たないので**コミットしないと反映されない**
- **`noindex` を外す場所を間違える。**〔点検〕`write` `article` `profile` は公開後も外さない。
  一覧と記事ページは揃っていないと、片方だけ検索に載る
- **外部の読み込みを混ぜる。**〔点検〕CDN・Webフォントに加えて、**本文の外部画像**も。
  `_headers` の CSP（`img-src 'self' data:`）で、Cloudflare に移した先で出なくなる
- **Supabase を引っ越して `_headers` を直し忘れる。**〔点検〕
  CSP の `connect-src` に古いURLが残り、**移設先でDBだけ繋がらない**
- **ログインのリンクが戻る先。** Supabase の Redirect URLs に無い画面でログインすると、
  メールのリンクを踏んでも戻ってこない。画面を足したら登録も足す（`biz/README.md`）
- **front matter は YAML ではない。** `md.js` の `parseFrontMatter` は
  `key: value` と `key: [a, b]` しか読まない。`"` と `'` の両方が入った題は書けないので、
  `pull-published.mjs` はその記事を飛ばして報せる
- **`author_id` を入れ忘れると必ず弾かれる。** RLS が `author_id = auth.uid()` を求める
- **`hidden` 属性は CSS の `display` に負ける。** `[hidden]{display:none !important}` を入れてある
- Supabase の新しいキーは `sb_publishable_...`。**Legacy の JWT 形式キーは無効**

## 置き場所と設定

| | |
| --- | --- |
| 配信 | GitHub Pages（`main` をそのまま配信） |
| Supabase | `https://wmjzbdacvjrepxdqzwen.supabase.co`（東京・無料プラン） |
| キー | `biz/config.js` に入っている。公開前提のキーなので、そのままでよい |
| 管理者・招待 | `admins` と `invites` テーブル。追加はSQL Editorから |

**このリポジトリには関係のないプロジェクト（AIエージェント教材・ふたりの体重帳）も
同居している。** `docs/` は体重帳のPWAなので触らないこと。詳しくは `../CLAUDE.md`。
