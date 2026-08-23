-- Pawtown（仮）Supabase スキーマ（ハンドオフ資料 v2 対応）
-- Supabase の SQL Editor にそのまま貼って実行する。
-- v1 から動かす場合は、末尾の「v1からの移行」を参照。

create extension if not exists "pgcrypto";

-- members: 飼い主とペットのプロフィール（Googleフォームの回答が入る）
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  nickname text not null,
  email text not null unique,
  pet_name text not null,                -- 物語の主役名。UI上はこの名前で人格化して表示
  pet_type text not null check (pet_type in ('dog', 'cat')),
  breed text,
  pet_age numeric,
  personality_tags text[] default '{}',  -- 例: ['甘えん坊', '警戒心強め']
  concern_tags text[] default '{}',      -- 例: ['しつけ', '留守番', '多頭飼い']
  area text,                             -- 「東京都世田谷区」のように都道府県から書く
  default_post_type text not null default 'B'
    check (default_post_type in ('A', 'B', 'C')),  -- 初回に選んだ方式を既定として覚える
  points int not null default 0,         -- 継続投稿のポイント（付与ルールは未定）
  active boolean not null default true,  -- 退会・一時停止した人はここを false にする
  created_at timestamptz not null default now()
);

-- posts: 投稿本体。category が「町のどの施設に貼られるか」を表す。
--   showcase … ひろば（うちの子紹介）  AIがペット目線の物語を書く
--   question … そうだん所（質問・相談）飼い主の言葉をそのまま残す
--   learn    … まなび舎（学び）        同上
--   goods    … マーケット（グッズ共有）同上
--   raw_input には生成のもとになった入力を必ず残す。
--   方式Bは回答、方式Aは飼い主の一言、方式Cは画像から取り出した情景。
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  category text not null default 'showcase'
    check (category in ('showcase', 'question', 'learn', 'goods')),
  post_type text not null check (post_type in ('A', 'B', 'C')),
  title text,                            -- 一覧に出す見出し（質問・学び・グッズで使う）
  question text,                         -- 方式Bで出した質問。後から質問の当たり外れを見る
  raw_input text,
  generated_story text not null,         -- 表示する本文
  created_at timestamptz not null default now()
);

create index if not exists posts_member_idx on posts (member_id, created_at desc);
create index if not exists posts_created_idx on posts (created_at desc);
create index if not exists posts_category_idx on posts (category, created_at desc);

-- matches: マッチ候補と、その承認状態（副次機能）
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
alter table posts enable row level security;
alter table matches enable row level security;

-- ダッシュボードが件数だけを anon キーで読めるようにするビュー。
-- 個人情報（メールアドレス等）は一切含めない。
create or replace view dashboard_stats as
select
  (select count(*) from members where active) as member_count,
  (select count(*) from posts) as post_count,
  (select count(*) from posts where category = 'showcase') as showcase_count,
  (select count(*) from posts where category = 'question') as question_count,
  (select count(*) from posts where category = 'learn') as learn_count,
  (select count(*) from posts where category = 'goods') as goods_count,
  (select count(*) from posts where created_at > now() - interval '7 days') as post_count_7d,
  (select count(distinct member_id) from posts
     where created_at > now() - interval '7 days') as active_writer_count,
  (select count(*) from matches where status = 'matched') as matched_count,
  (select count(*) from matches
     where status in ('pending', 'approved_a', 'approved_b')) as awaiting_count,
  (select count(*) from matches where status = 'rejected') as rejected_count;

grant select on dashboard_stats to anon;

-- 公開フィード用のビュー。物語とペット名だけを出し、飼い主は特定させない。
-- （公開ページを作る段階で anon に grant する。既定では付けない）
create or replace view public_feed as
select p.id, p.created_at, p.category, p.title, p.generated_story,
       m.pet_name, m.pet_type, m.breed, m.area
from posts p join members m on m.id = p.member_id
where m.active
order by p.created_at desc;

-- --------------------------------------------------------------------------
-- v1 から移行する場合（members / matches が既にある場合）はこちらを実行する。
--
--   alter table members add column if not exists pet_name text;
--   update members set pet_name = coalesce(pet_name, nickname) where pet_name is null;
--   alter table members alter column pet_name set not null;
--   alter table members add column if not exists default_post_type text not null default 'B';
--   alter table members add column if not exists points int not null default 0;
--   -- posts を作成済みの場合はカテゴリ列を足す
--   alter table posts add column if not exists category text not null default 'showcase';
--   alter table posts add column if not exists title text;
--   -- そのうえで、上のインデックスとビューの作成を流す
-- --------------------------------------------------------------------------
