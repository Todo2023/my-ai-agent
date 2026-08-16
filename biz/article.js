/**
 * 記事ページ
 *
 * ?slug=xxx を見て articles/xxx.md を取りに行き、md.js で組み立てる。
 *
 * URLに ?slug= が付くのは、いまビルドを持たないため（CLAUDE.md）。
 * 検索に載せる段（Phase 2）で、記事ごとの静的HTMLを吐く形に変える。
 * 設計は docs/platform-marketing.md。
 */
import { renderMarkdown, parseFrontMatter, readingMinutes } from "./md.js";

const $ = (id) => document.getElementById(id);

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

/** slugにパス区切りなどが混ざっていたら読みに行かない */
function cleanSlug(raw) {
  return /^[\w-]{1,80}$/.test(raw || "") ? raw : null;
}

function showError(message) {
  $("title").textContent = "記事を開けませんでした";
  $("emoji").textContent = "🚧";
  $("body").replaceChildren(el("p", null, message));
}

/** 目次を作り、いま読んでいる見出しに印を付ける */
function buildToc(toc) {
  if (toc.length < 2) return;
  const nav = $("toc");
  nav.append(el("h2", null, "もくじ"));
  const ol = el("ol");
  const links = new Map();

  for (const item of toc) {
    const li = el("li", item.level === 3 ? "lv3" : null);
    const a = el("a", null, item.text);
    a.href = `#${item.id}`;
    li.append(a);
    ol.append(li);
    links.set(item.id, a);
  }
  nav.append(ol);

  const seen = new Set();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) seen.add(e.target.id); else seen.delete(e.target.id);
    }
    // 画面に入っているうちの、いちばん上のものを現在地にする
    const current = toc.find((t) => seen.has(t.id));
    for (const [id, a] of links) a.setAttribute("aria-current", String(current?.id === id));
  }, { rootMargin: "-70px 0px -70% 0px" });

  for (const item of toc) {
    const h = document.getElementById(item.id);
    if (h) io.observe(h);
  }
}

async function main() {
  const slug = cleanSlug(new URLSearchParams(location.search).get("slug"));
  if (!slug) {
    showError("記事が指定されていません。記事一覧から選んでください。");
    return;
  }

  let text;
  try {
    const res = await fetch(`articles/${slug}.md`, { cache: "no-cache" });
    if (!res.ok) throw new Error(String(res.status));
    text = await res.text();
  } catch (err) {
    console.error(err);
    showError("記事が見つかりませんでした。ローカルで見るときは python3 -m http.server で開いてください。");
    return;
  }

  const { meta, body } = parseFrontMatter(text);
  const { html, toc } = renderMarkdown(body);

  const title = meta.title || slug;
  document.title = `${title} | ハタラク文庫（仮）`;
  $("title").textContent = title;
  $("emoji").textContent = meta.emoji || "📝";

  const metaBox = $("meta");
  if (meta.is_pr === true) metaBox.append(el("span", "tag pr", "PR"));
  const topics = Array.isArray(meta.topics) ? meta.topics : (meta.topics ? [meta.topics] : []);
  for (const t of topics) metaBox.append(el("span", "tag", t));
  if (meta.author) metaBox.append(el("span", null, meta.author));
  if (meta.published_at) metaBox.append(el("span", null, meta.published_at));
  metaBox.append(el("span", null, `約${readingMinutes(body)}分`));

  // md.js が生HTMLを通さないので、ここで組み立てた文字列を入れてよい
  $("body").innerHTML = html;

  buildToc(toc);

  // #見出し 付きで開かれたとき、描き終わってから飛ぶ
  if (location.hash) {
    document.getElementById(decodeURIComponent(location.hash.slice(1)))
      ?.scrollIntoView({ block: "start" });
  }
}

main();
