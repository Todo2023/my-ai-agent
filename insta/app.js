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

function card(p) {
  const li = el("li", "post");

  const img = el("img");
  img.src = p.image;
  img.alt = `${p.title} の投稿画像`;
  img.loading = "lazy";
  li.append(img);

  const body = el("div", "body");
  const head = el("div", "head");
  head.append(el("b", null, p.title));
  head.append(el("span", null, `${p.caption_length}文字`));
  head.append(el("span", null, `タグ${p.hashtag_count}`));
  head.append(el("span", null, `${Math.round(p.bytes / 1024)}KB`));
  body.append(head);

  body.append(el("pre", "cap", p.caption));

  const row = el("div", "row");
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

  const open = el("a", null, "この絵本を開く");
  open.href = p.link;
  open.target = "_blank";
  open.rel = "noopener";
  row.append(open);

  body.append(row);
  li.append(body);
  return li;
}

async function main() {
  try {
    const res = await fetch("posts.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(String(res.status));
    const { posts } = await res.json();
    $("posts").replaceChildren(...posts.map(card));
    $("count").textContent = `${posts.length}件`;
  } catch (err) {
    console.error(err);
    $("count").textContent =
      "posts.json を読めませんでした。python3 -m http.server でサーバー越しに開いてください。";
  }
}

main();
