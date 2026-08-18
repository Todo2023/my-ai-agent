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
};

/** 設定は端末に残す。次に開いたときも同じ見た目にする */
const store = {
  get ruby() { try { return localStorage.getItem("ehon:ruby") !== "0"; } catch { return true; } },
  set ruby(v) { try { localStorage.setItem("ehon:ruby", v ? "1" : "0"); } catch { /* 使えなくても読める */ } },
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
  $("speak").textContent = "🔊 よむ";
  try { speechSynthesis.cancel(); } catch { /* 対応していない端末 */ }
}

function speakCurrent() {
  const page = state.book.pages[state.page];
  if (!page || !("speechSynthesis" in window)) return;

  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(toSpeech(page.text));
    u.lang = "ja-JP";
    u.rate = 0.9;
    u.onend = () => { if (state.speaking) stopSpeech(); };
    speechSynthesis.speak(u);
    state.speaking = true;
    $("speak").setAttribute("aria-pressed", "true");
    $("speak").textContent = "■ とめる";
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
  $("pageno").textContent = `${page + 1} / ${book.pages.length}`;
  $("prev").disabled = page === 0;

  // 最後のページで「つぎ」を押せなくすると、おしまいの画面に行けなくなる。
  // 押せるままにして、名前だけ変える
  const isLast = page === book.pages.length - 1;
  $("next").textContent = isLast ? "おしまい" : "つぎ ▶";

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
  state.slug = cleanSlug(new URLSearchParams(location.search).get("book"));
  state.ruby = store.ruby;
  $("ruby").setAttribute("aria-pressed", String(state.ruby));

  if (!state.slug) {
    $("title").textContent = "えほんが えらばれていません";
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
    $("title").textContent = "この えほんは みつかりません";
    $("text").textContent = "なまえが かわったか、いまは おいて いないようです。";

    const back = document.createElement("a");
    back.href = "./";
    back.className = "to-shelf";
    back.textContent = "ほかの えほんを えらぶ";
    $("text").after(back);

    // めくるところは意味がないので消す
    document.querySelector(".reader-foot")?.remove();
    return;
  }

  document.title = `${state.book.title} | えほんの棚（仮）`;
  $("title").textContent = state.book.title;

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
  $("support").hidden = false;
}

main();
