/**
 * 審査画面（身内用）
 *
 * 投稿されたものを見て、公開するか差し戻すかを決める。
 *
 * ■ なぜこの画面が要るか
 *   子ども向け（site = 'ehon'）は、人が全ページを見るまで公開しない決まりにしてある。
 *   しかもそれは「気をつける」ではなく、データベース側のトリガで止めてある
 *   （supabase/community.sql の guard_publish）。
 *   つまり**この画面を通す以外に、絵本が世に出る道はない。**
 *
 * ■ 接続まわりは biz/ のものを使い回している
 *   同じ中身を3つ持つとズレるため。この画面は PWA ではないので、
 *   フォルダをまたいで読み込んでも困らない
 */
import * as supa from "../biz/supa.js";
import { renderMarkdown } from "../biz/md.js";
import { rubyToDom } from "../ehon/ruby.js";

const $ = (id) => document.getElementById(id);

const state = { tab: "review", rows: [] };

const TABS = {
  review: { label: "審査待ち", empty: "審査待ちはありません。" },
  published: { label: "公開ずみ", empty: "まだ公開したものはありません。" },
  rejected: { label: "差し戻し", empty: "差し戻したものはありません。" },
};

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/* ── ログイン ───────────────────────────────── */

function drawLogin(message) {
  const box = $("state");
  if (message != null) { box.textContent = message; return; }

  if (!supa.isConfigured()) {
    box.textContent = "つないでいません（../biz/config.js が空です）。";
    $("login-row").hidden = true;
    return;
  }

  const on = supa.signedIn();
  $("login-row").hidden = false;
  $("email").hidden = on;
  $("login").hidden = on;
  $("logout").hidden = !on;
  $("work-area").hidden = !on;
  box.textContent = on
    ? "ログイン中。管理者でなければ、下には何も出ません。"
    : "管理者のメールアドレスでログインしてください。";
}

/* ── 読み込み ──────────────────────────────── */

async function loadList() {
  const listBox = $("list");
  listBox.replaceChildren();
  $("empty").hidden = true;
  $("count").textContent = "読み込み中…";

  try {
    // 管理者だけが審査待ちを読める（RLS）。管理者でなければ0件で返る
    const rows = await supa.request(
      `/rest/v1/works?status=eq.${state.tab}&select=*&order=created_at.desc&limit=100`,
    );
    state.rows = rows || [];
  } catch (err) {
    $("count").textContent = "";
    $("empty").hidden = false;
    $("empty").textContent = `読み込めませんでした： ${err.message}`;
    return;
  }

  $("count").textContent = `${state.rows.length}件`;
  if (!state.rows.length) {
    $("empty").hidden = false;
    $("empty").textContent = TABS[state.tab].empty;
    return;
  }
  listBox.replaceChildren(...state.rows.map(card));
}

/* ── 1件ぶんの表示 ───────────────────────────── */

function card(w) {
  const li = el("li", "item");

  const head = el("div", "item-head");
  head.append(el("span", `badge site-${w.site}`, w.site === "ehon" ? "えほん" : "記事"));
  head.append(el("h2", null, `${w.emoji ? `${w.emoji} ` : ""}${w.title}`));
  if (w.is_pr) head.append(el("span", "badge pr", "PR"));
  head.append(el("span", "when", (w.created_at || "").slice(0, 16).replace("T", " ")));
  li.append(head);

  const meta = el("p", "item-meta");
  meta.textContent = [
    `slug: ${w.slug}`,
    w.topics?.length ? `トピック: ${w.topics.join("・")}` : null,
    w.age_min != null ? `対象 ${w.age_min}〜${w.age_max}さい` : null,
    w.reading_minutes ? `よみきかせ ${w.reading_minutes}ふん` : null,
  ].filter(Boolean).join("　/　");
  li.append(meta);

  // 中身
  const body = el("div", "item-body");
  if (w.site === "ehon") {
    body.append(el("p", "loading", "ページを読み込んでいます…"));
    loadPages(w.id).then((pages) => body.replaceChildren(ehonPages(pages)));
  } else {
    // md.js は生HTMLを通さないので、この文字列を入れてよい
    const article = el("div", "md");
    article.innerHTML = renderMarkdown(w.body_free || "").html;
    body.append(article);
  }
  li.append(body);

  if (w.review_note) {
    li.append(el("p", "note", `前回の差し戻し理由： ${w.review_note}`));
  }

  // 操作
  if (state.tab !== "published") li.append(actions(w, li));

  return li;
}

async function loadPages(workId) {
  try {
    return await supa.request(`/rest/v1/work_pages?work_id=eq.${workId}&select=*&order=page_no.asc`);
  } catch {
    return [];
  }
}

function ehonPages(pages) {
  const box = el("div", "pages");
  if (!pages.length) {
    box.append(el("p", "warn", "ページがありません。公開しないでください。"));
    return box;
  }

  for (const p of pages) {
    const row = el("div", "page");
    row.append(el("span", "page-no", `${p.page_no}`));

    const right = el("div", "page-main");
    const text = el("p", "page-text");
    text.append(rubyToDom(p.text || "", true));
    right.append(text);

    const file = el("p", "page-file");
    file.append(el("code", null, p.image || "（絵のファイル名なし）"));
    if (!p.alt) {
      file.append(el("span", "warn", "　絵のせつめい（alt）がありません"));
    } else {
      file.append(el("span", "alt", `　${p.alt}`));
    }
    right.append(file);

    row.append(right);
    box.append(row);
  }

  // ここが今の限界。見落とすと危ないので、必ず出す
  box.append(el("p", "warn",
    "⚠️ 絵そのものはまだ送られてきません（ファイル名だけ）。"
    + "公開する前に、作者から絵を受け取って中身を必ず目で見てください。"));
  return box;
}

/* ── 公開する・差し戻す ─────────────────────────── */

function actions(w, li) {
  const box = el("div", "actions");

  const publish = el("button", "btn primary", "公開する");
  publish.type = "button";
  publish.addEventListener("click", async () => {
    const what = w.site === "ehon" ? "全ページの絵と文を見ましたか？" : "中身を読みましたか？";
    if (!confirm(`「${w.title}」を公開します。\n${what}\n\n公開すると誰でも読める状態になります。`)) return;

    publish.disabled = true;
    try {
      await supa.request(`/rest/v1/works?id=eq.${w.id}`, {
        method: "PATCH",
        body: { status: "published" },
      });
      li.remove();
      await loadList();
    } catch (err) {
      // 管理者でないと、DB側のトリガがここで止める
      alert(`公開できませんでした：\n${err.message}`);
      publish.disabled = false;
    }
  });

  const reject = el("button", "btn", "差し戻す");
  reject.type = "button";
  reject.addEventListener("click", async () => {
    const note = prompt("差し戻す理由を書いてください（書いた人に見えます）");
    if (note == null || !note.trim()) return;

    reject.disabled = true;
    try {
      await supa.request(`/rest/v1/works?id=eq.${w.id}`, {
        method: "PATCH",
        body: { status: "rejected", review_note: note.trim() },
      });
      li.remove();
      await loadList();
    } catch (err) {
      alert(`差し戻せませんでした：\n${err.message}`);
      reject.disabled = false;
    }
  });

  box.append(publish, reject);
  return box;
}

/* ── 起動 ───────────────────────────────── */

function switchTab(tab) {
  state.tab = tab;
  for (const key of Object.keys(TABS)) {
    $(`tab-${key}`).setAttribute("aria-pressed", String(key === tab));
  }
  loadList();
}

function main() {
  supa.loadSession();
  drawLogin();

  $("login").addEventListener("click", async () => {
    const email = $("email").value.trim();
    if (!email) { drawLogin("メールアドレスを入れてください"); return; }
    try {
      await supa.sendLoginLink(email);
      drawLogin("リンクを送りました。メールを開いてください。");
    } catch (err) {
      drawLogin(`送れませんでした： ${err.message}`);
    }
  });

  $("logout").addEventListener("click", () => {
    supa.signOut();
    drawLogin();
    $("work-area").hidden = true;
  });

  for (const key of Object.keys(TABS)) {
    $(`tab-${key}`).addEventListener("click", () => switchTab(key));
  }
  $("reload").addEventListener("click", loadList);

  if (supa.signedIn()) loadList();
}

main();
