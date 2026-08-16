/**
 * 置いてあるものを点検する。
 *
 *   node biz/tools/check.mjs
 *
 * 直したあとと、**コミットする前**に走らせる。
 * 見るのは「実際にはまった落とし穴」（sekkei/hikitsugi-biz.md）だけで、
 * 好みの問題は見ない。増やすときも、一度はまったものだけ足すこと。
 *
 *   1. 生成物が最新か        … .md を直して build-index.mjs を流し忘れていないか
 *   2. config.js の読み込み  … 忘れるとDBに繋がらないのに静かに動く
 *   3. noindex の付き方      … 外してはいけない画面から外れていないか
 *   4. 外部の読み込み        … CDN・Webフォントを入れない決まり（CLAUDE.md）
 *   5. _headers と接続先     … Cloudflare に移したとき CSP がSupabaseを塞がないか
 *
 * ネットワークには出ない。ファイルを読むだけ。
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collect, pagesDir, root, REDIRECT, SLUG } from "./build-index.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

let bad = 0;
const ok = (label, cond, extra = "") => {
  if (cond) return true;
  bad++;
  console.error(`✗ ${label}${extra ? `　${extra}` : ""}`);
  return false;
};
const done = (label) => console.log(`○ ${label}`);

const read = async (path) => {
  try { return await readFile(path, "utf8"); } catch { return null; }
};

/* ── 1. 生成物が最新か ──────────────────────────────
   .md を直したのに build-index.mjs を流していない／流したのに
   コミットしていない、が一番起きる。配信にビルドを持たないので、
   置いてあるものが古いと、そのまま古いものが配られる            */

const { indexJson, pages, drafts, errors } = await collect();

for (const e of errors) ok(`記事の front matter: ${e}`, false);

ok("articles.json が最新", (await read(join(root, "articles.json"))) === indexJson,
  "→ node biz/tools/build-index.mjs");

for (const page of pages) {
  const path = join(pagesDir, page.slug, "index.html");
  ok(`a/${page.slug}/index.html が最新`, (await read(path)) === page.html,
    "→ node biz/tools/build-index.mjs");
}

ok("a/index.html（一覧への転送）がある", (await read(join(pagesDir, "index.html"))) === REDIRECT);

// 下書きに戻した記事のページが残っていないか。
// 残ると、一覧に出ないURLだけが生き続けて検索に拾われる
const keep = new Set(pages.map((p) => p.slug));
for (const name of await readdir(pagesDir)) {
  if (name === "index.html" || !SLUG.test(name)) continue;
  if (!(await stat(join(pagesDir, name))).isDirectory()) continue;
  ok(`a/${name}/ は残っていてよいページ`, keep.has(name),
    drafts.includes(name) ? "下書きに戻した記事のページが残っている" : "元の .md がない");
}

done(`記事 ${pages.length}本 ／ 下書き ${drafts.length}本`);

/* ── 見るHTMLを集める ── */

const htmlFiles = [];
for (const name of await readdir(root)) {
  if (name.endsWith(".html")) htmlFiles.push({ name, path: join(root, name) });
}
for (const name of await readdir(pagesDir)) {
  if (!SLUG.test(name)) continue;
  htmlFiles.push({ name: `a/${name}/index.html`, path: join(pagesDir, name, "index.html") });
}
htmlFiles.push({ name: "a/index.html", path: join(pagesDir, "index.html") });

const html = new Map();
for (const f of htmlFiles) html.set(f.name, (await read(f.path)) || "");

/* ── 2. config.js の読み込み ────────────────────────
   新しい画面を作ったとき、これを忘れると
   「DBに繋がらないのに、繋がっているように静かに動く」        */

for (const [name, src] of html) {
  const mod = src.indexOf('<script type="module"');
  if (mod < 0) continue;                       // 素のHTML（転送ページなど）は要らない
  const cfg = src.search(/<script src="[^"]*config\.js"/);
  ok(`${name} が config.js を読んでいる`, cfg >= 0) &&
    ok(`${name} は config.js を先に読んでいる`, cfg < mod,
      "module より後ろにあると、読む前に走る");
}
done("config.js の読み込み");

/* ── 3. noindex の付き方 ────────────────────────────
   外すのは判断が要る（sekkei/hikitsugi-biz.md）。
   ここで見るのは「外してはいけないものが外れていないか」だけ    */

const hasNoindex = (name) => /<meta name="robots" content="noindex"/.test(html.get(name) || "");

// 投稿・下見・自分の欄。中身が重なるか、他人に見せるものではない
for (const name of ["write.html", "article.html", "profile.html"]) {
  ok(`${name} は noindex のまま`, hasNoindex(name), "この3つは公開後も外さない");
}

// 一覧と記事ページは揃っていないと、片方だけ検索に載る
const listed = !hasNoindex("index.html");
const articlesListed = pages.map((p) => `a/${p.slug}/index.html`).filter((n) => !hasNoindex(n));
ok("一覧と記事ページの noindex が揃っている",
  listed ? articlesListed.length === pages.length : articlesListed.length === 0,
  `一覧=${listed ? "出す" : "出さない"} / 記事=${articlesListed.length}/${pages.length}本が出す設定`);
done(`検索に${listed ? "出す" : "出さない"}設定`);

/* ── 4. 外部の読み込み ──────────────────────────────
   CDN・Webフォントを入れない決まり（CLAUDE.md）。
   _headers の CSP でも塞いであるので、混ざると Cloudflare 側で壊れる  */

for (const [name, src] of html) {
  ok(`${name} に外部スクリプトがない`, !/<script[^>]+src="https?:/i.test(src));
  ok(`${name} に外部スタイルがない`,
    !/<link[^>]+rel="(?:stylesheet|preconnect|dns-prefetch|preload)"[^>]*href="https?:/i.test(src) &&
    !/<link[^>]+href="https?:[^"]*"[^>]*rel="(?:stylesheet|preconnect|dns-prefetch|preload)"/i.test(src));
  // 記事に外部画像を貼ると、CSP（img-src 'self' data:）で出なくなる
  ok(`${name} に外部画像がない`, !/<img[^>]+src="https?:/i.test(src),
    "本文の画像は biz/ の中に置く");
}

for (const name of (await readdir(root)).filter((f) => f.endsWith(".css") || f.endsWith(".js"))) {
  const src = (await read(join(root, name))) || "";
  ok(`${name} が外部を読んでいない`,
    !/@import\s+(?:url\()?["']?https?:/i.test(src) &&
    !/url\(\s*["']?https?:/i.test(src) &&
    !/\bfrom\s+["']https?:/i.test(src) &&
    !/\bimport\(\s*["']https?:/i.test(src));
}
done("外部の読み込みなし");

/* ── 5. _headers の CSP と接続先が合っているか ──────────
   Cloudflare Pages に移したときだけ効く設定だが、
   Supabase を引っ越したあとにここを直し忘れると、
   **移した先で急にDBだけ繋がらなくなる**。気づきにくいので先に見る  */

const cfgSrc = (await read(join(root, "config.js"))) || "";
const winCfg = {};
try { new Function("window", cfgSrc)(winCfg); } catch { /* 空でも先へ進む */ }
const supabase = String(winCfg.TODO_BIZ_CONFIG?.SUPABASE_URL || "").replace(/\/+$/, "");

const headers = (await read(join(repo, "_headers"))) || "";
const bizCsp = headers.split(/^\/biz\/\*\s*$/m)[1]?.split(/\n\S/)[0] || "";

if (!supabase) {
  console.log("‥ config.js が空なので、CSP との照合はとばす");
} else if (!bizCsp) {
  console.log("‥ _headers に /biz/* の指定がないので、照合はとばす");
} else {
  ok("_headers の connect-src に、いまの Supabase が入っている", bizCsp.includes(supabase),
    `config.js は ${supabase}`);
  done("_headers と接続先が合っている");
}

/* ── まとめ ── */

console.log(
  bad
    ? `\n✗ ${bad}件。直してからコミットする`
    : "\n○ ぜんぶ通った",
);
process.exitCode = bad ? 1 : 0;
