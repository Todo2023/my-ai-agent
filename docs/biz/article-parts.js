/**
 * 記事ページの共通部品
 *
 * 記事ページは2種類ある。
 *   a/<slug>/index.html … 生成した静的ページ（本文はHTMLに埋まっている）
 *   article.html?id=xxx … DBの記事をその場で描くページ
 *
 * 見た目も振る舞いも同じものにしたいので、
 * **中身の描画以外はここに寄せて、両方から読む。**
 * 片方だけ直して食い違うのを防ぐため。
 */
import * as supa from "./supa.js";

const $ = (id) => document.getElementById(id);

export function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

/* ── 目次 ────────────────────────────────────────── */

/** 目次のリンクを組み立てる（article.html 用。静的ページは生成時に入っている） */
export function buildToc(toc) {
  if (toc.length < 2) return;
  const nav = $("toc");
  nav.append(el("h2", null, "もくじ"));
  const ol = el("ol");
  for (const item of toc) {
    const li = el("li", item.level === 3 ? "lv3" : null);
    const a = el("a", null, item.text);
    a.href = `#${item.id}`;
    li.append(a);
    ol.append(li);
  }
  nav.append(ol);
  watchToc();
}

/**
 * いま読んでいる見出しに印を付ける。
 * 目次のリンクがDOMにある状態で呼ぶ（生成・組み立てのどちらでもよい）
 */
export function watchToc() {
  const nav = $("toc");
  if (!nav) return;

  const links = new Map();
  const order = [];
  for (const a of nav.querySelectorAll("a[href^='#']")) {
    const id = decodeURIComponent(a.getAttribute("href").slice(1));
    if (!document.getElementById(id)) continue;
    links.set(id, a);
    order.push(id);
  }
  if (order.length < 2) return;

  const seen = new Set();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) seen.add(e.target.id); else seen.delete(e.target.id);
    }
    // 画面に入っているうちの、いちばん上のものを現在地にする
    const current = order.find((id) => seen.has(id));
    for (const [id, a] of links) a.setAttribute("aria-current", String(current === id));
  }, { rootMargin: "-70px 0px -70% 0px" });

  for (const id of order) io.observe(document.getElementById(id));
}

/* ── いいね・通報（DBに行がある記事だけ） ──────────── */

/**
 * いいね。
 * 数は誰でも見えるが、押すにはログインが要る（likes の RLS が user_id = auth.uid() を求める）。
 * ログインしていない人には、その場でリンクを送れるようにしてある
 */
export async function setupLike(id) {
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
export function setupReport(id) {
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

/** いいねと通報をまとめて付ける。id を持たない記事では何もしない */
export function setupReactions(id) {
  if (!id || !supa.isConfigured()) return;
  supa.loadSession();
  setupLike(id);
  setupReport(id);
}
