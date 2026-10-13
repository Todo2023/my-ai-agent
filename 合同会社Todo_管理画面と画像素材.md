# 合同会社To do サイト 管理画面・画像素材

- 書き出し日：2026年10月13日

---

# 第1部：管理画面（CMS）

コードに触れずに、ブラウザから記事を投稿・編集するための仕組みです。

## 1. 入口

**https://todo-llc.netlify.app/admin/**

## 2. 仕組み

| 要素 | 内容 |
| --- | --- |
| ソフト | **Decap CMS 3.8**（旧 Netlify CMS） |
| 読み込み方 | CDNから1行で読み込み（`unpkg.com/decap-cms@^3.8.0`） |
| 認証 | **Netlify Identity** |
| 保存先 | **Git Gateway** 経由でGitHubの `main` ブランチに直接コミット |

**記事を書いて保存すると、GitHubにコミットが作られ、サイトが自動で更新されます。**
ファイルを手で置くのと、結果はまったく同じです。

## 3. ファイル

### `public/admin/index.html`

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>サイト管理画面｜合同会社To do</title>
  </head>
  <body>
    <script src="https://unpkg.com/decap-cms@^3.8.0/dist/decap-cms.js"></script>
  </body>
</html>
```

`noindex` 付きなので、検索結果には出ません。

### `public/admin/config.yml`

```yaml
backend:
  name: git-gateway
  branch: main

media_folder: "public/images"
public_folder: "/images"

locale: "ja"

collections:
  - name: "news"            # お知らせ
    folder: "src/content/news"
  - name: "column"          # コラム
    folder: "src/content/column"
```

両方とも同じ項目構成です。

| 項目 | 形式 | 必須 |
| --- | --- | --- |
| タイトル | 1行テキスト | ○ |
| 公開日 | 日付（YYYY-MM-DD） | ○ |
| 一覧に出る短い説明 | 複数行テキスト | |
| 下書き | チェックボックス | |
| 本文 | Markdownエディタ | ○ |

ファイル名は `{年}-{月}-{日}-{タイトルから生成}` の形で自動生成されます。

## 4. 利用者の管理

Netlify の **Identity** タブで行います。

- **Registration を `Invite only` にしてあります。** `Open` のままだと、
  誰でも `/admin` からアカウントを作れてしまいます
- 利用者を増やす場合は「Invite users」から招待メールを送る

## 5. 注意点

**控えサイト（Cloudflare）では管理画面は動きません。** Netlify Identity に依存する
仕組みのため、控え側では読み込み自体を止めてあります。

記事を投稿するときは、必ず**正式サイトの `/admin/`** を使ってください。

## 6. 新しい記事の種類を足す場合

1. `src/content.config.mjs` にコレクションを追加
2. `public/admin/config.yml` に同じ項目でコレクションを追加
3. 一覧ページと記事ページを `src/pages/` に作成
4. `site.mjs` の `nav` と `Base.astro` の `CRUMB_LABEL` に追加

コラムを追加したときが、この手順そのままの実例です。

---

# 第2部：画像素材

サイトで使っている画像は**3つだけ**です。写真は一切使っていません。

## 1. ロゴマーク

**実装場所：`src/components/Logo.astro`**（画像ファイルではなくSVGコード）

同じチェックマークを横にずらして2本重ね、交差部分が濃く沈む構造です。
`mix-blend-mode: multiply` によって、重なりが自動的に濃紺になります。

```
チェックの形： M18 50 L44 78 L96 20
            （左下 → 頂点 → 右上）

マゼンタの線： #a0128e  ← 左に15ずらす（transform="translate(-15 0)"）
青い線　　　： #4a6a9d  ← ずらさない

線の太さ　　： 15
線端　　　　： butt（角を落とさない）
viewBox　　 ： 0 0 100 100
```

**この3色がサイト全体の配色の出発点です。**
重なりの濃紺が `--ground`（#1d1745）のもとになっています。

既定の表示サイズは34px。ヘッダーでは36pxで呼び出しています。

## 2. ファビコン（タブのアイコン）

**ファイル：`public/favicon.svg`**（410バイト）

ロゴと同じ形に、白い背景を敷いたものです。全文：

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#ffffff"/>
  <g fill="none" stroke-width="15" stroke-linecap="butt" stroke-linejoin="miter">
    <path d="M18 50 L44 78 L96 20" stroke="#a0128e" transform="translate(-15 0)" style="mix-blend-mode:multiply"/>
    <path d="M18 50 L44 78 L96 20" stroke="#4a6a9d" style="mix-blend-mode:multiply"/>
  </g>
</svg>
```

**この内容をコピーすれば完全に再現できます。**

## 3. OGP画像（SNSで共有したときに出る画像）

**ファイル：`public/ogp.png`**

| 項目 | 値 |
| --- | --- |
| サイズ | 1200 × 630 ピクセル |
| 形式 | PNG（8bit RGB） |
| 容量 | 約168KB |

### ★これだけはMDから復元できません

**画像ファイルそのものを保管してください。** 以下は作り直すための情報です。

```
背景　　： #1d1745（--ground）の濃紺
ロゴ　　： 上記のチェックマーク（白または明るい色）
社名　　： 合同会社To do
説明文　： キーエンス出身の代表による事業アドバイザリー
フォント： system-ui 系（Hiragino Kaku Gothic ProN / Noto Sans JP）
```

制作時は1200×630のHTMLを作り、ブラウザでスクリーンショットを撮って
PNG化しました。同じ方法で作り直せます。

### 差し替えるとき

`public/ogp.png` を同じファイル名・同じサイズで置き換えるだけです。
**ファイル名を変えると、`Base.astro` の参照も直す必要があります。**

---

## 4. 画像を記事に入れたい場合

管理画面から画像をアップロードすると `public/images/` に保存され、
記事中では `/images/ファイル名` で参照されます。

**現在このフォルダは空です。** 画像を使った記事はまだありません。

写真を使う場合は、容量に注意してください。
Netlifyの無料枠は転送量100GB/月で、画像が増えるほど消費が早くなります。
