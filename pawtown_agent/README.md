# Pawtown（仮）マッチングエージェント

犬猫の飼い主向けAIマッチングコミュニティのMVP実装。
Googleフォームで集めたプロフィールから、**似た犬種・似た悩みを持つ飼い主**を探し、
**双方の承認を取ってから**メールで引き合わせる。

運営: 合同会社To do

## 5分で動きを見る（Supabase・APIキー不要）

```bash
pip install -r requirements.txt
export DEMO_MODE=1

python cli.py members                       # ダミー会員5名
python cli.py match mocha@example.com       # マッチ候補とその理由
python cli.py match mocha@example.com --send  # 承認依頼メールの文面まで（送信はしない）
python cli.py pending                       # 承認待ち一覧
python cli.py respond <ID> a yes            # 片方が承認 → まだ紹介しない
python cli.py respond <ID> b yes            # 両方揃った → 紹介メール
python cli.py stats
```

`DEMO_MODE=1` の間、メールは送信されず、内容が表示されるだけ。
コマンドをまたいで続きを試せるよう、マッチは `.demo_state.json` に保存される
（消せば初期状態に戻る。保存先は `PAWTOWN_DEMO_STATE` で変えられる）。

## 設計の要点

### どこをLLMに任せ、どこを決定的に固めるか

| 処理 | 担当 | 理由 |
| --- | --- | --- |
| フォーム回答の正規化 | `models.py`（コード） | 実行のたびにタグが変わるとスコアが再現しない |
| 候補の絞り込みとスコアの土台 | `scoring.py`（コード） | 犬種一致・悩みの重なりはコードで確実に書ける。全会員をLLMに渡すとトークン代と遅延が会員数に比例する |
| 上位候補の順位付けと紹介理由の文章 | `matcher.py`（LLM） | 「なぜ合いそうか」を日本語で書くのはLLMが得意 |
| 承認状態の遷移 | `flow.py`（コード） | 誤ると個人情報が漏れる。LLMには触らせない |
| メール文面の骨格 | `notify.py`（テンプレート） | LLMが書くのはマッチ理由の1〜2文だけ |

スコアは内訳付きで返す（`scoring.score()` の `breakdown`）。
マッチ精度が悪かったとき、候補の絞り込みが悪いのかプロンプトが悪いのかを切り分けるため。

配点は `scoring.WEIGHTS` の1か所にまとめてある（悩みの重なり35点・種別25点・犬種20点・エリア15点・性格5点）。
試験運用の結果を見てここを調整する。

### 個人情報の扱い

- LLMに渡すプロフィールにメールアドレスを含めない（`Member.to_prompt_dict`）
- **双方が承認するまで、相手のメールアドレスは相手に渡さない**。承認依頼は必ず個別送信で、
  両者が同じ宛先欄に並ぶのは `status = matched` になった紹介メールだけ
- 断られた事実は相手に通知しない
- 送信の直前に必ず人間の y/N を挟む（`notify.set_confirm_hook`）
- Supabaseは RLS を有効化し、`members` / `matches` は anon キーで読めない。
  公開ダッシュボードが読むのは件数だけの `dashboard_stats` ビュー

この4点はテストで固定してある（`test_pawtown.py` の「承認フロー」節）。

### 承認フローの状態遷移

```
pending ──(aが承認)──> approved_a ──(bが承認)──> matched → 紹介メール送信
   │    └─(bが承認)──> approved_b ──(aが承認)──> matched
   └──(どちらかが拒否)────────────────────────> rejected（相手には通知しない）
```

二重返信や確定後の返信は状態を動かさない（`flow.next_status`）。

## 本番セットアップ

### 1. Supabase

無料枠でプロジェクトを作り、SQL Editor で `schema.sql` を実行する。
`SUPABASE_URL` / `SUPABASE_SERVICE_KEY`（service_role）/ `SUPABASE_ANON_KEY` を控える。

### 2. Googleフォーム

次の項目で作る（質問文は `apps_script/form_to_supabase.gs` の `QUESTIONS` と一致させる）。

| 質問文 | 形式 | 必須 |
| --- | --- | --- |
| ニックネーム | 記述式 | ✓ |
| メールアドレス | 記述式（メール形式） | ✓ |
| ペットの種類 | ラジオ（犬 / 猫） | ✓ |
| 犬種・猫種 | 記述式 | |
| ペットの年齢 | 記述式 | |
| ペットの性格（複数選択可） | チェックボックス | |
| 悩んでいること（複数選択可） | チェックボックス（しつけ / 健康 / 留守番 / 多頭飼い / 老犬老猫ケア …） | |
| お住まいのエリア（都道府県・市区町村） | 記述式 | |

フォームの冒頭にプライバシーポリシーへのリンクと、
「マッチングのためにプロフィールを他の会員に提示すること」への同意を明記すること。

### 3. Apps Script（フォーム → Supabase）

`apps_script/form_to_supabase.gs` を回答スプレッドシートの Apps Script に貼り、
スクリプト プロパティに `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` を登録して
`installTrigger()` を1回実行する。以降、回答が入るたびに members へ upsert される。

### 4. マッチングの実行

```bash
cp .env.example .env    # 値を埋める
python cli.py round     # まだ候補が出ていない会員をまとめて処理
```

最初のうちは `PAWTOWN_EMAIL_DRY_RUN=1` を付けて文面だけ確認するのが安全。
定期実行はまず手動、運用が固まったら cron / GitHub Actions に載せる
（Netlify Functions でも動くが、無料枠の実行時間に注意）。

### 5. 返信の記録

承認依頼メールへの「はい / いいえ」の返信を見て、次を実行する。

```bash
python cli.py respond <マッチIDの先頭8桁> a yes
python cli.py respond <受付番号> yes          # 受付番号ならa/bの指定は不要
```

受付番号は `matches.token_a / token_b` の先頭8桁。
将来ワンクリック承認リンクにする場合は、Netlify Function から
`flow.respond_by_token(token, approved)` を呼べばよい。

### 6. ダッシュボード

```bash
python dashboard.py                       # 端末に件数を表示
python dashboard.py --html public/index.html   # Netlifyに置く静的HTML
```

書き出したHTMLは、読み込み時に `dashboard_stats` ビューを anon キーで読む。
**service_role キーはHTMLに埋めないこと**（`dashboard.py` は anon キーしか使わない）。

## コスト

| 項目 | 費用 |
| --- | --- |
| Netlify / Supabase / Googleフォーム / Gmail | 無料枠 |
| LLM API | 唯一の変動費。1人あたり1回の呼び出しで、候補は最大10名分しか渡さない |

ハンドオフ資料ではClaude APIを指定しているが、本実装は既存の `travel_agent` /
`meeting_agent` と揃えて無料枠のあるGemini APIを使っている（ゼロコスト制約を優先）。
LLM呼び出しは `matcher._call_llm()` の1か所だけなので、Claude APIに戻す場合はここを差し替える。
プロンプトは資料の案をそのまま使っている（`matcher.PROMPT_TEMPLATE`）。

`GEMINI_API_KEY` が未設定でも動く。その場合、マッチ理由は共通タグから機械的に組み立てる
（文章は硬くなるが、フローの検証はできる）。

## テスト

```bash
pytest
```

ネットワークもAPIキーも使わない。スコアリングの単調性、LLMが存在しないIDを返したときの
取り扱い、承認が揃う前にメールアドレスが漏れないこと、などを固定している。

## 実装状況（ハンドオフ資料 5. のタスクリスト）

- [x] 1. プロフィール収集フォーム … 項目と設問文を定義（フォーム自体はGoogleフォーム側で作成）
- [x] 2. Supabaseスキーマ … `schema.sql`
- [x] 3. Apps Script: フォーム回答 → Supabase … `apps_script/form_to_supabase.gs`
- [x] 4. マッチングロジック … `scoring.py` + `matcher.py`
- [x] 5. 承認依頼メールのテンプレートと送信フロー … `notify.py` + `flow.py`
- [x] 6. 簡易管理ダッシュボード … `dashboard.py`
- [ ] 7. テストユーザー5〜10名での試験運用 … 未実施

### 7の進め方（案）

1. `DEMO_MODE=1` で一連の流れを社内で1回通す
2. 実データ5〜10名を登録し、`PAWTOWN_EMAIL_DRY_RUN=1` で全員分の文面を目視確認
3. ドライランを外して送信。承認率と、成立後にやりとりが続いたかを記録する
4. 外れた候補について `scoring.score()` の内訳を見て、配点かプロンプトかを切り分ける

## 未実装（Phase 2 以降）

- メールのワンクリック承認（現状は返信を見て `respond` を手で叩く）。
  `flow.respond_by_token()` を呼ぶだけの Netlify Function を足せば実現できる
- 定期実行の自動化（現状は `python cli.py round` を手動）
- 不成立後の次候補の自動提示（現状は `python cli.py match <email>` を再実行）
- マッチング後の継続的な交流機能、悩みカテゴリ別のAIコンシェルジュ、SNS集客導線

## ファイル構成

```
models.py     フォーム回答の正規化と Member / Match の型
scoring.py    決定的な事前スコアリング（配点・犬種グループ・都道府県マップ）
matcher.py    LLMによる最終順位付けとマッチ理由の生成
store.py      Supabase REST（DEMO_MODE=1 ならメモリ上のダミー）
notify.py     メール文面と送信（確認フック・ドライラン）
flow.py       承認フローの状態遷移
cli.py        運用コマンド
dashboard.py  件数表示 / Netlify用HTMLの書き出し
fakes.py      デモ用ダミーデータ
schema.sql    Supabaseのテーブル・ビュー・RLS
apps_script/  Googleフォーム → Supabase
```
