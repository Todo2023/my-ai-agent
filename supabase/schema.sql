-- ============================================================
--  経営者・研究者マッチング　データベース定義
--
--  Supabase の SQL Editor に貼って、上から順にそのまま実行する。
--  何度実行しても壊れないように書いてある（if not exists / drop policy）。
--
--  無料プランの範囲で動く。有料の拡張は使っていない。
--
--  ここで守っていること
--   ・個人情報は anon キーでは1行も読めない（挿入だけ許可）
--   ・管理者だけが読める。管理者は admins テーブルで決める
--   ・マッチング結果は、本人が承認するまで status = 'pending' のまま
-- ============================================================


-- ------------------------------------------------------------
-- 1. 管理者
--    ここに入れたメールアドレスの人だけが、管理画面で中身を見られる。
--    ⚠️ 最初に自分のアドレスを1行入れること（入れないと誰も読めない）
-- ------------------------------------------------------------
create table if not exists admins (
  email      text primary key,
  note       text,
  created_at timestamptz not null default now()
);

-- 例：insert into admins (email, note) values ('you@example.com', '代表');

alter table admins enable row level security;
-- admins 自体には誰にもポリシーを与えない＝ anon からも認証ユーザーからも読めない。
-- 判定は下の is_admin() が security definer で行う。

-- ログイン中の人が管理者かどうか。
-- security definer なので、admins を読む権限が本人になくても判定できる。
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from admins
    where email = nullif(current_setting('request.jwt.claims', true), '')::json ->> 'email'
  );
$$;


-- ------------------------------------------------------------
-- 2. プロフィール（登録フォームの保存先）
--    カラム名は hp/match/index.html の input name と 1:1
-- ------------------------------------------------------------
create table if not exists profiles (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),

  -- セクション1：基本情報
  name                text not null,
  organization        text not null,
  title               text not null,
  industry            text not null,
  org_size            text,
  email               text not null,
  region              text not null,

  -- セクション2：プロフィール
  background          text not null,
  current_work        text not null,
  strengths           text not null,

  -- セクション3：会いたい相手像
  target_profile      text not null,
  purpose_tags        text[] not null default '{}',
  purpose_other       text,

  -- セクション4：意味的マッチング（任意）
  pain_points         text,
  near_term_goals     text,
  offerable_resources text,

  -- セクション5：運用同意
  ai_consent          boolean not null default false,
  ai_consent_note     text,
  visibility          text not null,
  visibility_note     text,

  -- 運用用（フォームからは送られない）
  status              text not null default 'new'
                        check (status in ('new', 'active', 'paused', 'withdrawn')),
  admin_note          text
);

create index if not exists profiles_created_at_idx on profiles (created_at desc);
create index if not exists profiles_status_idx     on profiles (status);

alter table profiles enable row level security;

-- 登録（挿入）だけ、誰でもできる。
-- AI生成に同意していない登録はDB側でも弾く（フォーム側でも必須にしてある）。
drop policy if exists "anyone can register" on profiles;
create policy "anyone can register" on profiles
  for insert to anon, authenticated
  with check (ai_consent = true);

-- 読み取り・更新は管理者だけ。
-- anon 用の select ポリシーを作らない＝ anon キーでは1行も読めない。
drop policy if exists "admin can read profiles" on profiles;
create policy "admin can read profiles" on profiles
  for select to authenticated
  using (is_admin());

drop policy if exists "admin can update profiles" on profiles;
create policy "admin can update profiles" on profiles
  for update to authenticated
  using (is_admin()) with check (is_admin());


-- ------------------------------------------------------------
-- 3. マッチング結果（Claude API が作る下書き置き場）
--    ★ 本人が承認するまで、ここから外に出さない
-- ------------------------------------------------------------
create table if not exists matches (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),

  -- 「誰に」「誰を」勧めるか。from_profile 側に送る想定
  from_profile     uuid not null references profiles (id) on delete cascade,
  to_profile       uuid not null references profiles (id) on delete cascade,

  score            int  check (score between 0 and 100),
  reason           text not null,   -- なぜ会うと良さそうか
  message_draft    text not null,   -- 初回メッセージ案（AIの下書き）

  -- Human-in-the-loop
  status           text not null default 'pending'
                     check (status in ('pending', 'approved', 'rejected', 'sent')),
  approved_message text,            -- 人が直したあとの文面
  decided_at       timestamptz,
  sent_at          timestamptz,

  -- あとで実費と品質を見返すため
  model            text,
  generation_id    uuid,

  constraint matches_not_self check (from_profile <> to_profile),
  constraint matches_unique_pair unique (from_profile, to_profile)
);

create index if not exists matches_status_idx  on matches (status, created_at desc);
create index if not exists matches_from_idx    on matches (from_profile);

alter table matches enable row level security;

-- マッチング結果は個人情報のかたまり。anon には一切触らせない。
drop policy if exists "admin can read matches" on matches;
create policy "admin can read matches" on matches
  for select to authenticated
  using (is_admin());

drop policy if exists "admin can update matches" on matches;
create policy "admin can update matches" on matches
  for update to authenticated
  using (is_admin()) with check (is_admin());

-- 挿入は Edge Function（service_role）だけが行う。
-- service_role は RLS を通らないので、insert のポリシーは作らない。


-- ------------------------------------------------------------
-- 4. 生成ログ（Claude API の実費を、あとから確認するため）
--    ★ CLAUDE.md の決まり「毎回のトークン使用量を記録する」がこれ
-- ------------------------------------------------------------
create table if not exists generation_logs (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  from_profile      uuid references profiles (id) on delete set null,
  model             text not null,
  input_tokens      int  not null default 0,
  output_tokens     int  not null default 0,
  candidates        int  not null default 0,  -- 何人と照合したか
  matches_created   int  not null default 0,  -- 何件できたか
  est_cost_usd      numeric(10, 5),           -- 概算（単価は関数側で持つ）
  stop_reason       text,
  error             text
);

create index if not exists generation_logs_created_at_idx on generation_logs (created_at desc);

alter table generation_logs enable row level security;

drop policy if exists "admin can read logs" on generation_logs;
create policy "admin can read logs" on generation_logs
  for select to authenticated
  using (is_admin());


-- ------------------------------------------------------------
-- 5. 今月の実費（管理画面のトップに出す）
-- ------------------------------------------------------------
create or replace view monthly_cost
with (security_invoker = true) as
  select
    date_trunc('month', created_at)   as month,
    count(*)                          as runs,
    sum(input_tokens)                 as input_tokens,
    sum(output_tokens)                as output_tokens,
    round(sum(est_cost_usd), 4)       as est_cost_usd
  from generation_logs
  group by 1
  order by 1 desc;


-- ============================================================
--  流したあとの確認（どちらも「0行」が正解）
--
--   -- anon キーで叩いて、1行も返らないこと
--   select * from profiles;   -- 管理者としてログインしていなければ 0行
--   select * from matches;    -- 同上
--
--  admins に自分のアドレスを入れ忘れると、自分でも0行になる。
--  そのときは SQL Editor（service_role 権限）から insert すればよい。
-- ============================================================
