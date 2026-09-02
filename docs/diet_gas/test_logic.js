/**
 * Code.gs の判断ロジック（読み取り結果の検証・JSONの解釈）を Node で確かめる。
 * Apps Script のエディタにテスト機構が無いため、GoogleのAPIを使わない純粋な関数だけを
 * 取り出して実行する。
 *
 *   node test_logic.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// Apps Script の組み込みオブジェクトは使わないので、参照されても落ちないダミーを置く
const sandbox = {
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
  SpreadsheetApp: {}, UrlFetchApp: {}, Utilities: {}, Session: {}, LockService: {}, HtmlService: {},
  console,
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, "Code.gs"), "utf8"), sandbox);
const { validate_, parseReading_ } = sandbox;

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (error) {
    console.error(`✗ ${name}\n  ${error.message}`);
    process.exitCode = 1;
  }
}

// --- モデル出力の解釈 ---

test("素直なJSONを読める", () => {
  const r = parseReading_('{"weight_kg":62.4,"body_fat_pct":18.2,"raw_text":"62.4","confidence":0.9}');
  assert.deepStrictEqual([r.weight, r.fat, r.confidence], [62.4, 18.2, 0.9]);
});

test("```json で囲まれていても読める", () => {
  assert.strictEqual(parseReading_('```json\n{"weight_kg":62.4,"confidence":0.9}\n```').weight, 62.4);
});

test("前後に説明文が付いていても読める", () => {
  assert.strictEqual(parseReading_('はい、読み取りました。{"weight_kg":62.4,"confidence":0.8} 以上です').weight, 62.4);
});

test("JSONでなければ空の読み取りになる", () => {
  const r = parseReading_("すみません、読めませんでした");
  assert.strictEqual(r.weight, null);
  assert.strictEqual(r.confidence, 0);
});

test("confidence は 0〜1 に丸める", () => {
  assert.strictEqual(parseReading_('{"weight_kg":62.4,"confidence":5}').confidence, 1);
});

// --- 決定的な検証 ---

test("ふつうの読み取りはそのまま通る", () => {
  const r = validate_({ weight: 62.4, fat: 18.2, rawText: "62.4kg", confidence: 0.9 }, 62.6);
  assert.strictEqual(r.weight, 62.4);
  assert.strictEqual(r.warnings.length, 0);
  assert.strictEqual(r.needsCheck, false);
});

test("小数点の読み落としを直し、直したことを残す", () => {
  const r = validate_({ weight: 624, fat: null, rawText: "624", confidence: 0.8 }, null);
  assert.strictEqual(r.weight, 62.4);
  assert.ok(r.warnings.some((w) => w.includes("小数点")));
  assert.strictEqual(r.needsCheck, true);
});

test("範囲外の体重は採用しない", () => {
  const r = validate_({ weight: 3000, fat: null, rawText: "3000", confidence: 0.9 }, null);
  assert.strictEqual(r.weight, null);
  assert.ok(r.warnings.some((w) => w.includes("範囲外")));
});

test("体脂肪率だけ範囲外なら体重は残す", () => {
  const r = validate_({ weight: 62.4, fat: 182, rawText: "62.4 182", confidence: 0.9 }, null);
  assert.strictEqual(r.weight, 62.4);
  assert.strictEqual(r.fat, null);
});

test("前回から大きく動いたときは、値を捨てずに確認を促す", () => {
  const r = validate_({ weight: 72.4, fat: null, rawText: "72.4", confidence: 0.95 }, 62.4);
  assert.strictEqual(r.weight, 72.4);
  assert.ok(r.warnings.some((w) => w.includes("+10.0kg")));
  assert.strictEqual(r.needsCheck, true);
});

test("自信が低いときは確認を促す", () => {
  assert.strictEqual(validate_({ weight: 62.4, fat: null, rawText: "62.4", confidence: 0.3 }, null).needsCheck, true);
});

test("何も読めなければ手入力に倒す", () => {
  const r = validate_({ weight: null, fat: null, rawText: "", confidence: 0.1 }, null);
  assert.ok(r.warnings.some((w) => w.includes("手で入れて")));
  assert.strictEqual(r.needsCheck, true);
});

if (!process.exitCode) console.log(`${passed}件すべて通りました`);
