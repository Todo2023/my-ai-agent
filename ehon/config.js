/*
  接続先の設定

  **ここが空のあいだは、何もどこにも送られない。**
  つくる画面（make.html）は作りかけを端末に貯めるだけで動く。

  ── 埋めるもの ──
  1. SUPABASE_URL      … Supabase の Project Settings > Data API > Project URL
  2. SUPABASE_ANON_KEY … 同じ画面の Publishable key（sb_publishable_... で始まる）

  このキーはブラウザから丸見えになるが、それで正しい。
  「招待された人だけが作れる」「審査を通すまで公開されない」は
  **テーブル側（RLS）** で守る。SQLは ../supabase/community.sql にある。
  先にそれを流してからここを埋めること。

  ⚠️ Secret key（sb_secret_... / service_role）は絶対にここへ書かない。
     あれは全部のデータを読み書きできる鍵で、ブラウザに置くと終わる。
*/

window.TODO_EHON_CONFIG = {
  SUPABASE_URL: "https://wmjzbdacvjrepxdqzwen.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_MfWenaXrRnHUKEYT0HjXJg_lx-4INn7"
};
