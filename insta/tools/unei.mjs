/**
 * えほんの棚の Instagram 運用をまわす道具。
 *
 *   node insta/tools/unei.mjs            # いまの状態
 *   node insta/tools/unei.mjs next       # 次の候補を出す（決めない）
 *   node insta/tools/unei.mjs set <slug> # きょう出す1件を決める
 *   node insta/tools/unei.mjs done       # 出したことを記録する
 *   node insta/tools/unei.mjs stats      # 反応の集計
 *
 * ■ どこにも送らない
 *   Instagram にも、ほかのどこにも繋がない。読むのと、posted.json を書くだけ。
 *   投稿は人がアプリから出す（insta/README.md）。
 *
 * ■ 決めるのは人
 *   next は候補を並べるだけで、today は書き換えない。
 *   書き換えるのは set を打ったときだけ。「どれを出すかは機械が決めない」を守る。
 *
 * ■ 依存パッケージなし
 *   このリポジトリは package.json を持たない。標準の node だけで動く。
 *
 * ■ ehon/ と posts.json は読むだけ
 *   書き換えるのは posted.json ひとつだけ。
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const POSTED = join(root, "posted.json");
const POSTS = join(root, "posts.json");
const BOOKS = join(root, "..", "ehon", "books.json");

const read = async (p) => JSON.parse(await readFile(p, "utf8"));

/** その端末の「きょう」。UTCではなく手元の日付で記録する */
function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
const weekday = (ymd) => WEEK[new Date(`${ymd}T00:00:00`).getDay()];

function daysBetween(a, b) {
  const ms = new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`);
  return Math.round(ms / 86400000);
}

/** posted の中身のうち、slug がある本物の記録だけ */
const realPosts = (state) => (state.posted || []).filter((r) => r.slug);

async function load() {
  const [state, { posts }, { books }] = await Promise.all([
    read(POSTED),
    read(POSTS),
    read(BOOKS),
  ]);
  const byslug = new Map(posts.map((p) => [p.slug, p]));
  const bookBySlug = new Map(books.map((b) => [b.slug, b]));
  return { state, posts, books, byslug, bookBySlug };
}

async function save(state) {
  await writeFile(POSTED, JSON.stringify(state, null, 2) + "\n", "utf8");
}

/* ────────────────────────────── status ───────────────────────────── */

async function cmdStatus() {
  const { state, posts, byslug } = await load();
  const done = realPosts(state);
  const doneSlugs = new Set(done.map((r) => r.slug));
  const left = posts.filter((p) => !doneSlugs.has(p.slug));

  console.log("");
  console.log("えほんの棚 / Instagram 運用");
  console.log("─".repeat(56));
  console.log(`下書き        ${posts.length}件`);
  console.log(`出した        ${done.length}件`);
  console.log(`まだ          ${left.length}件`);

  if (state.unrecorded) {
    console.log(`記録漏れ      ${state.unrecorded}件（出したが、どれか分からない）`);
  }

  // 週に何回出すと、残りが何ヶ月もつか
  if (left.length) {
    for (const perWeek of [3, 5, 7]) {
      const weeks = left.length / perWeek;
      console.log(
        `              週${perWeek}回なら あと約${Math.floor(weeks / 4.345)}ヶ月（${Math.ceil(weeks)}週）`
      );
    }
  }

  console.log("");
  if (state.today) {
    const p = byslug.get(state.today);
    if (p) {
      console.log(`きょう出す1件  ${p.title}（${state.today}）`);
      console.log(`               ${p.caption_length}文字 / タグ${p.hashtag_count} / ${Math.round(p.bytes / 1024)}KB`);
      console.log("");
      console.log("  画面で見る:  python3 -m http.server 8000 → http://localhost:8000/insta/");
      console.log("  出したら:    node insta/tools/unei.mjs done");
    } else {
      console.log(`きょう出す1件  ⚠ ${state.today} は posts.json に無い。set し直すこと`);
    }
  } else {
    console.log("きょう出す1件  まだ決めていない");
    console.log("               候補を見る: node insta/tools/unei.mjs next");
  }

  const last = done.at(-1);
  if (last) {
    const gap = daysBetween(last.date, today());
    console.log("");
    console.log(
      `前に出した     ${last.date}（${weekday(last.date)}）${byslug.get(last.slug)?.title ?? last.slug}` +
        (gap > 0 ? ` … ${gap}日前` : " … きょう")
    );
  }
  console.log("");
}

/* ─────────────────────────────── next ────────────────────────────── */

/**
 * 次の候補を並べる。**決めない。**
 *
 * 並べ方の根拠（これしか見ていない。凝ったことはしていない）
 *   1. まだ出していないもの だけ
 *   2. 直近3件と 対象年齢が重ならないもの を上に（同じ層に続けて当てない）
 *   3. あとは slug 順。毎回同じ順に出るようにして、迷わないため
 */
async function cmdNext(n) {
  const { state, posts, byslug, bookBySlug } = await load();
  const done = realPosts(state);
  const doneSlugs = new Set(done.map((r) => r.slug));
  const left = posts.filter((p) => !doneSlugs.has(p.slug) && p.slug !== state.today);

  if (!left.length) {
    console.log("\nまだ出していない絵本はありません。53冊すべて出し終えています。\n");
    return;
  }

  // 直近3件が当てた年齢帯
  const recent = done.slice(-3).map((r) => bookBySlug.get(r.slug)).filter(Boolean);
  const recentAges = new Set();
  for (const b of recent) {
    for (let a = b.age_min; a <= b.age_max; a++) recentAges.add(a);
  }

  const scored = left.map((p) => {
    const b = bookBySlug.get(p.slug);
    let overlap = 0;
    if (b) {
      for (let a = b.age_min; a <= b.age_max; a++) if (recentAges.has(a)) overlap++;
    }
    return { p, b, overlap };
  });

  scored.sort((x, y) => x.overlap - y.overlap || x.p.slug.localeCompare(y.p.slug));

  console.log("");
  console.log(`次の候補（まだ${left.length}件ある。上から${Math.min(n, left.length)}件）`);
  if (recent.length) {
    console.log(`直近${recent.length}件が当てた年齢: ${[...recentAges].sort((a, b) => a - b).join("・")}歳`);
  }
  console.log("─".repeat(56));

  for (const { p, b, overlap } of scored.slice(0, n)) {
    const age = b ? `${b.age_min}〜${b.age_max}歳` : "?";
    const why = overlap === 0 ? "直近と年齢が重ならない" : `直近と${overlap}歳ぶん重なる`;
    console.log(`  ${p.slug}`);
    console.log(`      ${p.title} / ${age} / ${why}`);
  }

  console.log("");
  console.log("決めるのは人です。決めたら:");
  console.log(`  node insta/tools/unei.mjs set ${scored[0].p.slug}`);
  console.log("");
}

/* ─────────────────────────────── set ─────────────────────────────── */

async function cmdSet(slug) {
  const { state, byslug } = await load();
  if (!slug) throw new Error("slug を渡してください。例: set moko-mori");

  const p = byslug.get(slug);
  if (!p) throw new Error(`${slug} は posts.json にありません。next で候補を見てください。`);

  if (realPosts(state).some((r) => r.slug === slug)) {
    const when = realPosts(state).find((r) => r.slug === slug).date;
    throw new Error(`${slug} は ${when} に出しています。同じ絵本を2回出さないため止めました。`);
  }

  state.today = slug;
  await save(state);
  console.log(`\nきょう出す1件を「${p.title}」（${slug}）にしました。`);
  console.log("画面で見る: python3 -m http.server 8000 → http://localhost:8000/insta/\n");
}

/* ─────────────────────────────── done ────────────────────────────── */

async function cmdDone(opts) {
  const { state, byslug } = await load();
  const slug = opts.slug || state.today;
  if (!slug) throw new Error("today が空です。先に set で決めてください。");

  const p = byslug.get(slug);
  if (!p) throw new Error(`${slug} は posts.json にありません。`);
  if (realPosts(state).some((r) => r.slug === slug)) {
    throw new Error(`${slug} はすでに記録されています。`);
  }

  const rec = { slug, date: opts.date || today() };
  if (opts.likes != null) rec.likes = opts.likes;
  if (opts.saves != null) rec.saves = opts.saves;
  if (opts.note) rec.note = opts.note;

  state.posted = [...(state.posted || []), rec];
  if (state.today === slug) state.today = "";
  await save(state);

  console.log(`\n「${p.title}」を ${rec.date}（${weekday(rec.date)}）に出したと記録しました。`);
  if (rec.likes == null && rec.saves == null) {
    console.log("反応はあとから足せます:");
    console.log(`  node insta/tools/unei.mjs stats   ← いまの集計`);
    console.log(`  posted.json の該当行に "likes" と "saves" を書き足す`);
  }
  console.log("\n次を決める: node insta/tools/unei.mjs next\n");
}

/* ─────────────────────────────── stats ───────────────────────────── */

async function cmdStats() {
  const { state, byslug, bookBySlug } = await load();
  const done = realPosts(state);

  if (!done.length) {
    console.log("\nまだ1件も記録がありません。出したら done で記録してください。\n");
    return;
  }

  const withNumbers = done.filter((r) => r.likes != null || r.saves != null);

  console.log("");
  console.log(`出した記録 ${done.length}件（うち反応を書いたもの ${withNumbers.length}件）`);
  console.log("─".repeat(56));

  for (const r of done) {
    const t = byslug.get(r.slug)?.title ?? r.slug;
    const b = bookBySlug.get(r.slug);
    const age = b ? `${b.age_min}〜${b.age_max}歳` : "?";
    const num =
      r.likes == null && r.saves == null
        ? "反応 未記入"
        : `いいね ${r.likes ?? "?"} / 保存 ${r.saves ?? "?"}`;
    console.log(`  ${r.date}(${weekday(r.date)}) ${t} … ${age} … ${num}`);
  }

  if (withNumbers.length < 3) {
    console.log("");
    console.log("※ 反応の記録が3件に満たないので、傾向は出しません。");
    console.log("   少ない数から «この年齢が効く» と決めると、たいてい外れます。");
    console.log("");
    return;
  }

  // 年齢帯ごと・曜日ごとの平均。あくまで目安として出す
  const group = (keyOf) => {
    const m = new Map();
    for (const r of withNumbers) {
      const k = keyOf(r);
      if (k == null) continue;
      const g = m.get(k) || { n: 0, likes: 0, saves: 0 };
      g.n++;
      g.likes += r.likes ?? 0;
      g.saves += r.saves ?? 0;
      m.set(k, g);
    }
    return m;
  };

  const show = (title, m) => {
    console.log("");
    console.log(title);
    const rows = [...m.entries()].sort((a, b) => b[1].likes / b[1].n - a[1].likes / a[1].n);
    for (const [k, g] of rows) {
      console.log(
        `  ${String(k).padEnd(10)} ${g.n}件  いいね平均 ${(g.likes / g.n).toFixed(1)}  保存平均 ${(g.saves / g.n).toFixed(1)}`
      );
    }
  };

  show("年齢帯ごと", group((r) => {
    const b = bookBySlug.get(r.slug);
    return b ? `${b.age_min}〜${b.age_max}歳` : null;
  }));
  show("曜日ごと", group((r) => weekday(r.date)));

  console.log("");
  console.log("※ 件数が少ないうちは、差が出ても偶然のことが多い。");
  console.log("   20件くらい貯まってから見ること。");
  console.log("");
}

/* ─────────────────────────────── main ────────────────────────────── */

function parseArgs(argv) {
  const opts = { n: 5 };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--likes") opts.likes = Number(argv[++i]);
    else if (a === "--saves") opts.saves = Number(argv[++i]);
    else if (a === "--note") opts.note = argv[++i];
    else if (a === "--date") opts.date = argv[++i];
    else if (a === "-n") opts.n = Number(argv[++i]);
    else rest.push(a);
  }
  return { opts, rest };
}

async function main() {
  const [, , cmd = "status", ...argv] = process.argv;
  const { opts, rest } = parseArgs(argv);

  switch (cmd) {
    case "status": return cmdStatus();
    case "next":   return cmdNext(opts.n);
    case "set":    return cmdSet(rest[0]);
    case "done":   return cmdDone({ ...opts, slug: rest[0] });
    case "stats":  return cmdStats();
    default:
      console.log(`知らないコマンド: ${cmd}

  node insta/tools/unei.mjs            いまの状態
  node insta/tools/unei.mjs next       次の候補（決めない）
  node insta/tools/unei.mjs set <slug> きょう出す1件を決める
  node insta/tools/unei.mjs done       出したことを記録する
  node insta/tools/unei.mjs stats      反応の集計
`);
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`\n${err.message}\n`);
  process.exitCode = 1;
});
