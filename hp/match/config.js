/*
  接続先の設定

  登録フォーム（index.html）と管理画面（admin/index.html）が、
  この1ファイルを共有している。**ここを埋めると全部が動く。**

  ── 埋めるもの ──
  1. SUPABASE_URL     … Supabase の Project Settings > Data API > Project URL
  2. SUPABASE_ANON_KEY … 同じ画面の anon public キー

  anon キーはブラウザから丸見えになるが、それで正しい。
  「誰でも登録はできるが、誰も読み出せない」を **テーブル側（RLS）** で守る。
  SQLは supabase/schema.sql にある。先にそれを流してからここを埋めること。

  ⚠️ service_role キーは絶対にここへ書かない。
     あれは全部のデータを読み書きできる鍵で、ブラウザに置くと終わる。
     管理画面は「ログインした管理者本人の権限」で読む作りにしてある。
*/

window.TODO_MATCH_CONFIG = {
  SUPABASE_URL: "",       // 例）https://xxxxxxxx.supabase.co
  SUPABASE_ANON_KEY: "",  // 例）eyJhbGciOi...

  // マッチング生成（Claude API）を呼ぶ Edge Function の名前。
  // supabase/functions/generate-matches/ をデプロイすると使えるようになる。
  GENERATE_FUNCTION: "generate-matches"
};
