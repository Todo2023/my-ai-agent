/**
 * 記事1本ぶんの静的HTMLを組み立てる。
 *
 * 出力先は `biz/a/<slug>/index.html`。URLは `…/biz/a/<slug>/` になる。
 *
 * ■ なぜ `<slug>.html` ではなく `<slug>/index.html` なのか
 *   拡張子なしのURLにしておくと、置き場所を変えても同じURLのまま運べる。
 *   GitHub Pages は `/a/xxx` を `/a/xxx.html` に読み替えてくれないが、
 *   `/a/xxx/` なら index.html を返す。Cloudflare Pages でも同じURLで通る。
 *   **URLは一度外に出すと変えられない**ので、移設に耐える形を先に選んでおく。
 *
 * ■ なぜ本文を先に埋めてしまうのか
 *   article.html は開いてから fetch して描いていた。検索エンジンと、
 *   JSが動かない環境では中身が空に見える。検索に載せる前提なら、
 *   HTMLの中に本文が入っていないと意味がない。
 */
import { renderMarkdown, excerpt, readingMinutes } from "../md.js";

/**
 * 公開したときのURLの根。canonical と OGP に入る。
 * **置き場所を移したらここを直す**（sekkei/README.md の移設の話）。
 */
export const SITE = "https://todo2023.github.io/my-ai-agent/biz/";

/**
 * 検索避け。いまは試作なので付けたまま。
 * 外すのは引き継ぎ書（sekkei/hikitsugi-biz.md）の 1〜3 が終わってから。
 * **ここを false にすると生成する記事ページ全部から noindex が消える。**
 */
export const NOINDEX = true;

const NAME = "ハタラク文庫（仮）";

const ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230f766e'/%3E%3Cpath d='M8 9h16M8 16h16M8 23h10' stroke='%23fff' stroke-width='2.6' stroke-linecap='round'/%3E%3C/svg%3E";

/** 属性にも本文にも使える無害化。md.js の中の esc と同じ考え方 */
function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 記事ページから見た biz/ までの深さ。a/<slug>/ にいるので2つ上 */
const UP = "../../";

/** 目次。JSがなくても出るように、ここで組み立ててしまう */
function tocHtml(toc) {
  if (toc.length < 2) return '<nav class="toc" id="toc" aria-label="目次"></nav>';
  const items = toc
    .map(
      (t) =>
        `<li${t.level === 3 ? ' class="lv3"' : ""}><a href="#${esc(t.id)}">${esc(t.text)}</a></li>`,
    )
    .join("");
  return `<nav class="toc" id="toc" aria-label="目次"><h2>もくじ</h2><ol>${items}</ol></nav>`;
}

/** 見出しの下に出す札（PR・トピック・書き手・日付・読了時間） */
function metaHtml({ meta, topics, minutes }) {
  const parts = [];
  if (meta.is_pr === true) parts.push('<span class="tag pr">PR</span>');
  for (const t of topics) parts.push(`<span class="tag">${esc(t)}</span>`);
  if (meta.author) {
    // handle があるときだけプロフィールへ行けるようにする
    parts.push(
      meta.handle
        ? `<a href="${UP}profile.html?handle=${encodeURIComponent(meta.handle)}">${esc(meta.author)}</a>`
        : `<span>${esc(meta.author)}</span>`,
    );
  }
  if (meta.published_at) parts.push(`<span>${esc(meta.published_at)}</span>`);
  parts.push(`<span>約${minutes}分</span>`);
  return parts.join("\n        ");
}

/**
 * @param {{slug:string, meta:object, body:string}} article
 * @returns {string} 1ファイルぶんのHTML
 */
export function renderArticlePage({ slug, meta, body }) {
  const { html, toc } = renderMarkdown(body);
  const title = meta.title || slug;
  const summary = meta.summary || excerpt(body, 110);
  const canonical = `${SITE}a/${slug}/`;
  const topics = Array.isArray(meta.topics) ? meta.topics : meta.topics ? [meta.topics] : [];

  // DBから取り込んだ記事だけ id を持つ。いいね・通報はその記事にしか付けられない
  const workId = /^[0-9a-f-]{36}$/i.test(meta.work_id || "") ? meta.work_id : null;

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${esc(title)} | ${NAME}</title>
<meta name="description" content="${esc(summary)}" />
<meta name="theme-color" content="#0f766e" />
<meta name="color-scheme" content="light dark" />
${NOINDEX ? '<meta name="robots" content="noindex" /><!-- 試作のため検索避け。tools/render-page.mjs の NOINDEX で切り替える -->\n' : ""}<link rel="canonical" href="${esc(canonical)}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="${NAME}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(summary)}" />
<meta property="og:url" content="${esc(canonical)}" />
<link rel="icon" href="${ICON}" />
<link rel="stylesheet" href="${UP}style.css" />
</head>
<body${workId ? ` data-work-id="${esc(workId)}"` : ""}>

<a class="skip" href="#main">本文へ</a>

<div class="demo-bar">
  <b>試作中</b>：記事は書き味を確かめるためのサンプルです。
</div>

<header>
  <div class="wrap bar">
    <a class="logo" href="${UP}">ハタラク文庫<small>KARI · WORKING LIBRARY</small></a>
    <nav>
      <a href="${UP}">記事一覧</a>
      <a href="${UP}../ehon/">えほんの棚</a>
    </nav>
  </div>
</header>

<main id="main" class="wrap article">
  <div class="layout">
    <div class="article-head">
      <div class="emoji" id="emoji">${esc(meta.emoji || "📝")}</div>
      <h1 id="title">${esc(title)}</h1>
      <div class="meta" id="meta">
        ${metaHtml({ meta, topics, minutes: readingMinutes(body) })}
      </div>
    </div>

    <article class="body" id="body">
${html}
    </article>

    <div class="after">
      <!--
        Phase 3 で、ここが投げ銭ボタンになる（sekkei/README.md）。
        いまは何も繋がっていない。金額の表示もしない。
      -->
      <div class="reaction" id="reaction" hidden>
        <button class="like" id="like" type="button" aria-pressed="false">♥ 0</button>
        <button class="btn-plain" id="report" type="button" hidden>気になる点を知らせる</button>
        <div class="login-row" id="login-row" hidden>
          <label class="skip" for="email">メールアドレス</label>
          <input id="email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" />
          <button class="btn-plain" id="send-link" type="button">ログインのリンクを送る</button>
        </div>
        <p class="reaction-note" id="reaction-note"></p>
      </div>

      <div class="support">
        <b>この記事が役に立ったら</b><br />
        いまは「読んだ」を伝える手段がありません。応援の仕組みは、投稿を受け付けるようになってから足します。
      </div>
      <a class="back" href="${UP}">← 記事一覧へ</a>
    </div>

    ${tocHtml(toc)}
  </div>
</main>

<footer>
  <div class="wrap">
    <p>${NAME} — 合同会社To do の試作。</p>
  </div>
</footer>

<script src="${UP}config.js"></script>
<script type="module" src="${UP}article-page.js"></script>
</body>
</html>
`;
}
