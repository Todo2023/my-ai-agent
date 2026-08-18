# 移設：GitHub Pages → Cloudflare Pages

## なぜ移すか

**読み放題（サブスク）＝有料販売**で、GitHub Pages は規約でこれを許していない
（[`README.md`](README.md#github-pages-に有料販売を載せてはいけない)）。

| | GitHub Pages |
| --- | --- |
| 無料公開だけ | OK |
| 投げ銭・支援リンク | **OK**（寄付として許容） |
| 読み放題・有料販売 | **NG** |

**投げ銭で始めるあいだは、移さなくてよい。** 課金を始める段で移す。

## 費用

Cloudflare Pages の無料枠で足りる。**カード登録は不要。**

| | |
| --- | --- |
| 帯域・リクエスト | 無制限 |
| ビルド | 月500回（このリポジトリはビルドを持たないので、実質はデプロイ回数） |
| 独自ドメイン | **使わない**（2026-08-16 決定）。`*.pages.dev` のまま |

## いまの状態：移設の障害はほぼない

調べたところ、**HTML・CSS・JS はすべて相対パス**（`./` と `../`）で書かれていた。
ルート絶対パス（`/biz/…`）は1つもない。だから `…/my-ai-agent/` の下でも、
ドメインの直下でも、そのまま動く。

**この決まりは崩さないこと。** ルート絶対パスを1つ書くと、移設した瞬間そこだけ壊れる。

ドメインを直書きしているのは生成ツールだけで、[`../site.mjs`](../site.mjs) に集めてある。

## 手順

### 1. こちら（済み）

- URLの根を `site.mjs` 1か所にまとめた。移設時はここを差し替えて、生成物を作り直す

```bash
# site.mjs の SITE を新しいURLに書き換えてから
node biz/tools/build-index.mjs
node insta/tools/build-posts.mjs
node biz/tools/check.mjs
```

### 2. Cloudflare 側（人の作業）

1. Cloudflare のアカウントを作る（無料・カード不要）
2. Workers & Pages → Pages → GitHub 連携で `Todo2023/my-ai-agent` を選ぶ
3. **Production branch に `main` を選ぶ**
   （このリポジトリの既定ブランチは `main` ではない。配信しているのは `main`）
4. Framework preset **なし** / Build command **空** / Output directory **`/`**
   （ビルドを持たない構成なので、置いてあるものをそのまま配る）

### 3. 移した直後に確かめること

**`_headers` の CSP が、そこで初めて効き始める。**
GitHub Pages はこのファイルを読まないので、いままで一度も検証されていない。

- [ ] `/biz/` … 一覧・記事・書く画面・書き手の欄（`check.mjs` で外部読み込みは確認済み）
- [ ] `/ehon/` … **絵本スレッドの担当**。PWA（Service Worker）があるので要確認
- [ ] `/admin/` … 審査画面
- [ ] Supabase に繋がるか（CSP の `connect-src` に入っているか。`check.mjs` が照合する）

そのほか。

- **`robots.txt` が置けるようになる。** ドメイン直下になるため。いまのURLでは持てない
- 旧URL（`todo2023.github.io/my-ai-agent/…`）は GitHub Pages 側に残せるので、
  転送を置いて積み上げを捨てないこと

## 移設しても解決しないこと

置き場所を移しても、有料販売には次が要る。**これは規約ではなく法律の話。**

- 特定商取引法の表示（事業者名・住所・連絡先・返品の扱い）
- 消費税・インボイス
- 読み放題なら「会員だけが読める仕組み」（いまは全部公開なので、設計が変わる）
