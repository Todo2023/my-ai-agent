/**
 * えほんの棚（一覧）
 *
 * books.json（tools/build-index.mjs が作る）だけを読む。
 *
 * えらびかたは2とおり。**タブで分けてある。**
 *   ・としで えらぶ    … 親が最初に見るのがここ
 *   ・ジャンルで えらぶ … 「ねる前に読むもの」のような探し方をするとき
 *
 * 2つを掛け合わせない。掛けると「0〜2さい × たび」のような空の組み合わせが
 * できて、棚が空になった理由が分からなくなる。タブを変えると前のしぼり込みは消える。
 */

const $ = (id) => document.getElementById(id);

// 年齢の区切り。細かく割っても選べないので4段にしてある
const BANDS = [
  { label: "0〜2さい", min: 0, max: 2 },
  { label: "3〜5さい", min: 3, max: 5 },
  { label: "6〜8さい", min: 6, max: 8 },
  { label: "9さい〜", min: 9, max: 99 },
];

// ジャンルの並び。books.json の genre と字面を合わせる
const GENRES = ["しぜん", "どうぶつ", "おやすみ", "さがす", "たび", "きもち"];

const TABS = [
  { key: "age", label: "としで えらぶ" },
  { key: "genre", label: "ジャンルで えらぶ" },
];

// ?tab=genre で開くと、ジャンルのタブから始まる。リンクで直接渡せるようにするため
const wantedTab = new URLSearchParams(location.search).get("tab");
const state = {
  all: [],
  tab: wantedTab === "genre" ? "genre" : "age",
  band: null,
  genre: null,
};

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
  if (b.genre) meta.append(el("span", "chip genre", b.genre));
  meta.append(el("span", "chip", `よみきかせ ${b.reading_minutes}ふん`));
  meta.append(el("span", null, `${b.pages}ページ・${b.author}`));
  info.append(meta);

  a.append(info);
  li.append(a);
  return li;
}

/** いま選ばれているしぼり込みに合う本 */
function visible() {
  if (state.tab === "age" && state.band) {
    return state.all.filter((b) => b.age_max >= state.band.min && b.age_min <= state.band.max);
  }
  if (state.tab === "genre" && state.genre) {
    return state.all.filter((b) => b.genre === state.genre);
  }
  return state.all;
}

function draw() {
  const list = visible();
  $("shelf").replaceChildren(...list.map(bookCard));

  const empty = $("empty");
  empty.textContent =
    state.tab === "genre"
      ? "その ジャンルの えほんが まだ ありません。"
      : "その としの えほんが まだ ありません。";
  empty.hidden = list.length > 0;
}

/** としで えらぶ / ジャンルで えらぶ */
function drawTabs() {
  const box = $("tabs");
  box.replaceChildren(
    ...TABS.map((t) => {
      const btn = el("button", "tab", t.label);
      btn.type = "button";
      btn.role = "tab";
      btn.setAttribute("aria-selected", String(state.tab === t.key));
      btn.addEventListener("click", () => {
        if (state.tab === t.key) return;
        state.tab = t.key;
        // タブを変えたら、前のタブのしぼり込みは消す（掛け合わせない）
        state.band = null;
        state.genre = null;
        drawTabs();
        drawFilters();
        draw();
      });
      return btn;
    })
  );
}

/** 選ばれているタブの中身。押すと しぼる、もう一度押すと ぜんぶに戻る */
function drawFilters() {
  const box = $("filters");
  const byAge = state.tab === "age";

  const make = (label, value) => {
    const btn = el("button", null, label);
    btn.type = "button";
    const now = byAge ? state.band : state.genre;
    btn.setAttribute("aria-pressed", String(now === value));
    btn.addEventListener("click", () => {
      const next = now === value ? null : value;
      if (byAge) state.band = next;
      else state.genre = next;
      drawFilters();
      draw();
    });
    return btn;
  };

  // その中身の本が何冊あるかを添える。0冊のタブを押させないため
  const count = byAge
    ? (v) => state.all.filter((b) => b.age_max >= v.min && b.age_min <= v.max).length
    : (v) => state.all.filter((b) => b.genre === v).length;

  const items = byAge
    ? BANDS.map((v) => [`${v.label}（${count(v)}）`, v])
    : GENRES.map((v) => [`${v}（${count(v)}）`, v]);

  box.replaceChildren(
    make(`ぜんぶ（${state.all.length}）`, null),
    ...items.map(([label, value]) => make(label, value))
  );
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
  drawTabs();
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

  // 棚の上と下の2か所に出す。下まで読んだ人にも押せるように
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
