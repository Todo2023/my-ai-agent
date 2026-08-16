/**
 * 記事一覧
 *
 * articles.json（tools/build-index.mjs が作る）だけを読む。
 * 記事本文は開いたときに取りに行くので、一覧は記事が増えても重くならない。
 */

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
  link.href = `article.html?slug=${encodeURIComponent(a.slug)}`;

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

async function main() {
  try {
    const res = await fetch("articles.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    state.all = data.articles || [];
    drawTopics(data.topics || []);
    draw();
  } catch (err) {
    // 読めない理由はだいたい file:// で開いたとき。原因を出しておく
    $("empty").hidden = false;
    $("empty").textContent =
      "記事の一覧を読み込めませんでした。ローカルで見るときは python3 -m http.server で開いてください。";
    console.error(err);
  }

  $("q").addEventListener("input", (e) => {
    state.q = e.target.value.trim().toLowerCase();
    draw();
  });
}

main();
