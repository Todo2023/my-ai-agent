/**
 * 書き手の欄（profiles）
 *
 * 開き方は2つ。
 *   ?handle=xxx … その人の欄を見る（ログイン不要。誰でも見える）
 *   handle なし  … 自分の欄。ログインして、名前と紹介を書く
 *
 * ここまで記事に書き手の名前が出なかったのは、この画面が無かったため。
 * `profiles` は前から在るので、足したのは画面だけ。
 *
 * ■ ID（handle）を後から変えられないようにしてある
 *   記事ページのリンク先（profile.html?handle=…）と、取り込んだ .md の
 *   front matter に handle が焼き付く。変えると両方が迷子になる。
 *   **URLになるものは決めたら変えない**（記事URLと同じ考え方）。
 *
 * ■ 読めるものを優先する
 *   記事の一覧は articles.json（リポジトリ側）とDBの両方から集める。
 *   DBに繋がらない日でも、リポジトリにある記事は出る。app.js と同じ作り。
 */
import * as supa from "./supa.js";

const $ = (id) => document.getElementById(id);

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

/** DB側（supabase/community.sql）の check と同じにしておく */
const HANDLE = /^[a-z0-9][a-z0-9_-]{1,29}$/;

/** その場かぎりの知らせ。問題を黙って飲み込まない */
function say(message) {
  const box = $("problems");
  box.hidden = !message;
  box.textContent = message || "";
}

/* ── 見るほう ────────────────────────────────── */

function drawProfile(p) {
  $("who").hidden = false;
  $("name").textContent = p.display_name || p.handle;
  $("handle").textContent = `@${p.handle}`;
  $("bio").textContent = p.bio || "";
  $("bio").hidden = !p.bio;

  const ul = $("links");
  ul.replaceChildren(
    ...(p.links || [])
      .filter((u) => /^https?:\/\//i.test(u))
      .map((u) => {
        const li = el("li");
        const a = el("a", null, u.replace(/^https?:\/\//i, "").replace(/\/$/, ""));
        a.href = u;
        // 本人が書いたものなので、記事中のリンクと同じ扱いにする
        a.rel = "ugc nofollow noopener";
        a.target = "_blank";
        li.append(a);
        return li;
      }),
  );
  document.title = `${p.display_name || p.handle} | ハタラク文庫（仮）`;
}

function card(a) {
  const li = el("li", "card");
  const link = el("a");
  link.href = a.href;
  link.append(el("div", "emoji", a.emoji || "📝"));

  const box = el("div");
  box.append(el("h2", null, a.title));
  if (a.excerpt) box.append(el("p", "ex", a.excerpt));

  const meta = el("div", "meta");
  if (a.is_pr) meta.append(el("span", "tag pr", "PR"));
  for (const t of a.topics || []) meta.append(el("span", "tag", t));
  meta.append(el("span", null, a.published_at));
  box.append(meta);

  link.append(box);
  li.append(link);
  return li;
}

/** リポジトリ側の記事。DBが落ちていてもここは出る */
async function localWorks(handle) {
  try {
    const res = await fetch("articles.json", { cache: "no-cache" });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.articles || [])
      .filter((a) => a.handle && a.handle === handle)
      .map((a) => ({ ...a, href: `a/${encodeURIComponent(a.slug)}/` }));
  } catch {
    return [];
  }
}

/** DB側。取り込みずみのものは、リポジトリ側と slug で重なる */
async function dbWorks(handle) {
  try {
    const rows = await supa.request(
      `/rest/v1/public_works?site=eq.biz&handle=eq.${encodeURIComponent(handle)}` +
        "&select=id,slug,title,emoji,topics,is_pr,summary,published_at&order=published_at.desc&limit=100",
    );
    return (rows || []).map((r) => ({
      slug: r.slug,
      title: r.title,
      emoji: r.emoji,
      topics: r.topics || [],
      is_pr: r.is_pr === true,
      excerpt: r.summary || "",
      published_at: (r.published_at || "").slice(0, 10),
      href: `article.html?id=${encodeURIComponent(r.id)}`,
    }));
  } catch (err) {
    console.warn("公開ぶんを読めませんでした", err);
    return [];
  }
}

async function drawWorks(handle) {
  const local = await localWorks(handle);
  const remote = await dbWorks(handle);

  // 同じ slug があればリポジトリのほうを残す（生成ページがあり、そちらが正）
  const seen = new Set(local.map((a) => a.slug));
  const all = [...local, ...remote.filter((a) => !seen.has(a.slug))]
    .sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)));

  $("works").hidden = false;
  $("cards").replaceChildren(...all.map(card));
  $("count").textContent = all.length ? `　${all.length}本` : "";
  $("empty").hidden = all.length > 0;
  return all;
}

/** その人の欄を1つ取ってくる。無ければ null */
async function fetchProfile(handle) {
  const rows = await supa.request(
    `/rest/v1/profiles?handle=eq.${encodeURIComponent(handle)}&select=user_id,handle,display_name,bio,links`,
  );
  return (rows || [])[0] || null;
}

async function fetchMine() {
  const me = supa.userId();
  if (!me) return null;
  const rows = await supa.request(
    `/rest/v1/profiles?user_id=eq.${me}&select=user_id,handle,display_name,bio,links`,
  );
  return (rows || [])[0] || null;
}

/* ── 直すほう ────────────────────────────────── */

let mine = null;      // 自分の欄（無ければ null）

function fillForm(p) {
  $("f-handle").value = p?.handle || "";
  $("f-name").value = p?.display_name || "";
  $("f-bio").value = p?.bio || "";
  $("f-links").value = (p?.links || []).join("\n");

  // 一度決めた ID は変えられない。記事のリンクが迷子になるため
  const fixed = Boolean(p?.handle);
  $("f-handle").disabled = fixed;
  $("handle-hint").textContent = fixed
    ? "決めたあとは変えられません（記事からのリンクが迷子になるため）。"
    : "半角の英小文字・数字と - _。2〜30文字。URLになるので、決めたら変えられない";
}

function readForm() {
  const links = $("f-links").value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    handle: $("f-handle").value.trim().toLowerCase(),
    display_name: $("f-name").value.trim(),
    bio: $("f-bio").value.trim(),
    links,
  };
}

function problems(v) {
  const list = [];
  if (!HANDLE.test(v.handle)) list.push("IDは英小文字・数字と - _ で2〜30文字");
  if (!v.display_name) list.push("表示名が要ります");
  if (v.links.length > 5) list.push("リンクは5つまで");
  if (v.links.some((u) => !/^https?:\/\//i.test(u))) list.push("リンクは https:// から書いてください");
  return list;
}

async function save() {
  const v = readForm();
  const list = problems(v);
  if (list.length) { say(list.join(" / ")); return; }

  const me = supa.userId();
  if (!me) { say("ログインし直してください"); return; }

  $("save").disabled = true;
  $("save-note").textContent = "保存しています…";
  try {
    if (mine) {
      // handle は送らない。フォームで止めていても、送らないほうが確実
      await supa.request(`/rest/v1/profiles?user_id=eq.${me}`, {
        method: "PATCH",
        body: {
          display_name: v.display_name,
          bio: v.bio || null,
          links: v.links,
          // profiles には更新時のトリガが無いので、ここで入れる
          updated_at: new Date().toISOString(),
        },
      });
    } else {
      await supa.request("/rest/v1/profiles", {
        method: "POST",
        body: {
          user_id: me,
          handle: v.handle,
          display_name: v.display_name,
          bio: v.bio || null,
          links: v.links,
        },
      });
    }
    say("");
    $("save-note").textContent = "保存しました。";
    // 保存後は、他の人から見えるのと同じ形で見せる
    location.href = `profile.html?handle=${encodeURIComponent(v.handle || mine.handle)}`;
  } catch (err) {
    // unique 違反（IDの取り合い）もここに来る
    $("save-note").textContent = "";
    say(
      /duplicate|unique/i.test(err.message)
        ? "そのIDは使われています。別のものにしてください。"
        : `保存できませんでした： ${err.message}`,
    );
    $("save").disabled = false;
  }
}

/* ── ログインの案内 ──────────────────────────── */

function drawLoginState(message) {
  const box = $("login-state");
  $("login-box").hidden = false;
  if (message != null) { box.textContent = message; return; }

  if (!supa.isConfigured()) {
    box.textContent = "まだつないでいません（つなぎ方は README）。";
    $("login-row").hidden = true;
    return;
  }
  $("login-row").hidden = false;
  const on = supa.signedIn();
  $("login").hidden = on;
  $("email").hidden = on;
  $("logout").hidden = !on;
  box.textContent = on
    ? "ログイン中。"
    : "自分の欄を直すにはログインします。メールに届くリンクを開くだけで、パスワードは要りません。";
}

function wireLogin() {
  $("login").addEventListener("click", async () => {
    const email = $("email").value.trim();
    if (!email) { drawLoginState("メールアドレスを入れてください"); return; }
    try {
      await supa.sendLoginLink(email);
      drawLoginState("リンクを送りました。メールを開いてください。");
    } catch (err) {
      drawLoginState(`送れませんでした： ${err.message}`);
    }
  });
  $("logout").addEventListener("click", () => {
    supa.signOut();
    location.href = "profile.html";
  });
  $("save").addEventListener("click", save);
}

/* ── 起動 ────────────────────────────────── */

async function showOwn() {
  drawLoginState();
  if (!supa.isConfigured() || !supa.signedIn()) return;

  try {
    mine = await fetchMine();
  } catch (err) {
    say(`自分の欄を読めませんでした： ${err.message}`);
    return;
  }

  fillForm(mine);
  $("edit").hidden = false;
  if (mine) {
    drawProfile(mine);
    await drawWorks(mine.handle);
  } else {
    $("save-note").textContent = "まだ欄がありません。作ると記事に名前が出ます。";
  }
}

async function showOther(handle) {
  if (!supa.isConfigured()) {
    // DBが無くても、リポジトリの記事だけは出せる
    const list = await drawWorks(handle);
    $("who").hidden = false;
    $("name").textContent = list[0]?.author || handle;
    $("handle").textContent = `@${handle}`;
    say("まだつないでいないので、紹介文は出せません。");
    return;
  }

  let p = null;
  try {
    p = await fetchProfile(handle);
  } catch (err) {
    say(`読み込めませんでした： ${err.message}`);
  }

  const list = await drawWorks(handle);

  if (p) {
    drawProfile(p);
  } else {
    // DBに欄が無くても、記事だけある人はいる（取り込みずみの .md）
    $("who").hidden = false;
    $("name").textContent = list[0]?.author || handle;
    $("handle").textContent = `@${handle}`;
    if (!list.length) say("この書き手は見つかりませんでした。");
  }

  // 自分の欄なら、その場で直せるようにする
  if (supa.signedIn() && p && p.user_id === supa.userId()) {
    mine = p;
    const btn = $("to-edit");
    btn.hidden = false;
    btn.addEventListener("click", () => {
      fillForm(p);
      $("edit").hidden = false;
      $("cancel").hidden = false;
      btn.hidden = true;
      drawLoginState();
      $("f-name").focus();
    });
    $("cancel").addEventListener("click", () => {
      $("edit").hidden = true;
      $("login-box").hidden = true;
      btn.hidden = false;
      say("");
    });
  }
}

async function main() {
  supa.loadSession();
  wireLogin();

  const raw = new URLSearchParams(location.search).get("handle");
  const handle = HANDLE.test(String(raw || "").toLowerCase()) ? String(raw).toLowerCase() : null;

  if (handle) {
    await showOther(handle);
  } else if (raw) {
    say("そのIDは使えない形です。");
  } else {
    await showOwn();
  }
}

main();
