# 経営者・研究者マッチング　事前登録フォーム

CLAUDE.md の**タスク1（フォームページの実装）**。
プロフィールを登録してもらうための1ページ。ビルド不要・外部の読み込みなし。

**https://todo2023.github.io/my-ai-agent/hp/match/**

会社トップ（`../index.html`）には手を入れていない。このフォルダだけで完結している。

## ファイル

| | |
| --- | --- |
| `index.html` | ページ本体。入力欄の `name` 属性が、そのまま DB のカラム名 |
| `form.css` | このページ専用の見た目（セクションの枠・選択肢・エラー表示） |
| `form.js` | 入力チェック、下書きの自動保存、送信 |

見た目とメニューは、全ページ共通の `../style.css` と `../app.js` をそのまま使っている。
この2つは触っていないので、他のページには影響しない。

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

自由記述に最低文字数を入れてあるのは、短すぎるとマッチングの判定ができないため。
数字は `form.js` の `FIELDS` にある。変えたければそこ1か所。

**項目を増やすときは、3つを必ずそろえる。**

1. `index.html` に `<input name="カラム名">` を足す
2. `form.js` の `FIELDS` に足す
3. `profiles` テーブルにカラムを足す

## いまの状態

**保存先につないでいないので、送信しても登録はされない。**
必須チェックを通ると、「まだ送信していません」という表示と、
Supabase に送る予定の内容（JSON）が出るところまで動く。

入力の途中経過は、その端末の中（localStorage）に自動保存している。
書きかけで閉じても、次に開いたときに戻る。同意のチェックだけは戻さない（毎回ご自身で入れてもらう）。

## 費用

**このページ自体には費用がかからない。** 配信は GitHub Pages、外部の読み込みもない。

この先つなぐものも、無料枠に収める。

| | |
| --- | --- |
| Supabase | 無料プランの範囲で使う。有料プランには切り替えない |
| Claude API（タスク3） | 従量課金。**使う前に見積もりを出して確認する** |
| メール通知（タスク4） | 無料枠のあるサービス、または `mailto:`（費用ゼロ）で済ませる |

課金の決まりはリポジトリ直下の `CLAUDE.md` にまとめてある。**有料になる操作の前は必ず相談すること。**

## 保存先につなぐ（タスク2）

`form.js` の先頭の2行を埋めると、実際に登録されるようになる。

```js
var SUPABASE_URL = "https://xxxxxxxx.supabase.co";
var SUPABASE_ANON_KEY = "eyJhbGciOi...";
```

anon キーはブラウザから見える。**テーブル側で守る**必要がある。
Supabase の SQL Editor で実行する内容（案）：

```sql
create table profiles (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),

  name                text not null,
  organization        text not null,
  title               text not null,
  industry            text not null,
  org_size            text,
  email               text not null,
  region              text not null,

  background          text not null,
  current_work        text not null,
  strengths           text not null,

  target_profile      text not null,
  purpose_tags        text[] not null default '{}',
  purpose_other       text,

  pain_points         text,
  near_term_goals     text,
  offerable_resources text,

  ai_consent          boolean not null default false,
  ai_consent_note     text,
  visibility          text not null,
  visibility_note     text
);

-- 個人情報なので、行単位のアクセス制御を必ず入れる
alter table profiles enable row level security;

-- 登録（挿入）だけ、誰でもできる
create policy "anon can insert" on profiles
  for insert to anon with check (true);

-- 読み取りのポリシーは作らない。
-- ポリシーがなければ anon キーでは1行も読めない（管理側は service_role キーで読む）。
```

`ai_consent` に同意していない登録を DB 側でも弾きたいなら、
`with check (ai_consent = true)` にする。フォーム側でも必須にしてある。

つないだあとに確認すること。

- [ ] 登録できる（Table Editor に行が増える）
- [ ] anon キーで `select` すると 0 行（読めないこと）
- [ ] `purpose_tags` が配列として入っている
- [ ] 通信を切って送信 → 失敗メッセージが出て、下書きが残る

## 動作確認

```bash
python3 -m http.server 8000
# → http://localhost:8000/hp/match/
```

スマホ幅（390px）とPC幅（1280px）で、横スクロールが出ないこと・
未入力のまま送信すると必須13項目が赤くなることを確認済み。

## 公開前にやること

- [ ] `index.html` 冒頭の `<div class="demo-bar">`（テスト運用中の帯）を、実情に合わせて直すか消す
- [ ] フッターの「このページは検証中の受付です。」を直す
- [ ] `form.js` に Supabase の URL とキーを入れる（タスク2）
- [ ] 問い合わせ先を決める。いまは「ご登録のメールアドレスからご連絡ください」としか書いていない
- [ ] 会社トップからリンクするなら、`../index.html` の事業一覧「BUSINESS 03（準備中）」の枠を差し替える

`<meta name="robots" content="noindex, nofollow">` は**公開後も外さない**。
個人情報を入力するページを検索結果に出す必要はない。案内はURLを直接送る形で足りる。
