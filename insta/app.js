/**
 * 下書きを並べて、目で確かめる画面。
 *
 * **ここからは何も送らない。** 出すかどうかは人が決める。
 * いまは「キャプションをコピー」で手で投稿できる。
 * API を繋いだあとも、この画面で確かめてから出す流れは変えない。
 */
const $ = (id) => document.getElementById(id);

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/** キャプションをコピーするボタン。押した結果を横に出す */
function copyRow(p, row) {
  const copy = el("button", null, "キャプションをコピー");
  const said = el("span", "said");
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(p.caption);
      said.textContent = "コピーしました";
    } catch {
      said.textContent = "コピーできませんでした（手で選んでください）";
    }
  });
  row.append(copy, said);
  return said;
}

/**
 * きょう出す1件を、一番上に大きく出す。
 * どれを出すかは **posted.json の "today"**（手で書く記録）で決める。
 * 機械が勝手に選ぶと、出したかどうかと噛み合わなくなる。
 */
function showToday(posts, todaySlug) {
  const p = posts.find((x) => x.slug === todaySlug);
  if (!p) return null;

  $("today-img").src = p.image;
  $("today-img").alt = `${p.title} の投稿画像`;
  $("today-title").textContent = `${p.title}（${p.caption_length}文字・タグ${p.hashtag_count}・${Math.round(p.bytes / 1024)}KB）`;
  $("today-cap").textContent = p.caption;

  const row = $("today-row");
  row.replaceChildren();

  // 画像を保存。download を付けると、ブラウザが「保存」にしてくれる
  const save = el("a", "btn-like", "画像を保存");
  save.href = p.image;
  save.download = `${p.slug}.jpg`;
  row.append(save);

  copyRow(p, row);

  const open = el("a", null, "この絵本を開く");
  open.href = p.link;
  open.target = "_blank";
  open.rel = "noopener";
  row.append(open);

  $("today").hidden = false;
  return p.slug;
}

function card(p, doneRec) {
  const li = el("li", "post" + (doneRec ? " done" : ""));

  const img = el("img");
  img.src = p.image;
  img.alt = `${p.title} の投稿画像`;
  img.loading = "lazy";
  li.append(img);

  const body = el("div", "body");
  const head = el("div", "head");
  head.append(el("b", null, p.title));
  if (doneRec) head.append(el("span", "done-tag", `${doneRec.date} に出した`));
  head.append(el("span", null, `${p.caption_length}文字`));
  head.append(el("span", null, `タグ${p.hashtag_count}`));
  head.append(el("span", null, `${Math.round(p.bytes / 1024)}KB`));
  body.append(head);

  body.append(el("pre", "cap", p.caption));

  const row = el("div", "row");
  copyRow(p, row);

  const open = el("a", null, "この絵本を開く");
  open.href = p.link;
  open.target = "_blank";
  open.rel = "noopener";
  row.append(open);

  body.append(row);
  li.append(body);
  return li;
}

/**
 * 運用の状態を1行にする。**posted.json は手で書く記録**なので、
 * 無くても・壊れていても、下書きは見られるようにしておく。
 */
function showUnei(posts, state) {
  const done = (state.posted || []).filter((r) => r.slug);
  const left = posts.length - done.length;
  const box = $("unei");
  box.replaceChildren();

  const put = (label, value) => {
    const span = el("span", null, `${label} `);
    span.append(el("b", null, String(value)));
    box.append(span);
  };
  put("下書き", `${posts.length}件`);
  put("出した", `${done.length}件`);
  put("まだ", `${left}件`);
  if (state.unrecorded) put("記録漏れ", `${state.unrecorded}件`);
  if (left > 0) put("週3回なら", `あと約${Math.floor(left / 3 / 4.345)}ヶ月`);

  box.hidden = false;
  return new Map(done.map((r) => [r.slug, r]));
}

async function main() {
  try {
    const res = await fetch("posts.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(String(res.status));
    const { posts } = await res.json();

    // posted.json は**手で書く記録**。無くても下書きは見られるようにする
    let today = null;
    let doneBySlug = new Map();
    try {
      const r2 = await fetch("posted.json", { cache: "no-cache" });
      if (r2.ok) {
        const state = await r2.json();
        today = showToday(posts, state.today);
        doneBySlug = showUnei(posts, state);
      }
    } catch (err) {
      console.warn("posted.json を読めませんでした", err);
    }

    // きょう出す1件は上に大きく出したので、下の一覧からは外す。
    // 出し終えたものは下にまとめる（次に出すものを探しやすくするため）。
    const rest = posts.filter((p) => p.slug !== today);
    const yet = rest.filter((p) => !doneBySlug.has(p.slug));
    const already = rest.filter((p) => doneBySlug.has(p.slug));
    $("posts").replaceChildren(
      ...yet.map((p) => card(p, null)),
      ...already.map((p) => card(p, doneBySlug.get(p.slug)))
    );
    $("count").textContent = `${posts.length}件`;
    $("all-head").hidden = false;
  } catch (err) {
    console.error(err);
    $("count").textContent =
      "posts.json を読めませんでした。python3 -m http.server でサーバー越しに開いてください。";
  }
}

main();
