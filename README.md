# アプリ置き場

GitHub Pages に置いてあるスマホ向けアプリ（PWA）。どれもビルド不要・サーバーなし・通信なしで動く。

**https://todo2023.github.io/my-ai-agent/**

| | | |
| --- | --- | --- |
| [`meshi/`](meshi/) | **スクショ飯** | 行きたい店のスクショを貯めて、行ったらチェック |
| [`kakei/`](kakei/) | **家計のみらい** | 毎月の収支から、この先の残高を1本の線にする |
| [`todo_game/`](todo_game/) | **トドの晩酌** | 回転レーンの皿を開けて、注文どおりの品を食べさせる |
| [`breakout/`](breakout/) | **ブロック崩し** | 指でドラッグして遊ぶブロック崩し |
| [`ehon/`](ehon/) | **えほんの棚（仮）** | 絵本をめくって読む。ふりがな・読み上げつき。圏外でも読める |

アプリではないもの。

| | | |
| --- | --- | --- |
| [`someday/`](someday/) | **Someday（提案）** | つくる部門（アプリ・音楽）のサイト案。実績として上のアプリを載せている |
| [`hp/`](hp/) | **合同会社To do（デモ）** | 会社サイトの試作。事業ごとにページを分けてある。PWAではない |
| [`office/`](office/) | **MTGルーム／カンファレンスルーム（デモ）** | クライアントが開く画面。部屋を歩いてAI担当者に話しかけ、迎えて、仕事を渡す。PWAではない |
| [`eigyo/`](eigyo/) | **営業AIの作業台** | 営業支援AIのプロンプトを組み立てる社内用の道具。PWAではない |
| [`supabase/`](supabase/) | **DB定義と生成処理** | `hp/match/`（マッチング）用。ブラウザでは動かない。まだ配置していない |
| [`biz/`](biz/) | **ハタラク文庫（仮）** | マーケ・事業の記事置き場。Markdownで書く。PWAではない |
| [`admin/`](admin/) | **審査（身内用）** | 投稿を見て公開・差し戻しを決める。管理者以外には何も出ない |
| [`sekkei/`](sekkei/) | **設計メモ** | `biz/` と `ehon/` をどう育てるかの検討。コードはない |

| [`diet_agent/`](diet_agent/) [`invoice_agent/`](invoice_agent/) [`meeting_agent/`](meeting_agent/) [`travel_agent/`](travel_agent/) [`diet_gas/`](diet_gas/) [`diet_worker/`](diet_worker/) | **AIエージェント教材** | Python。進め方は [`README-agents.md`](README-agents.md) |

各フォルダの README に、遊び方・入れ方・中身の説明がある。

**このリポジトリには性質の違う2つのプロジェクトが入っている。**
配信するもの（上の表）と、AIエージェント教材（Python）。
GitHub Pages は1ブランチしか配信できないので、`main` ひとつにまとめてある。

```bash
# ローカルで動かす（Service Worker を使うので http で開く）
python3 -m http.server 8000
# → http://localhost:8000
```

## アプリは必ずフォルダに分ける

**リポジトリ直下にアプリ（manifest / Service Worker）を置かないこと。**

PWA の担当範囲（`scope`）は URL の前方一致で決まる。直下に置くと担当範囲がサイト全体になり、
下の階層のアプリまで巻き込む。実際にブロック崩しを直下に置いていたとき、こうなった。

- Android では、インストール済みアプリがその担当範囲のURLを**横取りして開く**（WebAPK のインテントフィルタ）。
  `meshi/` のリンクをタップしても**ブロック崩しが起動**してしまい、新しいアプリを入れられなかった
- 直下の Service Worker が下の階層のページまで拾い、通信が細いときに**別アプリの画面を返す**恐れもあった

いまはアプリごとにフォルダが分かれていて、担当範囲が重ならない。

直下に残っているのは、その後始末のためのファイルだけ。

| | |
| --- | --- |
| `index.html` | このアプリ一覧のページ。manifest も Service Worker も持たない |
| `manifest.webmanifest` | ブロック崩しのマニフェスト。すでに入っている端末がこのURLを見に来るので動かせない。中身は `breakout/` を指している |
| `game.html` | 旧アイコンの受け皿。`breakout/game.html` へ転送する |
| `sw.js` | 昔ここにいた Service Worker の後始末。自分で登録を解除して消える |

## 公開のしかた

`main` を GitHub Pages がそのまま配信している。push すれば1〜2分で反映される。
更新が出ないときは、そのアプリの `sw.js` にある `CACHE` の版数を上げる。
