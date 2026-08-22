-- Pawtown（仮）Supabase スキーマ
-- Supabase の SQL Editor にそのまま貼って実行する。

create extension if not exists "pgcrypto";

-- members: 飼い主プロフィール（Googleフォームの回答が入る）
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  nickname text not null,
  email text not null unique,
  pet_type text not null check (pet_type in ('dog', 'cat')),
  breed text,
  pet_age numeric,
  personality_tags text[] default '{}',  -- 例: ['甘えん坊', '警戒心強め']
  concern_tags text[] default '{}',      -- 例: ['しつけ', '留守番', '多頭飼い']
  area text,                             -- 「東京都世田谷区」のように都道府県から書く
  active boolean not null default true,  -- 退会・一時停止した人はここを false にする
  created_at timestamptz not null default now()
);

-- matches: マッチ候補と、その承認状態
--   status の遷移は flow.py が管理する:
--     pending -> approved_a / approved_b -> matched
--     pending -> rejected（どちらかが断った時点で不成立）
create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  member_a_id uuid not null references members(id) on delete cascade,
  member_b_id uuid not null references members(id) on delete cascade,
  match_score numeric,
  match_reason text,                     -- AIが生成した「なぜマッチしたか」の説明文
  status text not null default 'pending'
    check (status in ('pending', 'approved_a', 'approved_b', 'matched', 'rejected')),
  -- 承認用トークン。将来メールのワンクリック承認リンクにする想定
  token_a text not null default encode(gen_random_bytes(16), 'hex'),
  token_b text not null default encode(gen_random_bytes(16), 'hex'),
  asked_at timestamptz,                  -- 承認依頼メールを送った時刻
  responded_at timestamptz,              -- 最後に賛否が入った時刻
  created_at timestamptz not null default now()
);

-- 同じ2人を何度も候補に出さないための一意制約。
-- member_a_id < member_b_id の順で入れる前提（store.py 側で並べ替えている）。
create unique index if not exists matches_pair_uniq
  on matches (member_a_id, member_b_id);

create index if not exists matches_status_idx on matches (status);
create index if not exists members_active_idx on members (active);

-- RLS: anon キーで直接読み書きさせない。
-- 書き込みは Apps Script / バッチ（service_role キー）からのみ行う。
alter table members enable row level security;
alter table matches enable row level security;

-- ダッシュボードが件数だけを anon キーで読めるようにするビュー。
-- 個人情報（メールアドレス等）は一切含めない。
create or replace view dashboard_stats as
select
  (select count(*) from members where active) as member_count,
  (select count(*) from matches where status = 'matched') as matched_count,
  (select count(*) from matches
     where status in ('pending', 'approved_a', 'approved_b')) as awaiting_count,
  (select count(*) from matches where status = 'rejected') as rejected_count;

grant select on dashboard_stats to anon;
