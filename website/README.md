# 合同会社To do コーポレートサイト

WIXから作り直した、新しいホームページのデータ一式です。

- **仕組み**：Astro（静的サイト）＝ 表示が速く、検索エンジンに読まれやすい形
- **公開先**：Netlify の無料プラン（費用0円。転送量100GB/月まで無料）
- **更新方法**：`/admin` の管理画面から、コードを触らずに「お知らせ」を投稿できる

---

## 1. まず公開するまで（初回だけ・約15分）

ここは1回だけの作業です。ブラウザだけで完了します。

### ステップ1：Netlifyに登録する

1. https://app.netlify.com/signup を開く
2. 「GitHub」を選んでログイン（GitHubアカウントでそのまま入れます）

### ステップ2：このリポジトリをつなぐ

1. Netlifyの画面で **Add new site** → **Import an existing project**
2. **GitHub** を選び、このリポジトリを選択
3. 設定画面が出たら、以下だけ確認する（他はそのままでOK）

   | 項目 | 入れる値 |
   | --- | --- |
   | Base directory | `website` |
   | Build command | `npm run build` |
   | Publish directory | `website/dist` |

4. **Deploy** を押す。2〜3分で `https://〇〇〇.netlify.app` が発行されます

> サイト名は Netlify の **Site configuration → Change site name** で変えられます。
> 変えたら、`src/data/site.mjs` の `url:` と `public/robots.txt` の Sitemap 行も
> 同じアドレスに直してください（ここが合っていないと検索に出にくくなります）。

### ステップ3：管理画面（/admin）を使えるようにする

1. Netlifyの左メニューから **Integrations**（または **Identity**）→ **Identity** を **Enable**
2. **Identity → Services → Git Gateway** を **Enable**
3. **Identity → Invite users** に自分のメールアドレスを入れて招待
4. 届いたメールのリンクを開き、パスワードを設定
5. 以後 `https://〇〇〇.netlify.app/admin/` からログインできます

> 招待していない人はログインできません。**Registration** は
> **Invite only** のままにしておいてください。

---

## 2. ふだんの更新のしかた

### お知らせを追加する（管理画面から・おすすめ）

1. `https://〇〇〇.netlify.app/admin/` を開いてログイン
2. 左の「お知らせ」→ **New お知らせ**
3. タイトル・公開日・本文を入れて **Publish**
4. 2〜3分待つとサイトに反映されます

「下書き」にチェックを入れて保存すると、サイトには出ません。
あとでチェックを外せば公開されます。

### 会社概要や事業内容の文章を直す

こちらはファイルを1つ書き換えます。**`src/data/site.mjs` だけ**を見てください。
中身は日本語のメモ付きで、`'` で囲まれた部分を書き換えるだけです。

GitHubのサイト上で直接編集できます：

1. GitHubでこのリポジトリを開く
2. `website` → `src` → `data` → `site.mjs` を開く
3. 右上の鉛筆マーク（Edit）を押して書き換える
4. 下の **Commit changes** を押す
5. 2〜3分でサイトに反映されます

書き換えるときの注意は3つだけです。

- `'` （シングルクォート）で囲まれた中の文字を変える
- 行の最後の `,` （カンマ）は消さない
- `//` で始まる行は説明メモなので、消しても画面は変わりません

万一おかしくなっても、GitHubの履歴からいつでも元に戻せます。

---

## 3. 検索で見つけてもらうために（重要）

作り直しただけでは、まだ足りません。以下は**公開後にやること**です。

### 3-1. 独自ドメインを取る（強く推奨・年1,000〜2,000円程度）

`〇〇〇.netlify.app` のままだと、会社名で検索したときの信頼性・順位が上がりにくいです。
`todo-llc.co.jp` のような独自ドメインを取ると、検索でも名刺でも効果が違います。

- 取得先の例：お名前.com、ムームードメイン、Cloudflare Registrar
- 取ったら Netlify の **Domain management → Add a domain** で設定するだけ（HTTPSは自動）
- ドメインを変えたら `src/data/site.mjs` の `url:` と `public/robots.txt` も直す

> ここだけは無料になりません。ホスティング自体は無料のままです。

### 3-2. Google Search Console に登録する

1. https://search.google.com/search-console を開く
2. サイトのURLを登録して所有権を確認
3. **サイトマップ** に `sitemap-index.xml` を送信

これでGoogleにページの存在が伝わります。

### 3-3. Googleビジネスプロフィールを登録する

札幌で事業をしているので、地図・ローカル検索に出るようにすると効果が大きいです。
https://www.google.com/business/ から無料で登録できます。

### 3-4. お知らせを更新し続ける

更新のないサイトは順位が上がりません。月1回でもよいので、
実績・お知らせ・気づいたことを管理画面から投稿してください。

---

## 4. WIXからの移行時にやること

新しいサイトを独自ドメインで公開したあと、WIX側で以下をしてください。

1. WIXサイトを**すぐには消さない**（1〜2か月は残す）
2. WIX側にも新サイトへのリンクを置く
3. WIXの契約を解約する前に、画像や文章のバックアップを取る
4. 名刺・SNS・各種登録サイトのURLを新しいものに差し替える

同じ内容のページが2つあると検索上不利になるので、
新サイトが検索に出るようになったらWIX側は公開停止にしてください。

---

## 5. 開発者向け（触らなくて大丈夫です）

```bash
cd website
npm install
npm run dev      # http://localhost:4321 で確認
npm run build    # dist/ に静的ファイルを出力
npm run preview  # ビルド結果を確認
```

### ファイルの場所

| やりたいこと | 場所 |
| --- | --- |
| 文章・会社情報を直す | `src/data/site.mjs` |
| お知らせを追加する | `src/content/news/*.md` |
| 色やフォントを変える | `src/styles/global.css` の `:root` |
| ページを増やす | `src/pages/` に `.astro` を追加 |
| 共通のhead・SEO設定 | `src/layouts/Base.astro` |
| 管理画面の項目を変える | `public/admin/config.yml` |

### 入っているSEO対応

- ページごとの `title` / `description` / `canonical`
- OGP（SNSでシェアしたときの表示）
- 構造化データ（`Organization` — 会社名・住所・電話をGoogleに伝える）
- `sitemap-index.xml` の自動生成、`robots.txt`
- 静的HTML出力（JavaScriptなしで内容が読める＝クローラに確実に読まれる）
