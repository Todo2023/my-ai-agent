# 合同会社To do サイト 技術構成・公開手順

- 書き出し日：2026年10月13日
- リポジトリ：https://github.com/todo2023/todo-website
- 最終更新：2026年10月13日（アクセス解析の設定項目を追加）

---

## 1. 構成の全体像

```
GitHub（todo2023/todo-website）
   │  変更をプッシュすると
   ├──→ Netlify ────→ https://todo-llc.netlify.app（正式サイト・検索に出る）
   └──→ Cloudflare ─→ https://todo-llc-preview.pages.dev（控え・検索に出ない）
```

**どちらも同じリポジトリを見ています。** プッシュすると両方が自動で作り直されます。

---

## 2. 使っている技術

| 項目 | 内容 |
| --- | --- |
| フレームワーク | **Astro 5**（`astro@^5.18.2`） |
| 追加パッケージ | `@astrojs/sitemap@^3.7.3` のみ |
| Node.js | **22**（`.node-version` と `netlify.toml` で指定） |
| CSS | 手書き1ファイル（フレームワーク不使用） |
| JavaScript | 画面下バーの表示制御のみ。それ以外は静的HTML |
| Webフォント | **不使用**（端末のフォントを使う） |

**依存パッケージは2つだけです。** 壊れにくく、長期間放置しても動きます。

### なぜAstroか

- 完成品がただのHTMLファイルになるため、**表示が速く、検索エンジンに読まれやすい**
- 無料ホスティングでそのまま動く
- 文言を1ファイルに集約でき、非エンジニアでも編集できる

---

## 3. ファイル構成

```
todo-website/
├── src/
│   ├── data/site.mjs           ★文言のほぼ全部がここ
│   ├── content/
│   │   ├── news/*.md           お知らせ記事
│   │   └── column/*.md         コラム記事
│   ├── content.config.mjs      記事の項目定義
│   ├── layouts/Base.astro      全ページ共通の枠（head・構造化データ）
│   ├── components/             共通部品6つ
│   ├── pages/                  各ページ（URLと1対1）
│   ├── lib/mailto.mjs          メール作成リンクの組み立て
│   └── styles/global.css       見た目の全部（734行）
├── public/
│   ├── favicon.svg             タブのアイコン
│   ├── ogp.png                 SNS共有画像（1200×630）
│   └── admin/                  管理画面
├── docs/                       各種手順書・引き継ぎ資料
├── scripts/check-text.mjs      文字混入の検査
├── astro.config.mjs
├── netlify.toml
├── .node-version
└── package.json
```

---

## 4. 設定ファイル

### package.json

```json
{
  "scripts": {
    "dev": "astro dev",
    "build": "node scripts/check-text.mjs && astro build",
    "preview": "astro preview",
    "check": "node scripts/check-text.mjs"
  },
  "dependencies": {
    "@astrojs/sitemap": "^3.7.3",
    "astro": "^5.18.2"
  },
  "type": "module"
}
```

**ビルド前に必ず文字チェックが走ります。** 問題があればビルドが止まります。

### astro.config.mjs

```js
export default defineConfig({
  site: site.url,                 // src/data/site.mjs から読む
  trailingSlash: 'always',        // URLの末尾を / に統一
  integrations: process.env.NOINDEX === '1' ? [] : [sitemap()],
  build: { format: 'directory' }, // /services/ の形（.html を付けない）
});
```

**`trailingSlash: 'always'` は変えないでください。** 変えるとcanonicalと実URLがずれ、
同じページが2つのURLで存在する扱いになります。

### netlify.toml

```toml
[build]
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "22"

[[redirects]]
  from = "/admin"
  to = "/admin/"
  status = 301
```

### src/data/site.mjs の `gaId`

```js
gaId: '',   // 空ならGoogleアナリティクスのタグは出力されない
```

測定IDを入れると、正式サイトにだけタグが出ます。控えサイトでは出ません。
あわせてプライバシーポリシーの解析章も表示されます。詳細は「SEO構造化データ仕様.md」。

### .node-version

```
22
```

**Cloudflare Pages は `netlify.toml` を読みません。** そのため同じ内容を
`.node-version` にも書いています。両方必要です。

---

## 5. 文字混入チェック（`scripts/check-text.mjs`）

日本語の文章にハングル・キリル文字が紛れ込んでいないか検査します。
`src/` 以下の `.astro` `.mjs` `.md` が対象です。

**見つかるとビルドが失敗し、ファイル名・行番号・該当文字を表示します。**

### なぜ存在するか

制作中、AIが生成した日本語の文章に、意図せず外国語の文字が混入する事故が
複数回ありました（`измерение`、`회의` など）。公開前に気づけたものの、
人間の目視では見落としやすいため、機械的に止める仕組みを入れています。

**この検査は残しておくことを強く勧めます。**

---

## 6. 公開の手順

### 通常（自動）

1. GitHubに変更をプッシュ
2. NetlifyとCloudflareが自動で検知し、作り直す
3. 1〜3分で反映

### 手動で作り直す

Netlify → **Deploys** → **Trigger deploy** → **Deploy site**

### ビルド済みファイルを直接アップロード

Netlify → Deploys → ページ下部の枠に `dist` フォルダをドラッグ＆ドロップ。
ビルドを実行しないため、ビルド枠を消費せずに済みます。

---

## 7. 過去に起きた問題と対処

### ① Netlifyのビルド枠切れ（2026年8月）

小さな修正のたびにプッシュしたため、月のビルドクレジットを使い切り、
**正式サイトが8月15日時点で凍結**しました。

**対処**：Cloudflare Pagesに控えサイトを構築。変更はまとめて1回でプッシュする運用に。

### ② 枠が戻っても自動で復旧しない（2026年10月に判明）

**Netlifyは「変更が届いたとき」にしか作り直しません。**
枠切れでスキップされた分を後から拾うこともしません。

8月31日を最後にプッシュしていなかったため、枠が回復した後も
正式サイトは古いまま1か月半放置されていました。

**対処**：何かプッシュする、または Trigger deploy を押す。

### ③ スマートフォンでの横スクロール

メールアドレスのような切れ目のない長い文字列が原因で、320px幅で崩れました。

**対処**：`.grid > * { min-width: 0 }` と `overflow-wrap: anywhere`。
詳細は「デザイン仕様CSS.md」の章6を参照。

---

## 8. ローカルで動かす

```bash
git clone https://github.com/todo2023/todo-website.git
cd todo-website
npm ci
npm run dev        # http://localhost:4321 で確認
npm run build      # dist/ に完成品を出力
npm run preview    # 完成品を確認
```

控えサイトと同じ検索よけ版を試す場合：

```bash
NOINDEX=1 npm run build
```

---

## 9. 費用

| 項目 | 費用 |
| --- | --- |
| Netlify（無料プラン） | 0円。転送量100GB/月まで |
| Cloudflare Pages（無料プラン） | 0円。ビルド月500回、転送量無制限 |
| GitHub | 0円 |
| Googleフォーム | 0円 |
| ドメイン | **現在なし**（取得する場合は年1,000〜1,500円程度） |

**どちらのホスティングも、カードを登録しなければ課金は発生しません。**
