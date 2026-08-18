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
  SUPABASE_ANON_KEY: "sb_publishable_MfWenaXrRnHUKEYT0HjXJg_lx-4INn7",

  /*
    投げ銭（Stripe Payment Link）の行き先。おしまいの画面に、
    **保護者向けとして控えめに**出る（子ども向けのボタンにはしない）。

    ⚠️ いま入っているのは **Stripe のテスト用リンク**（`/test_` が付いている）。
       テストのリンクは本物のお金が動かないのに、カード情報の入力欄が出る。
       読者が本気で入力してしまうので、**reader.js が test を弾いて表示しない。**
       本番のリンク（`/test_` の付かないもの）に差し替えると、その時点で出る。
  */
  SUPPORT_URL: "https://buy.stripe.com/test_7sY00c5xccNU7lt4A52VG00"
};
