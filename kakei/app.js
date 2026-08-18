/**
 * 家計のみらい — 本体
 *
 * 家計簿ではない。**これから**のお金を1本の線にするだけの道具。
 * 「毎日つける」を要求した時点で続かないので、記録は一切とらない。
 * 入れるのは毎月の収支と、いくつかの前提だけ。
 *
 * 画面の作りは4段。
 *   1. 一文の答え（もつ／尽きる、あと月いくら）
 *   2. 毎月の収支（ここが手元の表と合っていないと、この先の線に意味がない）
 *   3. グラフ（なぞるとその年が読める）
 *   4. 年ごとの表（押すと内訳）
 * 計算そのものは sim.js にある。ここは見せ方と保存だけを持つ。
 */

const VERSION = "2026-08-18 カードの引落";
const KEY = "kakei-data";
const SIM = self.KakeiSim;

/* ---------------- 画面の状態 ---------------- */

const state = {
  data: { v: 1, plans: [], activeId: null },
  sim: null,      // いま表示しているプランの計算結果
  others: [],     // 比較で重ねるプランの計算結果
  hover: null,    // グラフをなぞっている年（西暦）
  opened: new Set(),   // 収支で「⌄」を開いている項目
  cardMonth: "",       // カードの引落で表示している月（"2026-08"）
};

const $ = (id) => document.getElementById(id);
const el = {
  chart: $("chart"), rows: $("rows"), readout: $("readout"), legend: $("legend"),
  verdict: $("verdict"), toast: $("toast"),
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------------- この家の人たち ---------------- */

// 合い言葉で開くまでは見本の家。開いた時点で本物に入れ替わる（setPeople）
let PEOPLE = self.KakeiSecret.SAMPLE.people;
let NAME = { me: PEOPLE.me.name, partner: PEOPLE.partner.name, none: "そのほか" };

function setPeople(people) {
  PEOPLE = people || self.KakeiSecret.SAMPLE.people;
  NAME = { me: PEOPLE.me.name, partner: PEOPLE.partner.name, none: "そのほか" };
}

/** 誕生日を迎えたかどうかまで見た、今日ちょうどの年齢 */
function ageToday(birth) {
  const [y, m, d] = birth;
  const now = new Date();
  let age = now.getFullYear() - y;
  const beforeBirthday = now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d);
  return beforeBirthday ? age - 1 : age;
}

const bornText = (p) => `${p.birth[0]}年${p.birth[1]}月${p.birth[2]}日生まれ・いま${ageToday(p.birth)}歳`;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));

let toastTimer = null;
function toast(msg) {
  clearTimeout(toastTimer);
  el.toast.textContent = msg;
  el.toast.hidden = false;
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 2600);
}

/* ---------------- 数字の見せ方 ---------------- */

/** 万円で持っている値を、日本語で読める形にする。1万円未満の端数は切る（見通しに小数は要らない） */
function yen(man) {
  const neg = man < -0.5;
  const v = Math.round(Math.abs(man));
  if (v >= 10000) {
    const oku = Math.floor(v / 10000);
    const rest = v % 10000;
    return `${neg ? "−" : ""}${oku}億${rest ? `${rest.toLocaleString("ja-JP")}万` : ""}円`;
  }
  return `${neg ? "−" : ""}${v.toLocaleString("ja-JP")}万円`;
}

/** 毎月の金額は円のまま出す。手元の表と1円まで突き合わせられるように */
const en = (v) => `${Math.round(v).toLocaleString("ja-JP")}円`;

/** 表の中の素の数字（万円）。単位は表の見出しに1回だけ出す */
const man = (v) => Math.round(v).toLocaleString("ja-JP");
const signed = (v) => (v >= 0 ? `+${man(v)}` : `−${man(-v)}`);

/* ---------------- 保存 ---------------- */

/**
 * 項目の欠けている値をうめる。
 *
 * 保存したデータや preset.js には、その項目に関係のない欄が書かれていない。
 * そのまま入力欄に流すと value="undefined" になってブラウザに叱られるので、
 * 画面に出す前に必ずここを通す。sim.js 側にも同じ既定があるが、あちらは計算用で、
 * 保存されるデータそのものは直さない（画面が触るのはこちらの形）。
 */
const hydrateItem = (it) => Object.assign({
  id: uid(), label: "", group: "", monthly: 0,
  from: null, to: null, untilRetire: false, inflate: true,
  owner: "", raise: 0, saving: false,
}, it);

function hydrate(plan) {
  plan.income = (plan.income || []).map(hydrateItem);
  plan.spend = (plan.spend || []).map(hydrateItem);

  // 子どもとイベントにも id が要る。画面はこの id で「どれを直すか」を見分けている
  plan.children = (plan.children || []).map((c) => {
    const child = Object.assign({ id: uid(), name: "", path: "public", uni: "national", auto: false }, c);
    if (Array.isArray(child.birth)) child.birthYear = child.birth[0];   // 生年月日があるほうを正とする
    return child;
  });
  plan.events = (plan.events || []).map((e) => Object.assign({ id: uid(), kind: "spend", label: "", repeat: 1 }, e));

  // カードと、その引落の記録。cardLog は { "2026-08": { カードのid: 円 } }
  plan.cards = (plan.cards || []).map((c) => Object.assign({ id: uid(), label: "" }, c));
  plan.cardLog = plan.cardLog && typeof plan.cardLog === "object" ? plan.cardLog : {};
  return plan;
}

/**
 * 新しいプラン。seed（`{ income, spend }`）を渡すとその収支表で作り、
 * 渡さなければ**からっぽ**で作る。
 *
 * 以前ここで見本の収支表を既定にしていたが、鍵の付いた本物の家計を開いている人に
 * 見本の数字が混ざるのは筋が悪い。新しく作るなら、何も入っていないところから。
 */
function newPlan(name, seed) {
  const P = seed || { income: [], spend: [] };
  return hydrate({
    id: uid(),
    name: name || "わが家",
    startYear: new Date().getFullYear(),
    horizonAge: 95,
    people: { me: PEOPLE.me.short, partner: PEOPLE.partner.short },
    me: { birthYear: PEOPLE.me.birth[0], retireAge: 65, severance: 0, pension: 170 },
    partner: { on: true, birthYear: PEOPLE.partner.birth[0], retireAge: 65, severance: 0, pension: 120 },
    living: { inflation: 1.5, oldRate: 80 },
    assets: { now: 0, yieldRate: 1 },
    income: (P.income || []).map((it) => Object.assign({ id: uid() }, it)),
    spend: (P.spend || []).map((it) => Object.assign({ id: uid() }, it)),
    accounts: [],
    childAllowance: false,
    children: [],
    home: null,
    events: [],
    compare: false,
  });
}

/**
 * 起点を今年に合わせ、2人の生年を固定値から入れ直す。
 *
 * 年齢そのものは持たない。持つと年をまたぐたびにずれて、入れ直しが要る。
 * 生年だけ持っていれば、年齢はいつ開いても正しく出る。
 * 古い保存データには `age` が入っているが、もう見ないので捨てる。
 */
function syncPeople(plan) {
  const now = new Date().getFullYear();
  const moved = plan.startYear !== now;
  plan.startYear = now;
  plan.me = plan.me || {};
  plan.partner = plan.partner || {};
  plan.me.birthYear = PEOPLE.me.birth[0];
  plan.partner.birthYear = PEOPLE.partner.birth[0];
  plan.partner.on = true;
  plan.people = { me: PEOPLE.me.short, partner: PEOPLE.partner.short };   // 表に出す呼び名
  delete plan.me.age;
  delete plan.partner.age;
  return moved;
}

/** すでにこの端末で開いたことがあるか（あれば合い言葉は聞かない） */
function readSaved() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    return raw && Array.isArray(raw.plans) && raw.plans.length ? raw : null;
  } catch (_) {
    return null;   // 壊れていたら無かったことにする
  }
}

/** データ一式を受け取って、画面をそれで作り直す。合い言葉で開いたときもここに来る */
function adopt(data, stamp) {
  if (stamp) data.stamp = stamp;   // どの版の封から取り出したか
  setPeople(data.people);
  for (const p of data.plans) { hydrate(p); syncPeople(p); }
  if (!data.plans.some((p) => p.id === data.activeId)) data.activeId = data.plans[0].id;
  state.data = data;
  refresh();
}

/** 合い言葉なしで使うときの、だれのものでもない家計 */
function sampleData() {
  const S = self.KakeiSecret.SAMPLE;
  const plan = newPlan("見本の家計", S);
  return { v: 1, people: S.people, pets: [], plans: [plan], activeId: plan.id };
}

function saveData() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state.data));
  } catch (_) {
    toast("保存できませんでした（ブラウザの設定を確認してください）");
  }
}

const active = () => state.data.plans.find((p) => p.id === state.data.activeId) || state.data.plans[0];

/* ---------------- 計算しなおして描き直す ---------------- */

function refresh() {
  const plan = active();
  state.sim = SIM.simulate(plan);
  state.others = state.data.plans
    .filter((p) => p.id !== plan.id && p.compare)
    .map((p) => ({ plan: p, sim: SIM.simulate(p) }));

  renderVerdict();
  renderMonthly();
  renderAssetsCard();
  renderCardsCard();
  renderTiles();
  drawChart();
  renderLegend();
  renderTable();
  saveData();
}

/* ---------------- 一文の答え ---------------- */

function renderVerdict() {
  const { summary } = state.sim;
  const plan = active();
  const room = SIM.monthlyRoom(plan);
  let html;

  if (summary.broke) {
    const b = summary.broke;
    html = `いまのままだと、<b class="bad">${b.year}年（${b.age}歳）に貯蓄が尽きます</b>。`;
    html += room.impossible
      ? `<span class="sub">毎月の支出をゼロにしても届きません。収入か、まとまった支出の側を見直す必要があります。</span>`
      : `<span class="sub">毎月の支出を <b>${en(room.delta)}</b> 減らせば（いまの ${Math.round(room.delta / monthlySpend() * 100)}%）、${plan.horizonAge}歳まで届きます。</span>`;
  } else {
    html = `${plan.horizonAge}歳まで<b>足ります</b>。最後に <b>${yen(summary.last.balance)}</b> 残る計算です。`;
    html += room.capped
      ? `<span class="sub">余裕はかなりあります（毎月100万円増やしても届きます）。</span>`
      : `<span class="sub">毎月の支出は <b>${en(room.delta)}</b> まで増やせます。そこを超えると途中で尽きます。</span>`;
  }

  // いちばん低くなる年は、尽きなくても知っておく価値がある（そこが踏ん張りどころ）
  if (!summary.broke && summary.low && summary.low.year !== summary.first.year) {
    html += `<span class="sub">いちばん薄くなるのは ${summary.low.year}年（${summary.low.age}歳）の ${yen(summary.low.balance)}。</span>`;
  }
  el.verdict.innerHTML = html;
}

const monthlySpend = () => Math.max(1, SIM.monthlyNow(active()).spend);

function renderMonthly() {
  const m = SIM.monthlyNow(active());
  $("mIn").textContent = en(m.income);
  $("mOut").textContent = en(m.spend);
  $("mSave").textContent = en(m.saving);
  $("mCash").textContent = en(m.cash);
  $("mCash").className = m.cash < 0 ? "bad" : "";
  $("mNote").textContent = m.keep >= 0
    ? `毎月 ${en(m.keep)} ずつ資産がふえます（現金＋貯める）`
    : `毎月 ${en(-m.keep)} ずつ資産が減っています`;
}

/** いまの貯蓄。主画面から1タップで直しに行けるように、ここにも出す */
function renderAssetsCard() {
  const plan = active();
  const list = plan.accounts || [];
  const total = list.reduce((s, a) => s + (Number(a.yen) || 0), 0);

  $("aTotal").textContent = list.length ? en(total) : yen(plan.assets.now || 0);
  const newest = list.map((a) => a.asOf).filter(Boolean).sort().pop();
  $("aNote").textContent = list.length
    ? `${list.length}つの口座の合計${newest ? `・${asOfText(newest)}` : ""}（押すと直せます）`
    : "まだ入っていません（押すと入れられます）";
}

function renderTiles() {
  const { summary, rows } = state.sim;
  const plan = active();
  const m = SIM.monthlyNow(plan);

  $("tile1l").textContent = "毎月ふえる額";
  $("tile1v").textContent = en(m.keep);
  $("tile1v").className = "tv" + (m.keep < 0 ? " bad" : "");

  const retire = rows.find((r) => r.age === plan.me.retireAge);
  $("tile2l").textContent = retire ? `${PEOPLE.me.short}の退職時` : "いちばん多いとき";
  const t2 = retire ? retire.balance : summary.peak.balance;
  $("tile2v").textContent = yen(t2);
  $("tile2v").className = "tv" + (t2 < 0 ? " bad" : "");

  if (summary.broke) {
    // 年と歳を1行に並べると、狭い端末で数字が切れる。歳は見出しのほうへ逃がす
    $("tile3l").textContent = `尽きる年（${summary.broke.age}歳）`;
    $("tile3v").textContent = `${summary.broke.year}年`;
    $("tile3v").className = "tv bad";
  } else {
    $("tile3l").textContent = `${plan.horizonAge}歳のとき`;
    $("tile3v").textContent = yen(summary.last.balance);
    $("tile3v").className = "tv good";
  }
}

/* ---------------- グラフ ---------------- */

const COLORS = ["#f0c463", "#79b8f0", "#e58fd0", "#a0d468"];   // 比較で重ねる線の色
const PAD = { l: 44, r: 10, t: 12, b: 22 };

/** 目盛りの刻み。5本くらいに収まるところを選ぶ（多いと線より目盛りがうるさい） */
function niceStep(range) {
  const steps = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000];
  for (const s of steps) if (range / s <= 5) return s;
  return 500000;
}

const axisLabel = (v) => (Math.abs(v) >= 10000 ? `${(v / 10000).toFixed(Math.abs(v) % 10000 ? 1 : 0)}億` : man(v));

function drawChart() {
  const cv = el.chart;
  const ctx = cv.getContext("2d");
  const dpr = Math.min(3, self.devicePixelRatio || 1);
  const w = cv.clientWidth || 320;
  const h = 240;
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const main = state.sim.rows;
  const all = [main, ...state.others.map((o) => o.sim.rows)];

  const y0 = Math.min(...all.map((rs) => rs[0].year));
  const y1 = Math.max(...all.map((rs) => rs[rs.length - 1].year));
  let lo = Math.min(0, ...all.flatMap((rs) => rs.map((r) => r.balance)));
  const hi0 = Math.max(0, ...all.flatMap((rs) => rs.map((r) => r.balance)));
  let hi = hi0;

  // 尽きたあとの落ち込みは、放っておくと桁が違う（5億のマイナスなど）。
  // そこに縦軸を合わせると、肝心の「いつゼロを割るか」が上端の平らな線になって読めない。
  // 底は上の高さの半分までにして、それより下は切る。深さは知りたい数字ではない
  const floor = -Math.max(hi0 * 0.5, 200);
  if (lo < floor) lo = floor;

  const span = Math.max(100, hi - lo);
  hi += span * 0.08;
  lo -= span * 0.08;

  const X = (year) => PAD.l + ((year - y0) / Math.max(1, y1 - y0)) * (w - PAD.l - PAD.r);
  const Y = (v) => PAD.t + (1 - (v - lo) / (hi - lo)) * (h - PAD.t - PAD.b);

  // 目盛りと横線
  const step = niceStep(hi - lo);
  ctx.font = "10px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
    const y = Y(v);
    ctx.strokeStyle = v === 0 ? "rgba(240,116,138,0.45)" : "rgba(219,255,246,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD.l, y);
    ctx.lineTo(w - PAD.r, y);
    ctx.stroke();
    ctx.fillStyle = v === 0 ? "rgba(240,116,138,0.8)" : "rgba(139,168,162,0.75)";
    ctx.fillText(axisLabel(v), PAD.l - 6, y);
  }

  // 2人の退職の年に薄い縦線。線が折れる理由がその場で分かる。
  // 同じ年なら1本にまとめる（重ねて引くと、ただ濃い線になって読めない）
  const plan = active();
  const retires = [
    { year: plan.me.birthYear + plan.me.retireAge, label: PEOPLE.me.short },
    { year: plan.partner.birthYear + plan.partner.retireAge, label: PEOPLE.partner.short },
  ];
  const marks = retires[0].year === retires[1].year
    ? [{ year: retires[0].year, label: "2人とも退職" }]
    : retires;

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  let lastLabelX = -999;
  for (const mk of marks.slice().sort((a, b) => a.year - b.year)) {
    if (!(mk.year > y0 && mk.year < y1)) continue;
    const x = X(mk.year);
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = "rgba(219,255,246,0.22)";
    ctx.beginPath();
    ctx.moveTo(x, PAD.t);
    ctx.lineTo(x, h - PAD.b);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "rgba(139,168,162,0.8)";
    // 退職の年が近いと札が重なって読めなくなる。近いときは下の段に逃がす
    const stacked = x - lastLabelX < 52;
    ctx.fillText(`${mk.label}退職`, x, PAD.t + (stacked ? 13 : 0));
    lastLabelX = x;
  }

  // 横軸は年齢で刻む。西暦より「何歳のとき」の方が体でわかる
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(139,168,162,0.75)";
  const ageStep = main.length > 45 ? 15 : 10;
  const firstAge = main[0].age;
  // 最初の年齢は必ず出したいが、次の目盛りとくっつくと重なって読めない。
  // 間が半目盛り未満のときは、最初のほうを譲る
  const showFirst = (ageStep - (firstAge % ageStep)) % ageStep >= ageStep / 2;
  for (const r of main) {
    const onStep = r.age % ageStep === 0;
    if (!onStep && !(r === main[0] && showFirst)) continue;
    ctx.fillText(`${r.age}歳`, X(r.year), h - PAD.b + 6);
  }

  // ここから下は、はみ出したら切る（下限で切った線が目盛りの上に描かれないように）
  ctx.save();
  ctx.beginPath();
  ctx.rect(PAD.l, PAD.t, w - PAD.l - PAD.r, h - PAD.t - PAD.b);
  ctx.clip();

  // 比べる線（細く、控えめに）
  state.others.forEach((o, i) => {
    ctx.strokeStyle = COLORS[i % COLORS.length];
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    o.sim.rows.forEach((r, k) => (k ? ctx.lineTo(X(r.year), Y(r.balance)) : ctx.moveTo(X(r.year), Y(r.balance))));
    ctx.stroke();
    ctx.globalAlpha = 1;
  });

  // 本命の線と、その下の塗り。ゼロを割ったところは赤にする
  const zeroY = Math.min(h - PAD.b, Math.max(PAD.t, Y(0)));
  const up = ctx.createLinearGradient(0, PAD.t, 0, zeroY);
  up.addColorStop(0, "rgba(79,214,169,0.34)");
  up.addColorStop(1, "rgba(79,214,169,0.02)");

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(X(main[0].year), zeroY);
  for (const r of main) ctx.lineTo(X(r.year), Y(r.balance));
  ctx.lineTo(X(main[main.length - 1].year), zeroY);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = up;
  ctx.fillRect(0, PAD.t, w, Math.max(0, zeroY - PAD.t));
  ctx.fillStyle = "rgba(240,116,138,0.28)";
  ctx.fillRect(0, zeroY, w, Math.max(0, h - PAD.b - zeroY));
  ctx.restore();

  ctx.strokeStyle = "#4fd6a9";
  ctx.lineWidth = 2.4;
  ctx.lineJoin = "round";
  ctx.beginPath();
  main.forEach((r, k) => (k ? ctx.lineTo(X(r.year), Y(r.balance)) : ctx.moveTo(X(r.year), Y(r.balance))));
  ctx.stroke();

  // 尽きる年に印。ここだけは見落とさせない
  const broke = state.sim.summary.broke;
  if (broke) {
    ctx.fillStyle = "#f0748a";
    ctx.beginPath();
    ctx.arc(X(broke.year), Y(broke.balance), 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // なぞっている年
  const hv = state.hover != null ? main.find((r) => r.year === state.hover) : null;
  if (hv) {
    ctx.strokeStyle = "rgba(219,255,246,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(X(hv.year), PAD.t);
    ctx.lineTo(X(hv.year), h - PAD.b);
    ctx.stroke();
    ctx.fillStyle = "#e6f2ee";
    ctx.beginPath();
    ctx.arc(X(hv.year), Y(hv.balance), 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  renderReadout(hv);
}

function renderReadout(row) {
  if (!row) {
    const s = state.sim.summary;
    el.readout.innerHTML = `いちばん多いとき <b>${yen(s.peak.balance)}</b>（${s.peak.year}年・${s.peak.age}歳）`;
    return;
  }
  el.readout.innerHTML =
    `${row.year}年 ${row.age}歳　残高 <b class="${row.balance < 0 ? "bad" : ""}">${yen(row.balance)}</b>　`
    + `収支 <b class="${row.net < 0 ? "bad" : ""}">${signed(row.net)}万円</b>`;
}

function renderLegend() {
  if (!state.others.length) { el.legend.innerHTML = ""; return; }
  const parts = [`<span><i style="background:#4fd6a9"></i>${esc(active().name)}</span>`];
  state.others.forEach((o, i) => {
    parts.push(`<span><i style="background:${COLORS[i % COLORS.length]}"></i>${esc(o.plan.name)}　${yen(o.sim.summary.last.balance)}</span>`);
  });
  el.legend.innerHTML = parts.join("");
}

/** グラフの上の座標から年を割り出す。指はふといので、いちばん近い年に吸い付かせる */
function yearAt(clientX) {
  const rect = el.chart.getBoundingClientRect();
  const rows = state.sim.rows;
  const inner = rect.width - PAD.l - PAD.r;
  const ratio = (clientX - rect.left - PAD.l) / Math.max(1, inner);
  const i = Math.round(ratio * (rows.length - 1));
  return rows[Math.min(rows.length - 1, Math.max(0, i))].year;
}

/* ---------------- 年ごとの表 ---------------- */

function renderTable() {
  el.rows.innerHTML = state.sim.rows.map((r) => {
    const notes = r.notes.length
      ? `<span class="notes">${r.notes.map((n) => `<em>${esc(n)}</em>`).join("")}</span>`
      : "";
    return `<button type="button" class="row${notes ? " marked" : ""}" data-year="${r.year}">
      <span class="y">${r.year}<i>${r.age}歳${r.partnerAge != null ? ` / ${r.partnerAge}歳` : ""}</i></span>
      <span class="n">${man(r.income.total)}</span>
      <span class="n">${man(r.spend.total)}</span>
      <span class="n bal${r.balance < 0 ? " bad" : ""}">${man(r.balance)}</span>
      ${notes}
    </button>`;
  }).join("");
}

function highlightRow(year) {
  for (const b of el.rows.children) b.classList.toggle("is-on", Number(b.dataset.year) === year);
}

/* ---------------- 1年の内訳 ---------------- */

function openYear(year) {
  const r = state.sim.rows.find((x) => x.year === year);
  if (!r) return;
  const plan = active();
  const b = SIM.breakdown(plan, year);   // 項目ごとの明細は、開いたその年のぶんだけ作る

  const line = (k, v, cls) => (v ? `<div class="${cls || ""}"><span>${esc(k)}</span><span>${signed(v)}</span></div>` : "");
  // 明細の1行。月いくらだったかも添える（手元の表と突き合わせるのは月額のほうなので）
  const item = (label, amount, sign) => `<div class="sub"><span>${esc(label || "（名前なし）")}</span>
    <span>${sign}${man(Math.abs(amount))}<i>${en((Math.abs(amount) * 10000) / 12)}/月</i></span></div>`;

  $("yearTitle").textContent = `${r.year}年（${PEOPLE.me.short}${r.age}歳 / ${PEOPLE.partner.short}${r.partnerAge}歳）`;
  $("yearBody").innerHTML = `
    ${r.notes.length ? `<p class="note"><b>${r.notes.map(esc).join("・")}</b></p>` : ""}

    <h2 class="sec">入ってくるお金</h2>
    <div class="kv">
      ${b.income.map((x) => item(`${x.label}${x.owner ? `（${NAME[x.owner]}）` : ""}`, x.amount, "+")).join("")}
      ${line("年金", r.income.pension)}
      ${line("退職金", r.income.severance)}
      ${line("児童手当", r.income.allowance)}
      ${line("そのほかの収入", r.income.other)}
      <div class="total"><span>合計</span><span>${signed(r.income.total)}</span></div>
    </div>

    <h2 class="sec">出ていくお金</h2>
    <div class="kv">
      ${b.groups.map((g) => `
        <div class="gsum"><span>${esc(g.name)}</span><span>−${man(g.total)}</span></div>
        ${g.items.map((x) => item(x.label, x.amount, "−")).join("")}
      `).join("")}
      ${line("住宅ローン", -r.spend.loan)}
      ${line("住まいの維持費", -r.spend.upkeep)}
      ${line("頭金・諸費用", -r.spend.down)}
      ${line("教育費", -r.spend.edu)}
      ${line("そのほかの支出", -r.spend.other)}
      <div class="total"><span>合計</span><span>${signed(-r.spend.total)}</span></div>
    </div>

    ${b.savings.length ? `
      <h2 class="sec">貯めるお金（資産に残る）</h2>
      <div class="kv">
        ${b.savings.map((x) => item(x.label, x.amount, "")).join("")}
        <div class="total"><span>合計</span><span>${man(b.savingTotal)}</span></div>
      </div>` : ""}

    <h2 class="sec">この年の収支</h2>
    <div class="kv">
      <div class="total${r.net < 0 ? " bad" : ""}"><span>年間の収支</span><span>${signed(r.net)}</span></div>
      <div class="total${r.balance < 0 ? " bad" : ""}"><span>年末の残高</span><span>${r.balance < 0 ? `−${man(-r.balance)}` : man(r.balance)}</span></div>
    </div>

    <p class="note dim">単位は万円（右の小さい字は、その年の月あたり）。1万円未満は四捨五入しているので、
      小計を足すと合計と1万円ほどずれることがあります。残高には運用の利回り（年 ${plan.assets.yieldRate}%）が入っています。
      ${b.savingTotal ? `貯めるお金 ${man(b.savingTotal)}万円 は資産に残るので、「出ていくお金」には数えていません。` : ""}
      ${r.retired ? `退職後なので、毎月の支出を ${plan.living.oldRate}% で見ています。` : ""}
      ${plan.living.inflation ? `物価上昇（年 ${plan.living.inflation}%）を見込む項目は、その年の額に増えています。` : ""}</p>
  `;
  openSheet("year");
}

/* ---------------- 配信された家計のほうが新しいとき ---------------- */

const SKIP_KEY = "kakei-skip-stamp";

/**
 * いちど開いた端末は、封を二度と読みに行かない作りになっている（合い言葉を
 * 毎回聞かないため）。その結果、こちらで中身を入れ替えても端末に届かない。
 *
 * そこで封には日付の印だけ平文で付けてあり、起動のたびに**印だけ**を見に行く。
 * 新しければ知らせる。読み込むかどうかは、この端末で直したものが
 * 置き換わるということなので、必ず本人に選んでもらう。
 */
async function checkForNewSeal() {
  const { stamp } = await self.KakeiSecret.peek();
  if (!stamp) return;
  const mine = state.data.stamp || "";
  if (stamp === mine) return;
  if (localStorage.getItem(SKIP_KEY) === stamp) return;   // 「あとで」と言われたぶんは黙る

  const when = stamp.slice(0, 10).replace(/-/g, "/");
  $("updateText").textContent = mine
    ? `新しい家計が届いています（${when}）`
    : `配信されている家計があります（${when}）`;
  $("update").hidden = false;
  $("update").dataset.stamp = stamp;
}

/* ---------------- 合い言葉 ---------------- */

function showLock() {
  $("lock").hidden = false;
  $("lockMsg").hidden = true;
  $("pass").value = "";
  document.body.style.overflow = "hidden";
  setTimeout(() => $("pass").focus(), 60);
}

function hideLock() {
  $("lock").hidden = true;
  document.body.style.overflow = "";
}

async function tryUnlock() {
  const msg = $("lockMsg");
  const btn = $("unlock");
  msg.hidden = false;
  msg.className = "lockmsg";
  msg.textContent = "ひらいています…";   // 鍵を作るのに1秒近くかかる端末がある
  btn.disabled = true;

  let opened = null;
  let failure = "";
  try {
    opened = await self.KakeiSecret.unlock($("pass").value);
  } catch (e) {
    failure = e.message;
  }
  btn.disabled = false;

  if (failure) {
    msg.className = "lockmsg ng";
    msg.textContent = failure;
    return;
  }
  if (!opened) {
    msg.className = "lockmsg ng";
    msg.textContent = "合い言葉がちがうようです。";
    $("pass").select();
    return;
  }

  hideLock();
  $("update").hidden = true;
  adopt(opened.data, opened.stamp);
  toast("ひらきました。次からは合い言葉なしで開きます");
}

/* ---------------- シートの開け閉め ---------------- */

function openSheet(id) {
  $(id).hidden = false;
  document.body.style.overflow = "hidden";
}

function closeSheet(id) {
  $(id).hidden = true;
  if (![...document.querySelectorAll(".sheet")].some((s) => !s.hidden)) document.body.style.overflow = "";
}

/* ---------------- 毎月の収支 ---------------- */

/** 項目1つ。ふだんは名前と金額だけ。細かい条件は「⌄」を押したときに出す */
function itemRow(it, kind) {
  const open = state.opened.has(it.id);
  const badges = [];
  if (it.saving) badges.push("貯める");
  if (it.untilRetire) badges.push("退職で止まる");
  if (it.from) badges.push(`${it.from}年から`);
  if (it.to) badges.push(`${it.to}年まで`);
  if (it.owner) badges.push(NAME[it.owner]);
  if (it.raise) badges.push(`昇給 ${it.raise}%`);
  if (kind === "spend" && !it.inflate && !it.saving) badges.push("物価に連動しない");

  // 金額は桁区切りで見せる。7桁の数字を区切りなしで読み違えると、
  // 家計の表と突き合わせるという、このアプリでいちばん大事な作業が壊れる。
  // type="number" では区切りを出せないので text にして、入るのは数字だけにしてある
  return `<div class="item${it.saving ? " saving" : ""}" data-item="${it.id}">
    <input class="ilabel" type="text" data-k="label" value="${esc(it.label)}" placeholder="項目の名前" />
    <span class="iamt"><input type="text" data-k="monthly" inputmode="numeric" value="${Math.round(it.monthly).toLocaleString("ja-JP")}" /><i>円</i></span>
    <button type="button" class="more" data-more="${it.id}" aria-expanded="${open}" aria-label="くわしく">${open ? "⌃" : "⌄"}</button>
    ${badges.length ? `<span class="badges">${badges.map((b) => `<em>${esc(b)}</em>`).join("")}</span>` : ""}
    <div class="detail" ${open ? "" : "hidden"}>
      <div class="grid2">
        <label class="field"><span class="label">いつから（空欄＝いま）</span><span class="unit"><input type="number" data-k="from" inputmode="numeric" step="1" value="${it.from || ""}" /><i>年</i></span></label>
        <label class="field"><span class="label">いつまで（空欄＝ずっと）</span><span class="unit"><input type="number" data-k="to" inputmode="numeric" step="1" value="${it.to || ""}" /><i>年</i></span></label>
        ${kind === "income" ? `
        <label class="field"><span class="label">だれの収入か</span>
          <select data-k="owner">
            <option value=""${it.owner === "" ? " selected" : ""}>どちらの分でもない（続く）</option>
            <option value="me"${it.owner === "me" ? " selected" : ""}>${esc(PEOPLE.me.name)}（退職で止まる）</option>
            <option value="partner"${it.owner === "partner" ? " selected" : ""}>${esc(PEOPLE.partner.name)}（退職で止まる）</option>
          </select>
        </label>
        <label class="field"><span class="label">昇給率</span><span class="unit"><input type="number" data-k="raise" inputmode="decimal" step="0.5" value="${it.raise}" /><i>%/年</i></span></label>
        ` : `
        <label class="field"><span class="label">グループ</span><input type="text" data-k="group" list="groupNames" value="${esc(it.group)}" placeholder="くらし など" /></label>
        `}
      </div>
      <div class="checks">
        ${kind === "spend" ? `<label class="switch"><input type="checkbox" data-k="saving" ${it.saving ? "checked" : ""} /><span>貯める（資産に残る）</span></label>` : ""}
        <label class="switch"><input type="checkbox" data-k="untilRetire" ${it.untilRetire ? "checked" : ""} /><span>退職したら止まる</span></label>
        ${kind === "spend" ? `<label class="switch"><input type="checkbox" data-k="inflate" ${it.inflate !== false ? "checked" : ""} /><span>物価とともに増える</span></label>` : ""}
      </div>
      <button type="button" class="btn danger" data-del-item="${it.id}">この項目を消す</button>
    </div>
  </div>`;
}

function renderBudget() {
  const plan = active();
  const m = SIM.monthlyNow(plan);

  $("sumIn").innerHTML = `<span>入ってくる</span><b>${en(m.income)}</b>`;
  $("sumOut").innerHTML = `<span>出ていく</span><b>${en(m.spend)}</b>`
    + `<span class="side">＋ 貯める ${en(m.saving)}</span>`;

  $("incomeList").innerHTML = plan.income.map((it) => itemRow(it, "income")).join("")
    || `<p class="note dim">収入の項目がありません。</p>`;

  // 支出はグループごとにまとめて、小計を出す。項目が30もあると、合計だけでは動かせない
  const groups = [];
  for (const it of plan.spend) {
    const key = it.group || "その他";
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push((g = { key, items: [] }));
    g.items.push(it);
  }
  $("spendList").innerHTML = groups.map((g) => {
    const sub = g.items.reduce((s, it) => s + it.monthly, 0);
    return `<div class="group">
      <div class="ghead"><span>${esc(g.key)}</span><b>${en(sub)}</b></div>
      ${g.items.map((it) => itemRow(it, "spend")).join("")}
    </div>`;
  }).join("") || `<p class="note dim">支出の項目がありません。</p>`;

  $("groupNames").innerHTML = groups.map((g) => `<option value="${esc(g.key)}"></option>`).join("");
}

/** 収支シートの中で値を書き換える。名前を打っている最中に組み直すと入力が飛ぶので、合計だけ直す */
function updateItem(kind, id, key, value) {
  const list = active()[kind];
  const it = list.find((x) => x.id === id);
  if (!it) return;
  if (key === "label" || key === "group" || key === "owner") it[key] = value;
  else if (key === "saving" || key === "untilRetire" || key === "inflate") it[key] = value;
  else if (key === "from" || key === "to") it[key] = String(value).trim() === "" ? null : Number(value);
  else if (key === "monthly") it.monthly = Number(String(value).replace(/[^\d.-]/g, "")) || 0;   // 桁区切りを外す
  else it[key] = Number(value) || 0;
  refresh();
  const m = SIM.monthlyNow(active());
  $("sumIn").innerHTML = `<span>入ってくる</span><b>${en(m.income)}</b>`;
  $("sumOut").innerHTML = `<span>出ていく</span><b>${en(m.spend)}</b><span class="side">＋ 貯める ${en(m.saving)}</span>`;
}

/* ---------------- 前提のフォーム ---------------- */

const FIELDS = {
  mRetire: "me.retireAge", mSev: "me.severance", mPension: "me.pension",
  pRetire: "partner.retireAge", pSev: "partner.severance", pPension: "partner.pension",
  inflation: "living.inflation", oldRate: "living.oldRate",
  yieldRate: "assets.yieldRate", horizonAge: "horizonAge",
};

const dig = (obj, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);

function place(obj, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  const target = keys.reduce((o, k) => (o[k] = o[k] || {}), obj);
  target[last] = value;
}

function fillForm() {
  const plan = active();
  for (const [id, path] of Object.entries(FIELDS)) $(id).value = dig(plan, path);
  $("childAllowance").checked = plan.childAllowance === true;

  // 名前と生年月日は決まっているので、入力欄ではなく見出しとして出す
  $("meName").textContent = `あなた（${PEOPLE.me.name}）`;
  $("meBorn").textContent = bornText(PEOPLE.me);
  $("pName").textContent = `配偶者（${PEOPLE.partner.name}）`;
  $("pBorn").textContent = bornText(PEOPLE.partner);
  $("horizonLabel").textContent = `${PEOPLE.me.short}が何歳まで`;

  // 子どもとペット。お金の話ではないが、「その年に何歳か」がすぐ引けると考えやすい
  const family = [
    ...plan.children.map((c) => ({ name: c.name || "子ども", birth: c.birth, tail: c.auto ? "教育費を自動計上" : "" })),
    ...(state.data.pets || []).map((p) => ({ name: p.name, birth: p.birth, tail: p.kind || "" })),
  ].filter((f) => f.birth);
  $("familyList").innerHTML = family.length
    ? family.map((f) => `<div><span>${esc(f.name)}${f.tail ? `（${esc(f.tail)}）` : ""}</span><span>${bornText({ birth: f.birth })}</span></div>`).join("")
    : `<div><span>登録なし</span><span>ライフイベントから足せます</span></div>`;
}

function readForm() {
  const plan = active();
  for (const [id, path] of Object.entries(FIELDS)) {
    const v = Number($(id).value);
    if (Number.isFinite(v) && $(id).value !== "") place(plan, path, v);
  }
  refresh();
}

/* ---------------- お金の置き場（口座） ---------------- */

const todayISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/** その残高がいつのものか。古くなったら、そう言う */
function asOfText(asOf) {
  if (!asOf) return "時点を入れてください";
  const d = new Date(`${asOf}T00:00:00`);
  if (isNaN(d)) return "";
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  const when = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} 時点`;
  if (days <= 0) return `${when}（今日）`;
  if (days < 31) return `${when}（${days}日前）`;
  const months = Math.floor(days / 30.4);
  return `${when}（${months}か月前・そろそろ入れ直しどき）`;
}

function renderAccounts() {
  const plan = active();
  const list = plan.accounts || [];
  const total = list.reduce((s, a) => s + (Number(a.yen) || 0), 0);

  $("accountList").innerHTML = list.map((a) => `<div class="item account" data-account="${a.id}">
    <input class="ilabel" type="text" data-k="label" value="${esc(a.label)}" placeholder="口座・サービスの名前" />
    <span class="iamt"><input type="text" data-k="yen" inputmode="numeric" value="${Math.round(a.yen).toLocaleString("ja-JP")}" /><i>円</i></span>
    <button type="button" class="del" data-del-account="${a.id}" aria-label="消す">🗑</button>
    <span class="asof">
      <input type="date" data-k="asOf" value="${esc(a.asOf || "")}" />
      <em>${esc(asOfText(a.asOf))}${a.yen ? `・${yen(a.yen / 10000)}` : ""}</em>
    </span>
  </div>`).join("") || `<p class="note dim">まだ1つも入れていません。「＋ 口座を足す」から。</p>`;

  $("sumAssets").innerHTML = `<span>合計（スタート地点）</span><b>${en(total)}</b>`
    + `<span class="side">${yen(total / 10000)}</span>`;
}

/* ---------------- カードの引落 ---------------- */

const CARD_START = "2026-08";   // ここより前の月は入れられない（記録の始まり）

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const monthLabel = (m) => `${m.slice(0, 4)}年${Number(m.slice(5, 7))}月`;

/** "2026-08" を n か月ずらす */
function monthAdd(m, n) {
  const y = Number(m.slice(0, 4));
  const mo = Number(m.slice(5, 7)) - 1 + n;
  const d = new Date(y, mo, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** 入れられる最後の月。引落は先の分まで分かることがあるので、翌月まで開けておく */
const monthMax = () => monthAdd(thisMonth(), 1);

const cardTotal = (plan, m) => Object.values((plan.cardLog || {})[m] || {}).reduce((s, v) => s + (Number(v) || 0), 0);

/** 記録のある月を新しい順に */
const loggedMonths = (plan) => Object.keys(plan.cardLog || {})
  .filter((m) => cardTotal(plan, m) > 0)
  .sort()
  .reverse();

function renderCards() {
  const plan = active();
  const m = state.cardMonth;
  const log = (plan.cardLog || {})[m] || {};

  $("monthLabel").textContent = monthLabel(m);
  $("prevMonth").disabled = m <= CARD_START;
  $("nextMonth").disabled = m >= monthMax();

  $("cardList").innerHTML = (plan.cards || []).map((c) => {
    const v = Number(log[c.id]) || 0;
    return `<div class="item pay" data-card="${c.id}">
      <input class="ilabel" type="text" data-k="label" value="${esc(c.label)}" placeholder="カードの名前" />
      <span class="iamt"><input type="text" data-k="yen" inputmode="numeric" value="${v ? v.toLocaleString("ja-JP") : ""}" placeholder="0" /><i>円</i></span>
      <button type="button" class="del" data-del-card="${c.id}" aria-label="消す">🗑</button>
    </div>`;
  }).join("") || `<p class="note dim">カードがありません。「＋ カードを足す」から。</p>`;

  const total = cardTotal(plan, m);
  $("sumCards").innerHTML = `<span>${monthLabel(m)}の合計</span><b>${en(total)}</b>`;

  // 収支表と突き合わせる。カードは支払いの通り道なので、足し算はしない
  const spend = SIM.monthlyNow(plan).spend;
  const prev = cardTotal(plan, monthAdd(m, -1));
  const diff = prev && total ? total - prev : null;
  $("cardCompare").textContent = total
    ? `収支表の「出ていく」は ${en(spend)}／月。カードの引落はその内側にあります。`
      + (diff !== null ? `　前の月とくらべて ${diff >= 0 ? "＋" : "−"}${en(Math.abs(diff))}。` : "")
    : "まだ入っていません。カードごとに引落額を入れてください。";

  const months = loggedMonths(plan);
  $("cardHistory").innerHTML = months.length
    ? months.map((mm) => `<div data-month="${mm}" style="cursor:pointer"><span>${monthLabel(mm)}${mm === m ? "（表示中）" : ""}</span><span>${en(cardTotal(plan, mm))}</span></div>`).join("")
    : `<div><span>まだ記録がありません</span><span>—</span></div>`;
}

/** 主画面のカード。最後に入れた月の合計を出す */
function renderCardsCard() {
  const plan = active();
  const months = loggedMonths(plan);
  const has = (plan.cards || []).length > 0;
  $("cardsCard").hidden = !has;
  if (!has) return;

  if (!months.length) {
    $("cLabel").textContent = "カードの引落";
    $("cTotal").textContent = "未入力";
    $("cNote").textContent = `${monthLabel(CARD_START)}分から入れられます（押すと入力）`;
    return;
  }
  const m = months[0];
  $("cLabel").textContent = `カードの引落（${monthLabel(m)}）`;
  $("cTotal").textContent = en(cardTotal(plan, m));
  const n = (plan.cards || []).filter((c) => Number(((plan.cardLog || {})[m] || {})[c.id]) > 0).length;
  $("cNote").textContent = `${n}枚ぶん・${plan.cards.length}枚中（押すと入力）`;
}

/* ---------------- ライフイベント ---------------- */

/** その子に、これから出ていく教育費の合計。判断の材料になるのは年額より総額 */
function lifetimeEdu(child) {
  const now = new Date().getFullYear();
  let sum = 0;
  for (let age = Math.max(0, now - child.birthYear); age <= 21; age++) sum += SIM.eduCost(child, age);
  return sum;
}

function renderChildren() {
  const plan = active();
  const now = new Date().getFullYear();

  $("childList").innerHTML = plan.children.map((c, i) => {
    const age = now - c.birthYear;
    return `<div class="card" data-child="${c.id}">
      <div class="card-head">
        <span class="grow"><input class="name" type="text" data-k="name" value="${esc(c.name)}" placeholder="子ども${i + 1}" /></span>
        <button type="button" class="del" data-del-child="${c.id}" aria-label="消す">🗑</button>
      </div>
      ${c.birth
        ? `<p class="sub">${bornText(c)}</p>`
        : `<label class="field"><span class="label">生まれた年（これからなら予定の年）</span>
             <span class="unit"><input type="number" data-k="birthYear" inputmode="numeric" step="1" value="${c.birthYear}" /><i>年</i></span>
           </label>`}
      <label class="switch"><input type="checkbox" data-k="auto" ${c.auto ? "checked" : ""} /><span>教育費を自動で入れる</span></label>
      <div class="field"><span class="label">小・中・高</span>
        <div class="chips">${Object.entries(SIM.PATH_LABEL).map(([k, v]) =>
          `<button type="button" class="chip${c.path === k ? " is-on" : ""}" data-k="path" data-v="${k}">${v}</button>`).join("")}</div>
      </div>
      <div class="field"><span class="label">大学</span>
        <div class="chips">${Object.entries(SIM.UNI_LABEL).map(([k, v]) =>
          `<button type="button" class="chip${c.uni === k ? " is-on" : ""}" data-k="uni" data-v="${k}">${v}</button>`).join("")}</div>
      </div>
      <p class="sub">${c.auto
        ? `これからかかる教育費は <b>${yen(lifetimeEdu(c))}</b>（この進路のとき）`
        : `教育費は入れていません。入れると <b>${yen(lifetimeEdu(c))}</b> 増えます`}
        ${c.birth ? "" : `・${age < 0 ? `${-age}年後に誕生` : `いま${age}歳`}`}</p>
      ${c.auto ? "" : `<p class="sub">月々の項目ですでに払っているぶんと<b>二重にならないよう</b>、既定では入れていません。</p>`}
    </div>`;
  }).join("");
}

function renderHome() {
  const h = active().home;
  $("addHome").hidden = !!h;
  if (!h) { $("homeBox").innerHTML = ""; return; }

  const loan = SIM.loanPerYear(Math.max(0, h.price - h.down), h.rate, h.years);
  $("homeBox").innerHTML = `<div class="card" data-home="1">
    <div class="card-head"><span class="grow">住まいを買う</span>
      <button type="button" class="del" data-del-home="1" aria-label="消す">🗑</button>
    </div>
    <div class="grid2">
      <label class="field"><span class="label">買う年</span><span class="unit"><input type="number" data-k="year" inputmode="numeric" step="1" value="${h.year}" /><i>年</i></span></label>
      <label class="field"><span class="label">物件価格</span><span class="unit"><input type="number" data-k="price" inputmode="decimal" step="100" value="${h.price}" /><i>万円</i></span></label>
      <label class="field"><span class="label">頭金</span><span class="unit"><input type="number" data-k="down" inputmode="decimal" step="50" value="${h.down}" /><i>万円</i></span></label>
      <label class="field"><span class="label">諸費用</span><span class="unit"><input type="number" data-k="fees" inputmode="decimal" step="10" value="${h.fees}" /><i>万円</i></span></label>
      <label class="field"><span class="label">ローン金利</span><span class="unit"><input type="number" data-k="rate" inputmode="decimal" step="0.1" value="${h.rate}" /><i>%</i></span></label>
      <label class="field"><span class="label">返済年数</span><span class="unit"><input type="number" data-k="years" inputmode="numeric" step="1" value="${h.years}" /><i>年</i></span></label>
      <label class="field"><span class="label">維持費（価格に対して）</span><span class="unit"><input type="number" data-k="upkeepRate" inputmode="decimal" step="0.1" value="${h.upkeepRate}" /><i>%/年</i></span></label>
    </div>
    <p class="sub">借入 <b>${yen(Math.max(0, h.price - h.down))}</b>／返済 <b>月${(loan / 12).toFixed(1)}万円</b>（年${Math.round(loan)}万円）
      ・維持費 <b>年${Math.round((h.price * h.upkeepRate) / 100)}万円</b>。
      維持費は固定資産税・管理費・修繕積立金・火災保険のぶんで、マンションなら 1.2〜1.5%、戸建てなら 1.0% ほどが目安です。</p>
  </div>`;
}

function renderEvents() {
  $("eventList").innerHTML = active().events.map((e) => `<div class="card" data-event="${e.id}">
    <div class="card-head">
      <span class="grow"><input class="name" type="text" data-k="label" value="${esc(e.label)}" placeholder="${e.kind === "income" ? "臨時の収入" : "車の買い替え など"}" /></span>
      <button type="button" class="del" data-del-event="${e.id}" aria-label="消す">🗑</button>
    </div>
    <div class="grid2">
      <label class="field"><span class="label">年</span><span class="unit"><input type="number" data-k="year" inputmode="numeric" step="1" value="${e.year}" /><i>年</i></span></label>
      <label class="field"><span class="label">${e.kind === "income" ? "入ってくる額" : "出ていく額"}（年）</span><span class="unit"><input type="number" data-k="amount" inputmode="decimal" step="10" value="${e.amount}" /><i>万円</i></span></label>
      <label class="field"><span class="label">続く年数</span><span class="unit"><input type="number" data-k="repeat" inputmode="numeric" step="1" min="1" value="${e.repeat}" /><i>年</i></span></label>
    </div>
    <p class="sub">${e.kind === "income" ? "＋" : "−"}${man(e.amount)}万円 × ${e.repeat}年（${e.year}年〜${e.year + e.repeat - 1}年）</p>
  </div>`).join("");
}

function renderEventSheet() {
  renderChildren();
  renderHome();
  renderEvents();
}

/* ---------------- プラン ---------------- */

function renderPlans() {
  $("planList").innerHTML = state.data.plans.map((p) => {
    const s = SIM.simulate(p).summary;
    const line = s.broke ? `${s.broke.year}年（${s.broke.age}歳）に尽きる` : `${p.horizonAge}歳で ${yen(s.last.balance)}`;
    return `<div class="card plan${p.id === state.data.activeId ? " is-on" : ""}" data-plan="${p.id}">
      <input type="radio" name="plan" ${p.id === state.data.activeId ? "checked" : ""} data-pick="${p.id}" aria-label="${esc(p.name)}に切り替える" />
      <span class="grow"><input class="name" type="text" data-rename="${p.id}" value="${esc(p.name)}" /></span>
      <button type="button" class="del" data-del-plan="${p.id}" aria-label="消す">🗑</button>
      <span class="foot">
        <label class="switch"><input type="checkbox" data-cmp="${p.id}" ${p.compare ? "checked" : ""} ${p.id === state.data.activeId ? "disabled" : ""} /><span>グラフに重ねる</span></label>
        <button type="button" class="mini" data-dup="${p.id}">複製</button>
      </span>
      <p class="sub" style="flex:1 1 100%">${line}</p>
    </div>`;
  }).join("");
}

/* ---------------- 設定 ---------------- */

function renderSettings() {
  const n = state.data.plans.length;
  const bytes = new Blob([JSON.stringify(state.data)]).size;
  $("usage").textContent = `プラン ${n}件・${bytes.toLocaleString("ja-JP")}バイト。この端末のブラウザに保存しています。`;
  $("version").textContent = `版：${VERSION}`;

  const E = SIM.EDU;
  const rows = [
    ["0〜2歳（保育園）", `${E.hoiku}万円/年`],
    ["3〜5歳", `公立 ${E.you.public} ／ 私立 ${E.you.private} 万円/年`],
    ["小学校", `公立 ${E.sho.public} ／ 私立 ${E.sho.private} 万円/年`],
    ["中学校", `公立 ${E.chu.public} ／ 私立 ${E.chu.private} 万円/年`],
    ["高校", `公立 ${E.kou.public} ／ 私立 ${E.kou.private} 万円/年`],
    ["大学", `国公立 ${E.dai.national} ／ 私立文系 ${E.dai.arts} ／ 私立理系 ${E.dai.sci} 万円/年`],
    ["大学の入学金", `国公立 ${E.daiEnter.national} ／ 私立 ${E.daiEnter.arts} 万円`],
  ];
  $("eduTable").innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><span>${v}</span></div>`).join("");
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importData(file) {
  try {
    const obj = JSON.parse(await file.text());
    const plans = Array.isArray(obj.plans) ? obj.plans : Array.isArray(obj) ? obj : null;
    if (!plans || !plans.length) { toast("プランが入っていないファイルです"); return; }
    for (const p of plans) {
      p.id = uid();                     // 同じ id が来ても既存を上書きしない
      p.compare = false;
      hydrate(p);
      syncPeople(p);
      state.data.plans.push(p);
    }
    toast(`${plans.length}件を足しました`);
    renderPlans();
    refresh();
  } catch (_) {
    toast("読み込めませんでした");
  }
}

/* ---------------- 配線 ---------------- */

function bind() {
  for (const b of document.querySelectorAll("[data-close]")) {
    b.addEventListener("click", () => closeSheet(b.dataset.close));
  }

  /* --- 合い言葉 --- */

  $("lockForm").addEventListener("submit", (e) => { e.preventDefault(); tryUnlock(); });

  $("startBlank").addEventListener("click", () => {
    hideLock();
    adopt(sampleData());
    toast("見本の家計です。設定から合い言葉で読み込めます");
  });

  $("updateNow").addEventListener("click", () => {
    if (!confirm("配信されている家計を読み込みます。\nこの端末で直したものは置き換わります。")) return;
    $("update").hidden = true;
    showLock();
  });

  $("updateLater").addEventListener("click", () => {
    localStorage.setItem(SKIP_KEY, $("update").dataset.stamp || "");
    $("update").hidden = true;
  });

  $("relock").addEventListener("click", () => {
    if (!confirm("合い言葉を入れて読み込み直します。いまこの端末で編集した内容は消えます。")) return;
    closeSheet("settings");
    showLock();
  });

  const openBudget = () => { renderBudget(); openSheet("budget"); };
  $("budgetBtn").addEventListener("click", openBudget);
  $("monthly").addEventListener("click", openBudget);
  const openAssume = (scrollTo) => {
    fillForm();
    renderAccounts();
    openSheet("assume");
    // 「口座はどこ？」と探させない。貯蓄カードから来たときは、その場所まで運ぶ
    if (scrollTo) setTimeout(() => $(scrollTo).scrollIntoView({ block: "center" }), 60);
  };
  $("assumeBtn").addEventListener("click", () => openAssume());
  $("assetsCard").addEventListener("click", () => openAssume("accountList"));

  /* --- カードの引落 --- */

  const openCards = () => {
    // 記録のある最新の月から開く。無ければ今月（始まりより前には行かない）
    if (!state.cardMonth) {
      const months = loggedMonths(active());
      const now = thisMonth();
      state.cardMonth = months[0] || (now < CARD_START ? CARD_START : now);
    }
    renderCards();
    openSheet("cards");
  };
  $("cardsBtn").addEventListener("click", openCards);
  $("cardsCard").addEventListener("click", openCards);

  $("prevMonth").addEventListener("click", () => {
    if (state.cardMonth <= CARD_START) return;
    state.cardMonth = monthAdd(state.cardMonth, -1);
    renderCards();
  });

  $("nextMonth").addEventListener("click", () => {
    if (state.cardMonth >= monthMax()) return;
    state.cardMonth = monthAdd(state.cardMonth, 1);
    renderCards();
  });

  $("addCard").addEventListener("click", () => {
    const plan = active();
    plan.cards = plan.cards || [];
    plan.cards.push({ id: uid(), label: "" });
    renderCards();
    saveData();
  });

  $("cardList").addEventListener("input", (e) => {
    const row = e.target.closest("[data-card]");
    const k = e.target.dataset.k;
    if (!row || !k) return;
    const plan = active();
    const card = plan.cards.find((c) => c.id === row.dataset.card);
    if (!card) return;

    if (k === "label") {
      card.label = e.target.value;
    } else {
      const yen = Number(String(e.target.value).replace(/[^\d.-]/g, "")) || 0;
      plan.cardLog = plan.cardLog || {};
      plan.cardLog[state.cardMonth] = plan.cardLog[state.cardMonth] || {};
      if (yen) plan.cardLog[state.cardMonth][card.id] = yen;
      else delete plan.cardLog[state.cardMonth][card.id];
    }
    saveData();
    // 名前や桁区切りを打っている最中に組み直すと入力が飛ぶ。合計だけ先に直す
    const total = cardTotal(plan, state.cardMonth);
    $("sumCards").innerHTML = `<span>${monthLabel(state.cardMonth)}の合計</span><b>${en(total)}</b>`;
    renderCardsCard();
  });

  // 指を離してから組み直す（桁区切りと履歴がここで整う）
  $("cardList").addEventListener("change", (e) => { if (e.target.dataset.k) renderCards(); });

  $("cardList").addEventListener("click", (e) => {
    const del = e.target.closest("[data-del-card]");
    if (!del) return;
    const plan = active();
    const card = plan.cards.find((c) => c.id === del.dataset.delCard);
    if (!confirm(`「${card && card.label ? card.label : "このカード"}」を消します。\nこれまでに入れた引落の記録も消えます。`)) return;
    plan.cards = plan.cards.filter((c) => c.id !== del.dataset.delCard);
    for (const m of Object.keys(plan.cardLog || {})) delete plan.cardLog[m][del.dataset.delCard];
    renderCards();
    renderCardsCard();
    saveData();
  });

  $("cardHistory").addEventListener("click", (e) => {
    const row = e.target.closest("[data-month]");
    if (!row) return;
    state.cardMonth = row.dataset.month;
    renderCards();
  });

  /* --- お金の置き場（口座） --- */

  $("addAccount").addEventListener("click", () => {
    const plan = active();
    plan.accounts = plan.accounts || [];
    plan.accounts.push({ id: uid(), label: "", yen: 0, asOf: todayISO() });
    renderAccounts();
    refresh();
  });

  $("accountList").addEventListener("input", (e) => {
    const card = e.target.closest("[data-account]");
    const k = e.target.dataset.k;
    if (!card || !k) return;
    const a = active().accounts.find((x) => x.id === card.dataset.account);
    if (!a) return;
    if (k === "yen") a.yen = Number(String(e.target.value).replace(/[^\d.-]/g, "")) || 0;
    else a[k] = e.target.value;
    refresh();
    // 名前を打っている最中に組み直すと入力が飛ぶ。合計だけ先に直す
    const total = active().accounts.reduce((s, x) => s + (Number(x.yen) || 0), 0);
    $("sumAssets").innerHTML = `<span>合計（スタート地点）</span><b>${en(total)}</b><span class="side">${yen(total / 10000)}</span>`;
  });

  $("accountList").addEventListener("change", (e) => {
    if (e.target.dataset.k && e.target.dataset.k !== "label") renderAccounts();
  });

  $("accountList").addEventListener("click", (e) => {
    const del = e.target.closest("[data-del-account]");
    if (!del) return;
    const a = active().accounts.find((x) => x.id === del.dataset.delAccount);
    if (!confirm(`「${a && a.label ? a.label : "この口座"}」を消します。`)) return;
    active().accounts = active().accounts.filter((x) => x.id !== del.dataset.delAccount);
    renderAccounts();
    refresh();
  });
  $("eventsBtn").addEventListener("click", () => { renderEventSheet(); openSheet("events"); });
  $("plansBtn").addEventListener("click", () => { renderPlans(); openSheet("plans"); });
  $("settingsBtn").addEventListener("click", () => { renderSettings(); openSheet("settings"); });

  /* --- 毎月の収支 --- */

  for (const [listId, kind] of [["incomeList", "income"], ["spendList", "spend"]]) {
    const box = $(listId);

    box.addEventListener("input", (e) => {
      const item = e.target.closest("[data-item]");
      const k = e.target.dataset.k;
      if (!item || !k) return;
      // グループを打っている最中に組み直すと入力が飛ぶ。並べ替えは指を離してから
      if (k === "group") return;
      updateItem(kind, item.dataset.item, k, e.target.type === "checkbox" ? e.target.checked : e.target.value);
    });

    box.addEventListener("change", (e) => {
      const item = e.target.closest("[data-item]");
      const k = e.target.dataset.k;
      if (!item || !k) return;
      updateItem(kind, item.dataset.item, k, e.target.type === "checkbox" ? e.target.checked : e.target.value);
      // 指を離してから組み直す。並び・印・桁区切りがここで整う（名前だけは組み直す理由がない）
      if (k !== "label") renderBudget();
    });

    box.addEventListener("click", (e) => {
      const more = e.target.closest("[data-more]");
      const del = e.target.closest("[data-del-item]");
      if (more) {
        const id = more.dataset.more;
        if (state.opened.has(id)) state.opened.delete(id); else state.opened.add(id);
        renderBudget();
      } else if (del) {
        const list = active()[kind];
        const it = list.find((x) => x.id === del.dataset.delItem);
        if (!confirm(`「${it && it.label ? it.label : "この項目"}」を消します。`)) return;
        active()[kind] = list.filter((x) => x.id !== del.dataset.delItem);
        renderBudget();
        refresh();
      }
    });
  }

  $("addIncomeItem").addEventListener("click", () => {
    const it = { id: uid(), label: "", monthly: 0, owner: "", raise: 0, inflate: true };
    active().income.push(it);
    state.opened.add(it.id);
    renderBudget();
    refresh();
  });

  $("addSpendItem").addEventListener("click", () => {
    const it = { id: uid(), label: "", group: "", monthly: 0, inflate: true };
    active().spend.push(it);
    state.opened.add(it.id);
    renderBudget();
    refresh();
  });

  /* --- 前提 --- */

  for (const id of Object.keys(FIELDS)) $(id).addEventListener("input", readForm);

  $("childAllowance").addEventListener("change", () => {
    active().childAllowance = $("childAllowance").checked;
    refresh();
  });

  /* --- 子ども --- */

  $("addChild").addEventListener("click", () => {
    active().children.push({ id: uid(), name: "", birthYear: new Date().getFullYear(), path: "public", uni: "national" });
    renderChildren();
    refresh();
  });

  $("childList").addEventListener("input", (e) => {
    const card = e.target.closest("[data-child]");
    if (!card || !e.target.dataset.k) return;
    const c = active().children.find((x) => x.id === card.dataset.child);
    const k = e.target.dataset.k;
    if (k === "auto") { c.auto = e.target.checked; renderChildren(); refresh(); return; }
    c[k] = k === "name" ? e.target.value : Number(e.target.value);
    refresh();
    if (k !== "name") renderChildren();   // 名前を打っている最中に描き直すと入力が飛ぶ
  });

  $("childList").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    const del = e.target.closest("[data-del-child]");
    if (chip) {
      const c = active().children.find((x) => x.id === chip.closest("[data-child]").dataset.child);
      c[chip.dataset.k] = chip.dataset.v;
      renderChildren();
      refresh();
    } else if (del) {
      active().children = active().children.filter((x) => x.id !== del.dataset.delChild);
      renderChildren();
      refresh();
    }
  });

  /* --- 住まい --- */

  $("addHome").addEventListener("click", () => {
    const plan = active();
    plan.home = { year: plan.startYear + 3, price: 4000, down: 500, fees: 280, rate: 1.5, years: 35, upkeepRate: 1.2 };
    renderHome();
    refresh();
  });

  $("homeBox").addEventListener("input", (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    active().home[k] = Number(e.target.value);
    refresh();
  });

  $("homeBox").addEventListener("change", () => renderHome());

  $("homeBox").addEventListener("click", (e) => {
    if (!e.target.closest("[data-del-home]")) return;
    active().home = null;
    renderHome();
    refresh();
  });

  /* --- そのほかのイベント --- */

  const addEvent = (kind) => {
    active().events.push({ id: uid(), kind, label: "", year: new Date().getFullYear() + 1, amount: kind === "income" ? 100 : 200, repeat: 1 });
    renderEvents();
    refresh();
  };
  $("addSpend").addEventListener("click", () => addEvent("spend"));
  $("addIncome").addEventListener("click", () => addEvent("income"));

  $("eventList").addEventListener("input", (e) => {
    const card = e.target.closest("[data-event]");
    if (!card || !e.target.dataset.k) return;
    const ev = active().events.find((x) => x.id === card.dataset.event);
    const k = e.target.dataset.k;
    ev[k] = k === "label" ? e.target.value : Number(e.target.value);
    if (k === "repeat") ev.repeat = Math.max(1, ev.repeat);
    refresh();
    const sub = card.querySelector(".sub");
    if (sub) sub.textContent = `${ev.kind === "income" ? "＋" : "−"}${man(ev.amount)}万円 × ${ev.repeat}年（${ev.year}年〜${ev.year + ev.repeat - 1}年）`;
  });

  $("eventList").addEventListener("click", (e) => {
    const del = e.target.closest("[data-del-event]");
    if (!del) return;
    active().events = active().events.filter((x) => x.id !== del.dataset.delEvent);
    renderEvents();
    refresh();
  });

  /* --- プラン --- */

  $("addPlan").addEventListener("click", () => {
    const p = newPlan(`プラン${state.data.plans.length + 1}`);
    state.data.plans.push(p);
    state.data.activeId = p.id;
    renderPlans();
    refresh();
    toast("新しいプランに切り替えました");
  });

  $("planList").addEventListener("click", (e) => {
    const pick = e.target.closest("[data-pick]");
    const dup = e.target.closest("[data-dup]");
    const del = e.target.closest("[data-del-plan]");

    if (pick) {
      state.data.activeId = pick.dataset.pick;
      active().compare = false;   // 表示中のものを重ねる意味はない
      renderPlans();
      refresh();
    } else if (dup) {
      const src = state.data.plans.find((x) => x.id === dup.dataset.dup);
      const copy = JSON.parse(JSON.stringify(src));
      copy.id = uid();
      copy.name = `${src.name}のコピー`;
      copy.compare = false;
      src.compare = true;                 // 元を重ねておく。比べるために複製するのだから
      state.data.plans.push(copy);
      state.data.activeId = copy.id;
      renderPlans();
      refresh();
      toast("複製しました。前提を変えると2本並びます");
    } else if (del) {
      if (state.data.plans.length === 1) { toast("最後の1つは消せません"); return; }
      if (!confirm("このプランを消します。取り消せません。")) return;
      state.data.plans = state.data.plans.filter((x) => x.id !== del.dataset.delPlan);
      if (!state.data.plans.some((x) => x.id === state.data.activeId)) state.data.activeId = state.data.plans[0].id;
      renderPlans();
      refresh();
    }
  });

  $("planList").addEventListener("input", (e) => {
    const rename = e.target.dataset.rename;
    const cmp = e.target.dataset.cmp;
    if (rename) {
      state.data.plans.find((x) => x.id === rename).name = e.target.value;
      refresh();
    } else if (cmp) {
      state.data.plans.find((x) => x.id === cmp).compare = e.target.checked;
      refresh();
    }
  });

  /* --- 設定 --- */

  $("exportBtn").addEventListener("click", () => {
    download(`kakei-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state.data, null, 2));
    toast("書き出しました");
  });

  $("importBtn").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", async () => {
    const f = $("importFile").files[0];
    $("importFile").value = "";
    if (f) await importData(f);
  });

  $("wipe").addEventListener("click", () => {
    if (!confirm("この端末に保存した家計を全部消します。取り消せません。\n（合い言葉を入れれば、また読み込めます）")) return;
    try { localStorage.removeItem(KEY); } catch (_) { /* 消せなくても先へ */ }
    closeSheet("settings");
    showLock();
  });

  /* --- グラフと表 --- */

  const track = (e) => {
    const year = yearAt(e.clientX);
    if (year === state.hover) return;
    state.hover = year;
    drawChart();
    highlightRow(year);
  };

  el.chart.addEventListener("pointerdown", (e) => { el.chart.setPointerCapture(e.pointerId); track(e); });
  el.chart.addEventListener("pointermove", (e) => { if (e.buttons || e.pointerType === "touch") track(e); });
  el.chart.addEventListener("pointerleave", () => {
    if (state.hover == null) return;
    state.hover = null;
    drawChart();
    highlightRow(-1);
  });

  el.rows.addEventListener("click", (e) => {
    const row = e.target.closest(".row");
    if (row) openYear(Number(row.dataset.year));
  });

  addEventListener("resize", () => drawChart());

  addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const open = [...document.querySelectorAll(".sheet")].filter((s) => !s.hidden).pop();
    if (open) closeSheet(open.id);
  });
}

/* ---------------- 起動 ---------------- */

/**
 * 1つ上の階層に住んでいた別アプリ（ブロック崩し）の Service Worker が、
 * この階層まで担当してしまっている端末がある。自前のが主導権を取ったら1回だけ読み直す。
 * 詳しくは meshi/README.md と、リポジトリ直下の sw.js に書いてある。
 */
function healForeignController() {
  const home = new URL("./", location.href).href;
  const c = navigator.serviceWorker.controller;
  if (!c || c.scriptURL.startsWith(home)) return;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    const now = navigator.serviceWorker.controller;
    if (!now || !now.scriptURL.startsWith(home)) return;
    if (sessionStorage.getItem("kakei-sw-heal")) return;
    sessionStorage.setItem("kakei-sw-heal", "1");
    location.reload();
  });
}

/**
 * 新しい版が入ったら、その場で読み直す。
 *
 * キャッシュを先に返す作りなので、直したものが届くのは「次に開いたとき」になる。
 * 直したのに変わらない、という一番たちの悪い状態が生まれるので、
 * 新しい Service Worker が主導権を取った時点で1回だけ読み直す。
 * 起動時から担当がいた場合だけ（＝入れ替わったときだけ）動かす。
 */
function watchForUpdate() {
  if (!navigator.serviceWorker.controller) return;   // 初回の登録は対象外
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}

(function start() {
  bind();

  // いちど開いた端末には家計が残っている。そのときは合い言葉を聞かない。
  // 残っていなければ、暗号文を開くまでこの端末には何も無い
  const saved = readSaved();
  if (saved) {
    adopt(saved);
    checkForNewSeal();   // 封のほうが新しければ知らせる（印だけ見に行く）
  } else {
    showLock();
  }

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    healForeignController();
    watchForUpdate();
    addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
})();
