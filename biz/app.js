/**
 * 記事一覧
 *
 * 2か所から集めて並べる。
 *   1. articles.json … リポジトリに置いた記事（tools/build-index.mjs が作る）
 *   2. Supabase の public_works … 審査を通して公開された記事
 *
 * 2が落ちても1は出る。逆はない。**読めるものを優先**して、
 * つながらない日でも一覧が真っ白にならないようにしてある。
 */
import * as supa from "./supa.js";

const $ = (id) => document.getElementById(id);
const state = { all: [], topic: null, q: "" };

/** テキストをそのままDOMに入れる。innerHTML を使わないので記法の心配が要らない */
function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function card(a) {
  const li = el("li", "card");
  const link = el("a");
  // DBから来たものは id で開く。リポジトリの記事は slug で開く
  link.href = a.from_db
    ? `article.html?id=${encodeURIComponent(a.id)}`
    : `article.html?slug=${encodeURIComponent(a.slug)}`;

  link.append(el("div", "emoji", a.emoji));

  const box = el("div");
  box.append(el("h2", null, a.title));
  if (a.excerpt) box.append(el("p", "ex", a.excerpt));

  const meta = el("div", "meta");
  if (a.is_pr) meta.append(el("span", "tag pr", "PR"));
  for (const t of a.topics) meta.append(el("span", "tag", t));
  meta.append(el("span", null, `${a.published_at}・約${a.minutes}分`));
  box.append(meta);

  link.append(box);
  li.append(link);
  return li;
}

function matches(a) {
  if (state.topic && !a.topics.includes(state.topic)) return false;
  if (!state.q) return true;
  const hay = `${a.title} ${a.excerpt} ${a.topics.join(" ")} ${a.author}`.toLowerCase();
  return hay.includes(state.q);
}

function draw() {
  const list = state.all.filter(matches);
  const cards = $("cards");
  cards.replaceChildren(...list.map(card));
  $("empty").hidden = list.length > 0;
  $("count").textContent = `${list.length}本`;
}

function drawTopics(topics) {
  const ul = $("topics");
  const make = (label, value) => {
    const li = el("li");
    const btn = el("button", null, label);
    btn.type = "button";
    btn.setAttribute("aria-pressed", String(state.topic === value));
    btn.addEventListener("click", () => {
      // 同じものをもう一度押したら解除
      state.topic = state.topic === value ? null : value;
      drawTopics(topics);
      draw();
    });
    li.append(btn);
    return li;
  };
  ul.replaceChildren(make("すべて", null), ...topics.map((t) => make(t, t)));
}

/** Supabase で公開されている記事を取りに行く。落ちても一覧は出す */
async function fromDatabase() {
  if (!supa.isConfigured()) return [];
  try {
    const rows = await supa.request(
      "/rest/v1/public_works?site=eq.biz&select=*&order=published_at.desc&limit=100",
    );
    return (rows || []).map((r) => ({
      from_db: true,
      id: r.id,
      slug: r.slug,
      title: r.title,
      emoji: r.emoji || "📝",
      topics: r.topics || [],
      author: r.display_name || "",
      published_at: (r.published_at || "").slice(0, 10),
      is_pr: r.is_pr === true,
      excerpt: r.summary || "",
      minutes: 1,
    }));
  } catch (err) {
    console.warn("公開ぶんを読めませんでした", err);
    return [];
  }
}

async function main() {
  let local = [];
  let topics = [];
  try {
    const res = await fetch("articles.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    local = data.articles || [];
    topics = data.topics || [];
  } catch (err) {
    // 読めない理由はだいたい file:// で開いたとき
    console.error(err);
  }

  const remote = await fromDatabase();

  // 同じ slug があればリポジトリのほうを残す（そちらが正）
  const seen = new Set(local.map((a) => a.slug));
  state.all = [...local, ...remote.filter((a) => !seen.has(a.slug))]
    .sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)));

  drawTopics([...new Set([...topics, ...remote.flatMap((a) => a.topics)])].sort());
  draw();

  if (!state.all.length) {
    $("empty").hidden = false;
    $("empty").textContent =
      "記事を読み込めませんでした。ローカルで見るときは python3 -m http.server で開いてください。";
  }

  $("q").addEventListener("input", (e) => {
    state.q = e.target.value.trim().toLowerCase();
    draw();
  });
}

main();
