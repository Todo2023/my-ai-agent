# 経営者・研究者マッチング

プロフィールを登録してもらい、相性の良い相手と「会う理由」「初回メッセージ案」を
AIが下書きし、**人が直して承認したものだけ**を相手に送る仕組み。

| | |
| --- | --- |
| 登録フォーム | https://todo2023.github.io/my-ai-agent/hp/match/ |
| 管理画面（身内用） | https://todo2023.github.io/my-ai-agent/hp/match/admin/ |

会社トップ（`../index.html`）には手を入れていない。

## 全体の流れ

```
  登録者                     管理画面（身内）                  相手
    │                            │                            │
    │ ① フォームで登録 ─────────▶ profiles に保存             │
    │                            │                            │
    │                            │ ② 「相手を探す」を押す      │
    │                            │    → Claude API（有料）    │
    │                            │    → matches に pending    │
    │                            │                            │
    │ ◀── ③ 確認依頼メール ───── │                            │
    │ ──── 返事（修正・承認）───▶ │                            │
    │                            │ ④ 承認（approved）         │
    │                            │ ────── ⑤ 送信 ───────────▶ │
```

**②で作ったものは、④を通るまで相手に届かない。** これがこの仕組みの前提（Human-in-the-loop）。

## ファイル

| | |
| --- | --- |
| `index.html` | 登録フォーム。入力欄の `name` が DB のカラム名 |
| `config.js` | **接続先の設定。ここだけ直せば全部に効く** |
| `form.css` / `form.js` | フォームの見た目と、入力チェック・下書き保存・送信 |
| `admin/` | 管理画面（一覧・生成・承認・送信） |
| `../../supabase/schema.sql` | テーブルとRLSの定義。SQL Editor に貼る |
| `../../supabase/functions/generate-matches/` | Claude API を呼ぶサーバー側の処理 |

見た目とメニューは、全ページ共通の `../style.css` と `../app.js` をそのまま使っている。

## 入力項目とカラムの対応

CLAUDE.md のデータスキーマと 1:1。フォームの5セクションが、そのまま表の5区分。

| セクション | カラム | 必須 | 入力欄 |
| --- | --- | --- | --- |
| 1 基本情報 | `name` `organization` `title` `industry` `email` `region` | 必須 | 1行テキスト |
| | `org_size` | 任意 | 選択（4段階） |
| 2 プロフィール | `background` `current_work` `strengths` | 必須 | 複数行（20文字以上） |
| 3 会いたい相手像 | `target_profile` | 必須 | 複数行（15文字以上） |
| | `purpose_tags` | 必須 | チェックボックス（複数可・8種） |
| | `purpose_other` | 任意 | 1行テキスト |
| 4 意味的マッチング | `pain_points` `near_term_goals` `offerable_resources` | 任意 | 複数行 |
| 5 運用同意 | `ai_consent` | 必須 | チェックボックス（真偽値） |
| | `visibility` | 必須 | ラジオ（3択） |
| | `ai_consent_note` `visibility_note` | 任意 | 1行テキスト |

**項目を増やすときは、3つを必ずそろえる。**

1. `index.html` に `<input name="カラム名">` を足す
2. `form.js` の `FIELDS` に足す
3. `supabase/schema.sql` の `profiles` にカラムを足す

自由記述に最低文字数を入れてあるのは、短すぎるとマッチングの判定ができないため。
数字は `form.js` の `FIELDS` にある。

## いまの状態

**`config.js` が空なので、まだどこにもつながっていない。**

- 登録フォーム … 入力チェックまで動く。送信しても保存はされず、送る予定の内容が表示されるだけ
- 管理画面 … 「まだつないでいません」と出る
- **現時点の費用はゼロ**

## 費用

| | |
| --- | --- |
| GitHub Pages（配信） | 無料 |
| Supabase | 無料プランの範囲。有料プランには切り替えない |
| **Claude API** | **従量課金。ここだけお金がかかる** |
| メール送信 | `mailto:`（端末のメールアプリを開くだけ）なので費用ゼロ |

Claude API の目安は **1回の生成で $0.05〜0.15（8〜20円）程度**。
登録10名規模の検証なら、総額で数百円のオーダー。

歯止めとして次を入れてある（決まりは `../../CLAUDE.md`）。

1. APIキーはサーバー側（Edge Function の環境変数）だけ。ブラウザには置かない
2. 自動実行なし。管理画面のボタンを押したときだけ動く
3. 1回の照合人数（12名）と生成件数（3件）に上限
4. `max_tokens` を明示
5. 使用量を `generation_logs` に必ず記録（失敗した回も記録する）
6. 押す前に「何名と照合するか・概算いくらか」を出して確認する

**Anthropic のコンソールで月額上限を設定しておくこと。** これが最後の砦になる。

## つなぐ手順

### 1. Supabase（無料プラン・カード登録不要）

1. プロジェクトを作る
2. SQL Editor に [`../../supabase/schema.sql`](../../supabase/schema.sql) を貼って実行
3. 続けて、自分のメールアドレスを管理者に入れる

```sql
insert into admins (email, note) values ('あなた@example.com', '代表');
```

4. Project Settings > Data API から **Project URL** と **anon public** キーを控える

### 2. `config.js` を埋める

```js
window.TODO_MATCH_CONFIG = {
  SUPABASE_URL: "https://xxxxxxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi..."
};
```

anon キーはブラウザから見える。それで正しい。読み取りは RLS で止めてある。
**service_role キーは絶対に書かない。**

この時点で登録フォームは動く。管理画面のログインには次の設定が要る。

### 3. 管理画面のログインを通す

Authentication > URL Configuration の **Redirect URLs** に管理画面のURLを足す。

```
https://todo2023.github.io/my-ai-agent/hp/match/admin/
```

ログインは「メールで届いたリンクを開く」方式。パスワードは持たない。

### 4. Claude API をつなぐ（タスク3）

Supabase CLI から Edge Function を置く。

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy generate-matches
```

`ANTHROPIC_API_KEY` はここにしか置かない。リポジトリにも `config.js` にも書かない。

### 5. つないだあとに確認すること

- [ ] フォームから登録できる（Table Editor に行が増える）
- [ ] **anon キーで `select * from profiles` を叩くと 0 行**（＝他人には読めない）
- [ ] `purpose_tags` が配列として入っている
- [ ] 通信を切って送信 → 失敗メッセージが出て、下書きが残る
- [ ] 管理画面にログインできる。`admins` にないアドレスでは入れない
- [ ] 「相手を探す」→ 確認ダイアログで **やめると費用が発生しない**
- [ ] 生成後、`generation_logs` に使用量が記録されている
- [ ] 承認前のマッチは「相手に送る」が押せない

## 削除・修正の依頼が来たときの手順

フォームに「削除のご希望はいつでも承ります」「理由をうかがうことはありません」と
書いてある（`index.html`）。**約束した以上、受け口と手順を決めておく。**

### 誰がどこで受けるか

- **受け口：登録メールアドレスからの連絡**（フォームにそう書いてある）
- **受けるのは代表。** 管理画面に入れるのは `admins` に入れたアドレスだけなので、
  実際に消せるのも代表だけ
- 本人確認は「**登録時のメールアドレスと、依頼メールの差出人が一致すること**」で足りる。
  別のアドレスから来た場合は、登録アドレス宛に折り返して確認する

### 削除の手順（Supabase Table Editor で行う）

1. Supabase の **Table Editor > `profiles`** を開く
2. `email` で該当の行を探す
3. **その行を削除する**

これだけでよい。関連データは追いかけなくても消える。

| | どうなるか | 根拠 |
| --- | --- | --- |
| `matches`（マッチ結果・AIの下書き文面） | **一緒に消える** | `from_profile` / `to_profile` が `on delete cascade`（`supabase/schema.sql`） |
| `generation_logs`（実費の記録） | 行は残るが `from_profile` が **NULL になる** | `on delete set null`。このテーブルは**トークン数と費用だけ**で、本人の情報を持たない |

**相手側に届いているマッチは戻せない。** 承認して送信済み（`status = 'sent'`）のものは、
相手の手元にメールとして残る。削除依頼を受けたら、
**まだ送っていないものは消える／送ったものは取り消せない**ことを正直に伝える。

### 「消す」ではなく「止める」場合

退会ではなく「しばらく紹介を止めたい」なら、削除せずに `profiles.status` を変える。

| 値 | 意味 |
| --- | --- |
| `active` | 通常。マッチ生成の対象 |
| `paused` | 一時停止。本人の希望で紹介を止めている |
| `withdrawn` | 退会。データは残すが対象外にする |

**どれを使うかは本人に確認してから決める。**
「削除してください」と言われたら、勝手に `withdrawn` で済ませない。**行ごと消す。**

### 修正の依頼

Table Editor で該当セルを直す。本人から届いた文面をそのまま入れる。
こちらで言い回しを整えない（本人の言葉が、そのままマッチングの材料になるため）。

### 記録

やりとりは代表のメールボックスに残る。**別途の台帳は作らない**（作ると、
消したはずの個人情報がそちらに残るため）。

---

## 動作確認（手元）

```bash
python3 -m http.server 8000
# 登録フォーム   → http://localhost:8000/hp/match/
# 管理画面       → http://localhost:8000/hp/match/admin/
```

スマホ幅（390px）とPC幅（1280px）で横スクロールが出ないこと、
未入力のまま送信すると必須13項目が赤くなることは確認済み。

## 公開前にやること

- [ ] `index.html` 冒頭の `<div class="demo-bar">`（テスト運用中の帯）を、実情に合わせて直すか消す
- [ ] フッターの「このページは検証中の受付です。」を直す
- [ ] 問い合わせ先を決める。いまは「ご登録のメールアドレスからご連絡ください」としか書いていない
- [ ] 会社トップからリンクするなら、`../index.html` の事業一覧に枠を足す

`<meta name="robots" content="noindex, nofollow">` は**公開後も外さない**。
登録フォームも管理画面も、検索結果に出す必要はない。
