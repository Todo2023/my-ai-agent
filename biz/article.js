/**
 * 記事ページ（その場で描くほう）
 *
 * 公開した記事の入口は `a/<slug>/` になった（tools/build-index.mjs が生成する）。
 * この画面が残っているのは、そこに乗らないものが2つあるため。
 *
 *   ?id=xxx   … Supabase で公開された記事。まだ .md に取り込んでいないもの
 *   ?slug=xxx … 下書き（published: false）の下見。ページは生成されない
 *
 * 公開ずみの `?slug=` で開かれたら、生成したページへ転送する。
 * **前に配ったURLを死なせないため。** 検索にも二重に載せない（あちらが canonical）。
 *
 * この画面自体は noindex のままにする。中身は生成ページと同じものなので、
 * 検索に出す必要がない。
 */
import { renderMarkdown, parseFrontMatter, readingMinutes } from "./md.js";
import { buildToc, setupReactions, el } from "./article-parts.js";
import * as supa from "./supa.js";

const $ = (id) => document.getElementById(id);

/** slugにパス区切りなどが混ざっていたら読みに行かない */
function cleanSlug(raw) {
  return /^[\w-]{1,80}$/.test(raw || "") ? raw : null;
}

/** UUID の形をしているかだけ見る。違うものは投げない */
function cleanId(raw) {
  return /^[0-9a-f-]{36}$/i.test(raw || "") ? raw : null;
}

function showError(message) {
  $("title").textContent = "記事を開けませんでした";
  $("emoji").textContent = "🚧";
  $("body").replaceChildren(el("p", null, message));
}

/**
 * 公開ずみの記事かどうかを articles.json で確かめる。
 * 生成ページがあるものだけ転送したいので、当てずっぽうで飛ばさない
 */
async function publishedPage(slug) {
  try {
    const res = await fetch("articles.json", { cache: "no-cache" });
    if (!res.ok) return false;
    const data = await res.json();
    return (data.articles || []).some((a) => a.slug === slug);
  } catch {
    return false;
  }
}

/** Supabase で公開されている記事を1本取ってくる */
async function fromDatabase(id) {
  const rows = await supa.request(
    `/rest/v1/works?id=eq.${id}&status=eq.published&select=title,emoji,topics,is_pr,body_free,published_at,author_id`,
  );
  const w = (rows || [])[0];
  if (!w) throw new Error("見つかりません");
  return {
    meta: {
      title: w.title,
      emoji: w.emoji,
      topics: w.topics || [],
      is_pr: w.is_pr === true,
      published_at: (w.published_at || "").slice(0, 10),
    },
    body: w.body_free || "",
  };
}

async function main() {
  const params = new URLSearchParams(location.search);
  const slug = cleanSlug(params.get("slug"));
  const id = cleanId(params.get("id"));

  if (!slug && !id) {
    showError("記事が指定されていません。記事一覧から選んでください。");
    return;
  }

  // 公開ずみなら生成ページへ。replace にして戻るボタンで往復させない
  if (slug && await publishedPage(slug)) {
    location.replace(`a/${encodeURIComponent(slug)}/${location.hash}`);
    return;
  }

  let meta, body;
  try {
    if (id) {
      ({ meta, body } = await fromDatabase(id));
    } else {
      const res = await fetch(`articles/${slug}.md`, { cache: "no-cache" });
      if (!res.ok) throw new Error(String(res.status));
      ({ meta, body } = parseFrontMatter(await res.text()));
    }
  } catch (err) {
    console.error(err);
    showError(id
      ? "記事を読み込めませんでした。公開が取り下げられたかもしれません。"
      : "記事が見つかりませんでした。ローカルで見るときは python3 -m http.server で開いてください。");
    return;
  }

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

  // 反応はDBにある記事だけ。リポジトリに置いた記事には行がないので付けない
  setupReactions(id);

  // #見出し 付きで開かれたとき、描き終わってから飛ぶ
  if (location.hash) {
    document.getElementById(decodeURIComponent(location.hash.slice(1)))
      ?.scrollIntoView({ block: "start" });
  }
}

main();
