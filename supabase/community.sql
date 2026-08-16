-- ============================================================
--  コミュニティ（ハタラク文庫 / えほんの棚）データベース定義
--
--  Supabase の SQL Editor に貼って、上から順にそのまま実行する。
--  何度実行しても壊れないように書いてある（if not exists / drop policy）。
--
--  無料プランの範囲で動く。有料の拡張は使っていない。
--  設計の意図は sekkei/README.md（共通）と sekkei/platform-*.md にある。
--
--  ── ここで守っていること ──
--   ・下書きと審査待ちは、書いた本人と管理者以外には1行も見えない
--   ・子ども向け（site = 'ehon'）は、人が通すまで公開されない。
--     これはアプリ側ではなく、このファイルの中で止めている
--   ・招待された人だけが書ける（invites に載っているメールアドレス）
--   ・匿名（anon）キーで消せるものは何もない
--
--  ⚠️ hp/match/ の schema.sql とは別のファイル。あちらと同居してよい
--     （admins テーブルだけは共用する。なければここで作る）
-- ============================================================


-- ------------------------------------------------------------
-- 0. 管理者
--    hp/match/ の schema.sql を先に流していれば、すでにある。
--    ここでは「なければ作る」だけにしてある。
--    ⚠️ 最初に自分のアドレスを1行入れること（入れないと審査ができない）
-- ------------------------------------------------------------
create table if not exists admins (
  email      text primary key,
  note       text,
  created_at timestamptz not null default now()
);

-- 例：insert into admins (email, note) values ('you@example.com', '代表');

alter table admins enable row level security;

-- ログイン中の人のメールアドレス。何度も使うので関数にしておく
create or replace function jwt_email()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true), '')::json ->> 'email';
$$;

-- security definer なので、admins を読む権限が本人になくても判定できる
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from admins where email = jwt_email());
$$;


-- ------------------------------------------------------------
-- 1. 招待
--    Phase 1 は招待制。ここに載っているアドレスの人だけが書ける。
--    「誰でも書ける」に変えるのは、荒れ方を見てから（sekkei/platform-marketing.md）
-- ------------------------------------------------------------
create table if not exists invites (
  email      text primary key,
  site       text not null check (site in ('biz', 'ehon', 'both')),
  note       text,
  created_at timestamptz not null default now()
);

alter table invites enable row level security;
-- 誰にも読ませない。判定は下の can_write() が security definer で行う

create or replace function can_write(target_site text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_admin() or exists (
    select 1 from invites
    where email = jwt_email()
      and (site = target_site or site = 'both')
  );
$$;


-- ------------------------------------------------------------
-- 2. プロフィール
--    ログインした人が1つ持つ。公開されるのは表示名まわりだけ
-- ------------------------------------------------------------
create table if not exists profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  handle     text unique not null check (handle ~ '^[a-z0-9][a-z0-9_-]{1,29}$'),
  display_name text not null,
  bio        text,
  links      text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

drop policy if exists "profiles are public" on profiles;
create policy "profiles are public"
  on profiles for select
  using (true);

drop policy if exists "own profile insert" on profiles;
create policy "own profile insert"
  on profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "own profile update" on profiles;
create policy "own profile update"
  on profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ------------------------------------------------------------
-- 3. 作品（記事・絵本を1つの表で持つ）
--
--    site で2つのサービスを分ける。無料プランはプロジェクトを2つまでしか
--    作れないので、1つのDBに同居させる（sekkei/README.md）。
--
--    status は4つ。
--      draft     … 書いている途中。本人と管理者だけが見える
--      review    … 審査待ち。本人と管理者だけが見える
--      published … 公開。誰でも見える
--      rejected  … 差し戻し。本人と管理者だけが見える
--
--    マーケ版は review を素通ししてよいが、
--    **子ども版は人が通すまで published にしない。** 下のトリガで止めている
-- ------------------------------------------------------------
create table if not exists works (
  id            uuid primary key default gen_random_uuid(),
  site          text not null check (site in ('biz', 'ehon')),
  kind          text not null check (kind in ('article', 'ehon', 'story')),
  author_id     uuid not null references auth.users (id) on delete cascade,

  slug          text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  title         text not null check (length(title) between 1 and 120),
  emoji         text,
  summary       text,
  topics        text[] not null default '{}',

  -- 記事の本文。有料販売を後から足せるように、最初から2つに分けて持つ。
  -- いま body_paid は必ず空。表示側も見に行かない（sekkei/platform-marketing.md）
  body_free     text,
  body_paid     text,

  -- 絵本のページは work_pages に入る。ここは絵本の共通情報だけ
  age_min       int,
  age_max       int,
  reading_minutes int,

  is_pr         boolean not null default false,
  status        text not null default 'draft'
                check (status in ('draft', 'review', 'published', 'rejected')),
  review_note   text,                      -- 差し戻しの理由。書いた人に見せる
  reviewed_by   text,                      -- 審査した人のメールアドレス
  reviewed_at   timestamptz,

  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (site, slug)
);

create index if not exists works_public_idx
  on works (site, published_at desc)
  where status = 'published';

create index if not exists works_author_idx on works (author_id);

alter table works enable row level security;

-- 公開されたものは誰でも読める。それ以外は本人と管理者だけ
drop policy if exists "published works are public" on works;
create policy "published works are public"
  on works for select
  using (status = 'published' or author_id = auth.uid() or is_admin());

-- 書けるのは招待された人だけ。しかも自分名義でしか作れない
drop policy if exists "invited can insert" on works;
create policy "invited can insert"
  on works for insert
  with check (author_id = auth.uid() and can_write(site));

drop policy if exists "author can update" on works;
create policy "author can update"
  on works for update
  using (author_id = auth.uid() or is_admin())
  with check (author_id = auth.uid() or is_admin());

drop policy if exists "author can delete" on works;
create policy "author can delete"
  on works for delete
  using (author_id = auth.uid() or is_admin());

-- ── 公開の門番 ──
-- 子ども向けは、管理者が通したときしか published にできない。
-- 「アプリ側で気をつける」だと、いつか漏れる。DBで止める
create or replace function guard_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'published' and coalesce(old.status, '') <> 'published' then
    if new.site = 'ehon' and not is_admin() then
      raise exception '子ども向けの作品は、審査を通さないと公開できません';
    end if;
    new.published_at := coalesce(new.published_at, now());
    new.reviewed_by  := coalesce(new.reviewed_by, jwt_email());
    new.reviewed_at  := coalesce(new.reviewed_at, now());
  end if;

  -- 本人が自分の作品の審査状態を勝手に書き換えられないようにする
  if not is_admin() and old.status is distinct from new.status then
    if new.status not in ('draft', 'review') then
      raise exception 'この状態には自分では変えられません';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists works_guard_publish on works;
create trigger works_guard_publish
  before update on works
  for each row execute function guard_publish();

-- 新規作成のときも、いきなり published にはさせない
create or replace function guard_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'published' and not is_admin() then
    raise exception '作ったときには公開できません。審査に出してください';
  end if;
  return new;
end;
$$;

drop trigger if exists works_guard_insert on works;
create trigger works_guard_insert
  before insert on works
  for each row execute function guard_insert();


-- ------------------------------------------------------------
-- 4. 絵本のページ
--    絵そのものはここに入れない。ファイル名だけを持つ。
--    絵は配信側（Cloudflare Pages / R2）に置く（sekkei/platform-kids.md）
-- ------------------------------------------------------------
create table if not exists work_pages (
  id         uuid primary key default gen_random_uuid(),
  work_id    uuid not null references works (id) on delete cascade,
  page_no    int not null check (page_no >= 1),
  image      text not null,
  alt        text,
  -- ふりがなは青空文庫と同じ記法で本文に埋める（｜小《ちい》さな）。
  -- 出し分けは表示側でやる
  text       text,
  unique (work_id, page_no)
);

alter table work_pages enable row level security;

-- 親（works）が見えるページだけ見える
drop policy if exists "pages follow work" on work_pages;
create policy "pages follow work"
  on work_pages for select
  using (exists (
    select 1 from works w
    where w.id = work_id
      and (w.status = 'published' or w.author_id = auth.uid() or is_admin())
  ));

drop policy if exists "author edits pages" on work_pages;
create policy "author edits pages"
  on work_pages for all
  using (exists (select 1 from works w where w.id = work_id and (w.author_id = auth.uid() or is_admin())))
  with check (exists (select 1 from works w where w.id = work_id and (w.author_id = auth.uid() or is_admin())));


-- ------------------------------------------------------------
-- 5. 反応
--    子ども向けの自由記述コメントは作らない。
--    comments は site = 'biz' だけで使う（sekkei/platform-kids.md）
-- ------------------------------------------------------------
create table if not exists likes (
  work_id    uuid not null references works (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (work_id, user_id)
);

alter table likes enable row level security;

drop policy if exists "likes are public" on likes;
create policy "likes are public" on likes for select using (true);

drop policy if exists "own like insert" on likes;
create policy "own like insert" on likes for insert with check (user_id = auth.uid());

drop policy if exists "own like delete" on likes;
create policy "own like delete" on likes for delete using (user_id = auth.uid());


create table if not exists comments (
  id         uuid primary key default gen_random_uuid(),
  work_id    uuid not null references works (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  body       text not null check (length(body) between 1 and 2000),
  hidden     boolean not null default false,
  created_at timestamptz not null default now()
);

alter table comments enable row level security;

drop policy if exists "comments on published works" on comments;
create policy "comments on published works"
  on comments for select
  using (
    (not hidden and exists (select 1 from works w where w.id = work_id and w.status = 'published'))
    or user_id = auth.uid() or is_admin()
  );

-- 子ども向けにはコメントを付けさせない。ここで止める
drop policy if exists "comment insert biz only" on comments;
create policy "comment insert biz only"
  on comments for insert
  with check (
    user_id = auth.uid()
    and exists (select 1 from works w where w.id = work_id and w.site = 'biz' and w.status = 'published')
  );

drop policy if exists "own comment delete" on comments;
create policy "own comment delete"
  on comments for delete using (user_id = auth.uid() or is_admin());


-- ------------------------------------------------------------
-- 6. 通報
--    あとから足すと、それまでの分に対応できない。最初から持つ。
--    ログインしていない人からも受け取る（読むのは管理者だけ）
-- ------------------------------------------------------------
create table if not exists reports (
  id          uuid primary key default gen_random_uuid(),
  work_id     uuid references works (id) on delete cascade,
  comment_id  uuid references comments (id) on delete cascade,
  reason      text not null check (length(reason) between 1 and 1000),
  reporter_id uuid references auth.users (id) on delete set null,
  handled     boolean not null default false,
  created_at  timestamptz not null default now(),
  check (work_id is not null or comment_id is not null)
);

alter table reports enable row level security;

drop policy if exists "anyone can report" on reports;
create policy "anyone can report" on reports for insert with check (true);

drop policy if exists "admins read reports" on reports;
create policy "admins read reports" on reports for select using (is_admin());

drop policy if exists "admins update reports" on reports;
create policy "admins update reports" on reports for update using (is_admin()) with check (is_admin());


-- ------------------------------------------------------------
-- 7. 決済の器（Phase 3。いまは何も入れない）
--
--    Stripe Connect の Standard を使う。作者が自分のStripeアカウントで受け取り、
--    我々はお金を預からない（sekkei/README.md）。
--    ここに入るのは、作者とStripeアカウントの対応だけ。
--
--    ⚠️ 本人にも読ませない列は作らない。カード情報はここに一切来ない
-- ------------------------------------------------------------
create table if not exists stripe_accounts (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  stripe_account_id text not null,
  -- 子ども自身の作品でも、受け取りは保護者名義にする。
  -- Stripeのアカウントは18歳以上でないと作れない（sekkei/platform-kids.md）
  on_behalf_of_minor boolean not null default false,
  created_at        timestamptz not null default now()
);

alter table stripe_accounts enable row level security;

drop policy if exists "own stripe account" on stripe_accounts;
create policy "own stripe account"
  on stripe_accounts for all
  using (user_id = auth.uid() or is_admin())
  with check (user_id = auth.uid());


-- ------------------------------------------------------------
-- 8. 一覧用のビュー
--    公開されたものだけを、一覧に要る列だけ返す。
--    本文を含めないので、一覧を開くたびに重い列を運ばずに済む
-- ------------------------------------------------------------
create or replace view public_works as
select
  w.id, w.site, w.kind, w.slug, w.title, w.emoji, w.summary, w.topics,
  w.age_min, w.age_max, w.reading_minutes, w.is_pr, w.published_at,
  p.handle, p.display_name,
  (select count(*) from likes l where l.work_id = w.id) as like_count
from works w
left join profiles p on p.user_id = w.author_id
where w.status = 'published';


-- ============================================================
--  流したあとに確かめること
--
--   1. anon キーで  select * from works           → 0行（下書きが漏れていない）
--   2. anon キーで  select * from public_works    → 公開したものだけ出る
--   3. 招待していないアドレスでログインして insert → 弾かれる
--   4. site='ehon' の作品を、管理者以外が published に更新 → 弾かれる
--   5. 子ども向けの作品に comments を insert       → 弾かれる
--   6. anon キーで reports に insert               → 通る（読み出しはできない）
--
--  4 と 5 は、この仕組みの肝。**必ず自分の手で試す。**
-- ============================================================
