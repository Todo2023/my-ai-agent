# 合同会社To do サイト SEO・構造化データ仕様

- 書き出し日：2026年10月13日
- 実装場所：`src/layouts/Base.astro`、`src/pages/robots.txt.js`、`astro.config.mjs`

検索対策の実装は、ほぼすべてこのファイルに記録した内容で成り立っています。

---

## 1. 前提：なぜ対策が必要か

社名の「To do」が一般名詞であるうえ、URLの `todo-llc.netlify.app` が
世界中の「Todoアプリ」の練習作品と競合しています。

そのため、**「この会社は実在し、このサイトがその公式である」という裏づけを、
機械が読める形で与える**ことに重点を置いています。

---

## 2. 各ページの基本設定

### タイトルタグ

```
トップページ： 合同会社To do｜キーエンス出身の代表による事業アドバイザリー
その他　　　： 〇〇｜合同会社To do
```

**社名を必ず含めます。** 社名検索で引っかかるための最低条件です。

### 説明文（description）

全ページに個別に設定済み。未設定の場合はサイト共通の説明文が入ります。
全角60〜80文字が目安です。

### canonical（正規URL）

```html
<link rel="canonical" href="https://todo-llc.netlify.app/〇〇/" />
```

すべてのページに出力。URLは末尾スラッシュ付きで統一しています
（`trailingSlash: 'always'`）。**同じページが複数URLで存在する状態を防ぐため**です。

### OGP（SNSで共有したときの表示）

| 項目 | 値 |
| --- | --- |
| `og:type` | website |
| `og:site_name` | 合同会社To do |
| `og:title` | ページタイトル |
| `og:description` | ページの説明文 |
| `og:url` | canonicalと同じ |
| `og:locale` | ja_JP |
| `og:image` | `/ogp.png`（1200×630） |
| `twitter:card` | summary_large_image |

### Search Console の所有権確認

```html
<meta name="google-site-verification" content="ZDDQSH8gMWGZhiox_9ZSql-TrOiBb-mnVKrau8r_OMU" />
```

**この行を消すと所有権が外れます。** 確認が済んだ後も残しておく必要があります。

---

## 3. 構造化データ（6種類）

Googleに「何の会社か」を機械が読める形で伝えるものです。
JSON-LD形式で `<head>` に出力しています。

### ① Organization（全ページ）

会社そのものの情報です。**社名検索で最も効きます。**

| 項目 | 内容 |
| --- | --- |
| `name` / `legalName` | 合同会社To do |
| `alternateName` | To do, Todo, トゥードゥー, To do LLC, 合同会社Todo |
| `identifier` | **法人番号 4011603004093** |
| `url` / `description` / `email` | サイトURL・説明文・メールアドレス |
| `foundingDate` | 2023-10 |
| `founder` | 辰巳貴恒（代表） |
| `knowsAbout` | 対応できる領域7件を配列で |
| `hasOfferCatalog` | 提供サービス5件を配列で |
| `areaServed` | 日本（国単位） |
| `sameAs` | Facebook、X、クラウドワークスのURL |

**重要な3点**

- **法人番号**は、同名の会社と取り違えられないための最も確実な識別子です
- **`alternateName`** で表記ゆれを吸収しています（「合同会社Todo」などでも引っかかる）
- **`areaServed` は国単位**。住所を公開しない方針のため、`PostalAddress` は意図的に入れていません

### ② WebSite（全ページ）

サイト自体の情報。社名と正式名称を結びつけます。

### ③ BreadcrumbList（トップ以外の全ページ）

検索結果に「ホーム > サービス > COO代行」と表示させるためのもの。
URLの階層から自動生成されます。日本語表示名は `Base.astro` の `CRUMB_LABEL` で定義：

```
services → サービス    news → お知らせ    column → コラム
team → 代表    company → 会社概要    contact → 無料相談・お問い合わせ
```

**新しいページ種別を足したら、ここにも追加が必要です。**

### ④ Person（代表ページのみ）

| 項目 | 内容 |
| --- | --- |
| `name` | 辰巳貴恒 |
| `jobTitle` | 代表 |
| `worksFor` | 合同会社To do |
| `alumniOf` | **過去に在籍した6社**（現職のオムロンを除く） |
| `knowsAbout` | 対応できる領域7件 |

**氏名で検索されたときに、会社と経歴を結びつけます。**
キーエンス等の社名と代表個人をGoogleが関連づける材料になります。

### ⑤ Service（サービス詳細3ページ）

COO代行・SEO・セミナーの各ページに1つずつ。
サービス名、説明、提供者（合同会社To do）、対応地域（日本）。

### ⑥ FAQPage（お問い合わせページ）

よくあるご質問8問を登録。**検索結果に質問と回答が直接表示されることがあり、
占有面積が増えます。**

---

## 4. robots.txt

`src/pages/robots.txt.js` が生成します。**固定ファイルではありません。**

### 通常（正式サイト）

```
User-agent: *
Allow: /

Sitemap: https://todo-llc.netlify.app/sitemap-index.xml
```

### 環境変数 `NOINDEX=1` のとき（控えサイト）

```
User-agent: *
Disallow: /
```

---

## 5. 検索よけの切り替え機構

控えサイト（Cloudflare Pages）用の仕組みです。
**同じ内容のサイトが2つ検索に出ると評価が分散するため**、3つを同時に切り替えます。

| 対象 | `NOINDEX=1` のとき |
| --- | --- |
| `robots.txt` | `Disallow: /` になる |
| 各ページの `<head>` | `<meta name="robots" content="noindex, nofollow">` が入る |
| `sitemap.xml` | **生成されない** |
| 管理画面のスクリプト | 読み込まない（控えでは動かないため） |

**この3つが揃って初めて確実に除外されます。** どれか1つでは漏れます。

設定場所：Cloudflare Pages の Environment variables に `NOINDEX` = `1`

---

## 6. sitemap.xml

`@astrojs/sitemap` が自動生成します。手で管理する必要はありません。

- 出力先：`/sitemap-index.xml`（index が `/sitemap-0.xml` を指す）
- 収録：公開中の全ページ（現在16件）
- 基準URL：`site.mjs` の `url`

**独自ドメインを取ったら `site.mjs` の `url` を変えてください。**
変えないと、sitemapが古いURLを指し続けます。

---

## 7. 管理画面の除外

`/admin/` は `<meta name="robots" content="noindex" />` 付き。
検索結果に管理画面が出ることはありません。

---

## 8. 変更するときの注意

| やること | 影響 |
| --- | --- |
| `site.mjs` の `url` を変更 | canonical・OGP・sitemap・robots が一斉に変わる |
| `googleSiteVerification` を削除 | **Search Consoleの所有権が外れる** |
| `nav` にページ追加 | `CRUMB_LABEL` にも追加しないとパンくずが英語のまま |
| 住所を追加したくなった場合 | 非公開方針のため、追加前に方針の再確認が必要 |

### 外部プロフィールの追加

`site.mjs` の `profiles` にURLを足すと、`sameAs` に入ります。
フッターには出ません。**Googleに「同じ会社のもの」と伝えるためだけ**の設定です。

現在：クラウドワークス。**ランサーズのURLが判明したら追加する余地があります。**
