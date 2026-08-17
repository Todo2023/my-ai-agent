# リード獲得自動化（SNS → 無料相談）

X / note / Zenn の投稿に、無料相談ページへの導線（CTA + UTM）を自動で付ける道具。
毎日1件ぶんの投稿の下書きを作り、どこから来た人か・A/Bどちらの文面から来た人かを
あとから数えられる状態にする。

**費用はゼロ。** 外部ライブラリなし、API呼び出しなし、通信なし。Python の標準ライブラリだけで動く。
投稿の送信も自動化していない（人がコピペする）。

## 使い方

最初に1回だけ。

```bash
cd lead
python3 scripts/generate_utm_links.py   # data/utm_links.json を作る
```

あとは毎日これだけ。

```bash
python3 scripts/daily_post_generator.py            # 今日ぶん・X向け
cat output/$(date +%F)_post.md                     # 中身を見て
                                                   # X / note / Zenn へコピペ
```

投稿先を変えるとき、日付を指定するとき、下書きだけ見たいとき。

```bash
python3 scripts/daily_post_generator.py --platform note
python3 scripts/daily_post_generator.py --date 2026-08-20
python3 scripts/daily_post_generator.py --dry-run   # 画面に出すだけ。ネタは消費しない
python3 scripts/daily_post_generator.py --variant b # CTA を手で指定する
```

テスト（pip 不要）。

```bash
python3 test_lead.py
```

## 中身

```
lead/
├ scripts/
│  ├ config.py                 設定。変えたいものは全部ここにある
│  ├ generate_utm_links.py     UTM付きリンクを作る
│  └ daily_post_generator.py   ネタ帳から1件選んで投稿の下書きを作る
├ data/
│  ├ terms_bank.csv            ネタ帳（人が書き足す）
│  ├ utm_links.json            生成物。手で編集しない
│  └ post_log.csv              いつ・どこへ・A/Bどっち・どのネタ を記録（初回実行で作られる）
├ output/                      YYYY-MM-DD_post.md（git には入れない）
└ test_lead.py
```

`scripts/config.py` を直せば、リンク先・キャンペーン名・投稿先・CTA の文面が全部変わる。
他のファイルは触らなくてよい。

## ネタ帳（`data/terms_bank.csv`）の書き方

| 列 | 中身 |
| --- | --- |
| `id` | 何でもよい。`t001`（用語）/ `c001`（コマンド）で分けている |
| `category` | `用語` か `コマンド`。この2つを交互に選ぶ |
| `title` | 投稿の1行目 |
| `body` | 本文。**改行は `\n`（バックスラッシュ + n の2文字）で書く** |
| `used_flag` | `false` で未使用。使われると `true` に変わる |

CSV を1行1件で保つため、本文の改行は `\n` と書く。スマホからでも編集できる形にしてある。

いま入っているのは Claude Code の用語10件・コマンド10件。**そのまま使えるが、差し替え前提。**
note / Zenn の既存記事から流用する場合は、この列の形に直して貼り替える（下の「決めていないこと」参照）。

X の文字数上限を超えそうなときは、生成のあとに警告が出る（切り詰めはしない）。
いま入っている20件はすべて上限内に収まっている。

## A/B の測り方

CTA は2種類ある。

| | 文面 | 狙い |
| --- | --- | --- |
| A | 業務の自動化・仕組み化のご相談はこちら → | 事業者 |
| B | もっと知りたい方はこちら → | 個人学習者 |

**平日ごとに A → B → A … と交互に切り替わる**（土日は直前の平日と同じ）。
起点は `config.py` の `AB_EPOCH`。手で指定したいときは `--variant`。

A と B のクリックを分けて数えるため、リンクに `utm_content=cta_a` / `cta_b` を付けている。
仕様書には無いパラメータだが、これが無いと「A/B別クリック数」を出せない。
A/B をやめるなら `utm_links.json` の `url`（`utm_content` 無し）を使えばよい。

```
…/contact/?utm_source=x&utm_medium=sns&utm_campaign=claudecode_series&utm_content=cta_a
```

**注意：クリック数そのものは、この道具では取れない。**
数えるのは無料相談ページ（`todo-llc.netlify.app/contact/`、このリポジトリの外）側の
アクセス解析。そこに解析が入っていない間は、UTM を付けても記録は残らない。
月末の集計スクリプトを仕様書が想定しているが、**集計元のデータが無いので作っていない。**
`data/post_log.csv` には「どの日にどちらを出したか」が残るので、
解析側のデータが取れるようになれば、そこと突き合わせて数えられる。

## 決めていないこと（仕様書の「未確定・要判断」）

1. **ネタ帳の元データ** — note / Zenn の既存30語+16語をそのまま流用するかは未決。
   このリポジトリにその原稿が無いため、**新しく20件書いて仮置きしてある。**
   流用するなら `data/terms_bank.csv` を丸ごと差し替える（スクリプトは変えなくてよい）。
2. **投稿先** — いまは X / note / Zenn すべて同じ本文を作れるが、`--platform` で1件ずつ。
   note / Zenn 向けに長い原稿を自動生成する形にはしていない（X の短文が前提）。
3. **週1タスク**（フォームの「きっかけ」設問、人気用語まとめ投稿）は未着手。
   前者は `hp/` 側のフォームを直す話なので、この道具の外。

## なぜ自動投稿にしていないか

- 誤爆が取り消せない（このリポジトリの決まり：取り消せない操作の前に人を挟む）
- 予約投稿APIは無料枠が細く、将来の課金につながる

投稿は人が見てからコピペする。ここを自動化したくなったら、まず相談する。
