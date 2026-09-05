/**
 * 売上までの5つの数字を、週に1回書き留めて、**人が一番減っている場所**を1つ出す。
 *
 *   node insta/tools/uriage.mjs                       # いまの状態と、直す場所
 *   node insta/tools/uriage.mjs add --date 2026-09-08 \
 *        --hyoji 4200 --hozon 61 --profile 88 --click 24 --kounyu 2
 *   node insta/tools/uriage.mjs --self-test
 *
 * ■ なぜ手で入れるのか
 *   表示数・保存数・プロフィール閲覧は Instagram Graph API で取れるが、
 *   **note の購入数は外から取れない**（note に公開APIが無い）。
 *   全部を自動にできない以上、**週1回まとめて手で入れる**のがいちばん簡単で、
 *   無料枠も一切使わない。5つの数字を写すだけ。
 *
 * ■ お金はかからない
 *   AI を呼ばない。どこにも送らない。読むのと uriage.json を書くだけ。
 *
 * ■ 勘で全部作り直さない
 *   5つの数字は、上から下へ人が減っていく順に並んでいる。
 *   **いちばん減り方が大きい1か所だけ**を出す。そこだけ直す。
 *
 * ■ 依存パッケージなし
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const FILE = join(here, "..", "uriage.json");

/* 上から下へ、人が減っていく順。直す場所も決まっている。

   `meyasu` は「この段では、これくらい残れば普通」という**目安**。
   ここが要になる。**段ごとに、落ち方の当たり前が違う**からだ。
   表示から保存へは、もともと数%しか残らない。生の割合だけを見ると、
   毎回そこが「いちばん落ちている」ことになり、**同じ場所を直し続けてしまう。**

   だから見るのは「目安と比べてどうか」。目安を大きく下回った段を1つだけ出す。

   ※ この目安には出典がない。**当てずっぽうの初期値**。
     3週ぶん貯まったら、自分の実績の中央値に自動で置き換わる（medianBase）。 */
const STEPS = [
  { key: "hyoji",   label: "表示",           meyasu: null, fix: "投稿そのもの。最初の2行を直す" },
  { key: "hozon",   label: "保存",           meyasu: 0.02, fix: "投稿の中身。あとで読み返す価値が足りない" },
  { key: "profile", label: "プロフィール閲覧", meyasu: 0.60, fix: "投稿の締め。行き先を書いていない" },
  { key: "click",   label: "リンククリック",   meyasu: 0.30, fix: "プロフィール。何が受け取れるか伝わっていない" },
  { key: "kounyu",  label: "購入",           meyasu: 0.05, fix: "note の記事か、値段。無料部分で足りてしまっている" },
];

/** 過去の記録から、段ごとの「自分の普通」を出す。3件以上ないと使わない */
export function medianBase(rows) {
  if (!rows || rows.length < 3) return null;
  const base = {};
  for (let i = 1; i < STEPS.length; i++) {
    const vals = rows
      .map((r) => {
        const from = Number(r[STEPS[i - 1].key] ?? 0);
        const to = Number(r[STEPS[i].key] ?? 0);
        return from > 0 ? to / from : null;
      })
      .filter((v) => v !== null)
      .sort((a, b) => a - b);
    if (vals.length >= 3) base[STEPS[i].key] = vals[Math.floor(vals.length / 2)];
  }
  return Object.keys(base).length ? base : null;
}

/**
 * いちばん人が減っている場所を1つ返す。
 * 生の割合ではなく、**目安と比べてどれだけ下回ったか**で選ぶ。
 * base を渡すと、目安の代わりに自分の実績を使う。
 */
export function yowai(row, base = null) {
  let worst = null;
  for (let i = 1; i < STEPS.length; i++) {
    const step = STEPS[i];
    const from = Number(row[STEPS[i - 1].key] ?? 0);
    const to = Number(row[step.key] ?? 0);
    if (from <= 0) continue;
    const nokori = to / from;                       // 実際に残った割合
    const kijun = base?.[step.key] ?? step.meyasu;  // この段の「普通」
    if (!kijun) continue;
    const hi = nokori / kijun;                      // 1 より小さいほど普通を下回っている
    if (!worst || hi < worst.hi) {
      worst = { hi, nokori, kijun, from: STEPS[i - 1], to: step, jibun: Boolean(base?.[step.key]) };
    }
  }
  return worst;
}

function pct(x) {
  return `${(x * 100).toFixed(1)}%`;
}

async function load() {
  try {
    return JSON.parse(await readFile(FILE, "utf8"));
  } catch {
    return { rows: [] };
  }
}

async function cmdAdd(opts) {
  if (!opts.date) throw new Error("--date を渡してください。例: --date 2026-09-08");
  const data = await load();
  const row = { date: opts.date };
  for (const s of STEPS) row[s.key] = Number(opts[s.key] ?? 0);
  data.rows = data.rows.filter((r) => r.date !== opts.date);
  data.rows.push(row);
  data.rows.sort((a, b) => (a.date < b.date ? -1 : 1));
  await writeFile(FILE, JSON.stringify(data, null, 2) + "\n");
  console.log(`\n${opts.date} の数字を記録しました。\n`);
  show(row);
}

function show(row, base = null) {
  console.log("  " + STEPS.map((s) => `${s.label} ${row[s.key]}`).join("  →  "));
  const w = yowai(row, base);
  console.log("");
  if (!w) {
    console.log("  まだ判断できません。表示数から順に埋めてください。");
    return;
  }
  const motto = w.hi < 1 ? "下回っている" : "上回っている";
  console.log(`  いちばん弱いのは 「${w.from.label} → ${w.to.label}」`);
  console.log(`    残り ${pct(w.nokori)}（${w.jibun ? "自分の普通" : "目安"} ${pct(w.kijun)} を ${motto}）`);
  console.log(`  直す場所：${w.to.fix}`);
  console.log("");
  if (w.hi >= 1) {
    console.log("  ※ どの段も普通より上。**いま直すところはない。** 本数を増やすほうが先。");
  } else {
    console.log("  **ここだけ直すこと。** 勘で全部作り直さない。");
  }
  console.log("");
}

async function cmdStatus() {
  const { rows } = await load();
  console.log("");
  console.log("売上までの5つの数字");
  console.log("────────────────────────────────────────────────────────");
  if (!rows.length) {
    console.log("まだ1件もありません。週に1回、これを打ってください。");
    console.log("");
    console.log("  node insta/tools/uriage.mjs add --date 2026-09-08 \\");
    console.log("       --hyoji 0 --hozon 0 --profile 0 --click 0 --kounyu 0");
    console.log("");
    console.log("表示・保存・プロフィール閲覧は Instagram のインサイトから。");
    console.log("リンククリックはプロフィールのリンク先の数字から。");
    console.log("購入は note の売上画面から。**5つ写すだけ。**");
    console.log("");
    return;
  }
  const base = medianBase(rows);
  for (const r of rows.slice(-8)) {
    console.log(`\n${r.date}`);
    show(r, base);
  }
  if (base) {
    console.log("※ 比べる相手は、**自分の実績の中央値**に切り替わっています。");
  } else {
    console.log("※ 比べる相手は、まだ**出典のない目安**です（3週たまると自分の実績に変わります）。");
    console.log("   3週ぶんくらい貯まるまでは、差が出ても偶然のことが多い。");
  }
  console.log("");
}

function selfTest() {
  const cases = [
    /* 保存率1.5%は目安2%を下回るが、他の段はもっと落ちていない → 保存 */
    ["保存が弱い", { hyoji: 4200, hozon: 61, profile: 50, click: 16, kounyu: 1 }, "保存"],
    /* 保存率は目安どおり。購入だけ極端に低い → 生の割合で見ると保存が選ばれてしまう場面 */
    ["購入だけ弱い", { hyoji: 4200, hozon: 84, profile: 50, click: 15, kounyu: 0 }, "購入"],
    ["クリックが弱い", { hyoji: 4200, hozon: 84, profile: 50, click: 2, kounyu: 1 }, "リンククリック"],
    ["数字が無い", { hyoji: 0, hozon: 0, profile: 0, click: 0, kounyu: 0 }, null],
  ];
  let ng = 0;
  for (const [name, row, want] of cases) {
    const got = yowai(row)?.to.label ?? null;
    const ok = got === want;
    if (!ok) ng++;
    console.log(`${ok ? "OK  " : "NG  "} ${name}（${got} ／ 期待 ${want}）`);
  }
  console.log(ng ? `\n${ng} 件しくじった` : "\n全部通った");
  return ng ? 1 : 0;
}

function parseArgs(argv) {
  const opts = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      if (k === "self-test") opts.selfTest = true;
      else opts[k] = argv[++i];
    } else rest.push(a);
  }
  return { opts, rest };
}

const direct = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (direct) {
  const [, , cmd = "status", ...argv] = process.argv;
  const { opts } = parseArgs([cmd, ...argv]);
  try {
    if (opts.selfTest) process.exit(selfTest());
    else if (cmd === "add") await cmdAdd(opts);
    else await cmdStatus();
  } catch (e) {
    console.error(`\n${e.message}\n`);
    process.exit(1);
  }
}
