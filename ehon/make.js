/**
 * えほんを つくる画面
 *
 * Phase 1（投稿を受け付ける段）の前に、作るところだけ先に作ってある。
 * まだどこにも送らない。端末の中（localStorage）に残り、book.json として持ち出す。
 *
 * 記事（biz/write.html）と作りを分けている理由は docs/platform-kids.md にある。
 * 絵本は「1本の長い文章」ではなく「ページの並び」なので、Markdownの画面では作れない。
 *
 * 絵はファイル名だけを持つ。中身を localStorage に入れると数冊で容量が尽きるため、
 * 選んだ絵はその場の確認に使うだけにしてある。
 */
import { rubyToDom, toSpeech, toPlain } from "./ruby.js";

const $ = (id) => document.getElementById(id);
const KEY = "ehon:drafts";

let drafts = [];
let currentId = null;
let saveTimer = null;

// 選んだ絵の見た目だけを、この画面が開いているあいだ覚えておく（保存はしない）
const previews = new Map();   // `${draftId}:${pageIndex}` -> objectURL

/* ── 保存 ─────────────────────────────────── */

function load() {
  try {
    drafts = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (!Array.isArray(drafts)) drafts = [];
  } catch { drafts = []; }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(drafts));
    return true;
  } catch (err) {
    console.error(err);
    $("saved").textContent = "保存できませんでした（端末の空きが足りないかもしれません）";
    $("saved").classList.add("warn");
    return false;
  }
}

const current = () => drafts.find((d) => d.id === currentId);

function blank() {
  return {
    id: `b${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    title: "", slug: "", author: "", age_min: 3, age_max: 6,
    reading_minutes: 4, summary: "",
    pages: [{ image: "", alt: "", text: "" }],
  };
}

/* ── 画面 ─────────────────────────────────── */

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function readForm(d) {
  d.title = $("f-title").value.trim();
  d.slug = $("f-slug").value.trim();
  d.author = $("f-author").value.trim();
  d.age_min = Number($("f-agemin").value || 0);
  d.age_max = Number($("f-agemax").value || 0);
  d.reading_minutes = Number($("f-minutes").value || 1);
  d.summary = $("f-summary").value.trim();
}

function writeForm(d) {
  $("f-title").value = d.title || "";
  $("f-slug").value = d.slug || "";
  $("f-author").value = d.author || "";
  $("f-agemin").value = d.age_min ?? "";
  $("f-agemax").value = d.age_max ?? "";
  $("f-minutes").value = d.reading_minutes ?? "";
  $("f-summary").value = d.summary || "";
}

function drawDraftList() {
  $("draft-pick").replaceChildren(...drafts.map((d) => {
    const o = document.createElement("option");
    o.value = d.id;
    o.textContent = d.title || d.slug || "（名前のない えほん）";
    o.selected = d.id === currentId;
    return o;
  }));
  $("delete").disabled = drafts.length <= 1;
}

/** 1ページぶんの入力欄 */
function pageRow(page, i, d) {
  const li = el("li", "page-row");

  const head = el("div", "page-head");
  head.append(el("span", "no", `${i + 1}ページ`));

  const move = (dir, label) => {
    const b = el("button", "btn small", label);
    b.type = "button";
    b.disabled = dir < 0 ? i === 0 : i === d.pages.length - 1;
    b.addEventListener("click", () => {
      const [p] = d.pages.splice(i, 1);
      d.pages.splice(i + dir, 0, p);
      // 見た目の対応もいっしょに動かす
      const a = previews.get(`${d.id}:${i}`);
      const b2 = previews.get(`${d.id}:${i + dir}`);
      if (a) previews.set(`${d.id}:${i + dir}`, a); else previews.delete(`${d.id}:${i + dir}`);
      if (b2) previews.set(`${d.id}:${i}`, b2); else previews.delete(`${d.id}:${i}`);
      touch();
      drawPages();
    });
    return b;
  };
  head.append(move(-1, "↑"), move(1, "↓"));

  const del = el("button", "btn small danger", "消す");
  del.type = "button";
  del.disabled = d.pages.length <= 1;
  del.addEventListener("click", () => {
    if (!confirm(`${i + 1}ページを消します。`)) return;
    d.pages.splice(i, 1);
    previews.delete(`${d.id}:${i}`);
    touch();
    drawPages();
  });
  head.append(del);
  li.append(head);

  const grid = el("div", "page-grid");

  // 左：絵
  const left = el("div", "page-art");
  const img = el("img", "page-thumb");
  const url = previews.get(`${d.id}:${i}`);
  if (url) { img.src = url; img.alt = ""; } else { img.hidden = true; }
  left.append(img);
  if (!url) left.append(el("div", "no-art", page.image ? `${page.image}（この画面では表示できません）` : "絵をえらぶと ここに出ます"));

  const pick = el("input");
  pick.type = "file";
  pick.accept = "image/*,.svg";
  pick.className = "pick";
  pick.addEventListener("change", () => {
    const file = pick.files?.[0];
    if (!file) return;
    // ファイル名だけを book.json に入れる。中身は持たない
    page.image = file.name;
    const old = previews.get(`${d.id}:${i}`);
    if (old) URL.revokeObjectURL(old);
    previews.set(`${d.id}:${i}`, URL.createObjectURL(file));
    touch();
    drawPages();
  });
  left.append(pick);

  const name = el("input");
  name.type = "text";
  name.className = "file-name";
  name.placeholder = "p01.svg";
  name.value = page.image || "";
  name.spellcheck = false;
  name.addEventListener("input", () => { page.image = name.value.trim(); touch(); });
  left.append(name);

  grid.append(left);

  // 右：文
  const right = el("div", "page-text-fields");

  const textLabel = el("label", null, "この ページの 文");
  const text = el("textarea");
  text.value = page.text || "";
  text.rows = 3;
  text.placeholder = "よるに なると あかりが つく、｜小《ちい》さな パンやさんが あります。";
  text.addEventListener("input", () => { page.text = text.value; touch(); drawPreview(li, page); });
  textLabel.append(text);
  right.append(textLabel);

  const hint = el("p", "hint");
  hint.append("ふりがなは ");
  hint.append(el("code", null, "｜小《ちい》さな"));
  hint.append(" のように書く（｜を省くと直前の漢字に付く）");
  right.append(hint);

  const altLabel = el("label", null, "絵の せつめい（alt）");
  const alt = el("input");
  alt.type = "text";
  alt.value = page.alt || "";
  alt.placeholder = "月の下に立つ小さなパン屋さん";
  alt.addEventListener("input", () => { page.alt = alt.value; touch(); });
  altLabel.append(alt);
  right.append(altLabel);

  const speak = el("button", "btn small", "🔊 よみあげて たしかめる");
  speak.type = "button";
  speak.addEventListener("click", () => {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(toSpeech(page.text));
      u.lang = "ja-JP";
      u.rate = 0.9;
      speechSynthesis.speak(u);
    } catch { /* 対応していない端末では何も起きない */ }
  });
  if (!("speechSynthesis" in window)) speak.hidden = true;
  right.append(speak);

  const prev = el("p", "page-preview");
  right.append(prev);

  grid.append(right);
  li.append(grid);

  drawPreview(li, page);
  return li;
}

/** ふりがなを付けた見た目を出す */
function drawPreview(li, page) {
  const box = li.querySelector(".page-preview");
  if (box) box.replaceChildren(rubyToDom(page.text, true));
}

function drawPages() {
  const d = current();
  $("pages").replaceChildren(...d.pages.map((p, i) => pageRow(p, i, d)));
}

/* ── 出来上がり ─────────────────────────────── */

function toBookJson(d) {
  return `${JSON.stringify({
    slug: d.slug,
    title: d.title,
    author: d.author,
    age_min: d.age_min,
    age_max: d.age_max,
    reading_minutes: d.reading_minutes,
    cover: d.pages[0]?.image || "",
    summary: d.summary,
    pages: d.pages.map((p) => ({ image: p.image, alt: p.alt, text: p.text })),
  }, null, 2)}\n`;
}

function problems(d) {
  const out = [];
  if (!d.title) out.push("だいめいが 空です");
  if (!d.slug) out.push("フォルダ名が 空です");
  else if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(d.slug)) out.push("フォルダ名は半角の小文字・数字・- だけにしてください");
  const noImage = d.pages.filter((p) => !p.image).length;
  if (noImage) out.push(`絵の入っていないページが ${noImage}つ`);
  const noAlt = d.pages.filter((p) => !p.alt).length;
  if (noAlt) out.push(`絵のせつめい（alt）がないページが ${noAlt}つ`);
  return out;
}

function drawProblems() {
  const list = problems(current());
  // alt がないだけなら止めない。注意だけ出す
  const blocking = list.filter((m) => !m.includes("alt"));
  $("problems").hidden = list.length === 0;
  $("problems").textContent = list.join(" / ");
  $("problems").classList.toggle("soft", blocking.length === 0);
  $("download").disabled = blocking.length > 0;
}

function download() {
  const d = current();
  const blob = new Blob([toBookJson(d)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "book.json";
  a.click();
  URL.revokeObjectURL(url);
}

/* ── 動かす ────────────────────────────────── */

function touch() {
  const d = current();
  if (!d) return;
  readForm(d);
  drawProblems();

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

function switchTo(id) {
  currentId = id;
  writeForm(current());
  drawDraftList();
  drawPages();
  drawProblems();
}

function main() {
  load();
  if (!drafts.length) drafts.push(blank());
  switchTo(drafts[drafts.length - 1].id);

  for (const f of ["title", "slug", "author", "agemin", "agemax", "minutes", "summary"]) {
    $(`f-${f}`).addEventListener("input", touch);
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
    if (!confirm(`「${d.title || "名前のない えほん"}」を消します。元に戻せません。`)) return;
    drafts = drafts.filter((x) => x.id !== currentId);
    if (!drafts.length) drafts.push(blank());
    persist();
    switchTo(drafts[drafts.length - 1].id);
  });

  $("add-page").addEventListener("click", () => {
    current().pages.push({ image: "", alt: "", text: "" });
    touch();
    drawPages();
  });

  $("download").addEventListener("click", download);
}

main();
