/*
  接続先の設定

  **ここが空のあいだは、何もどこにも送られない。**
  つくる画面（make.html）は作りかけを端末に貯めるだけで動く。

  ── 埋めるもの ──
  1. SUPABASE_URL      … Supabase の Project Settings > Data API > Project URL
  2. SUPABASE_ANON_KEY … 同じ画面の anon public キー

  anon キーはブラウザから丸見えになるが、それで正しい。
  「招待された人だけが作れる」「審査を通すまで公開されない」は
  **テーブル側（RLS）** で守る。SQLは ../supabase/community.sql にある。
  先にそれを流してからここを埋めること。

  ⚠️ service_role キーは絶対にここへ書かない。
     あれは全部のデータを読み書きできる鍵で、ブラウザに置くと終わる。
*/

window.TODO_EHON_CONFIG = {
  SUPABASE_URL: "",       // 例）https://xxxxxxxx.supabase.co
  SUPABASE_ANON_KEY: ""   // 例）eyJhbGciOi...
};
