-- ============================================================
--  つないだ直後の自己点検
--
--  schema.sql を流したあと、Supabase の SQL Editor にこれを貼って実行する。
--  データは1件も作らない。読むだけ。費用はゼロ。
--
--  ── 見方 ──
--   「Success. No rows returned」   → 全部通った。先に進んでよい
--   赤いエラーで「NG:」から始まる文 → そこが通っていない。文面のとおりに直す
--
--  TODO.md の「つないだ直後に必ず確認すること」を、目視ではなくSQLにしたもの。
--  いちばん大事なのは 1〜4（anon キーで個人情報が1行も読めないこと）。
-- ============================================================

do $$
declare
  c   int;
  n   int;
begin
  ---------------------------------------------------------
  -- 1〜4. anon（＝ブラウザに置いてあるキー）では1行も読めないこと
  --        ここが漏れていたら、他は全部無意味になる
  ---------------------------------------------------------
  set local role anon;

  select count(*) into c from profiles;
  set local role none;
  if c <> 0 then
    raise exception 'NG: anon で profiles が % 行読めてしまう。profiles に anon 向けの select ポリシーが付いていないか確認する', c;
  end if;

  set local role anon;
  select count(*) into c from matches;
  set local role none;
  if c <> 0 then
    raise exception 'NG: anon で matches が % 行読めてしまう', c;
  end if;

  set local role anon;
  select count(*) into c from generation_logs;
  set local role none;
  if c <> 0 then
    raise exception 'NG: anon で generation_logs が % 行読めてしまう', c;
  end if;

  set local role anon;
  select count(*) into c from admins;
  set local role none;
  if c <> 0 then
    raise exception 'NG: anon で admins が % 行読めてしまう', c;
  end if;

  ---------------------------------------------------------
  -- 5. 4つのテーブルすべてで RLS が有効になっていること
  ---------------------------------------------------------
  select count(*) into n
    from pg_class t join pg_namespace ns on ns.oid = t.relnamespace
   where ns.nspname = 'public'
     and t.relname in ('admins','profiles','matches','generation_logs')
     and t.relrowsecurity;
  if n <> 4 then
    raise exception 'NG: RLS が有効なテーブルが % 個しかない（4個が正解）。schema.sql を最後まで流したか確認する', n;
  end if;

  ---------------------------------------------------------
  -- 6. anon に読み取りを許すポリシーが1つも無いこと
  --    （登録＝insert の1本だけが anon 向けの正解）
  ---------------------------------------------------------
  select count(*) into n
    from pg_policies
   where schemaname = 'public'
     and 'anon' = any (roles)
     and cmd <> 'INSERT';
  if n <> 0 then
    raise exception 'NG: anon に insert 以外を許すポリシーが % 本ある。消すこと', n;
  end if;

  ---------------------------------------------------------
  -- 7. 管理者が1人以上入っていること
  --    入れ忘れると、代表自身も管理画面で何も見えない
  ---------------------------------------------------------
  select count(*) into n from admins;
  if n = 0 then
    raise exception 'NG: admins が空。自分のアドレスを入れる → insert into admins (email, note) values (''自分のアドレス'', ''代表'');';
  end if;

  ---------------------------------------------------------
  -- 8. ログインしていない状態で is_admin() が落ちず、false を返すこと
  ---------------------------------------------------------
  if is_admin() is distinct from false then
    raise exception 'NG: 未ログイン状態の is_admin() が false にならない';
  end if;

  ---------------------------------------------------------
  -- 9. AI生成に同意していない登録が、DB側でも弾かれること
  --    （入るはずが無いので、入ってしまったら失敗）
  ---------------------------------------------------------
  begin
    set local role anon;
    insert into profiles
      (name, organization, title, industry, email, region,
       background, current_work, strengths, target_profile, ai_consent, visibility)
    values
      ('__verify__', '__verify__', '__verify__', '__verify__', '__verify__@example.invalid', '__verify__',
       '__verify__', '__verify__', '__verify__', '__verify__', false, '__verify__');
    set local role none;
    raise exception 'NG: ai_consent = false の登録が通ってしまった。profiles の insert ポリシーの with check を確認する';
  exception
    when insufficient_privilege then
      set local role none;   -- 期待どおり弾かれた
  end;

  raise notice '全部通った。anon では1行も読めず、同意なしの登録も弾かれている。';
end $$;
