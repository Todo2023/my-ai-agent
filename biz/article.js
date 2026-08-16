/**
 * 記事ページ
 *
 * 開き方は2つある。
 *   ?slug=xxx … articles/xxx.md（リポジトリに置いた記事）
 *   ?id=xxx   … Supabase で公開された記事
 * どちらも同じ見た目にする。
 *
 * URLに ?slug= が付くのは、いまビルドを持たないため（CLAUDE.md）。
 * 検索に載せる段（Phase 2）で、記事ごとの静的HTMLを吐く形に変える。
 * 設計は sekkei/platform-marketing.md。
 */
import { renderMarkdown, parseFrontMatter, readingMinutes } from "./md.js";
import * as supa from "./supa.js";

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

/** UUID の形をしているかだけ見る。違うものは投げない */
function cleanId(raw) {
  return /^[0-9a-f-]{36}$/i.test(raw || "") ? raw : null;
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

/* ── いいね・通報（DBで公開された記事だけ） ────────────────── */

/**
 * いいね。
 * 数は誰でも見えるが、押すにはログインが要る（likes の RLS が user_id = auth.uid() を求める）。
 * ログインしていない人には、その場でリンクを送れるようにしてある
 */
async function setupLike(id) {
  const box = $("reaction");
  box.hidden = false;

  const btn = $("like");
  const note = $("reaction-note");

  let count = 0;
  let mine = false;

  const draw = () => {
    btn.textContent = `♥ ${count}`;
    btn.setAttribute("aria-pressed", String(mine));
  };

  const load = async () => {
    // count=exact で件数だけもらう。全行を運ばない
    const rows = await supa.request(`/rest/v1/likes?work_id=eq.${id}&select=user_id`);
    count = (rows || []).length;
    const me = supa.userId();
    mine = Boolean(me && rows.some((r) => r.user_id === me));
    draw();
  };

  try {
    await load();
  } catch (err) {
    console.warn("いいねを読めませんでした", err);
    box.hidden = true;
    return;
  }

  btn.addEventListener("click", async () => {
    if (!supa.signedIn()) {
      $("login-row").hidden = false;
      note.textContent = "いいねするにはログインします。メールに届くリンクを開くだけです。";
      return;
    }
    btn.disabled = true;
    try {
      if (mine) {
        await supa.request(`/rest/v1/likes?work_id=eq.${id}&user_id=eq.${supa.userId()}`, { method: "DELETE" });
      } else {
        await supa.request("/rest/v1/likes", {
          method: "POST",
          body: { work_id: id, user_id: supa.userId() },
        });
      }
      await load();
    } catch (err) {
      note.textContent = `できませんでした： ${err.message}`;
    }
    btn.disabled = false;
  });

  $("send-link").addEventListener("click", async () => {
    const email = $("email").value.trim();
    if (!email) { note.textContent = "メールアドレスを入れてください"; return; }
    try {
      await supa.sendLoginLink(email);
      note.textContent = "リンクを送りました。メールを開いてください。";
    } catch (err) {
      note.textContent = `送れませんでした： ${err.message}`;
    }
  });
}

/** 通報。ログインなしでも出せる（読むのは管理者だけ） */
function setupReport(id) {
  const btn = $("report");
  btn.hidden = false;
  btn.addEventListener("click", async () => {
    const reason = prompt("気になった点を書いてください（管理者だけが読みます）");
    if (reason == null || !reason.trim()) return;
    try {
      await supa.request("/rest/v1/reports", {
        method: "POST",
        body: { work_id: id, reason: reason.trim() },
      });
      $("reaction-note").textContent = "受け取りました。確認します。";
    } catch (err) {
      $("reaction-note").textContent = `送れませんでした： ${err.message}`;
    }
  });
}

async function main() {
  const params = new URLSearchParams(location.search);
  const slug = cleanSlug(params.get("slug"));
  const id = cleanId(params.get("id"));

  if (!slug && !id) {
    showError("記事が指定されていません。記事一覧から選んでください。");
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
  if (id) {
    supa.loadSession();
    setupLike(id);
    setupReport(id);
  }

  // #見出し 付きで開かれたとき、描き終わってから飛ぶ
  if (location.hash) {
    document.getElementById(decodeURIComponent(location.hash.slice(1)))
      ?.scrollIntoView({ block: "start" });
  }
}

main();
