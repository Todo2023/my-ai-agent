/**
 * 計算の突き合わせ。ブラウザを開かずに数字を確かめる:  node kakei/_test.js
 *
 * 画面を見て「なんとなく合っている」で済ませると、複利や返済のような
 * 目で追えない計算はいつまでも間違ったままになる。手で出せる答えとだけ突き合わせる。
 */
const S = require("./sim.js");
const SECRET = require("./secret.js");

let ng = 0;
const near = (a, b, tol, what) => {
  const ok = Math.abs(a - b) <= tol;
  if (!ok) ng++;
  console.log(`${ok ? "  ok" : "  NG"}  ${what}: ${a.toFixed(2)}（期待 ${b}±${tol}）`);
};
const is = (a, b, what) => {
  const ok = a === b;
  if (!ok) ng++;
  console.log(`${ok ? "  ok" : "  NG"}  ${what}: ${a}（期待 ${b}）`);
};

const YEAR = new Date().getFullYear();
const base = (over) => Object.assign({
  startYear: YEAR, horizonAge: 45,
  me: { birthYear: YEAR - 40, retireAge: 65, severance: 0, pension: 0 },
  partner: null,
  living: { inflation: 0, oldRate: 100 },
  assets: { now: 0, yieldRate: 0 },
  income: [], spend: [], children: [], events: [], childAllowance: false,
}, over);

console.log("単位の変換（円/月 → 万円/年）");
near(S.toMan(10000), 12, 0.001, "月1万円");
near(S.toMan(123456), 148.15, 0.01, "月12万3456円");

console.log("ローンの返済額");
// 3500万・年1.5%・35年 → 月107,164円 ≒ 年128.6万（金融機関の返済額表と同じ）
near(S.loanPerYear(3500, 1.5, 35), 128.6, 0.5, "3500万 1.5% 35年");
near(S.loanPerYear(3500, 0, 35), 100, 0.01, "金利0%なら元金÷年数");
near(S.loanPerYear(0, 1.5, 35), 0, 0.001, "借りない");

console.log("教育費");
near(S.eduCost({ path: "public", uni: "national" }, 8), 35, 0.01, "公立小（8歳）");
near(S.eduCost({ path: "private", uni: "national" }, 8), 167, 0.01, "私立小（8歳）");
near(S.eduCost({ path: "public", uni: "arts" }, 18), 145, 0.01, "私大1年目（授業料＋入学金）");
near(S.eduCost({ path: "public", uni: "arts" }, 19), 120, 0.01, "私大2年目");
near(S.eduCost({ path: "public", uni: "none" }, 19), 0, 0.01, "大学に行かない");
near(S.eduCost({ path: "public", uni: "arts" }, 22), 0, 0.01, "卒業後");

console.log("児童手当");
near(S.allowance(0, 1), 18, 0.01, "0歳（月1.5万）");
near(S.allowance(5, 1), 12, 0.01, "5歳（月1万）");
near(S.allowance(5, 3), 36, 0.01, "5歳・第3子（月3万）");
near(S.allowance(18, 1), 0, 0.01, "18歳（もう出ない）");

console.log("合い言葉のならし（打ち方がちがっても同じ鍵になる）");
{
  const c = SECRET.canon;
  is(c("トド"), c("とど"), "カタカナ＝ひらがな");
  is(c("トド"), c("todo"), "カタカナ＝ローマ字");
  is(c("トド"), c("TODO"), "大文字でも同じ");
  is(c("トド"), c("Todo"), "先頭だけ大文字でも同じ");
  is(c("トド"), c("ﾄﾄﾞ"), "半角カナでも同じ");
  is(c("トド"), c(" と ど "), "空白が入っても同じ");
  is(c("しゃけ"), "shake", "拗音");
  is(c("がっこう"), "gakkou", "促音と長音");
  is(c("ジョン"), "jon", "濁った拗音");
  is(c("トド") === c("とら"), false, "ちがう言葉は同じにならない");
}

console.log("生年で持つ（年齢を入れ直さなくていい）");
{
  const plan = base({
    horizonAge: 95,
    me: { birthYear: 1980, retireAge: 65, severance: 0, pension: 0 },
    partner: { on: true, birthYear: 1991, retireAge: 65, severance: 0, pension: 0 },
  });
  const rows = S.simulate(plan).rows;
  is(rows[0].year, YEAR, "起点は今年");
  is(rows[0].age, YEAR - 1980, "その年に迎える年齢で数える");
  is(rows[0].partnerAge, YEAR - 1991, "配偶者も同じ数え方");
  is(rows[rows.length - 1].year, 1980 + 95, "最後は95歳になる年");
  is(rows[rows.length - 1].age, 95, "最後の年齢");
}

console.log("収入は「だれの分か」で分かれる");
{
  const plan = base({
    horizonAge: 41,
    income: [
      { label: "給与", monthly: 100000, owner: "me" },
      { label: "手当", monthly: 200000, owner: "partner" },
      { label: "事業", monthly: 300000 },
    ],
    partner: { on: true, birthYear: YEAR - 40, retireAge: 65 },
  });
  const by = S.simulate(plan).rows[0].income.workBy;
  near(by.me, 120, 0.01, "あなた");
  near(by.partner, 240, 0.01, "配偶者");
  near(by.none, 360, 0.01, "どちらの分でもない");
}

console.log("見本の収支表");
{
  const plan = base({ income: SECRET.SAMPLE.income, spend: SECRET.SAMPLE.spend });
  const m = S.monthlyNow(plan);
  is(m.income, 500000, "収入の合計");
  is(m.spend + m.saving, 329000, "支出の合計（貯蓄をふくむ）");
  is(m.saving, 50000, "うち貯蓄にまわすぶん");
  is(m.cash, 171000, "手元に残る現金");
  is(m.keep, 221000, "毎月ふえる資産（現金＋貯蓄）");
}

console.log("教育費は「自動で入れる」にした子だけ");
{
  const kid = { name: "こ", birthYear: YEAR - 8, path: "public", uni: "national" };
  const off = base({ horizonAge: 41, children: [Object.assign({}, kid, { auto: false })] });
  const on = base({ horizonAge: 41, children: [Object.assign({}, kid, { auto: true })] });
  near(S.simulate(off).rows[0].spend.edu, 0, 0.01, "切っているときは0");
  near(S.simulate(on).rows[0].spend.edu, 35, 0.01, "入れると公立小の35万");
}

console.log("貯蓄は資産に残る（出ていくお金に数えない）");
{
  const plan = base({
    horizonAge: 41,
    income: [{ label: "給与", monthly: 300000 }],
    spend: [
      { label: "生活費", monthly: 200000 },
      { label: "つみたて", monthly: 100000, saving: true },
    ],
  });
  const r = S.simulate(plan).rows;
  near(r[0].income.total, 360, 0.01, "収入 月30万 → 年360万");
  near(r[0].spend.total, 240, 0.01, "出ていくのは生活費だけ");
  near(r[0].spend.saving, 120, 0.01, "つみたては別に数える");
  near(r[0].balance, 120, 0.01, "1年で120万ふえる（使い切っていない）");
}

console.log("いつから・いつまで・退職で止まる");
{
  const plan = base({
    horizonAge: 44,
    me: { birthYear: YEAR - 40, retireAge: 42, severance: 0, pension: 0 },
    income: [
      { label: "給与", monthly: 100000, owner: "me" },
      { label: "手当", monthly: 100000, to: YEAR + 1 },
      { label: "あとから", monthly: 100000, from: YEAR + 3 },
    ],
    spend: [{ label: "通勤費", monthly: 100000, untilRetire: true }],
  });
  // 月10万円 ＝ 年120万円。40・41歳が現役、42歳で退職する並び
  const at = (n) => S.simulate(plan).rows[n];
  near(at(0).income.total, 240, 0.01, "40歳：給与＋手当");
  near(at(1).income.total, 240, 0.01, "41歳：手当はまだ出る（いつまで＝この年）");
  near(at(1).spend.total, 120, 0.01, "41歳：通勤費はまだ出る");
  near(at(2).income.total, 0, 0.01, "42歳：退職で給与が止まり、手当も終わっている");
  near(at(2).spend.total, 0, 0.01, "42歳：通勤費も止まる");
  near(at(3).income.total, 120, 0.01, "43歳：「いつから」で始まる収入だけ");
}

console.log("物価上昇は「対象の項目」にだけかかる");
{
  const plan = base({
    horizonAge: 42, living: { inflation: 10, oldRate: 100 },
    spend: [
      { label: "食費", monthly: 100000 },
      { label: "保険", monthly: 100000, inflate: false },
    ],
  });
  const r = S.simulate(plan).rows;
  near(r[0].spend.total, 240, 0.01, "1年目は 120＋120");
  near(r[1].spend.total, 252, 0.01, "2年目は 132＋120（保険は上がらない）");
}

console.log("退職後は生活費が oldRate に落ちる");
{
  const plan = base({
    horizonAge: 42,
    me: { birthYear: YEAR - 40, retireAge: 41, severance: 0, pension: 0 },
    living: { inflation: 0, oldRate: 50 },
    spend: [{ label: "生活費", monthly: 100000 }],
  });
  const r = S.simulate(plan).rows;
  near(r[0].spend.total, 120, 0.01, "現役のうちは満額");
  near(r[1].spend.total, 60, 0.01, "退職したら半分");
}

console.log("利回りは前年までの資産にかかる");
{
  const plan = base({ horizonAge: 42, income: [{ label: "給与", monthly: 1000000 / 12 }], assets: { now: 1000, yieldRate: 10 } });
  const r = S.simulate(plan).rows;
  near(r[0].balance, 1200, 0.01, "1000×1.1＋100");
  near(r[1].balance, 1420, 0.01, "1200×1.1＋100");
}

console.log("マイナスの資産では増えも減りもしない");
{
  const plan = base({ horizonAge: 42, spend: [{ label: "生活費", monthly: 100000 }], assets: { now: 0, yieldRate: 100 } });
  const r = S.simulate(plan).rows;
  near(r[0].balance, -120, 0.01, "1年目");
  near(r[1].balance, -240, 0.01, "2年目（利息は付かない）");
}

console.log("退職から年金までの谷");
{
  const plan = base({
    horizonAge: 70,
    me: { birthYear: YEAR - 59, retireAge: 60, severance: 1000, pension: 200 },
    income: [{ label: "給与", monthly: 500000, owner: "me" }],
  });
  const rows = S.simulate(plan).rows;
  const at = (age) => rows.find((r) => r.age === age);
  near(at(59).income.total, 600, 0.01, "59歳（現役）");
  near(at(60).income.total, 1000, 0.01, "60歳（退職金だけ）");
  near(at(62).income.total, 0, 0.01, "62歳（無収入）");
  near(at(65).income.total, 200, 0.01, "65歳（年金開始）");
}

console.log("家を買うと頭金が出て、返済と維持費が始まる");
{
  const plan = base({
    horizonAge: 45,
    spend: [{ label: "家賃", monthly: 100000, to: YEAR + 1 }],   // 買う前年まで
    home: { year: YEAR + 2, price: 4000, down: 500, fees: 280, rate: 1.5, years: 35, upkeepRate: 1.2 },
  });
  const rows = S.simulate(plan).rows;
  const at = (y) => rows.find((r) => r.year === y);
  near(at(YEAR + 1).spend.daily, 120, 0.01, "買う前は家賃");
  near(at(YEAR + 2).spend.daily, 0, 0.01, "「いつまで」で家賃が止まる");
  near(at(YEAR + 2).spend.down, 780, 0.01, "頭金＋諸費用");
  near(at(YEAR + 2).spend.loan, 128.6, 0.5, "返済（3500万 1.5% 35年）");
  near(at(YEAR + 2).spend.upkeep, 48, 0.01, "維持費（4000万の1.2%）");
  near(at(YEAR + 3).spend.down, 0, 0.01, "頭金は一度きり");
}

console.log("「あと月いくら」");
{
  // 31年で 1000万しかない。年240万使うと確実に尽きる
  const tight = base({
    horizonAge: 90,
    me: { birthYear: YEAR - 60, retireAge: 60, severance: 0, pension: 0 },
    spend: [{ label: "生活費", monthly: 200000 }],
    assets: { now: 1000, yieldRate: 0 },
  });
  const room = S.monthlyRoom(tight);
  is(room.ok, false, "尽きると判定される");
  // 1000万 ÷ 31年 ÷ 12か月 ≒ 2.69万円/月 しか使えない → 20万 − 2.69万 を削る
  near(room.delta, 200000 - 26881, 500, "減らすべき月額（円）");

  const rich = JSON.parse(JSON.stringify(tight));
  rich.assets.now = 100000;
  const room2 = S.monthlyRoom(rich);
  is(room2.ok, true, "余る場合");
  console.log(`      → 月あと ${Math.round(room2.delta).toLocaleString("ja-JP")}円まで使える${room2.capped ? "（上限）" : ""}`);
}

console.log("封をして、開け直せるか");
{
  const os = require("os");
  const fs = require("fs");
  const pathx = require("path");
  const cp = require("child_process");
  const nodeCrypto = require("crypto");

  const dir = fs.mkdtempSync(pathx.join(os.tmpdir(), "kakei-"));
  const src = pathx.join(dir, "plain.json");
  const box = pathx.join(dir, "sealed.json");
  const body = { v: 1, ためし: "封をして開ける", 金額: 123456 };
  fs.writeFileSync(src, JSON.stringify(body));

  // 本物の preset.enc.json を上書きしないよう、出力先を渡して封をする
  cp.execFileSync("node", [pathx.join(__dirname, "_seal.js"), src, "テストノアイコトバ", box], { stdio: "pipe" });
  const sealed = JSON.parse(fs.readFileSync(box, "utf8"));

  is(sealed.kdf, "PBKDF2-SHA256", "鍵の作り方");
  is(Buffer.from(sealed.iv, "base64").length, 12, "IV は12バイト");
  is(sealed.data.includes("123456"), false, "中身がそのまま見えていない");

  // ブラウザ（Web Crypto）と同じ手順で開く：暗号文のうしろ16バイトが認証タグ
  const open = (pass) => {
    const key = nodeCrypto.pbkdf2Sync(SECRET.canon(pass), Buffer.from(sealed.salt, "base64"), sealed.iter, 32, "sha256");
    const all = Buffer.from(sealed.data, "base64");
    const d = nodeCrypto.createDecipheriv("aes-256-gcm", key, Buffer.from(sealed.iv, "base64"));
    d.setAuthTag(all.subarray(all.length - 16));
    return Buffer.concat([d.update(all.subarray(0, all.length - 16)), d.final()]).toString("utf8");
  };

  is(open("テストノアイコトバ"), JSON.stringify(body), "合い言葉が合えば元どおり");
  is(open("てすとのあいことば"), JSON.stringify(body), "ひらがなでも開く");
  let failed = false;
  try { open("ちがう合い言葉"); } catch (_) { failed = true; }
  is(failed, true, "ちがう合い言葉では開かない");

  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(ng === 0 ? "\n全部合っている" : `\n${ng}件ちがう`);
process.exit(ng === 0 ? 0 : 1);
