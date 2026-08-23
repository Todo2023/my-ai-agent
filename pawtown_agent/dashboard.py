"""簡易管理ダッシュボード。

2通りの使い方がある。

1. `python dashboard.py` … 端末に件数を表示する（DEMO_MODE=1 でも動く）
2. `python dashboard.py --html public/index.html` … Netlifyに置く静的HTMLを書き出す

2のHTMLは、読み込み時に Supabase の dashboard_stats ビューを anon キーで読む。
ビューは件数だけを返し、メールアドレス等の個人情報は一切含まない。
members / matches 本体は RLS で anon から読めないので、公開しても中身は出ない。
"""

from __future__ import annotations

import argparse
import os
import sys

import store

HTML_TEMPLATE = """<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__SERVICE_NAME__ 管理ダッシュボード</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, "Hiragino Sans", "Noto Sans JP", sans-serif;
         margin: 0; padding: 2rem 1.25rem; line-height: 1.6; }
  main { max-width: 46rem; margin: 0 auto; }
  h1 { font-size: 1.25rem; margin: 0 0 1.5rem; }
  .cards { display: grid; gap: 1rem;
           grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); }
  .card { border: 1px solid rgba(128,128,128,.35); border-radius: .75rem; padding: 1rem; }
  .label { font-size: .8rem; opacity: .75; }
  .value { font-size: 2rem; font-weight: 600; font-variant-numeric: tabular-nums; }
  footer { margin-top: 2rem; font-size: .8rem; opacity: .7; }
  .error { color: #b3261e; }
</style>
</head>
<body>
<main>
  <h1>__SERVICE_NAME__ 管理ダッシュボード</h1>
  <div class="cards">
    <div class="card"><div class="label">登録者数</div><div class="value" id="member_count">–</div></div>
    <div class="card"><div class="label">物語（累計）</div><div class="value" id="post_count">–</div></div>
    <div class="card"><div class="label">今週の物語</div><div class="value" id="post_count_7d">–</div></div>
    <div class="card"><div class="label">今週書いた人</div><div class="value" id="active_writer_count">–</div></div>
    <div class="card"><div class="label">マッチ成立数</div><div class="value" id="matched_count">–</div></div>
    <div class="card"><div class="label">承認待ち</div><div class="value" id="awaiting_count">–</div></div>
  </div>
  <footer>
    <p id="updated"></p>
    <p>運営: 合同会社To do</p>
  </footer>
</main>
<script>
const SUPABASE_URL = "__SUPABASE_URL__";
const SUPABASE_ANON_KEY = "__SUPABASE_ANON_KEY__";

async function load() {
  const updated = document.getElementById("updated");
  try {
    const response = await fetch(
      SUPABASE_URL + "/rest/v1/dashboard_stats?select=*",
      { headers: { apikey: SUPABASE_ANON_KEY,
                   Authorization: "Bearer " + SUPABASE_ANON_KEY } }
    );
    if (!response.ok) throw new Error("HTTP " + response.status);
    const stats = (await response.json())[0] || {};
    for (const key of ["member_count", "post_count", "post_count_7d",
                       "active_writer_count", "matched_count", "awaiting_count"]) {
      document.getElementById(key).textContent = stats[key] ?? "–";
    }
    updated.textContent = "最終更新: " + new Date().toLocaleString("ja-JP");
  } catch (error) {
    updated.className = "error";
    updated.textContent = "件数を取得できませんでした（" + error.message + "）";
  }
}
load();
setInterval(load, 60000);
</script>
</body>
</html>
"""


def build_html() -> str:
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    anon_key = os.environ.get("SUPABASE_ANON_KEY", "")
    if not url or not anon_key:
        raise RuntimeError(
            "環境変数 SUPABASE_URL / SUPABASE_ANON_KEY が設定されていません。"
            "（HTMLに埋めるのは anon キーです。service_role キーは絶対に埋めないでください）"
        )
    return (
        HTML_TEMPLATE
        .replace("__SERVICE_NAME__", os.environ.get("PAWTOWN_SERVICE_NAME", "Pawtown（仮）"))
        .replace("__SUPABASE_URL__", url)
        .replace("__SUPABASE_ANON_KEY__", anon_key)
    )


def print_stats():
    stats = store.stats()
    labels = {
        "member_count": "登録者数",
        "post_count": "物語（累計）",
        "writer_count": "書いた人",
        "matched_count": "マッチ成立数",
        "awaiting_count": "承認待ち",
        "rejected_count": "不成立",
    }
    for key, label in labels.items():
        print(f"{label:<10} {stats[key]:>5}")


def main():
    parser = argparse.ArgumentParser(description="Pawtown 管理ダッシュボード")
    parser.add_argument("--html", metavar="PATH", help="Netlifyに置く静的HTMLを書き出す")
    args = parser.parse_args()

    try:
        if args.html:
            with open(args.html, "w", encoding="utf-8") as file:
                file.write(build_html())
            print(f"{args.html} を書き出しました。Netlifyの公開ディレクトリに置いてください。")
        else:
            print_stats()
    except RuntimeError as e:
        print(f"エラー: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
