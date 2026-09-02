/**
 * えほんの棚の Instagram 運用をまわす道具。
 *
 *   node insta/tools/unei.mjs            # いまの状態
 *   node insta/tools/unei.mjs plan       # 毎日1件ずつの順番を決める（最初に1回）
 *   node insta/tools/unei.mjs next       # この先の予定を見る
 *   node insta/tools/unei.mjs set <slug> # 順番に割り込んで、きょうの1件を差し替える
 *   node insta/tools/unei.mjs ok         # 見て確かめた。出してよい（人がやる）
 *   node insta/tools/unei.mjs post       # OKしたものだけ Instagram に出す（機械がやる）
 *   node insta/tools/unei.mjs done       # 手で出したときに記録する
 *   node insta/tools/unei.mjs stats      # 反応の集計
 *
 * ■ どこにも送らない
 *   Instagram にも、ほかのどこにも繋がない。読むのと、posted.json を書くだけ。
 *   投稿は人がアプリから出す（insta/README.md）。
 *
 * ■ 順番は機械、出してよいと決めるのは人
 *   plan で「毎日1件ずつ、どの順で出すか」を先に決めて queue に書く。
 *   きょうの1件は、その queue のうち **まだ出していない先頭** に決まる。
 *   気が変わったら set で割り込める。
 *
 * ■ 投稿は「人がOK → 機械が出す」
 *   post は **ok を打ってあるものしか出さない。** OKが無ければ何もせずに終わる。
 *   これで CLAUDE.md の「取り消せない操作の前に人の確認を挟む」を守っている。
 *   ok を打つ前に、必ず画面で画像とキャプションを見ること。
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

/** start から i 日後の日付 */
function addDays(start, i) {
  const d = new Date(`${start}T00:00:00`);
  d.setDate(d.getDate() + i);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * きょう出す1件を決める。
 *
 *   1. today に手で書いてあって、まだ出していなければ それ（割り込み）
 *   2. なければ queue のうち **まだ出していない先頭**
 *
 * 日付では選ばない。1日飛ばしても絵本が飛ばされないようにするため。
 * （日付で選ぶと、出せなかった日のぶんが永久に出せなくなる）
 */
function pickToday(state) {
  const done = new Set(realPosts(state).map((r) => r.slug));
  if (state.today && !done.has(state.today)) {
    return { slug: state.today, from: "手で決めたもの", index: null };
  }
  const queue = state.schedule?.queue || [];
  const i = queue.findIndex((slug) => !done.has(slug));
  if (i < 0) return null;
  return { slug: queue[i], from: "順番どおり", index: i };
}

/**
 * 毎日1件ずつの順番を作る。
 *
 * 並べ方は next と同じ考えで、**対象年齢が続けて重ならないように**散らす。
 * 同じ層に何日も続けて当てないため。それ以外の細工はしていない。
 */
function buildQueue(posts, bookBySlug, doneSlugs) {
  const left = posts.filter((p) => !doneSlugs.has(p.slug)).map((p) => p.slug);
  left.sort();

  const ages = (slug) => {
    const b = bookBySlug.get(slug);
    if (!b) return new Set();
    const s = new Set();
    for (let a = b.age_min; a <= b.age_max; a++) s.add(a);
    return s;
  };

  const queue = [];
  const rest = [...left];
  let recent = new Set();

  while (rest.length) {
    // 直近3件と年齢が重ならないものを優先。無ければ重なりが最小のもの
    let best = 0;
    let bestOverlap = Infinity;
    for (let i = 0; i < rest.length; i++) {
      let o = 0;
      for (const a of ages(rest[i])) if (recent.has(a)) o++;
      if (o < bestOverlap) {
        bestOverlap = o;
        best = i;
        if (o === 0) break;
      }
    }
    const [slug] = rest.splice(best, 1);
    queue.push(slug);

    // 直近3件が当てた年齢を持ち回す
    const last3 = queue.slice(-3);
    recent = new Set();
    for (const s of last3) for (const a of ages(s)) recent.add(a);
  }
  return queue;
}

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

/* ─────────────────────────────── plan ────────────────────────────── */

async function cmdPlan(opts) {
  const { state, posts, bookBySlug } = await load();
  const doneSlugs = new Set(realPosts(state).map((r) => r.slug));
  const queue = buildQueue(posts, bookBySlug, doneSlugs);

  if (!queue.length) {
    console.log("\nまだ出していない絵本がありません。順番を作る必要はありません。\n");
    return;
  }

  const start = opts.start || today();
  state.schedule = { start, queue };
  if (state.today && doneSlugs.has(state.today)) state.today = "";
  await save(state);

  console.log("");
  console.log(`毎日1件ずつの順番を決めました（${queue.length}件・${start} から）`);
  console.log("─".repeat(56));
  for (let i = 0; i < Math.min(7, queue.length); i++) {
    const d = addDays(start, i);
    const b = bookBySlug.get(queue[i]);
    console.log(`  ${d}(${weekday(d)})  ${b?.title ?? queue[i]}  ${b ? `${b.age_min}〜${b.age_max}歳` : ""}`);
  }
  if (queue.length > 7) console.log(`  … ほか ${queue.length - 7}件`);
  console.log("");
  console.log(`最後は ${addDays(start, queue.length - 1)} の予定。`);
  console.log("");
  console.log("これで毎日えらぶ手間は無くなりました。**出すのは人です。**");
  console.log("  きょうの1件を見る: node insta/tools/unei.mjs");
  console.log("");
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

  const sched = state.schedule;
  if (!sched?.queue?.length) {
    console.log("");
    console.log("毎日の順番がまだ決まっていません。");
    console.log("  作る: node insta/tools/unei.mjs plan");
    console.log("");
    return;
  }

  console.log(`最後の予定    ${addDays(sched.start, sched.queue.length - 1)}（1日1件で出した場合）`);

  const pick = pickToday(state);
  console.log("");
  if (!pick) {
    console.log("出すものが残っていません。53冊すべて出し終えています。");
    console.log("");
    return;
  }

  const p = byslug.get(pick.slug);
  if (!p) {
    console.log(`⚠ ${pick.slug} は posts.json にありません。plan で作り直してください。`);
    console.log("");
    return;
  }

  console.log(`きょう出す1件  ${p.title}（${pick.slug}）… ${pick.from}`);
  console.log(`               ${p.caption_length}文字 / タグ${p.hashtag_count} / ${Math.round(p.bytes / 1024)}KB`);

  // 予定より進んでいるか遅れているか
  if (pick.index != null) {
    const due = addDays(sched.start, pick.index);
    const gap = daysBetween(due, today());
    if (gap > 0) console.log(`               予定は ${due}。${gap}日ぶん遅れています（絵本は飛びません）`);
    else if (gap < 0) console.log(`               予定は ${due}。${-gap}日ぶん先に進んでいます`);
    else console.log(`               予定どおり（${due}）`);
  }

  console.log("");
  console.log("  画面で見る:  python3 -m http.server 8000 → http://localhost:8000/insta/");
  console.log("  出したら:    node insta/tools/unei.mjs done");

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

/** この先の予定を見る。決めるのではなく、決まっているものを見せるだけ */
async function cmdNext(n) {
  const { state, byslug, bookBySlug } = await load();
  const sched = state.schedule;
  if (!sched?.queue?.length) {
    console.log("\n順番がまだ決まっていません。先に plan を打ってください。\n");
    return;
  }

  const doneSlugs = new Set(realPosts(state).map((r) => r.slug));
  const upcoming = [];
  sched.queue.forEach((slug, i) => {
    if (!doneSlugs.has(slug)) upcoming.push({ slug, i });
  });

  if (!upcoming.length) {
    console.log("\nまだ出していない絵本はありません。53冊すべて出し終えています。\n");
    return;
  }

  console.log("");
  console.log(`この先の予定（残り${upcoming.length}件。上から${Math.min(n, upcoming.length)}件）`);
  console.log("─".repeat(56));
  for (const { slug, i } of upcoming.slice(0, n)) {
    const d = addDays(sched.start, i);
    const b = bookBySlug.get(slug);
    const t = byslug.get(slug)?.title ?? slug;
    console.log(`  ${d}(${weekday(d)})  ${t}  ${b ? `${b.age_min}〜${b.age_max}歳` : ""}`);
  }
  console.log("");
  console.log("順番を変えたいときは set で割り込めます:");
  console.log(`  node insta/tools/unei.mjs set ${upcoming[0].slug}`);
  console.log("");
}

/* ─────────────────────────────── set ─────────────────────────────── */

async function cmdSet(slug) {
  const { state, byslug } = await load();
  if (!slug) throw new Error("slug を渡してください。例: set moko-mori");

  const p = byslug.get(slug);
  if (!p) throw new Error(`${slug} は posts.json にありません。next で予定を見てください。`);

  const already = realPosts(state).find((r) => r.slug === slug);
  if (already) {
    throw new Error(`${slug} は ${already.date} に出しています。同じ絵本を2回出さないため止めました。`);
  }

  state.today = slug;
  await save(state);
  console.log(`\nきょう出す1件を「${p.title}」（${slug}）にしました（順番に割り込み）。`);
  console.log("done で記録すると、次からはまた順番どおりに戻ります。\n");
}

/* ─────────────────────────────── done ────────────────────────────── */

async function cmdDone(opts) {
  const { state, byslug, bookBySlug } = await load();
  const pick = pickToday(state);
  const slug = opts.slug || pick?.slug;
  if (!slug) throw new Error("出すものがありません。plan で順番を作ってください。");

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
  if (state.today === slug) state.today = "";   // 割り込みを解除して順番に戻す
  await save(state);

  console.log(`\n「${p.title}」を ${rec.date}（${weekday(rec.date)}）に出したと記録しました。`);

  const nextPick = pickToday(state);
  if (nextPick) {
    const nb = bookBySlug.get(nextPick.slug);
    const nt = byslug.get(nextPick.slug)?.title ?? nextPick.slug;
    console.log(`次は「${nt}」${nb ? `（${nb.age_min}〜${nb.age_max}歳）` : ""}。もう決まっています。`);
  } else {
    console.log("これで全部出し終えました。");
  }

  if (rec.likes == null && rec.saves == null) {
    console.log("");
    console.log("反応はあとから足せます（posted.json の該当行に likes / saves を書く）。");
  }
  console.log("");
}

/* ──────────────────────────────── ok ─────────────────────────────── */

/**
 * 「見て確かめた。出してよい」を記録する。**人が打つ。**
 * これが無いと post は何も出さない。
 */
async function cmdOk(opts) {
  const { state, byslug } = await load();
  const pick = pickToday(state);
  const slug = opts.slug || pick?.slug;
  if (!slug) throw new Error("出すものがありません。plan で順番を作ってください。");

  const p = byslug.get(slug);
  if (!p) throw new Error(`${slug} は posts.json にありません。`);
  if (realPosts(state).some((r) => r.slug === slug)) {
    throw new Error(`${slug} は すでに出しています。`);
  }

  state.approved = slug;
  await save(state);

  console.log("");
  console.log(`「${p.title}」を出してよい、と記録しました。`);
  console.log("");
  console.log("  出す:  node insta/tools/unei.mjs post");
  console.log("  やめる: node insta/tools/unei.mjs unok");
  console.log("");
}

async function cmdUnok() {
  const { state, byslug } = await load();
  if (!state.approved) {
    console.log("\nOKは付いていません。\n");
    return;
  }
  const t = byslug.get(state.approved)?.title ?? state.approved;
  state.approved = "";
  await save(state);
  console.log(`\n「${t}」のOKを取り消しました。post しても出ません。\n`);
}

/* ─────────────────────────────── post ────────────────────────────── */

/**
 * つなぎ先。**2とおりある。**
 *
 *   ① Instagram ログイン（既定）… Facebookページが要らない。graph.instagram.com
 *   ② Facebookログイン          … Facebookページが要る。graph.facebook.com
 *
 * ①で足りるので、既定は①。②にするときだけ IG_API_BASE を渡す。
 *   IG_API_BASE=https://graph.facebook.com/v21.0
 *
 * バージョンでエラーになるときは、番号を外したものを渡す。
 *   IG_API_BASE=https://graph.instagram.com
 */
const GRAPH = process.env.IG_API_BASE || "https://graph.instagram.com/v21.0";

/**
 * OKしたものだけを Instagram に出す。**機械がやる。**
 *
 * 歯止め（CLAUDE.md の決まり）
 *   1. ok が付いていなければ何もしない。付いていても1回に1件だけ
 *   2. すでに出したものは出さない
 *   3. トークンは環境変数から読む。リポジトリにも posted.json にも書かない
 *   4. 画像が公開URLで取れることを、送る前に確かめる
 *      （Meta は公開URLから画像を取りに来る。取れないと投稿が失敗する）
 *   5. --dry-run を付けると、何を送るかだけ出して送らない
 */
async function cmdPost(opts) {
  const { state, byslug } = await load();

  const slug = state.approved;
  if (!slug) {
    console.log("");
    console.log("OKが付いていないので、何も出しませんでした。");
    console.log("画面で確かめてから: node insta/tools/unei.mjs ok");
    console.log("");
    return;
  }

  const p = byslug.get(slug);
  if (!p) throw new Error(`${slug} は posts.json にありません。OKを外してください（unok）。`);
  if (realPosts(state).some((r) => r.slug === slug)) {
    throw new Error(`${slug} は すでに出しています。OKを外してください（unok）。`);
  }

  const token = process.env.IG_ACCESS_TOKEN;
  const igUser = process.env.IG_USER_ID;

  console.log("");
  console.log(`出すもの: ${p.title}`);
  console.log(`画像:     ${p.image_url}`);
  console.log(`文字数:   ${p.caption_length}　ハッシュタグ: ${p.hashtag_count}`);
  console.log(`つなぎ先: ${GRAPH}`);
  console.log("");

  // Instagram 側の上限。超えると弾かれる
  if (p.caption_length > 2200) throw new Error("キャプションが2,200文字を超えています。");
  if (p.hashtag_count > 30) throw new Error("ハッシュタグが30個を超えています。");

  // 画像が公開URLから取れるか。Meta がここを取りに来る
  const head = await fetch(p.image_url, { method: "HEAD" }).catch((e) => ({ ok: false, status: e.message }));
  if (!head.ok) {
    throw new Error(
      `画像を公開URLから取れません（${head.status}）。\n` +
      `  ${p.image_url}\n` +
      "\n" +
      "  404 のとき … まだ main にマージしていないか、GitHub Pages に反映されていない。\n" +
      "                作り直したなら build-posts.mjs のあと main にマージすること。\n" +
      "  403 のとき … その端末から外に出られていない（社内プロキシなど）。\n" +
      "                ブラウザで上のURLを開いて、画像が見えるか確かめる。\n" +
      "\n" +
      "  Meta はここから画像を取りに来るので、取れないと投稿できません。"
    );
  }
  console.log("○ 画像は公開URLから取れました。");

  if (opts.dryRun) {
    console.log("");
    console.log("--dry-run なので、ここで止めます。実際には送っていません。");
    console.log("");
    return;
  }

  if (!token || !igUser) {
    throw new Error(
      "IG_ACCESS_TOKEN と IG_USER_ID が設定されていません。\n" +
      "  用意のしかたは insta/README.md の「Instagram につなぐ」を読んでください。\n" +
      "  中身を見るだけなら --dry-run を付けてください。"
    );
  }

  // ① 下書き（コンテナ）を作る
  const create = await fetch(`${GRAPH}/${igUser}/media`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image_url: p.image_url, caption: p.caption, access_token: token }),
  });
  const created = await create.json();
  if (!create.ok || !created.id) {
    throw new Error(`下書きを作れませんでした: ${JSON.stringify(created)}`);
  }
  console.log(`○ 下書きを作りました（${created.id}）。`);

  // ② 公開する。ここから先は取り消せない
  const pub = await fetch(`${GRAPH}/${igUser}/media_publish`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ creation_id: created.id, access_token: token }),
  });
  const published = await pub.json();
  if (!pub.ok || !published.id) {
    throw new Error(
      `公開できませんでした: ${JSON.stringify(published)}\n` +
      "  下書きは残っている場合があります。Instagram 側を確認してください。"
    );
  }

  // ③ 記録して、OKと割り込みを解除する
  const rec = { slug, date: today(), media_id: published.id };
  state.posted = [...(state.posted || []), rec];
  state.approved = "";
  if (state.today === slug) state.today = "";
  await save(state);

  console.log(`○ 出しました（${published.id}）。`);
  console.log("");

  const nextPick = pickToday(state);
  if (nextPick) {
    console.log(`次は「${byslug.get(nextPick.slug)?.title ?? nextPick.slug}」。もう決まっています。`);
    console.log("画面で確かめて ok を打つまで、post しても出ません。");
  } else {
    console.log("これで全部出し終えました。");
  }
  console.log("");
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
    else if (a === "--start") opts.start = argv[++i];
    else if (a === "--dry-run") opts.dryRun = true;
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
    case "plan":   return cmdPlan(opts);
    case "next":   return cmdNext(opts.n);
    case "set":    return cmdSet(rest[0]);
    case "ok":     return cmdOk({ ...opts, slug: rest[0] });
    case "unok":   return cmdUnok();
    case "post":   return cmdPost(opts);
    case "done":   return cmdDone({ ...opts, slug: rest[0] });
    case "stats":  return cmdStats();
    default:
      console.log(`知らないコマンド: ${cmd}

  node insta/tools/unei.mjs            いまの状態（きょう出す1件）
  node insta/tools/unei.mjs plan       毎日1件ずつの順番を決める（最初に1回）
  node insta/tools/unei.mjs next       この先の予定を見る
  node insta/tools/unei.mjs set <slug> 順番に割り込んで差し替える
  node insta/tools/unei.mjs ok         見て確かめた。出してよい（人）
  node insta/tools/unei.mjs unok       OKを取り消す
  node insta/tools/unei.mjs post       OKしたものだけ出す（機械）
  node insta/tools/unei.mjs done       手で出したときに記録する
  node insta/tools/unei.mjs stats      反応の集計
`);
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`\n${err.message}\n`);
  process.exitCode = 1;
});
