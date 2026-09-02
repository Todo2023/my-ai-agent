/* worker.js の通しの試験。ネットワークにもGeminiにも触れない。
   Geminiへの通信は差し替え（stub）て、返ってきた内容ごとに何が起きるかを確かめる。

   ここで見たいのは1つ。**出してよいかを決めているのはコードであって、AIではない**こと。
   実行:  node test_worker.mjs
*/
import assert from "node:assert";
import worker, { check } from "./worker.js";

/* ---- 道具 ---- */

function fakeKV() {
  const store = new Map();
  return {
    store,
    async get(k, type) {
      if (!store.has(k)) return null;
      const v = store.get(k);
      // 本物の KV と同じく、頼まれた形で返す（画像はバイトで取り出す）
      if (type === "arrayBuffer") {
        return typeof v === "string" ? new TextEncoder().encode(v).buffer : v;
      }
      return v;
    },
    async put(k, v) { store.set(k, v); },
    async delete(k) { store.delete(k); },
    async list({ prefix = "" } = {}) {
      return { keys: [...store.keys()].filter((k) => k.startsWith(prefix)).sort().map((name) => ({ name })) };
    },
  };
}

/** Gemini の応答を差し替える。queue に積んだものを順に返す */
function stubGemini(queue) {
  globalThis.fetch = async () => {
    const next = queue.shift();
    if (next.status === 429) return new Response("", { status: 429 });
    if (next.status && next.status !== 200) return new Response("", { status: next.status });
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(next.body) }] } }],
    }), { status: 200 });
  };
}

const CODES = JSON.stringify({
  "OK-CODE": { audience: "student", max_uses: null },
  "LIMITED": { audience: "student", max_uses: 2 },
});

function env(extra = {}) {
  return { GEMINI_API_KEY: "test-key", ACCESS_CODES: CODES, DEMO_KV: fakeKV(), ...extra };
}

function post(body) {
  return new Request("https://example.workers.dev", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const GOOD = {
  question: "この一文を読んだ人に、何を想像してほしいか?",
  explanation: "抽象のままだと読み手が像を結べない。想像させたい絵を先に決めると、書くべき具体が決まる。",
};

let passed = 0;
async function t(name, fn) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

/* ---- 検査そのもの ---- */

console.log("\n出力の検査");
await t("正常な出力は通る", () => {
  assert.deepStrictEqual(check(GOOD, "もっと具体的に書きたいです"), []);
});
await t("疑問形でない出力は落とす", () => {
  assert.ok(check({ ...GOOD, question: "AIをどう組み込むか" }, "x").includes("問いが疑問形で終わっていない"));
});
await t("元の文をそのまま返したら落とす", () => {
  assert.ok(check(GOOD, GOOD.question).includes("元の文をそのまま返している"));
});
await t("金額が入っていたら落とす", () => {
  assert.ok(check({ ...GOOD, explanation: "受講料は2,000円です。" }, "x").includes("金額が含まれている"));
});
await t("「必ず」などの約束は落とす", () => {
  assert.ok(check({ ...GOOD, explanation: "必ず結果が出ます。" }, "x").some((p) => p.includes("必ず")));
});
await t("個人名は落とす", () => {
  assert.ok(check({ ...GOOD, explanation: "大谷さんに聞いてください。" }, "x").some((p) => p.includes("大谷")));
});
await t("空の出力は落とす", () => {
  assert.ok(check({ question: "", explanation: "" }, "x").length >= 2);
});

/* ---- 通しの動き ---- */

console.log("\n通しの動き");

await t("コードが違えば、Geminiを呼ぶ前に断る", async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; };
  const res = await worker.fetch(post({ code: "NOPE", audience: "student", text: "あ" }), env());
  assert.strictEqual(res.status, 403);
  assert.strictEqual(called, false, "呼んではいけない");
});

await t("問いが空なら断る", async () => {
  const res = await worker.fetch(post({ code: "OK-CODE", text: "  " }), env());
  assert.strictEqual(res.status, 400);
});

await t("長すぎる入力は断る", async () => {
  const res = await worker.fetch(post({ code: "OK-CODE", text: "あ".repeat(401) }), env());
  assert.strictEqual(res.status, 400);
});

await t("正常なら書き換えた問いを返す", async () => {
  stubGemini([{ body: GOOD }]);
  const res = await worker.fetch(post({ code: "OK-CODE", audience: "student", text: "AIって結局何に使えるんですか" }), env());
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.question, GOOD.question);
  assert.ok(data.explanation.length > 0);
});

await t("1回目が検査に落ちても、2回目が通れば返す", async () => {
  stubGemini([{ body: { question: "疑問形でない", explanation: "説明" } }, { body: GOOD }]);
  const res = await worker.fetch(post({ code: "OK-CODE", text: "テスト" }), env());
  assert.strictEqual(res.status, 200);
});

await t("2回とも検査に落ちたら、画面には出さない", async () => {
  const bad = { question: "受講料は2,000円ですか?", explanation: "必ず得します。" };
  stubGemini([{ body: bad }, { body: bad }]);
  const res = await worker.fetch(post({ code: "OK-CODE", text: "テスト" }), env());
  assert.strictEqual(res.status, 422);
  const data = await res.json();
  assert.ok(!JSON.stringify(data).includes("2,000円"), "落とした内容を漏らさない");
});

await t("混雑（429）は、待ち時間つきで伝える", async () => {
  stubGemini([{ status: 429 }]);
  const res = await worker.fetch(post({ code: "OK-CODE", text: "テスト" }), env());
  assert.strictEqual(res.status, 429);
  const data = await res.json();
  assert.strictEqual(data.retryAfterSeconds, 20);
  assert.ok(data.error.includes("混み合"));
});

await t("鍵が未登録なら、そう言う", async () => {
  const res = await worker.fetch(post({ code: "OK-CODE", text: "テスト" }),
                                 { ACCESS_CODES: CODES, DEMO_KV: fakeKV() });
  assert.strictEqual(res.status, 502);
  assert.ok((await res.json()).error.includes("GEMINI_API_KEY"));
});

await t("利用回数の上限を超えたら断る", async () => {
  const e = env();
  stubGemini([{ body: GOOD }, { body: GOOD }, { body: GOOD }]);
  for (let i = 0; i < 2; i++) {
    const ok = await worker.fetch(post({ code: "LIMITED", text: "テスト" }), e);
    assert.strictEqual(ok.status, 200, `${i + 1}回目は通るはず`);
  }
  const over = await worker.fetch(post({ code: "LIMITED", text: "テスト" }), e);
  assert.strictEqual(over.status, 403);
  assert.ok((await over.json()).error.includes("2回"));
});

await t("上限なしのコードは何度でも使える", async () => {
  const e = env();
  stubGemini([{ body: GOOD }, { body: GOOD }, { body: GOOD }, { body: GOOD }]);
  for (let i = 0; i < 4; i++) {
    const res = await worker.fetch(post({ code: "OK-CODE", text: "テスト" }), e);
    assert.strictEqual(res.status, 200);
  }
});

await t("学年ごとに、渡す前提が変わる", async () => {
  const { buildPrompt } = await import("./worker.js");
  assert.ok(buildPrompt("g1", "x").includes("履修"), "1年には履修の文脈");
  assert.ok(buildPrompt("g1", "x").includes("サークル"));
  assert.ok(buildPrompt("g3", "x").includes("就職活動"), "3年には就活の文脈");
  assert.ok(buildPrompt("g4", "x").includes("修士論文"), "4年・院には論文の文脈");
  assert.ok(buildPrompt("pro", "x").includes("個人事業主"));
  // 1年生に就活の話をしない、4年生に履修の話をしない
  assert.ok(!buildPrompt("g1", "x").includes("就職活動"));
  assert.ok(!buildPrompt("g4", "x").includes("履修"));
});

await t("知らない学年が来ても落ちず、汎用の前提に戻る", async () => {
  stubGemini([{ body: GOOD }]);
  const res = await worker.fetch(post({ code: "OK-CODE", audience: "g9", text: "テスト" }), env());
  assert.strictEqual(res.status, 200);
});

/* ---- 資料ページからの質問（/ask） ---- */

function ask(body, headers = {}) {
  return new Request("https://example.workers.dev/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.9", ...headers },
    body: JSON.stringify(body),
  });
}

/** Slackへの送信を差し替える。届いた本文を覚えておく */
function stubSlack(status = 200) {
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push({ url, body: JSON.parse(init.body) });
    return new Response("ok", { status });
  };
  return seen;
}

await t("質問はSlackに届き、KVにも残る", async () => {
  const e = env({ SLACK_WEBHOOK_URL: "https://hooks.slack.test/x" });
  const seen = stubSlack();
  const res = await worker.fetch(ask({ lesson: "問いを立てる", slide: "5", name: "山田", text: "ここが分かりません" }), e);
  const body = await res.json();
  assert.strictEqual(res.status, 200);
  assert.strictEqual(body.delivered, true, "Slackに届いたと返る");
  assert.ok(seen[0].body.text.includes("ここが分かりません"), "本文が入っている");
  assert.ok(seen[0].body.text.includes("スライド 5"), "どのスライドか分かる");
  assert.ok(seen[0].body.text.includes("山田"));
  const keys = [...e.DEMO_KV.store.keys()].filter((k) => k.startsWith("ask:"));
  assert.strictEqual(keys.length, 1, "KVにも残る");
});

await t("Slackが落ちていても、質問は失わない", async () => {
  const e = env({ SLACK_WEBHOOK_URL: "https://hooks.slack.test/x" });
  stubSlack(500);
  const res = await worker.fetch(ask({ lesson: "第1回", text: "質問です" }), e);
  const body = await res.json();
  assert.strictEqual(res.status, 200);
  assert.strictEqual(body.delivered, false, "届かなかったことは正直に返す");
  const keys = [...e.DEMO_KV.store.keys()].filter((k) => k.startsWith("ask:"));
  assert.strictEqual(keys.length, 1, "それでもKVには残っている");
});

await t("Slackが未設定でも受け取り、KVに残す", async () => {
  const e = env();
  const res = await worker.fetch(ask({ lesson: "第1回", text: "質問です" }), e);
  assert.strictEqual(res.status, 200);
  assert.strictEqual((await res.json()).delivered, false);
  assert.strictEqual([...e.DEMO_KV.store.keys()].filter((k) => k.startsWith("ask:")).length, 1);
});

await t("空の質問と長すぎる質問は受けない", async () => {
  const e = env();
  assert.strictEqual((await worker.fetch(ask({ text: "   " }), e)).status, 400);
  assert.strictEqual((await worker.fetch(ask({ text: "あ".repeat(601) }), e)).status, 400);
});

await t("隠し欄が埋まっていたら、機械とみなして捨てる", async () => {
  const e = env({ SLACK_WEBHOOK_URL: "https://hooks.slack.test/x" });
  const seen = stubSlack();
  const res = await worker.fetch(ask({ text: "宣伝です", website: "http://spam" }), e);
  assert.strictEqual(res.status, 200, "機械には成功したように見せる");
  assert.strictEqual(seen.length, 0, "Slackには流さない");
  assert.strictEqual([...e.DEMO_KV.store.keys()].filter((k) => k.startsWith("ask:")).length, 0);
});

await t("短い時間の連投は止める", async () => {
  const e = env();
  for (let i = 0; i < 10; i++) {
    assert.strictEqual((await worker.fetch(ask({ text: "質問" + i }), e)).status, 200);
  }
  assert.strictEqual((await worker.fetch(ask({ text: "11件目" }), e)).status, 429);
});

await t("溜まった質問は、合鍵がある人だけが読める", async () => {
  const e = env({ ASK_ADMIN_KEY: "himitsu" });
  await worker.fetch(ask({ lesson: "第1回", text: "ひとつめ" }), e);
  const ng = await worker.fetch(new Request("https://example.workers.dev/ask?key=chigau"), e);
  assert.strictEqual(ng.status, 403, "鍵が違えば読めない");
  const ok = await worker.fetch(new Request("https://example.workers.dev/ask?key=himitsu"), e);
  assert.strictEqual(ok.status, 200);
  assert.strictEqual((await ok.json()).questions[0].text, "ひとつめ");
});

await t("鍵を設定していなければ、誰も読めない", async () => {
  const res = await worker.fetch(new Request("https://example.workers.dev/ask?key="), env());
  assert.strictEqual(res.status, 403);
});

await t("質問の入り口は、デモの書き換えを巻き込まない", async () => {
  const e = env({ SLACK_WEBHOOK_URL: "https://hooks.slack.test/x" });
  stubSlack();
  await worker.fetch(ask({ text: "質問" }), e);
  // 質問はアクセスコードを使わない＝デモの利用回数は増えない
  assert.strictEqual([...e.DEMO_KV.store.keys()].filter((k) => k.startsWith("use:")).length, 0);
});

/* ---- 教材の配信と、解放の決まり ---- */

const INDEX = [
  { slug: "lesson-00",  label: "第0回",    numbered: true,  gates: false, title: "デモ",       date: "", written: true, slides: 0 },
  { slug: "lesson-00b", label: "はじめに", numbered: false, gates: false, title: "付き合い方", date: "", written: true, slides: 0 },
  { slug: "lesson-01",  label: "第1回",    numbered: true,  gates: true, title: "問いを立てる", date: "", written: true, slides: 2 },
  { slug: "lesson-02",  label: "第2回",    numbered: true,  gates: true, title: "役割分担",   date: "", written: true, slides: 0 },
  { slug: "lesson-03",  label: "第3回",    numbered: true,  gates: true, title: "構造化",     date: "", written: true, slides: 0 },
];

/** 教材を載せた状態の env を作る */
function envWithLessons(memberRec = { name: "山田", paidThrough: 3 }, extra = {}) {
  const e = env(extra);
  e.DEMO_KV.store.set("index", JSON.stringify(INDEX));
  for (const x of INDEX) {
    e.DEMO_KV.store.set(`lesson:${x.slug}`, JSON.stringify({ ...x, body: `<p>${x.title}の本文</p>` }));
  }
  // 1x1 の透明PNG
  // 1x1 の透明PNG。**そのままの姿**で入れる（配信元と同じ形）
  e.DEMO_KV.store.set("slide:lesson-01:01", Uint8Array.from(
    atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="),
    (c) => c.charCodeAt(0)).buffer);
  if (memberRec) e.DEMO_KV.store.set("member:CODE1", JSON.stringify(memberRec));
  return e;
}

function api(path, body) {
  return new Request("https://example.workers.dev" + path, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

await t("合言葉が違えば、一覧すら返さない", async () => {
  const res = await worker.fetch(api("/me", { code: "SHIRANAI" }), envWithLessons());
  assert.strictEqual(res.status, 403);
});

await t("最初は、第0回と「はじめに」だけが開く", async () => {
  const res = await worker.fetch(api("/me", { code: "CODE1" }), envWithLessons());
  const open = (await res.json()).lessons.filter((x) => x.open).map((x) => x.slug);
  assert.deepStrictEqual(open, ["lesson-00", "lesson-00b", "lesson-01"],
    "デモ・はじめに・そして提出前でも第1回までは開く");
});

await t("開いていない回は、直接叩いても本文を返さない", async () => {
  const e = envWithLessons();
  const res = await worker.fetch(api("/lesson", { code: "CODE1", slug: "lesson-03" }), e);
  const body = await res.json();
  assert.strictEqual(res.status, 403);
  assert.strictEqual(body.locked, true);
  assert.ok(!("body" in body), "本文は含めない");
});

await t("ワークを出すと、次の回が開く", async () => {
  const e = envWithLessons();
  stubSlack();
  const before = await worker.fetch(api("/lesson", { code: "CODE1", slug: "lesson-02" }), e);
  assert.strictEqual(before.status, 403, "出す前は閉じている");

  const sub = await worker.fetch(api("/submit", { code: "CODE1", slug: "lesson-01", text: "書きました" }), e);
  const subBody = await sub.json();
  assert.strictEqual(sub.status, 200);
  assert.strictEqual(subBody.next.slug, "lesson-02");
  assert.strictEqual(subBody.next.open, true);

  const after = await worker.fetch(api("/lesson", { code: "CODE1", slug: "lesson-02" }), e);
  assert.strictEqual(after.status, 200, "出したあとは開く");
  assert.ok((await after.json()).body.includes("役割分担の本文"));
});

await t("途中では、まだ修了にしない", async () => {
  const e = envWithLessons();
  stubSlack();
  const sub = await worker.fetch(api("/submit", { code: "CODE1", slug: "lesson-01", text: "x" }), e);
  assert.strictEqual((await sub.json()).done, false);
});

await t("提出を求める回を出し切ると、修了として返す", async () => {
  // 最後の回まで支払いが届いている人
  const e = envWithLessons({ name: "山田", paidThrough: 4 });
  stubSlack();
  let sub;
  for (const slug of ["lesson-01", "lesson-02", "lesson-03"]) {
    stubSlack();
    sub = await worker.fetch(api("/submit", { code: "CODE1", slug, text: "x" }), e);
  }
  const body = await sub.json();
  assert.strictEqual(body.done, true, "最後の1本で修了になる");
  assert.strictEqual(body.next, null, "次の回はない");
});

await t("提出を求めない回だけ出しても、修了にはならない", async () => {
  // 第0回と「はじめに」は gates:false。ここを出しても進度は動かない
  const e = envWithLessons();
  stubSlack();
  const sub = await worker.fetch(api("/submit", { code: "CODE1", slug: "lesson-00b", text: "x" }), e);
  assert.strictEqual((await sub.json()).done, false);
});

await t("一覧は、提出を求める回かどうかも返す", async () => {
  const res = await worker.fetch(api("/me", { code: "CODE1" }), envWithLessons());
  const gating = (await res.json()).lessons.filter((x) => x.gates).map((x) => x.slug);
  assert.deepStrictEqual(gating, ["lesson-01", "lesson-02", "lesson-03"]);
});

await t("2つ先までは開かない", async () => {
  const e = envWithLessons();
  stubSlack();
  await worker.fetch(api("/submit", { code: "CODE1", slug: "lesson-01", text: "x" }), e);
  const res = await worker.fetch(api("/lesson", { code: "CODE1", slug: "lesson-03" }), e);
  assert.strictEqual(res.status, 403);
});

await t("支払いの範囲を超えた回は、提出しても開かない", async () => {
  // 支払いは第1回（i=2）まで。ワークを出しても第2回（i=3）は開かない
  const e = envWithLessons({ name: "山田", paidThrough: 2 });
  stubSlack();
  const sub = await worker.fetch(api("/submit", { code: "CODE1", slug: "lesson-01", text: "x" }), e);
  const subBody = await sub.json();
  assert.strictEqual(subBody.next.open, false, "次は開かない");
  assert.ok(subBody.blocked.includes("お申し込みの範囲"), "理由を返す");
  const res = await worker.fetch(api("/lesson", { code: "CODE1", slug: "lesson-02" }), e);
  const body = await res.json();
  assert.strictEqual(res.status, 403);
  assert.ok(body.error.includes("お申し込みの範囲"), "理由を支払い側だと伝える");
});

await t("提出前の回は、理由を「前の回を出せば開く」と伝える", async () => {
  const e = envWithLessons({ name: "山田", paidThrough: 9 });
  const res = await worker.fetch(api("/lesson", { code: "CODE1", slug: "lesson-03" }), e);
  assert.ok((await res.json()).error.includes("提出すると開きます"));
});

await t("出し直しても、進み具合は戻らない", async () => {
  const e = envWithLessons();
  stubSlack();
  await worker.fetch(api("/submit", { code: "CODE1", slug: "lesson-01", text: "x" }), e);
  await worker.fetch(api("/submit", { code: "CODE1", slug: "lesson-00", text: "y" }), e);
  const res = await worker.fetch(api("/lesson", { code: "CODE1", slug: "lesson-02" }), e);
  assert.strictEqual(res.status, 200, "第2回は開いたまま");
});

await t("提出したワークは残り、Slackにも流れる", async () => {
  const e = envWithLessons({ name: "山田", paidThrough: 3 }, { SLACK_WEBHOOK_URL: "https://hooks.slack.test/x" });
  const seen = stubSlack();
  await worker.fetch(api("/submit", { code: "CODE1", slug: "lesson-01", text: "私の答え" }), e);
  const keys = [...e.DEMO_KV.store.keys()].filter((k) => k.startsWith("work:CODE1:lesson-01:"));
  assert.strictEqual(keys.length, 1);
  assert.ok(seen[0].body.text.includes("私の答え"));
  assert.ok(seen[0].body.text.includes("ワーク提出"));
});

await t("スライド画像も同じ鍵で守る", async () => {
  const e = envWithLessons({ name: "山田", paidThrough: 2 });
  const ng = await worker.fetch(new Request("https://example.workers.dev/slide?code=CODE1&slug=lesson-03&p=01"), e);
  assert.strictEqual(ng.status, 403, "閉じた回の画像は返さない");
  const ok = await worker.fetch(new Request("https://example.workers.dev/slide?code=CODE1&slug=lesson-01&p=01"), e);
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.headers.get("Content-Type"), "image/png");
  // 画像として壊れていないこと。PNGの先頭8バイトを確かめる
  const head = new Uint8Array(await ok.arrayBuffer()).slice(0, 8);
  assert.deepStrictEqual([...head], [137, 80, 78, 71, 13, 10, 26, 10], "PNGの先頭が残っている");
});

await t("受講者の登録は、合鍵がある人だけができる", async () => {
  const e = envWithLessons(null, { ASK_ADMIN_KEY: "himitsu" });
  const ng = await worker.fetch(api("/member?key=chigau", { code: "NEW1", name: "新人", paidThrough: 4 }), e);
  assert.strictEqual(ng.status, 403);
  const ok = await worker.fetch(api("/member?key=himitsu", { code: "NEW1", name: "新人", paidThrough: 4 }), e);
  assert.strictEqual(ok.status, 200);
  const me = await worker.fetch(api("/me", { code: "NEW1" }), e);
  assert.strictEqual(me.status, 200);
});

await t("支払い範囲だけを更新しても、名前は消えない", async () => {
  const e = envWithLessons({ name: "山田", paidThrough: 1 }, { ASK_ADMIN_KEY: "himitsu" });
  await worker.fetch(api("/member?key=himitsu", { code: "CODE1", paidThrough: 4 }), e);
  const rec = JSON.parse(e.DEMO_KV.store.get("member:CODE1"));
  assert.strictEqual(rec.name, "山田");
  assert.strictEqual(rec.paidThrough, 4);
});

/* ---- みんなの質問と、Slackの届け分け ---- */

await t("質問はワークと違うチャンネルに流れる", async () => {
  const e = envWithLessons({ name: "山田", paidThrough: 3 }, {
    SLACK_WEBHOOK_URL: "https://hooks.slack.test/ask",
    SLACK_WORK_WEBHOOK_URL: "https://hooks.slack.test/work",
  });
  const seen = stubSlack();
  await worker.fetch(ask({ slug: "lesson-01", lesson: "第1回", text: "質問です" }), e);
  await worker.fetch(api("/submit", { code: "CODE1", slug: "lesson-01", text: "ワークです" }), e);
  assert.strictEqual(seen[0].url, "https://hooks.slack.test/ask", "質問は質問側へ");
  assert.strictEqual(seen[1].url, "https://hooks.slack.test/work", "ワークはワーク側へ");
});

await t("ワーク側が未設定なら、質問側に落として届ける", async () => {
  const e = envWithLessons({ name: "山田", paidThrough: 3 },
    { SLACK_WEBHOOK_URL: "https://hooks.slack.test/ask" });
  const seen = stubSlack();
  await worker.fetch(api("/submit", { code: "CODE1", slug: "lesson-01", text: "ワーク" }), e);
  assert.strictEqual(seen[0].url, "https://hooks.slack.test/ask", "黙って消さない");
});

await t("同じ回の質問が、名前を伏せて返る", async () => {
  const e = envWithLessons();
  stubSlack();
  await worker.fetch(ask({ slug: "lesson-01", lesson: "第1回", slide: "3", name: "山田", text: "ここが分かりません" }), e);
  const res = await worker.fetch(api("/questions", { code: "CODE1", slug: "lesson-01" }), e);
  const qs = (await res.json()).questions;
  assert.strictEqual(res.status, 200);
  assert.strictEqual(qs.length, 1);
  assert.strictEqual(qs[0].text, "ここが分かりません");
  assert.strictEqual(qs[0].slide, "3");
  assert.ok(!("name" in qs[0]), "名前は入れない");
  assert.ok(!JSON.stringify(qs).includes("山田"), "名前がどこにも漏れない");
});

await t("別の回の質問は混ざらない", async () => {
  const e = envWithLessons();
  stubSlack();
  await worker.fetch(ask({ slug: "lesson-01", text: "第1回の質問" }), e);
  await worker.fetch(ask({ slug: "lesson-02", text: "第2回の質問" }), e);
  const res = await worker.fetch(api("/questions", { code: "CODE1", slug: "lesson-01" }), e);
  const qs = (await res.json()).questions;
  assert.deepStrictEqual(qs.map((q) => q.text), ["第1回の質問"]);
});

await t("開いていない回の質問は読めない", async () => {
  const e = envWithLessons({ name: "山田", paidThrough: 2 });
  stubSlack();
  await worker.fetch(ask({ slug: "lesson-03", text: "先の回の質問" }), e);
  const res = await worker.fetch(api("/questions", { code: "CODE1", slug: "lesson-03" }), e);
  assert.strictEqual(res.status, 403, "本文と同じ扱いにする");
});

await t("新しい質問が先に来る", async () => {
  const e = envWithLessons();
  stubSlack();
  await worker.fetch(ask({ slug: "lesson-01", text: "ひとつめ" }), e);
  await new Promise((r) => setTimeout(r, 3));
  await worker.fetch(ask({ slug: "lesson-01", text: "ふたつめ" }), e);
  const res = await worker.fetch(api("/questions", { code: "CODE1", slug: "lesson-01" }), e);
  assert.deepStrictEqual((await res.json()).questions.map((q) => q.text), ["ふたつめ", "ひとつめ"]);
});

await t("見せたくない質問は、合鍵がある人だけが取り下げられる", async () => {
  const e = envWithLessons({ name: "山田", paidThrough: 3 }, { ASK_ADMIN_KEY: "himitsu" });
  stubSlack();
  await worker.fetch(ask({ slug: "lesson-01", text: "消したい質問" }), e);
  const before = await (await worker.fetch(api("/questions", { code: "CODE1", slug: "lesson-01" }), e)).json();
  const id = before.questions[0].id;

  const ng = await worker.fetch(api("/question/hide?key=chigau", { id }), e);
  assert.strictEqual(ng.status, 403);

  const ok = await worker.fetch(api("/question/hide?key=himitsu", { id }), e);
  assert.strictEqual(ok.status, 200);
  const after = await (await worker.fetch(api("/questions", { code: "CODE1", slug: "lesson-01" }), e)).json();
  assert.strictEqual(after.questions.length, 0);
});

await t("版が付いた画像だけ、ブラウザに長く持たせる", async () => {
  const e = envWithLessons({ name: "山田", paidThrough: 2 });
  const withV = await worker.fetch(
    new Request("https://example.workers.dev/slide?code=CODE1&slug=lesson-01&p=01&v=abc123"), e);
  assert.match(withV.headers.get("Cache-Control"), /max-age=604800/);

  // 版が無いときに長く持たせると、差し替えても古い画像が残り続ける
  const noV = await worker.fetch(
    new Request("https://example.workers.dev/slide?code=CODE1&slug=lesson-01&p=01"), e);
  assert.match(noV.headers.get("Cache-Control"), /max-age=60$/);
});

console.log(`\n${passed}件すべて通りました\n`);
