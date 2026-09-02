/**
 * えほんのビューア
 *
 * ?book=xxx を見て books/xxx/book.json を読み、1ページずつ出す。
 *
 * ここで気をつけていること（sekkei/platform-kids.md）
 *   - 端末の中だけで完結する。読んだ記録もサーバーに送らない
 *   - ふりがなは切り替えられる。4歳と9歳で要るものが違う
 *   - 読み上げは端末の音声合成を使う。通信も費用も発生しない
 *   - 全ページを先に取りに行く。めくるたびに待たせない。
 *     Service Worker がキャッシュするので、2回目からは通信ゼロで開く
 */
import { rubyToDom, toSpeech, toPlain } from "./ruby.js";

const $ = (id) => document.getElementById(id);

const state = {
  slug: null,
  book: null,
  page: 0,
  ruby: true,
  speaking: false,
  // 英語を ならべて 出すか。日本語と いっしょに 読めるようにする（既定は 出す）
  showEn: true,
  // ?lang=en で来たとき（英語の棚から）は、英語だけにする
  enOnly: false,
};

/** 英語だけのときに 出す文。日本語の画面は これまでどおり 日本語のまま */
const EN_UI = {
  ruby: "Kana",
  speak: "🔊 Read",
  stop: "■ Stop",
  prev: "◀ Back",
  next: "Next ▶",
  last: "The End",
  endTitle: "The End",
  endNote: "Thank you for reading.",
  again: "Read again",
  other: "Other books",
  notFound: "This book was not found.",
  notFoundNote: "It may have been renamed, or it is not here right now.",
  toShelf: "Choose another book",
  support: "For grown-ups: support this shelf",
};

/** 設定は端末に残す。次に開いたときも同じ見た目にする */
const store = {
  get ruby() { try { return localStorage.getItem("ehon:ruby") !== "0"; } catch { return true; } },
  set ruby(v) { try { localStorage.setItem("ehon:ruby", v ? "1" : "0"); } catch { /* 使えなくても読める */ } },
  get showEn() { try { return localStorage.getItem("ehon:en") !== "0"; } catch { return true; } },
  set showEn(v) { try { localStorage.setItem("ehon:en", v ? "1" : "0"); } catch { /* 同上 */ } },
  lastPage(slug) { try { return Number(localStorage.getItem(`ehon:page:${slug}`)) || 0; } catch { return 0; } },
  setLastPage(slug, n) { try { localStorage.setItem(`ehon:page:${slug}`, String(n)); } catch { /* 同上 */ } },
};

function cleanSlug(raw) {
  return /^[\w-]{1,80}$/.test(raw || "") ? raw : null;
}

/** 読み上げを止める。ページを動かすときは必ず呼ぶ */
function stopSpeech() {
  state.speaking = false;
  $("speak").setAttribute("aria-pressed", "false");
  $("speak").textContent = state.enOnly ? EN_UI.speak : "🔊 よむ";
  try { speechSynthesis.cancel(); } catch { /* 対応していない端末 */ }
}

function speakCurrent() {
  const page = state.book.pages[state.page];
  if (!page || !("speechSynthesis" in window)) return;

  // 英語だけの画面なら 英語で 読む。ならべて 出しているときは 日本語のまま
  // （2つ つづけて 読むと、めくる まえに 長く 待たせる）
  const en = state.enOnly && page.text_en;

  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(en ? page.text_en : toSpeech(page.text));
    u.lang = en ? "en-US" : "ja-JP";
    u.rate = 0.9;
    u.onend = () => { if (state.speaking) stopSpeech(); };
    speechSynthesis.speak(u);
    state.speaking = true;
    $("speak").setAttribute("aria-pressed", "true");
    $("speak").textContent = state.enOnly ? EN_UI.stop : "■ とめる";
  } catch (err) {
    console.warn("読み上げに対応していません", err);
  }
}

function draw() {
  const { book, page } = state;
  const p = book.pages[page];

  const img = $("img");
  img.src = `books/${state.slug}/${p.image}`;
  img.alt = p.alt || "";

  $("text").replaceChildren(rubyToDom(p.text, state.ruby));
  $("text").hidden = state.enOnly;

  // 英語。無い絵本もあるので、あるときだけ 出す
  const en = $("text-en");
  en.textContent = p.text_en || "";
  en.hidden = !p.text_en || (!state.showEn && !state.enOnly);

  $("pageno").textContent = `${page + 1} / ${book.pages.length}`;
  $("prev").disabled = page === 0;

  // 最後のページで「つぎ」を押せなくすると、おしまいの画面に行けなくなる。
  // 押せるままにして、名前だけ変える
  const isLast = page === book.pages.length - 1;
  $("next").textContent = state.enOnly
    ? (isLast ? EN_UI.last : EN_UI.next)
    : (isLast ? "おしまい" : "つぎ ▶");

  $("end").classList.remove("show");

  store.setLastPage(state.slug, page);
}

function go(delta) {
  const next = state.page + delta;
  if (next < 0) return;

  stopSpeech();

  if (next >= state.book.pages.length) {
    $("end").classList.add("show");
    return;
  }
  state.page = next;
  draw();
}

/** ページの画像を先に取りに行く。めくったときに白くならないようにする */
function prefetch(book, slug) {
  for (const p of book.pages) {
    const img = new Image();
    img.src = `books/${slug}/${p.image}`;
  }
}

function bindGestures() {
  const stage = $("stage");
  let x0 = null;

  stage.addEventListener("touchstart", (e) => { x0 = e.changedTouches[0].clientX; }, { passive: true });
  stage.addEventListener("touchend", (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    // 指が滑っただけの動きでめくらないよう、しきい値を大きめにしてある
    if (Math.abs(dx) < 60) return;
    go(dx < 0 ? 1 : -1);
  }, { passive: true });

  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); go(1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
  });
}

async function main() {
  const q = new URLSearchParams(location.search);
  state.slug = cleanSlug(q.get("book"));
  state.ruby = store.ruby;
  state.enOnly = q.get("lang") === "en";
  state.showEn = state.enOnly || store.showEn;
  $("ruby").setAttribute("aria-pressed", String(state.ruby));
  $("lang").setAttribute("aria-pressed", String(state.showEn));

  if (state.enOnly) {
    // 英語だけの画面。ふりがなは 日本語のためのものなので しまう
    document.documentElement.lang = "en";
    $("ruby").hidden = true;
    $("lang").hidden = true;
    $("prev").textContent = EN_UI.prev;
    $("speak").textContent = EN_UI.speak;
    $("end-title").textContent = EN_UI.endTitle;
    $("end-note").textContent = EN_UI.endNote;
    $("restart").textContent = EN_UI.again;
    $("end-back").textContent = EN_UI.other;
    $("end-back").href = "en/";
    document.querySelector('.reader-bar a[aria-label]')?.setAttribute("href", "en/");
  }

  if (!state.slug) {
    $("title").textContent = state.enOnly ? "No book was chosen." : "えほんが えらばれていません";
    return;
  }

  try {
    const res = await fetch(`books/${state.slug}/book.json`, { cache: "no-cache" });
    if (!res.ok) throw new Error(String(res.status));
    state.book = await res.json();
  } catch (err) {
    console.error(err);
    // 読む人に出す文。**開発の事情は書かない。**
    // 消した えほんの URL を、あとから開く人がいる（前に配ったリンクや ブックマーク）
    $("title").textContent = state.enOnly ? EN_UI.notFound : "この えほんは みつかりません";
    $("text").textContent = state.enOnly
      ? EN_UI.notFoundNote
      : "なまえが かわったか、いまは おいて いないようです。";
    $("text").hidden = false;

    const back = document.createElement("a");
    back.href = state.enOnly ? "en/" : "./";
    back.className = "to-shelf";
    back.textContent = state.enOnly ? EN_UI.toShelf : "ほかの えほんを えらぶ";
    $("text").after(back);

    // めくるところは意味がないので消す
    document.querySelector(".reader-foot")?.remove();
    return;
  }

  const shown = state.enOnly && state.book.title_en ? state.book.title_en : state.book.title;
  document.title = state.enOnly ? `${shown} | Ehon Shelf` : `${shown} | えほんの棚（仮）`;
  $("title").textContent = shown;

  // 途中まで読んでいたら、そこから開く
  const last = store.lastPage(state.slug);
  state.page = last < state.book.pages.length ? last : 0;

  prefetch(state.book, state.slug);
  draw();
  bindGestures();

  $("prev").addEventListener("click", () => go(-1));
  $("next").addEventListener("click", () => go(1));

  $("ruby").addEventListener("click", () => {
    state.ruby = !state.ruby;
    store.ruby = state.ruby;
    $("ruby").setAttribute("aria-pressed", String(state.ruby));
    draw();
  });

  $("lang").addEventListener("click", () => {
    state.showEn = !state.showEn;
    store.showEn = state.showEn;
    $("lang").setAttribute("aria-pressed", String(state.showEn));
    draw();
  });

  $("speak").addEventListener("click", () => {
    if (state.speaking) stopSpeech(); else speakCurrent();
  });

  $("restart").addEventListener("click", () => {
    state.page = 0;
    draw();
  });

  // 読み上げっぱなしで閉じない
  addEventListener("pagehide", stopSpeech);

  if (!("speechSynthesis" in window)) $("speak").hidden = true;

  setupSupport();
}

/**
 * おしまいの画面に、保護者向けの応援リンクを出す。
 *
 * ■ テスト用のリンクは絶対に出さない
 *   Stripe のテストリンク（`buy.stripe.com/test_…`）は、本物のお金が動かないのに
 *   カード情報の入力欄が出る。読者が本気で入力してしまうので、
 *   **本番のリンクに差し替わるまで、この行ごと隠す。**
 *
 * ■ 子ども向けのボタンにはしない
 *   大人の言葉で、小さく、下に置く（sekkei/platform-kids.md）。
 */
function setupSupport() {
  const url = String(window.TODO_EHON_CONFIG?.SUPPORT_URL || "");
  if (!/^https:\/\/buy\.stripe\.com\/(?!test_)[\w-]+$/.test(url)) return;

  $("support-link").href = url;
  if (state.enOnly) $("support-link").textContent = EN_UI.support;
  $("support").hidden = false;
}

main();
