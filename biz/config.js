/*
  接続先の設定

  **ここが空のあいだは、何もどこにも送られない。**
  書く画面（write.html）は下書きを端末に貯めるだけで動く。

  ── 埋めるもの ──
  1. SUPABASE_URL      … Supabase の Project Settings > Data API > Project URL
  2. SUPABASE_ANON_KEY … 同じ画面の anon public キー

  anon キーはブラウザから丸見えになるが、それで正しい。
  「招待された人だけが書ける」「下書きは本人しか読めない」は
  **テーブル側（RLS）** で守る。SQLは ../supabase/community.sql にある。
  先にそれを流してからここを埋めること。

  ⚠️ service_role キーは絶対にここへ書かない。
     あれは全部のデータを読み書きできる鍵で、ブラウザに置くと終わる。
*/

window.TODO_BIZ_CONFIG = {
  SUPABASE_URL: "https://wmjzbdacvjrepxdqzwen.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtanpiZGFjdmpyZXB4ZHF6d2VuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4NDU5NTIsImV4cCI6MjEwMjQyMTk1Mn0.oxBuZMXzc8QrrqeD6i2i1ZkrYRUisDNIhHjtw0R0ei4"
};
