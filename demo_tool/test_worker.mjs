/* worker.js の検査部分を確かめる。ネットワークもAPIキーも使わない。
   出力の合否をコード側で決めている、という設計がここで守られていることを見る。 */
import assert from "node:assert";
import { readFileSync } from "node:fs";

// worker.js から検査に必要な部分だけを取り出して評価する（export していないため）
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf-8");
const body = src.slice(src.indexOf("const BANNED"), src.indexOf("function json("));
const check = new Function(`${body}; return check;`)();

const ok = { question: "この一文を読んだ人に、何を想像してほしいか?", explanation: "抽象のままだと読み手が像を結べない。想像させたい絵を先に決めると、書くべき具体が自動的に決まる。" };
assert.deepStrictEqual(check(ok, "もっと具体的に書きたいです"), [], "正常な出力は通る");

assert.ok(check({ ...ok, question: "自分の意思決定にAIをどう組み込むか" }, "x").includes("問いが疑問形で終わっていない"));
assert.ok(check({ ...ok, question: "" }, "x").includes("問いが空"));
assert.ok(check({ ...ok, question: "あ".repeat(200) + "?" }, "x").includes("問いが長すぎる"));
assert.ok(check(ok, ok.question).includes("元の文をそのまま返している"));
assert.ok(check({ ...ok, explanation: "受講料は2,000円です。" }, "x").includes("金額が含まれている"));
assert.ok(check({ ...ok, explanation: "必ず結果が出ます。" }, "x").some((p) => p.includes("必ず")));
assert.ok(check({ ...ok, explanation: "大谷さんに聞いてください。" }, "x").some((p) => p.includes("大谷")));
assert.ok(check({ ...ok, explanation: "" }, "x").includes("説明が空"));

console.log("検査の試験 9件すべて通りました");
