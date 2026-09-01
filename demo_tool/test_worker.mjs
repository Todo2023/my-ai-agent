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
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, v); },
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

console.log(`\n${passed}件すべて通りました\n`);
