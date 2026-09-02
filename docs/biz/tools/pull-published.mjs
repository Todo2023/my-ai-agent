/**
 * Supabase で公開された記事を articles/*.md に書き出す。
 *
 *   node biz/tools/pull-published.mjs            取り込む
 *   node biz/tools/pull-published.mjs --dry-run  何が変わるかだけ見る
 *
 * ■ なぜ要るか
 *   審査で公開した記事はDBの中にしかなく、静的化の流れに乗らない。
 *   .md に落としてしまえば、リポジトリで書いた記事とまったく同じ扱いになる。
 *
 *   **DBは投稿と審査の待ち行列、配信するサイトは静的。**
 *   この一本の筋にしておくと、読まれる量が増えてもDBに負荷が乗らない
 *   （sekkei/platform-marketing.md の 5章）。
 *
 * ■ 上書きの決まり
 *   取り込んだ .md には `work_id` が入る。次に取り込むときは、
 *   その `work_id` が一致するものだけ上書きする。
 *
 *   - `work_id` がない .md（手で書いた記事）→ **触らない**
 *   - `work_id` が違う .md（slug がぶつかった）→ **触らない**。名前を変えて解決する
 *
 *   取り込んだ .md を手で直しても構わないが、その記事をもう一度公開し直すと
 *   消える。直すならDB側（審査画面）で直す。
 *
 * 読むだけなので費用はかからない（Supabase 無料プラン）。書き込みは一切しない。
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontMatter } from "../md.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const dir = join(root, "articles");

const DRY = process.argv.includes("--dry-run");
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;

/* ── 接続先（biz/config.js を読む。設定を2か所に持たない） ── */

const cfgSrc = await readFile(join(root, "config.js"), "utf8");
const win = {};
new Function("window", cfgSrc)(win);
const cfg = win.TODO_BIZ_CONFIG || {};
const URL_BASE = String(cfg.SUPABASE_URL || "").replace(/\/+$/, "");
const ANON = String(cfg.SUPABASE_ANON_KEY || "");

if (!URL_BASE || !ANON) {
  console.error("× biz/config.js が空です。つないでから走らせてください");
  process.exit(1);
}

async function get(path) {
  const res = await fetch(URL_BASE + path, {
    headers: { apikey: ANON, "Content-Type": "application/json" },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : [];
}

/* ── front matter を書く ──────────────────────────────
   md.js の parseFrontMatter は YAML を読まない。`key: value` と
   `key: [a, b]` だけ読む。**読める形しか書かない**ようにして、
   書けない値が来たら記事ごと飛ばす（黙って壊れたものを置かない）  */

/** 引用符の付け方を決める。どちらの引用符も入っている値は表せない */
function quote(value, where) {
  const s = String(value).replace(/[\r\n]+/g, " ").trim();
  if (!s.includes('"')) return `"${s}"`;
  if (!s.includes("'")) return `'${s}'`;
  throw new Error(`${where} に " と ' の両方が入っていて front matter に書けません`);
}

function frontMatter(fields) {
  const lines = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value == null || value === "") continue;
    if (Array.isArray(value)) {
      if (!value.length) continue;
      for (const v of value) {
        if (/[,[\]]/.test(String(v))) throw new Error(`${key} の「${v}」に , か [ ] が入っています`);
      }
      lines.push(`${key}: [${value.map((v) => String(v).trim()).join(", ")}]`);
    } else if (typeof value === "boolean") {
      lines.push(`${key}: ${value}`);
    } else {
      lines.push(`${key}: ${quote(value, key)}`);
    }
  }
  return `---\n${lines.join("\n")}\n---\n`;
}

/* ── 取ってくる ── */

// 本文は works にしかない。公開ずみは anon でも読める（RLS の "published works are public"）
const works = await get(
  "/rest/v1/works?site=eq.biz&status=eq.published" +
    "&select=id,slug,title,emoji,summary,topics,is_pr,body_free,published_at" +
    "&order=published_at.asc",
);

// 書き手の表示名は public_works が profiles と繋いだものを持っている
const publicRows = await get("/rest/v1/public_works?site=eq.biz&select=id,handle,display_name");
const authors = new Map(publicRows.map((r) => [r.id, r]));

console.log(`公開ずみ ${works.length}本`);

/* ── 既にある .md を見る ── */

const existing = new Map();
for (const file of (await readdir(dir)).filter((f) => f.endsWith(".md"))) {
  const { meta } = parseFrontMatter(await readFile(join(dir, file), "utf8"));
  existing.set(file.replace(/\.md$/, ""), meta.work_id || null);
}

/* ── 書き出す ── */

const wrote = [];
const kept = [];

for (const w of works) {
  const slug = String(w.slug || "");
  const label = `${slug || "(slugなし)"}「${w.title}」`;

  if (!SLUG.test(slug)) {
    console.error(`× ${label}: slug が使えない形です`);
    process.exitCode = 1;
    continue;
  }

  if (existing.has(slug) && existing.get(slug) !== w.id) {
    // 手で書いた記事、または別の記事と slug がぶつかっている。**上書きしない**
    kept.push(slug);
    console.warn(
      `▲ ${label}: articles/${slug}.md があるので触りません` +
        `（${existing.get(slug) ? "別の記事のもの" : "手で書いたもの"}）`,
    );
    continue;
  }

  const author = authors.get(w.id) || {};
  let text;
  try {
    text = frontMatter({
      title: w.title,
      emoji: w.emoji || "",
      topics: Array.isArray(w.topics) ? w.topics : [],
      author: author.display_name || "",
      handle: author.handle || "",
      published_at: String(w.published_at || "").slice(0, 10),
      published: true,
      is_pr: w.is_pr === true,
      // ここが上書きの判断材料になる。いいね・通報の宛先にもなる
      work_id: w.id,
    }) + `\n${String(w.body_free || "").replace(/\r\n?/g, "\n").trim()}\n`;
  } catch (err) {
    console.error(`× ${label}: ${err.message}`);
    process.exitCode = 1;
    continue;
  }

  const path = join(dir, `${slug}.md`);
  const before = existing.has(slug) ? await readFile(path, "utf8") : null;
  if (before === text) continue;             // 中身が同じなら触らない（差分を汚さない）

  if (!DRY) await writeFile(path, text, "utf8");
  wrote.push(slug);
}

console.log(
  DRY
    ? `○ --dry-run。書くとしたら ${wrote.length}本： ${wrote.join(", ") || "なし"}`
    : `○ ${wrote.length}本を articles/ に書きました： ${wrote.join(", ") || "なし"}`,
);
if (kept.length) console.log(`  触らなかったもの: ${kept.join(", ")}`);
if (wrote.length && !DRY) console.log("\n次： node biz/tools/build-index.mjs（一覧と記事ページを作り直す）");
