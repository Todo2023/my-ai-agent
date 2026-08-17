/**
 * ふたりの体重帳 — Cloudflare Worker 版
 *
 * 画面・保存・写真の読み取りを、この1ファイルだけで賄う。
 * Google アカウントの状態に左右されないので、どの端末でも同じように開ける。
 *
 * 必要な設定（Cloudflare のダッシュボードで行う。手順は README.md）:
 *   - KV 名前空間を作り、変数名 DIET でバインドする（記録の保存先）
 *   - 変数 GEMINI_API_KEY に Google AI Studio のキーを入れる（シークレットとして）
 *   - 変数 APP_PIN は任意。設定すると合言葉を聞く
 *
 * 費用は0円（Cloudflare の無料枠 ＋ Gemini の無料枠）。課金アカウントを紐付けない限り、
 * 使いすぎても請求ではなくエラーで止まる。
 */

const STORE_KEY = "diet";
const DEFAULT_NAMES = ["夫", "妻"];
const DEFAULT_MODEL = "gemini-3.6-flash";

// 体重計の表示としてありえる範囲。ここを外れた値は採用しない。
const W_MIN = 20, W_MAX = 250;
const JUMP_KG = 3; // 前回からこれ以上動いていたら読み間違いを疑う

const PROMPT = [
  "この画像は体重計（または体組成計）の表示部分です。表示されている数字をそのまま読み取り、",
  "JSONだけを返してください。説明文やコードブロックは付けないこと。",
  "",
  '{"weight_kg": 数値またはnull, "raw_text": "画面に見えている文字", "confidence": 0.0〜1.0}',
  "",
  "- weight_kg: 「kg」と書かれている、いちばん大きい数字。体脂肪率など他の数値は読まなくてよい",
  "- confidence: ぼやけている、桁が欠けて見える、どれが体重か判断できない場合は 0.5 未満にする",
  "",
  "小数点の位置に注意してください。体重計の表示はふつう小数第1位までです（例: 62.4）。",
  "推測で埋めないこと。読めない項目は null にし、confidence を下げてください。"
].join("\n");

/* ---------- 入口 ---------- */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === "/") return page(PAGE, "text/html");
    if (path === "/manifest.webmanifest") return page(MANIFEST, "application/manifest+json");
    if (path === "/sw.js") return page(SERVICE_WORKER, "text/javascript");
    if (path === "/icon-192.png") return icon(ICON_192);
    if (path === "/icon-512.png") return icon(ICON_512);
    if (path.startsWith("/api/")) return handleApi(request, env, path.slice(5));

    return new Response("見つかりません", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
};

function page(body, type) {
  return new Response(body, { headers: { "content-type": type + "; charset=utf-8", "cache-control": "no-cache" } });
}

function icon(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Response(bytes, { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } });
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

/* ---------- 保存（KV） ---------- */

function emptyData() {
  return {
    people: [{ name: DEFAULT_NAMES[0], goal: null }, { name: DEFAULT_NAMES[1], goal: null }],
    records: []
  };
}

async function load(env) {
  if (!env.DIET) throw new Error("保存先（KV の DIET）が設定されていません");
  const raw = await env.DIET.get(STORE_KEY);
  if (!raw) return emptyData();
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data.records) || !Array.isArray(data.people)) return emptyData();
    return data;
  } catch (e) {
    return emptyData();
  }
}

async function save(env, data) {
  await env.DIET.put(STORE_KEY, JSON.stringify(data));
}

/* ---------- API ---------- */

async function handleApi(request, env, action) {
  if (request.method !== "POST") return json({ error: "POST で呼んでください" }, 405);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    body = {};
  }

  if (env.APP_PIN && String(body.pin || "") !== String(env.APP_PIN)) {
    return json({ error: "合言葉が違います" }, 401);
  }

  try {
    const data = await load(env);
    if (action === "state") return json(withToday(data));
    if (action === "record") return json(await saveRecord(env, data, body));
    if (action === "delete") return json(await deleteRecord(env, data, body));
    if (action === "person") return json(await setPerson(env, data, body));
    if (action === "read") return json(await readScale(env, data, body));
    return json({ error: "知らない操作です: " + action }, 404);
  } catch (error) {
    return json({ error: error.message || String(error) }, 400);
  }
}

function withToday(data) {
  // 日付は日本時間で決める（端末の時計に左右されないように）
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  return { people: data.people, records: data.records, today: now.toISOString().slice(0, 10) };
}

function personIndex(value) {
  return Number(value) === 1 ? 1 : 0;
}

function number(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return isNaN(n) ? null : n;
}

/** 同じ（だれ・ひづけ）があれば上書きする。朝夜の撮り直しで二重にならないように。 */
async function saveRecord(env, data, body) {
  const person = personIndex(body.person);
  const date = String(body.date || "");
  const weight = number(body.weight);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("日付の形式が違います");
  if (weight === null || weight < W_MIN || weight > W_MAX) {
    throw new Error("体重が入力できる範囲（" + W_MIN + "〜" + W_MAX + "kg）の外です");
  }

  const record = {
    person: person,
    date: date,
    weight: Math.round(weight * 10) / 10,
    source: body.source === "ocr" ? "ocr" : "manual",
    note: body.note ? String(body.note).slice(0, 40) : null
  };

  const index = data.records.findIndex((r) => r.person === person && r.date === date);
  const overwritten = index >= 0;
  if (overwritten) data.records[index] = record;
  else data.records.push(record);
  await save(env, data);

  return { overwritten: overwritten, state: withToday(data) };
}

async function deleteRecord(env, data, body) {
  const person = personIndex(body.person);
  const date = String(body.date || "");
  data.records = data.records.filter((r) => !(r.person === person && r.date === date));
  await save(env, data);
  return withToday(data);
}

async function setPerson(env, data, body) {
  const i = personIndex(body.index);
  const goal = number(body.goal);
  data.people[i] = {
    name: String(body.name || DEFAULT_NAMES[i]).slice(0, 8),
    goal: goal !== null && goal >= W_MIN && goal <= W_MAX ? goal : null
  };
  await save(env, data);
  return withToday(data);
}

/* ---------- 写真を読む ---------- */

/**
 * 写真1枚を Gemini に読ませ、検証済みの候補値を返す。ここでは保存しない。
 * 保存は人間が数字を確認してから record を呼んだときだけ。
 */
async function readScale(env, data, body) {
  const person = personIndex(body.person);
  const rows = data.records.filter((r) => r.person === person).sort((a, b) => (a.date < b.date ? -1 : 1));
  const previous = rows.length ? rows[rows.length - 1].weight : null;

  let reading;
  try {
    reading = parseReading(await callGemini(env, String(body.image || ""), body.mimeType || "image/jpeg"));
  } catch (error) {
    return {
      weight: null, rawText: "", confidence: 0, needsCheck: true,
      warnings: ["読み取りに失敗しました（" + (error.message || error) + "）。手で入れてください"]
    };
  }
  return validate(reading, previous);
}

async function callGemini(env, base64, mimeType) {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY が設定されていません");
  if (!base64) throw new Error("写真が空です");
  const model = env.GEMINI_MODEL || DEFAULT_MODEL;

  const payload = {
    contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: base64 } }, { text: PROMPT }] }],
    generationConfig: { temperature: 0, response_mime_type: "application/json" }
  };

  // 無料枠は 429 に当たりやすい。待ちすぎない範囲で2回だけ再試行する。
  const waits = [0, 1500, 4000];
  let last = "";
  for (const wait of waits) {
    if (wait) await new Promise((done) => setTimeout(done, wait));
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) +
      ":generateContent?key=" + encodeURIComponent(env.GEMINI_API_KEY),
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }
    );
    const text = await res.text();
    if (res.ok) {
      const parsed = JSON.parse(text);
      const parts = parsed.candidates && parsed.candidates[0] && parsed.candidates[0].content &&
        parsed.candidates[0].content.parts;
      return (parts && parts[0] && parts[0].text) || "";
    }
    last = res.status + " " + text.slice(0, 200);
    if (res.status === 404) throw new Error("モデル " + model + " が使えません。変数 GEMINI_MODEL で別のモデルを指定してください");
    if (res.status !== 429 && res.status !== 500 && res.status !== 503) throw new Error(last);
  }
  throw new Error("混み合っています（" + last + "）");
}

function parseReading(text) {
  const cleaned = String(text || "").replace(/```json|```/g, "").trim();
  let data;
  try {
    data = JSON.parse(cleaned);
  } catch (e) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    data = match ? JSON.parse(match[0]) : {};
  }
  const confidence = number(data.confidence);
  return {
    weight: number(data.weight_kg),
    rawText: String(data.raw_text || ""),
    confidence: confidence === null ? 0 : Math.min(Math.max(confidence, 0), 1)
  };
}

/**
 * モデルの出力を決定的にチェックする。値を書き換えるときは必ず理由を残す。
 * 黙って直すと、間違った補正に気づけなくなるため。
 */
function validate(reading, previous) {
  const warnings = [];
  let weight = reading.weight;

  if (weight !== null) {
    // 「62.4」を「624」と読むのはよくある失敗。10で割って収まるなら直す。
    if (weight > W_MAX && weight / 10 >= W_MIN && weight / 10 <= W_MAX) {
      warnings.push(weight + " を小数点の読み落としとみなして " + (weight / 10) + "kg に直しました。確かめてください");
      weight = weight / 10;
    }
    if (weight < W_MIN || weight > W_MAX) {
      warnings.push("読み取った体重 " + weight + "kg は範囲外です。手で入れてください");
      weight = null;
    }
  }
  if (weight === null && !warnings.length) {
    warnings.push("体重を読み取れませんでした。手で入れてください");
  }
  if (weight !== null && previous !== null) {
    const diff = weight - previous;
    if (Math.abs(diff) >= JUMP_KG) {
      warnings.push("前回 " + previous + "kg から " + (diff > 0 ? "+" : "") + diff.toFixed(1) +
        "kg 動いています。読み違いでないか確かめてください");
    }
  }
  if (weight !== null && reading.confidence < 0.6) {
    warnings.push("読み取りの自信が低めです。数字が合っているか確かめてください");
  }

  return {
    weight: weight === null ? null : Math.round(weight * 10) / 10,
    rawText: reading.rawText,
    confidence: reading.confidence,
    warnings: warnings,
    needsCheck: warnings.length > 0 || weight === null || reading.confidence < 0.6
  };
}

/* ---------- 画面（ここから下は差し替え不要） ---------- */

const PAGE = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>ふたりの体重帳</title>
<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="#38708f">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="体重帳">
<link rel="apple-touch-icon" href="icon-192.png">
<link rel="icon" href="icon-192.png">
<style>
  :root {
    --ground: #eef1f0; --surface: #ffffff; --surface-sunk: #f5f7f6;
    --ink: #16201d; --ink-soft: #5d6b67; --ink-faint: #8b9793;
    --rule: #dde3e1; --rule-soft: #e8ecea;
    --a: #38708f; --a-wash: rgba(56,112,143,.10);
    --b: #9e5470; --b-wash: rgba(158,84,112,.10);
    --down: #2c7a58; --up: #b0483f; --field: #f7f9f8;
    --shadow: 0 1px 2px rgba(22,32,29,.05), 0 8px 24px -16px rgba(22,32,29,.3);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --ground: #121618; --surface: #1b2123; --surface-sunk: #171d1f;
      --ink: #e6ebe9; --ink-soft: #a3aeaa; --ink-faint: #78837f;
      --rule: #2b3336; --rule-soft: #232a2c;
      --a: #6fa8c4; --a-wash: rgba(111,168,196,.14);
      --b: #cd8ba5; --b-wash: rgba(205,139,165,.14);
      --down: #57b087; --up: #e0786d; --field: #232a2c;
      --shadow: 0 1px 2px rgba(0,0,0,.3);
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--ground); color: var(--ink);
    font-family: "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic Medium", "Noto Sans JP", system-ui, sans-serif;
    font-size: 15px; line-height: 1.65; -webkit-text-size-adjust: 100%;
    padding: 0 14px calc(56px + env(safe-area-inset-bottom));
  }
  .mincho { font-family: "Hiragino Mincho ProN", "Yu Mincho", "YuMincho", "Noto Serif JP", serif; }
  .wrap { max-width: 460px; margin: 0 auto; }
  header { padding: 24px 4px 16px; }
  header h1 { margin: 0; font-size: 25px; font-weight: 600; letter-spacing: .14em; }
  header p { margin: 6px 0 0; color: var(--ink-faint); font-size: 12px; letter-spacing: .1em; }
  section {
    background: var(--surface); border: 1px solid var(--rule); border-radius: 4px;
    padding: 16px; margin-bottom: 14px; box-shadow: var(--shadow);
  }
  .eyebrow { margin: 0 0 14px; font-size: 10.5px; font-weight: 700; letter-spacing: .22em; color: var(--ink-faint); }
  .pair { display: grid; grid-template-columns: 1fr 1px 1fr; gap: 14px; }
  .divider { background: var(--rule-soft); }
  .who { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; letter-spacing: .1em; }
  .who .dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
  .who input {
    width: 100%; min-width: 0; border: 0; background: none; padding: 2px 0; font: inherit;
    font-weight: 700; letter-spacing: .1em; color: inherit; border-bottom: 1px dashed transparent;
  }
  .who input:focus { outline: none; border-bottom-color: var(--rule); }
  .big { font-size: 40px; line-height: 1.1; font-weight: 400; font-variant-numeric: tabular-nums; margin: 10px 0 2px; }
  .big .u { font-size: 14px; color: var(--ink-faint); margin-left: 3px; }
  .chip { display: inline-block; font-size: 11.5px; font-weight: 700; padding: 2px 7px; border-radius: 3px; font-variant-numeric: tabular-nums; }
  .chip.d { color: var(--down); background: rgba(44,122,88,.12); }
  .chip.u { color: var(--up); background: rgba(176,72,63,.12); }
  .chip.n { color: var(--ink-faint); background: var(--surface-sunk); }
  .meta { font-size: 11.5px; color: var(--ink-soft); margin-top: 8px; font-variant-numeric: tabular-nums; }
  .goalrow { display: flex; gap: 5px; margin-top: 10px; align-items: center; }
  .goalrow input { width: 74px; padding: 5px 7px; font-size: 12px; text-align: right; }
  .goalrow span { font-size: 11px; color: var(--ink-faint); }
  .segmented { display: flex; border: 1px solid var(--rule); border-radius: 3px; overflow: hidden; }
  .segmented button {
    flex: 1; padding: 11px 6px; border: 0; background: var(--surface); color: var(--ink-soft);
    font: inherit; font-size: 14px; font-weight: 700; letter-spacing: .1em; cursor: pointer;
  }
  .segmented button + button { border-left: 1px solid var(--rule); }
  .ghost {
    width: 100%; margin-top: 14px; padding: 11px 8px; border: 1px solid var(--rule); border-radius: 3px;
    background: var(--surface-sunk); color: var(--ink); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
  }
  .ghost:disabled { opacity: .5; }
  input[type="file"] { display: none; }
  figure { margin: 12px 0 0; display: none; }
  figure img {
    width: 100%; max-height: 300px; object-fit: contain; border-radius: 3px;
    background: var(--surface-sunk); border: 1px solid var(--rule-soft);
  }
  figure figcaption { font-size: 11.5px; color: var(--ink-faint); margin-top: 6px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
  .grid .full { grid-column: 1 / -1; }
  label { display: block; font-size: 10.5px; font-weight: 700; letter-spacing: .16em; color: var(--ink-faint); margin-bottom: 5px; }
  input[type="text"], input[type="date"], input[type="number"], input[type="password"] {
    width: 100%; padding: 11px 10px; font: inherit; font-size: 16px; border: 1px solid var(--rule);
    border-radius: 3px; background: var(--field); color: var(--ink); font-variant-numeric: tabular-nums;
  }
  input:focus-visible, button:focus-visible { outline: 2px solid var(--a); outline-offset: 1px; }
  #weight { font-size: 22px; }
  .primary {
    width: 100%; margin-top: 14px; padding: 14px; border: 0; border-radius: 3px;
    background: var(--ink); color: var(--ground); font: inherit; font-size: 15px;
    font-weight: 700; letter-spacing: .12em; cursor: pointer;
  }
  .primary:disabled { opacity: .45; }
  .notice { margin-top: 12px; border-left: 2px solid; padding: 9px 12px; font-size: 12.5px; border-radius: 0 3px 3px 0; }
  .notice.warn { border-color: #c9932f; background: rgba(201,147,47,.1); }
  .notice.ok { border-color: var(--down); background: rgba(44,122,88,.1); }
  .notice.err { border-color: var(--up); background: rgba(176,72,63,.1); }
  .notice ul { margin: 4px 0 0; padding-left: 16px; }
  .range { display: flex; gap: 6px; margin-bottom: 10px; }
  .range button {
    padding: 4px 10px; font: inherit; font-size: 11.5px; font-weight: 600; border: 1px solid var(--rule);
    border-radius: 999px; background: var(--surface); color: var(--ink-soft); cursor: pointer;
  }
  .legend { display: flex; gap: 16px; font-size: 11.5px; color: var(--ink-soft); margin-top: 8px; }
  .legend i { display: inline-block; width: 14px; height: 2px; vertical-align: middle; margin-right: 5px; }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  thead th { font-size: 10px; letter-spacing: .16em; color: var(--ink-faint); font-weight: 700; text-align: left; padding-bottom: 8px; border-bottom: 1px solid var(--rule); }
  thead th.r, tbody td.r { text-align: right; }
  tbody td { padding: 9px 0; border-bottom: 1px solid var(--rule-soft); font-size: 13.5px; }
  tbody tr td:first-child { color: var(--ink-soft); font-size: 12.5px; }
  .tag { font-size: 10px; padding: 1px 5px; border-radius: 2px; font-weight: 700; }
  .note { color: var(--ink-faint); font-size: 11px; }
  .del { border: 0; background: none; color: var(--ink-faint); font-size: 14px; cursor: pointer; padding: 2px 4px; }
  .empty { color: var(--ink-faint); font-size: 13px; text-align: center; padding: 20px 0; }
  .fine { color: var(--ink-faint); font-size: 11.5px; margin: 14px 2px 0; }
  /* 合言葉を通るまで中身を出さない。hidden属性はApps Scriptの表示環境で効かない場合があるため、
     CSSで確実に隠し、通過したときだけ show を付けて出す。 */
  #gate, #main { display: none; }
  #gate.show, #main.show { display: block; }
  #loading { text-align: center; color: var(--ink-faint); font-size: 13px; padding: 40px 0; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1 class="mincho">ふたりの体重帳</h1>
    <p>MORNING SCALE LOG</p>
  </header>

  <div id="loading">読み込んでいます…</div>

  <section id="gate">
    <p class="eyebrow">あいことば</p>
    <input type="password" id="pin" inputmode="numeric" placeholder="合言葉を入れてください">
    <button class="primary" id="pinGo">はいる</button>
    <div id="pinMsg"></div>
  </section>

  <div id="main">
    <section>
      <p class="eyebrow">いまの ふたり</p>
      <div class="pair" id="pair"></div>
    </section>

    <section>
      <p class="eyebrow">記録する</p>
      <div class="segmented" id="picker"></div>
      <button class="ghost" id="shoot">体重計を撮る（数字が自動で入ります）</button>
      <input type="file" id="photo" accept="image/*" capture="environment">

      <figure id="figure">
        <img id="preview" alt="撮影した体重計">
        <figcaption id="figcap">写真と数字が合っているか確かめてください。</figcaption>
      </figure>

      <div class="grid">
        <div class="full">
          <label for="date">ひづけ</label>
          <input type="date" id="date">
        </div>
        <div class="full">
          <label for="weight">たいじゅう kg</label>
          <input type="number" id="weight" step="0.1" min="20" max="250" inputmode="decimal" placeholder="62.4">
        </div>
        <div class="full">
          <label for="note">ひとこと</label>
          <input type="text" id="note" maxlength="40" placeholder="任意（飲み会の翌日 など）">
        </div>
      </div>

      <div id="notice"></div>
      <button class="primary" id="save">この内容で記録する</button>
    </section>

    <section>
      <p class="eyebrow">うつりかわり</p>
      <div class="range" id="range"></div>
      <div id="chart"></div>
      <div class="legend" id="legend"></div>
    </section>

    <section>
      <p class="eyebrow">きろく</p>
      <div id="history"></div>
      <p class="fine">記録はこのスプレッドシートに入ります。ふたりで同じURLを開けば、同じ記録が見えます。</p>
    </section>
  </div>
</div>
<script>

"use strict";

var RANGES = [{ label: "30日", days: 30 }, { label: "90日", days: 90 }, { label: "1年", days: 365 }];
var DEFAULT_NAMES = ["夫", "妻"];
var state = { people: [{ name: "夫", goal: null }, { name: "妻", goal: null }], records: [], today: "" };
/* Apps Script の画面は googleusercontent.com の枠内で動くため、ブラウザの設定によっては
   localStorage に触れた瞬間に例外が出る。ここで落ちると画面が真っさらのまま止まるので、
   読み書きは必ずこの2つを通す。 */
function stored(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function store(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* 記憶できないだけで、動作には支障ない */ }
}

var current = Number(stored("taijuu:who") || 0);
var pin = stored("taijuu:pin") || "";
var rangeDays = 90;
var fromPhoto = false;

var $ = function (id) { return document.getElementById(id); };
var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
var one = function (n) { return (n > 0 ? "+" : "") + n.toFixed(1); };
var color = function (i) { return i === 0 ? "var(--a)" : "var(--b)"; };
var wash = function (i) { return i === 0 ? "var(--a-wash)" : "var(--b-wash)"; };

/** 同じサーバの /api を叩く。合言葉は毎回そえる。 */
function api(action, payload) {
  var data = { pin: pin };
  for (var key in (payload || {})) data[key] = payload[key];
  return fetch("api/" + action, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data)
  }).then(function (res) {
    return res.json().catch(function () { return {}; }).then(function (body) {
      if (!res.ok || body.error) throw new Error(body.error || ("通信に失敗しました（" + res.status + "）"));
      return body;
    });
  });
}

/** 失敗を画面に出す。黙って止まると原因が分からなくなるため。 */
function fail(error) {
  var message = (error && (error.message || error.toString())) || "原因不明のエラー";
  $("loading").style.display = "block";
  $("loading").innerHTML = '<div class="notice err">開けませんでした：' + esc(message) + "</div>";
}

function notice(kind, html) {
  $("notice").innerHTML = html ? '<div class="notice ' + kind + '">' + html + "</div>" : "";
}

/* ---------- 起動 ---------- */

refresh().catch(function (error) {
  if (String(error.message || error).indexOf("合言葉") >= 0) {
    pin = "";
    store("taijuu:pin", "");
    showGate();
  } else {
    fail(error);
  }
});

function showGate() {
  $("loading").style.display = "none";
  $("gate").classList.add("show");
  $("pin").focus();
}

$("pinGo").onclick = function () {
  pin = $("pin").value.trim();
  $("pinMsg").innerHTML = '<div class="notice">確かめています…</div>';
  refresh().then(function () {
    store("taijuu:pin", pin);
    $("pinMsg").innerHTML = "";
  }).catch(function () {
    pin = "";
    $("pinMsg").innerHTML = '<div class="notice err">合言葉が違います。</div>';
  });
};

/**
 * サーバーから届いた値を整える。空の項目（目標未設定・体脂肪率なし）は
 * 欠落して届くことがあり、そのまま数値として扱うと画面全体が止まるため、
 * ここで必ず null か数値のどちらかに揃える。
 */
function normalizeState(next) {
  next = next || {};
  var num = function (value) {
    var n = typeof value === "number" ? value : Number(value);
    return value === null || value === undefined || value === "" || isNaN(n) ? null : n;
  };
  var people = (next.people || []).slice(0, 2).map(function (person, i) {
    person = person || {};
    return { name: String(person.name || DEFAULT_NAMES[i]), goal: num(person.goal) };
  });
  while (people.length < 2) people.push({ name: DEFAULT_NAMES[people.length], goal: null });

  var records = (next.records || []).map(function (r) {
    r = r || {};
    return {
      person: Number(r.person) === 1 ? 1 : 0,
      date: String(r.date || ""),
      weight: num(r.weight),
      source: String(r.source || "manual"),
      note: r.note ? String(r.note) : null
    };
  }).filter(function (r) { return r.date && r.weight !== null; });

  return { people: people, records: records, today: String(next.today || "") };
}

function refresh() {
  return api("state").then(function (next) {
    state = normalizeState(next);
    $("loading").style.display = "none";
    $("gate").classList.remove("show");
    $("main").classList.add("show");
    if (!$("date").value) $("date").value = state.today;
    renderAll();
  });
}

/* ---------- 集計 ---------- */

function recordsOf(person) {
  return state.records.filter(function (r) { return r.person === person; })
    .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
}

/** 直近7日平均と、その前の7日平均。体重は日々1kgほど動くので平均同士で比べる。 */
function weekly(person) {
  var rows = recordsOf(person);
  if (!rows.length) return { avg: null, change: null };
  var end = new Date(rows[rows.length - 1].date + "T00:00");
  var avg = function (from, to) {
    var vals = rows.filter(function (r) {
      var days = Math.round((end - new Date(r.date + "T00:00")) / 86400000);
      return days >= from && days <= to;
    }).map(function (r) { return r.weight; });
    return vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : null;
  };
  var now = avg(0, 6), prev = avg(7, 13);
  return { avg: now, change: now !== null && prev !== null ? now - prev : null };
}

/* ---------- 表示 ---------- */

function renderPair() {
  $("pair").innerHTML = "";
  state.people.forEach(function (person, i) {
    if (i === 1) {
      var line = document.createElement("div");
      line.className = "divider";
      $("pair").appendChild(line);
    }
    var rows = recordsOf(i);
    var latest = rows.length ? rows[rows.length - 1] : null;
    var w = weekly(i);
    var total = rows.length ? latest.weight - rows[0].weight : null;
    var toGoal = person.goal !== null && latest ? latest.weight - person.goal : null;
    var box = document.createElement("div");
    box.innerHTML =
      '<div class="who"><span class="dot" style="background:' + color(i) + '"></span>' +
      '<input value="' + esc(person.name) + '" maxlength="8" aria-label="名前" data-name="' + i + '"></div>' +
      '<div class="big mincho">' + (latest ? latest.weight.toFixed(1) : "––.–") + '<span class="u">kg</span></div>' +
      (w.change === null ? '<span class="chip n">先週比 —</span>'
        : '<span class="chip ' + (w.change <= 0 ? "d" : "u") + '">先週比 ' + one(w.change) + "</span>") +
      '<div class="meta">7日平均 <b>' + (w.avg === null ? "—" : w.avg.toFixed(1) + "kg") + "</b><br>" +
      "はじめから <b>" + (total === null ? "—" : one(total) + "kg") + "</b><br>" +
      (person.goal === null ? "目標 未設定"
        : toGoal === null ? "目標 " + person.goal.toFixed(1) + "kg"
        : toGoal > 0 ? "目標まで <b>あと " + toGoal.toFixed(1) + "kg</b>" : "<b>目標に到達</b>") + "</div>" +
      '<div class="goalrow"><input type="number" step="0.1" inputmode="decimal" placeholder="目標kg" value="' +
      (person.goal === null ? "" : person.goal) + '" data-goal="' + i + '" aria-label="目標体重"><span>kg</span></div>';
    $("pair").appendChild(box);
  });

  var update = function (i) {
    var name = $("pair").querySelector('[data-name="' + i + '"]').value.trim();
    var goalValue = $("pair").querySelector('[data-goal="' + i + '"]').value;
    return api("person", { index: i, name: name, goal: goalValue === "" ? null : Number(goalValue) })
      .then(function (next) { state = normalizeState(next); renderAll(); });
  };
  $("pair").querySelectorAll("[data-name],[data-goal]").forEach(function (input) {
    input.onchange = function () { update(Number(input.dataset.name !== undefined ? input.dataset.name : input.dataset.goal)); };
  });
}

function renderPicker() {
  $("picker").innerHTML = "";
  state.people.forEach(function (person, i) {
    var button = document.createElement("button");
    button.textContent = person.name;
    button.setAttribute("aria-pressed", i === current);
    if (i === current) { button.style.background = color(i); button.style.color = "#fff"; }
    button.onclick = function () {
      current = i;
      store("taijuu:who", String(i));
      clearForm();
      renderAll();
    };
    $("picker").appendChild(button);
  });
}

function renderRange() {
  $("range").innerHTML = "";
  RANGES.forEach(function (r) {
    var button = document.createElement("button");
    button.textContent = r.label;
    button.setAttribute("aria-pressed", r.days === rangeDays);
    if (r.days === rangeDays) { button.style.background = "var(--ink)"; button.style.color = "var(--ground)"; }
    button.onclick = function () { rangeDays = r.days; renderRange(); renderChart(); };
    $("range").appendChild(button);
  });
}

function renderChart() {
  var W = 460, H = 210, P = { l: 34, r: 12, t: 12, b: 24 };
  var from = new Date();
  from.setDate(from.getDate() - rangeDays + 1);
  var fromKey = from.toISOString().slice(0, 10);
  var series = state.people.map(function (_, i) {
    return recordsOf(i).filter(function (r) { return r.date >= fromKey; })
      .map(function (r) { return { x: new Date(r.date + "T00:00").getTime(), y: r.weight }; });
  });
  var points = series.reduce(function (a, b) { return a.concat(b); }, []);
  if (points.length < 2) {
    $("chart").innerHTML = '<div class="empty">記録が2つたまると線になります</div>';
    $("legend").innerHTML = "";
    return;
  }
  var goals = state.people.map(function (p) { return p.goal; }).filter(function (g) { return g !== null; });
  var xs = points.map(function (p) { return p.x; });
  var ys = points.map(function (p) { return p.y; });
  var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
  var y0 = Math.min.apply(null, ys.concat(goals)), y1 = Math.max.apply(null, ys.concat(goals));
  var pad = Math.max((y1 - y0) * 0.18, 0.6);
  y0 -= pad; y1 += pad;
  var sx = function (x) { return P.l + ((x - x0) / (x1 - x0 || 1)) * (W - P.l - P.r); };
  var sy = function (y) { return H - P.b - ((y - y0) / (y1 - y0 || 1)) * (H - P.t - P.b); };
  var day = function (t) { return new Date(t).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }); };

  var svg = '<svg viewBox="0 0 ' + W + " " + H + '" style="width:100%;height:auto;display:block" role="img" aria-label="体重の推移">';
  for (var i = 0; i <= 3; i++) {
    var y = y0 + ((y1 - y0) * i) / 3;
    svg += '<line x1="' + P.l + '" y1="' + sy(y).toFixed(1) + '" x2="' + (W - P.r) + '" y2="' + sy(y).toFixed(1) +
      '" style="stroke:var(--rule-soft)" stroke-width="1"/>' +
      '<text x="' + (P.l - 6) + '" y="' + (sy(y) + 3.5).toFixed(1) + '" font-size="9.5" text-anchor="end" style="fill:var(--ink-faint)">' + y.toFixed(1) + "</text>";
  }
  svg += '<text x="' + P.l + '" y="' + (H - 7) + '" font-size="9.5" style="fill:var(--ink-faint)">' + day(x0) + "</text>" +
    '<text x="' + (W - P.r) + '" y="' + (H - 7) + '" font-size="9.5" text-anchor="end" style="fill:var(--ink-faint)">' + day(x1) + "</text>";

  state.people.forEach(function (person, i) {
    if (person.goal === null || person.goal < y0 || person.goal > y1) return;
    svg += '<line x1="' + P.l + '" y1="' + sy(person.goal).toFixed(1) + '" x2="' + (W - P.r) + '" y2="' + sy(person.goal).toFixed(1) +
      '" style="stroke:' + color(i) + '" stroke-width="1" stroke-dasharray="2 4" opacity=".7"/>';
  });
  series.forEach(function (pts, i) {
    if (!pts.length) return;
    if (pts.length > 1) {
      var line = pts.map(function (p, j) { return (j ? "L" : "M") + sx(p.x).toFixed(1) + "," + sy(p.y).toFixed(1); }).join(" ");
      var base = H - P.b;
      svg += '<path d="' + line + " L" + sx(pts[pts.length - 1].x).toFixed(1) + "," + base + " L" + sx(pts[0].x).toFixed(1) + "," + base +
        ' Z" style="fill:' + wash(i) + '"/>' +
        '<path d="' + line + '" fill="none" style="stroke:' + color(i) + '" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"/>';
    }
    var last = pts[pts.length - 1];
    svg += '<circle cx="' + sx(last.x).toFixed(1) + '" cy="' + sy(last.y).toFixed(1) +
      '" r="3.4" style="fill:' + color(i) + ";stroke:var(--surface)" + '" stroke-width="1.5"/>';
  });
  $("chart").innerHTML = svg + "</svg>";
  $("legend").innerHTML = state.people.map(function (p, i) {
    return '<span><i style="background:' + color(i) + '"></i>' + esc(p.name) + "</span>";
  }).join("");
}

function renderHistory() {
  var rows = recordsOf(current).slice().reverse().slice(0, 40);
  if (!rows.length) {
    $("history").innerHTML = '<div class="empty">' + esc(state.people[current].name) + " の記録はまだありません</div>";
    return;
  }
  $("history").innerHTML = "<table><thead><tr><th>ひづけ</th><th class='r'>たいじゅう</th><th class='r'>まえの日から</th><th></th></tr></thead><tbody>" +
    rows.map(function (r, i) {
      var prev = rows[i + 1];
      var diff = prev ? r.weight - prev.weight : null;
      return "<tr><td>" + r.date.slice(5).replace("-", "/") +
        (r.source === "ocr" ? ' <span class="tag" style="background:' + wash(current) + ";color:" + color(current) + '">写真</span>' : "") +
        (r.note ? '<br><span class="note">' + esc(r.note) + "</span>" : "") + "</td>" +
        "<td class='r'>" + r.weight.toFixed(1) + "</td>" +
        "<td class='r' style='color:" + (diff === null ? "var(--ink-faint)" : diff <= 0 ? "var(--down)" : "var(--up)") + "'>" +
        (diff === null ? "—" : one(diff)) + "</td>" +
        "<td class='r'><button class='del' data-date='" + r.date + "' aria-label='" + r.date + " の記録を消す'>✕</button></td></tr>";
    }).join("") + "</tbody></table>";

  $("history").querySelectorAll(".del").forEach(function (button) {
    button.onclick = function () {
      var date = button.dataset.date;
      if (!confirm(state.people[current].name + " の " + date + " の記録を消しますか。")) return;
      button.disabled = true;
      api("delete", { person: current, date: date }).then(function (next) { state = normalizeState(next); renderAll(); });
    };
  });
}

function renderAll() {
  renderPair();
  renderPicker();
  renderRange();
  renderChart();
  renderHistory();
}

/* ---------- 写真を読む ---------- */

function clearForm() {
  ["weight", "note"].forEach(function (id) { $(id).value = ""; });
  $("date").value = state.today;
  $("figure").style.display = "none";
  notice("", "");
  fromPhoto = false;
}

$("shoot").onclick = function () { $("photo").click(); };

/** 送信量を減らすため、長辺1024pxのJPEGに縮めてから送る。 */
function shrink(file) {
  return new Promise(function (resolve, reject) {
    var image = new Image();
    image.onload = function () {
      var scale = Math.min(1, 1024 / Math.max(image.width, image.height));
      var canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.75).split(",")[1]);
    };
    image.onerror = function () { reject(new Error("写真を読み込めませんでした")); };
    image.src = URL.createObjectURL(file);
  });
}

$("photo").onchange = function (event) {
  var file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  $("preview").src = URL.createObjectURL(file);
  $("figure").style.display = "block";
  $("shoot").disabled = true;
  $("shoot").textContent = "読み取っています…";
  notice("", "");

  shrink(file)
    .then(function (base64) { return api("read", { image: base64, mimeType: "image/jpeg", person: current }); })
    .then(function (reading) {
      // 読めなかった項目は欠落して届くことがあるので、ここでも null に揃える
      reading = reading || {};
      var weight = typeof reading.weight === "number" ? reading.weight : null;
      var warnings = reading.warnings || [];

      if (weight !== null) { $("weight").value = weight; fromPhoto = true; }
      if (warnings.length) {
        notice("warn", "<b>確かめてください</b><ul>" + warnings.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") + "</ul>");
      } else {
        notice("ok", "写真から <b>" + weight + "kg</b> を読み取りました。合っていれば記録してください。");
      }
      if (weight === null) $("weight").focus();
    })
    .catch(function (error) {
      notice("err", esc(error.message || error) + " — 手で入れて記録できます。");
    })
    .then(function () {
      $("shoot").disabled = false;
      $("shoot").textContent = "体重計を撮る（数字が自動で入ります）";
    });
};

/* ---------- 記録する ---------- */

$("save").onclick = function () {
  var weight = Number($("weight").value);
  if (!$("weight").value || isNaN(weight)) { notice("err", "体重を入れてください。"); $("weight").focus(); return; }
  if (!$("date").value) { notice("err", "日付を入れてください。"); return; }

  var record = {
    person: current,
    date: $("date").value,
    weight: weight,
    note: $("note").value.trim(),
    source: fromPhoto ? "ocr" : "manual"
  };
  var name = state.people[current].name;
  var day = record.date.slice(5).replace("-", "/");
  $("save").disabled = true;
  notice("", "");

  api("record", record).then(function (result) {
    state = normalizeState(result && result.state);
    clearForm();
    renderAll();
    notice("ok", esc(name) + " の " + day + " を" + (result.overwritten ? "書きなおしました" : "記録しました") + "。");
  }).catch(function (error) {
    notice("err", esc(error.message || error));
  }).then(function () {
    $("save").disabled = false;
  });
};

if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").catch(function () { /* 登録できなくてもアプリは動く */ });
  });
}

</script>
</body>
</html>
`;

const MANIFEST = `{
  "name": "ふたりの体重帳",
  "short_name": "体重帳",
  "description": "体重計の写真から数字を読み取り、夫婦2人分の体重を記録します。",
  "lang": "ja",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#eef1f0",
  "theme_color": "#38708f",
  "icons": [
    {
      "src": "icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}`;

const SERVICE_WORKER = `/** 入れ物だけをキャッシュする。記録の読み書きは毎回サーバに聞く。 */
const CACHE = "taijuu-shell-v1";
const SHELL = ["./", "manifest.webmanifest", "icon-192.png", "icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // /api は必ずネットワークへ。キャッシュすると古い記録が出てしまう。
  if (request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(caches.match(request).then((hit) => hit || fetch(request)));
});
`;

const ICON_192 = "iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAIAAADdvvtQAAADd0lEQVR42u3d0W3bQBAE0C1LZaWTdBokHaSEBLIs7cw+YP59N3xawqJIzuPHT5GnMyoQgAQgAUgAEgFIABKABCARgAQgAUgAEgFIABKABCARgAQgAUgAEoBEABKABCABSAQgAUgAEoBEABKABCABqCm//vz+YgCC5mUBCBqYAPqom2uSBh2MAFpNp5vRcEMSQGF6mgwNOhgdBfSpw4lRA6BVh+2yoTlIx4WRu4BSjs0dQ1Ovx5oBevJIWDxAVe1XMpoyPX2fB4B03byv6Wi5/qssgOjp3OZE13rtSjBAryz04G+YAKKnbeOjRNsvAdSn54k1x5Uw9LxnR61VJAFKPxlVtjH0vG07lZ0MPTsBpTQTAKjmP6nKcsb4Wasnop8xfhaevIIqGnrWjp+IosbJa/P42d/VGD/L9SyvaykgJ6+Uxsb42T9+Npc2xk/E+Fnb2xg/KXp2VjfGz/6T1+b2xvhJGT87CxzjJ2j8LOwQoDA9pwFduLX0Wo1j/GSNn21NAhQ2fgDKBhTxBLROQN3j5+zXaQDljR+A2gBdvp44Nz++6Xr2VDrGzz+XvVb/hlYBeub3oxHPEAZoux6AAArWA9AuQIlPTgUoVU/EygFarWf/4gECCCCAAAIIIIC+Rc/y9QMEEEBOYQABBBBAAAEEEEAuZQDkYqqLqQB92VDEggFaaihltQDdPSoAtf2oPu4+tTZABbf1uNHRjYVX9AAkAAEEEEP0AAQQQALQf37PS0ZcjR7za/wABBBADIUW6GUrxk8XIIayqvPCOeOnDhBDQaV56a7x0wiIoZS69gJiKKKr8akyflIBMVRQ0RjOTl7BgAyh9HLGh8z4yQbEUHQnoy96rgA6YiirilEcPSWAGErc/ijRxqsA3TSUu+VgQDWGovc76Z1GMyrY5ijXBjsBPTKfnHptX6NrO2oG9HjqKeA2AlBV+5V0wgA9Ml9IkPsShUJAj5wXo0S/wKUZ0GP3OwbT3394AtCrDtULj9aqxQD01sP2xFH81N8FKIbRO5PefzygXEYdzZcAijNUU3sPoAhJfW0XAtrJqLXnWkB7GHU3XA7og5KOFHsF0HswHSzzIqDjFx8AEoAEIBGABCABSAASgEQAEoAEIAFIBCABSAASgEQAEoAEIAFIBCABSAASgAQgEYAEIAFIABIBSAASgAQgEYDku/IXxDYsCX1+DbUAAAAASUVORK5CYII=";

const ICON_512 = "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";
