/**
 * 記事を書く画面
 *
 * Phase 1（投稿を受け付ける段）の前に、書くところだけ先に作ってある。
 * まだどこにも送らない。書いたものは端末の中（localStorage）だけに残り、
 * 出来上がりは .md として持ち出す。
 *
 * ここを先に作った理由は docs/platform-marketing.md にある。
 * マーケターはGitHubを開かないので、Zennと同じGitHub連携を真似ると書き手が来ない。
 * 「見たまま書けて、裏はMarkdown」がこのサービスの入口になる。
 *
 * つないだあと（Phase 1）は、この画面の「ダウンロード」が「保存」に変わるだけで、
 * 書き味の部分はそのまま使える。
 */
import { renderMarkdown, parseFrontMatter, readingMinutes } from "./md.js";
import * as supa from "./supa.js";

const $ = (id) => document.getElementById(id);

const KEY = "biz:drafts";
const FIELDS = ["title", "slug", "emoji", "author", "date", "topics", "pr", "src"];

let drafts = [];      // [{id, ...FIELDS, updated_at}]
let currentId = null;
let saveTimer = null;

/* ── 保存（端末の中だけ） ───────────────────────────── */

function load() {
  try {
    drafts = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (!Array.isArray(drafts)) drafts = [];
  } catch {
    drafts = [];
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(drafts));
    return true;
  } catch (err) {
    // 容量いっぱいのときに黙って消えるのが一番困る
    console.error(err);
    $("saved").textContent = "保存できませんでした（端末の空きが足りないかもしれません）";
    $("saved").classList.add("warn");
    return false;
  }
}

function current() {
  return drafts.find((d) => d.id === currentId);
}

function blank() {
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return {
    id: `d${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    title: "", slug: "", emoji: "", author: "", date: iso, topics: "", pr: false, src: "",
    updated_at: Date.now(),
  };
}

/* ── 画面とデータのやりとり ─────────────────────────── */

function readForm() {
  return {
    title: $("f-title").value.trim(),
    slug: $("f-slug").value.trim(),
    emoji: $("f-emoji").value.trim(),
    author: $("f-author").value.trim(),
    date: $("f-date").value,
    topics: $("f-topics").value.trim(),
    pr: $("f-pr").checked,
    src: $("src").value,
  };
}

function writeForm(d) {
  $("f-title").value = d.title || "";
  $("f-slug").value = d.slug || "";
  $("f-emoji").value = d.emoji || "";
  $("f-author").value = d.author || "";
  $("f-date").value = d.date || "";
  $("f-topics").value = d.topics || "";
  $("f-pr").checked = d.pr === true;
  $("src").value = d.src || "";
}

function drawDraftList() {
  const sel = $("draft-pick");
  sel.replaceChildren(...drafts.map((d) => {
    const o = document.createElement("option");
    o.value = d.id;
    o.textContent = d.title || d.slug || "（名前のない下書き）";
    o.selected = d.id === currentId;
    return o;
  }));
  $("delete").disabled = drafts.length <= 1;
}

/* ── 出来上がりの形 ─────────────────────────────── */

function topicList(raw) {
  // 全角カンマ・読点でも切れるようにしておく。日本語で書くと必ず混ざる
  return String(raw).split(/[,、，]/).map((t) => t.trim()).filter(Boolean);
}

function toMarkdown(d) {
  const lines = ["---", `title: "${String(d.title).replace(/"/g, "'")}"`];
  if (d.emoji) lines.push(`emoji: "${d.emoji}"`);
  const topics = topicList(d.topics);
  if (topics.length) lines.push(`topics: [${topics.join(", ")}]`);
  if (d.author) lines.push(`author: "${d.author}"`);
  lines.push(`published_at: "${d.date}"`);
  lines.push("published: true");
  if (d.pr) lines.push("is_pr: true");
  lines.push("---", "", String(d.src).trim(), "");
  return lines.join("\n");
}

/** 出す前に気づきたいことだけ出す。書いている途中で赤くしない */
function problems(d) {
  const out = [];
  if (!d.title) out.push("タイトルが空です");
  if (!d.slug) out.push("ファイル名が空です");
  else if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(d.slug)) out.push("ファイル名は半角の小文字・数字・- だけにしてください");
  if (!d.date) out.push("公開日が空です");
  if (!String(d.src).trim()) out.push("本文が空です");
  return out;
}

/* ── 描き直し ──────────────────────────────── */

function draw() {
  const d = current();
  if (!d) return;

  const md = toMarkdown(d);
  const { body } = parseFrontMatter(md);
  const { html } = renderMarkdown(body);

  // md.js は生HTMLを通さないので、この文字列を入れてよい
  $("preview").innerHTML = html;

  const chars = String(d.src).replace(/\s+/g, "").length;
  $("chars").textContent = `${chars}字・約${readingMinutes(d.src)}分`;

  const list = problems(d);
  $("problems").hidden = list.length === 0;
  $("problems").textContent = list.length ? `あと ${list.length}つ： ${list.join(" / ")}` : "";
  $("download").disabled = list.length > 0;
}

function touch() {
  const d = current();
  if (!d) return;
  Object.assign(d, readForm(), { updated_at: Date.now() });
  draw();

  // 打つたびに書き出すと重いので、少し置いてからまとめて保存する
  clearTimeout(saveTimer);
  $("saved").textContent = "…";
  $("saved").classList.remove("warn");
  saveTimer = setTimeout(() => {
    if (persist()) {
      $("saved").textContent = "この端末に保存しました";
      drawDraftList();
    }
  }, 400);
}

/* ── 書くのを助けるボタン ───────────────────────── */

function applyTool(btn) {
  const ta = $("src");
  const [s, e] = [ta.selectionStart, ta.selectionEnd];
  const value = ta.value;
  const selected = value.slice(s, e);

  let insert, caret;

  if (btn.dataset.wrap) {
    // 「**|**」の | が、置いたあとのカーソル位置
    const [before, after] = btn.dataset.wrap.split("|");
    insert = before + selected + after;
    caret = s + before.length + selected.length;
  } else if (btn.dataset.line) {
    const head = value.lastIndexOf("\n", s - 1) + 1;
    ta.setSelectionRange(head, head);
    insert = btn.dataset.line;
    caret = head + insert.length;
    ta.setRangeText(insert, head, head, "end");
    ta.focus();
    ta.setSelectionRange(caret, caret);
    touch();
    return;
  } else if (btn.dataset.block) {
    const nl = s > 0 && value[s - 1] !== "\n" ? "\n\n" : "";
    insert = nl + btn.dataset.block + "\n";
    caret = s + insert.length;
  } else {
    return;
  }

  ta.setRangeText(insert, s, e, "end");
  ta.focus();
  ta.setSelectionRange(caret, caret);
  touch();
}

/* ── 持ち出し ──────────────────────────────── */

function download() {
  const d = current();
  const blob = new Blob([toMarkdown(d)], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${d.slug}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

async function copyAll() {
  const text = toMarkdown(current());
  try {
    await navigator.clipboard.writeText(text);
    $("saved").textContent = "コピーしました";
  } catch {
    // 権限が下りない環境がある。選択状態にして、手でコピーしてもらう
    $("src").focus();
    $("src").select();
    $("saved").textContent = "コピーできませんでした。本文を選択したので、手でコピーしてください";
  }
}

/* ── トピックの候補（表記ゆれを減らす） ────────────── */

async function loadTopicHints() {
  try {
    const res = await fetch("articles.json", { cache: "no-cache" });
    if (!res.ok) return;
    const topics = (await res.json()).topics || [];
    if (topics.length) $("topic-suggest").textContent = `すでにあるもの：${topics.join("・")}`;
  } catch {
    // 出なくても書けるので、黙って諦める
  }
}

/* ── 送る（config.js が空のあいだは何も送らない） ────────── */

function drawSendState(message) {
  const box = $("send-state");
  if (message != null) { box.textContent = message; return; }

  if (!supa.isConfigured()) {
    box.textContent = "まだつないでいません。書いたものは端末の中だけに残ります（つなぎ方は README）。";
    $("send-row").hidden = true;
    return;
  }
  $("send-row").hidden = false;
  const on = supa.signedIn();
  $("login").hidden = on;
  $("email").hidden = on;
  $("submit").hidden = !on;
  $("logout").hidden = !on;
  box.textContent = on
    ? "ログイン中。審査に出すと、通るまで公開されません。"
    : "審査に出すにはログインします。メールに届くリンクを開くだけで、パスワードは要りません。";
}

async function submit() {
  const d = current();
  const list = problems(d);
  if (list.length) { drawSendState(`出せません： ${list.join(" / ")}`); return; }

  $("submit").disabled = true;
  drawSendState("送っています…");
  try {
    await supa.submitArticle(d, topicList(d.topics));
    drawSendState("審査に出しました。結果はメールで届きます。");
  } catch (err) {
    // RLS で弾かれた理由がそのまま返る。招待されていない場合もここに来る
    drawSendState(`送れませんでした： ${err.message}`);
    $("submit").disabled = false;
  }
}

function wireSend() {
  supa.loadSession();
  drawSendState();

  $("login").addEventListener("click", async () => {
    const email = $("email").value.trim();
    if (!email) { drawSendState("メールアドレスを入れてください"); return; }
    try {
      await supa.sendLoginLink(email);
      drawSendState("リンクを送りました。メールを開いてください。");
    } catch (err) {
      drawSendState(`送れませんでした： ${err.message}`);
    }
  });

  $("logout").addEventListener("click", () => { supa.signOut(); drawSendState(); });
  $("submit").addEventListener("click", submit);
}

/* ── 起動 ───────────────────────────────── */

function switchTo(id) {
  currentId = id;
  writeForm(current());
  drawDraftList();
  draw();
}

function main() {
  load();
  if (!drafts.length) drafts.push(blank());
  switchTo(drafts[drafts.length - 1].id);

  for (const f of FIELDS) {
    const node = f === "src" ? $("src") : $(`f-${f}`);
    node.addEventListener("input", touch);
    node.addEventListener("change", touch);
  }

  $("draft-pick").addEventListener("change", (e) => switchTo(e.target.value));

  $("new").addEventListener("click", () => {
    const d = blank();
    drafts.push(d);
    persist();
    switchTo(d.id);
    $("f-title").focus();
  });

  $("delete").addEventListener("click", () => {
    const d = current();
    if (!confirm(`「${d.title || "名前のない下書き"}」を消します。元に戻せません。`)) return;
    drafts = drafts.filter((x) => x.id !== currentId);
    if (!drafts.length) drafts.push(blank());
    persist();
    switchTo(drafts[drafts.length - 1].id);
  });

  for (const btn of document.querySelectorAll(".toolbar .btn")) {
    btn.addEventListener("click", () => applyTool(btn));
  }

  $("download").addEventListener("click", download);
  $("copy").addEventListener("click", copyAll);

  // 狭い画面では「書く」「見る」を切り替える。広い画面では両方出す
  const setTab = (preview) => {
    $("panes").classList.toggle("show-preview", preview);
    $("tab-write").setAttribute("aria-pressed", String(!preview));
    $("tab-preview").setAttribute("aria-pressed", String(preview));
  };
  $("tab-write").addEventListener("click", () => setTab(false));
  $("tab-preview").addEventListener("click", () => setTab(true));

  loadTopicHints();
  wireSend();
}

main();
