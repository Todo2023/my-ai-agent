/**
 * 英語の棚（一覧）
 *
 * 日本語の ../app.js と同じ books.json を読む。**中身は1つ。**
 * 訳を別ファイルに分けると、片方だけ古くなる。
 *
 * ここに出すのは has_en が true の絵本だけ。1ページでも英語が抜けている本を
 * 混ぜると、読んでいる途中で英語が消える（build-index.mjs が判定している）。
 */

const $ = (id) => document.getElementById(id);

// 年齢の区切りは日本語の棚と同じ。ラベルだけ英語にする
const BANDS = [
  { label: "Ages 0–2", min: 0, max: 2 },
  { label: "Ages 3–5", min: 3, max: 5 },
  { label: "Ages 6–8", min: 6, max: 8 },
  { label: "Ages 9+", min: 9, max: 99 },
];

const state = { all: [], band: null };

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function bookCard(b) {
  const li = el("li", "book");
  const a = el("a");
  // lang=en で開くと、読む画面が英語だけになる（reader.js）
  a.href = `../read.html?book=${encodeURIComponent(b.slug)}&lang=en`;

  const img = el("img", "cover");
  img.src = `../books/${b.slug}/${b.cover}`;
  img.alt = "";           // 表紙は飾り。中身はタイトルで伝わる
  img.loading = "lazy";
  a.append(img);

  const info = el("div", "info");
  info.append(el("h2", null, b.title_en || b.title));
  if (b.summary_en) info.append(el("p", "sum", b.summary_en));

  const meta = el("div", "meta");
  meta.append(el("span", "chip", `Ages ${b.age_min}–${b.age_max}`));
  meta.append(el("span", "chip", `${b.reading_minutes} min read`));
  meta.append(el("span", null, `${b.pages} pages`));
  // 日本語でも読めることを、その場で見せる
  meta.append(el("span", "chip", "日本語 / English"));
  info.append(meta);

  a.append(info);
  li.append(a);
  return li;
}

function draw() {
  const list = state.band
    ? state.all.filter((b) => b.age_max >= state.band.min && b.age_min <= state.band.max)
    : state.all;

  $("shelf").replaceChildren(...list.map(bookCard));
  $("empty").hidden = list.length > 0;
}

function drawFilters() {
  const box = $("filters");
  const make = (label, band) => {
    const btn = el("button", null, label);
    btn.type = "button";
    btn.setAttribute("aria-pressed", String(state.band === band));
    btn.addEventListener("click", () => {
      state.band = state.band === band ? null : band;
      drawFilters();
      draw();
    });
    return btn;
  };
  box.replaceChildren(make("All", null), ...BANDS.map((b) => make(b.label, b)));
}

async function main() {
  try {
    const res = await fetch("../books.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(String(res.status));
    state.all = ((await res.json()).books || []).filter((b) => b.has_en);
  } catch (err) {
    console.error(err);
    $("empty").hidden = false;
    $("empty").textContent = "Could not load the list of books. Please try again.";
    return;
  }
  drawFilters();
  draw();
}

main();
setupSupportFoot();

// Service Worker は棚と共有する。en/ から登録しても、置き場所は ../sw.js なので
// 一度読んだ絵本は日本語の棚でもそのまま開ける
if ("serviceWorker" in navigator) {
  addEventListener("load", () => {
    navigator.serviceWorker.register("../sw.js", { scope: "../" })
      .catch((err) => console.warn("sw", err));
  });
}

/** おうちの方むけの応援リンク。../app.js と同じ判定（テスト用のリンクは出さない） */
function setupSupportFoot() {
  const url = String(window.TODO_EHON_CONFIG?.SUPPORT_URL || "");
  if (!/^https:\/\/buy\.stripe\.com\/(?!test_)[\w-]+$/.test(url)) return;

  for (const [boxId, linkId] of [
    ["support-foot", "support-foot-link"],
    ["support-foot2", "support-foot-link2"],
  ]) {
    const box = document.getElementById(boxId);
    const link = document.getElementById(linkId);
    if (!box || !link) continue;
    link.href = url;
    box.hidden = false;
  }
}
