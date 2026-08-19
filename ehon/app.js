/**
 * えほんの棚（一覧）
 *
 * books.json（tools/build-index.mjs が作る）だけを読む。
 * 対象年齢でしぼれるようにしてある。親が選ぶときに最初に見るのがそこだから。
 */

const $ = (id) => document.getElementById(id);

// 年齢の区切り。細かく割っても選べないので4段にしてある
const BANDS = [
  { label: "0〜2さい", min: 0, max: 2 },
  { label: "3〜5さい", min: 3, max: 5 },
  { label: "6〜8さい", min: 6, max: 8 },
  { label: "9さい〜", min: 9, max: 99 },
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
  a.href = `read.html?book=${encodeURIComponent(b.slug)}`;

  const img = el("img", "cover");
  img.src = `books/${b.slug}/${b.cover}`;
  img.alt = "";           // 表紙は飾り。中身はタイトルで伝わる
  img.loading = "lazy";
  a.append(img);

  const info = el("div", "info");
  info.append(el("h2", null, b.title));
  if (b.summary) info.append(el("p", "sum", b.summary));

  const meta = el("div", "meta");
  meta.append(el("span", "chip", `${b.age_min}〜${b.age_max}さい`));
  meta.append(el("span", "chip", `よみきかせ ${b.reading_minutes}ふん`));
  meta.append(el("span", null, `${b.pages}ページ・${b.author}`));
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
  box.replaceChildren(make("ぜんぶ", null), ...BANDS.map((b) => make(b.label, b)));
}

async function main() {
  try {
    const res = await fetch("books.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(String(res.status));
    state.all = (await res.json()).books || [];
  } catch (err) {
    console.error(err);
    $("empty").hidden = false;
    $("empty").textContent =
      "えほんの一覧を読み込めませんでした。ローカルで見るときは python3 -m http.server で開いてください。";
    return;
  }
  drawFilters();
  draw();
}

main();
setupSupportFoot();

// Service Worker。一度読んだえほんは端末に残り、次からは通信なしで開く。
// 絵は重いので、これが帯域の節約にもなる（sekkei/platform-kids.md）
if ("serviceWorker" in navigator) {
  addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => console.warn("sw", err));
  });
}

/**
 * おうちの方むけの応援リンク（棚のいちばん下）。
 *
 * reader.js の setupSupport と同じ判定にしてある。
 * **テスト用のリンク（buy.stripe.com/test_…）は出さない。**
 * 本物のお金が動かないのに カード情報の入力欄が出るため。
 */
function setupSupportFoot() {
  const url = String(window.TODO_EHON_CONFIG?.SUPPORT_URL || "");
  if (!/^https:\/\/buy\.stripe\.com\/(?!test_)[\w-]+$/.test(url)) return;

  const link = document.getElementById("support-foot-link");
  const box = document.getElementById("support-foot");
  if (!link || !box) return;
  link.href = url;
  box.hidden = false;
}
