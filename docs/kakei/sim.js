/**
 * 家計のみらい — 計算の中身
 *
 * ここには画面に触る処理を1行も置かない。前提（plan）を渡すと1年ずつの表が返る、
 * それだけの純粋な関数の集まりにしてある。理由は2つ。
 *   1. 数字が合っているかを node から確かめられる（`node kakei/_test.js`）
 *   2. 「なぜこの数字になるのか」を1か所で読み切れる
 *
 * ■ 単位
 *   毎月の収入・支出の項目は **円**。家計の表がその単位で書かれているから。
 *   貯蓄・退職金・物件価格・教育費など、まとまった額は **万円**。
 *   計算の途中はぜんぶ万円に寄せてある（`toMan`）。
 *
 * ■ 貯蓄は「支出」に数えない
 *   つみたてや共済への積立は、財布から出ていっても**自分の資産に残る**。
 *   支出に混ぜると「毎月ぜんぶ使い切っている」ように見えてしまうので、
 *   `saving: true` の項目は出ていくお金から外し、別に数える。
 */
(function (scope) {
  "use strict";

  /** 円／月 → 万円／年 */
  const toMan = (yenPerMonth) => (yenPerMonth * 12) / 10000;

  /**
   * 教育費（1年あたり・万円）。
   * 小〜高は文部科学省「子供の学習費調査」（学校教育費＋給食費＋学校外活動費）のおおよその額、
   * 大学は授業料と施設費のめやす。仕送りや一人暮らしの生活費は入っていない。
   * 0〜2歳は認可保育園の自己負担のめやす（3〜5歳は無償化ぶんを引いてある）。
   */
  const EDU = {
    hoiku: 30,                                    // 0〜2歳
    you: { public: 17, private: 31 },             // 3〜5歳（幼稚園・保育園）
    sho: { public: 35, private: 167 },            // 6〜11歳
    chu: { public: 54, private: 144 },            // 12〜14歳
    kou: { public: 51, private: 105 },            // 15〜17歳
    dai: { national: 60, arts: 120, sci: 160, none: 0 },     // 18〜21歳
    daiEnter: { national: 28, arts: 25, sci: 25, none: 0 },  // 入学金（18歳の年に1回だけ）
  };

  /** 小中高の進み方。3つに絞ってある（細かく刻んでも、当たる精度にはならない） */
  const PATHS = {
    public: { you: "public", sho: "public", chu: "public", kou: "public" },
    jhs: { you: "public", sho: "public", chu: "private", kou: "private" },
    private: { you: "private", sho: "private", chu: "private", kou: "private" },
  };

  const PATH_LABEL = { public: "ずっと公立", jhs: "中学から私立", private: "ずっと私立" };
  const UNI_LABEL = { national: "国公立", arts: "私立文系", sci: "私立理系", none: "行かない" };

  const PENSION_AGE = 65;   // 年金を受け取り始める年齢。繰上げ・繰下げは扱わない

  const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const yearOrNull = (v) => (Number.isFinite(Number(v)) && Number(v) > 1900 ? Number(v) : null);

  /** 元利均等返済の年あたり返済額（万円）。月々で計算して12倍する */
  function loanPerYear(principal, ratePct, years) {
    if (principal <= 0 || years <= 0) return 0;
    const r = ratePct / 100 / 12;
    const n = years * 12;
    if (r <= 0) return principal / years;
    const pay = (principal * r) / (1 - Math.pow(1 + r, -n));
    return pay * 12;
  }

  /** 子ども1人の、その年の教育費（万円） */
  function eduCost(child, age) {
    if (age < 0) return 0;
    const path = PATHS[child.path] || PATHS.public;
    if (age <= 2) return EDU.hoiku;
    if (age <= 5) return EDU.you[path.you];
    if (age <= 11) return EDU.sho[path.sho];
    if (age <= 14) return EDU.chu[path.chu];
    if (age <= 17) return EDU.kou[path.kou];
    const uni = child.uni || "national";
    if (age > 21) return 0;
    return EDU.dai[uni] + (age === 18 ? EDU.daiEnter[uni] : 0);
  }

  /**
   * 児童手当（万円／年）。2024年10月からの形に合わせてある。
   * 3歳未満は月1.5万、3歳〜高校生年代は月1万、第3子以降は月3万。所得制限はない。
   */
  function allowance(age, order) {
    if (age < 0 || age > 17) return 0;
    if (order >= 3) return 3 * 12;
    return (age <= 2 ? 1.5 : 1) * 12;
  }

  /** その項目がその年に生きているか（いつから・いつまで・退職で止まる） */
  function alive(item, year, retired) {
    if (item.from != null && year < item.from) return false;
    if (item.to != null && year > item.to) return false;
    if (item.untilRetire && retired) return false;
    return true;
  }

  /*
   * 1項目ぶんの金額と生死を出す小さい関数。
   * 年ごとの表を作る simulate と、1年の明細を作る breakdown の両方から呼ぶ。
   * ここを共通にしておかないと、グラフの数字と明細の数字が静かにずれる。
   */

  const incomeLive = (it, year, retired, pRetired) => {
    const ownerRetired = it.owner === "me" ? retired : it.owner === "partner" ? pRetired : false;
    return !(it.owner && ownerRetired) && alive(it, year, retired);
  };

  const incomeYear = (it, t) => toMan(it.monthly) * Math.pow(1 + it.raise / 100, t);

  // 貯めるお金には老後の掛け率をかけない（積立額は暮らしぶりで増減するものではない）
  const spendYear = (it, infl, oldFactor) =>
    toMan(it.monthly) * (it.inflate ? infl : 1) * (it.saving ? 1 : oldFactor);

  /** その年がどんな年か（年齢・退職しているか・物価の倍率）を1か所で出す */
  function yearFacts(p, year) {
    const t = year - p.startYear;
    const age = year - p.me.birthYear;
    const pAge = p.partner.on ? year - p.partner.birthYear : null;
    const retired = age >= p.me.retireAge;
    return {
      t, age, pAge, retired,
      pRetired: p.partner.on ? pAge >= p.partner.retireAge : true,
      infl: Math.pow(1 + p.living.inflation / 100, t),
      oldFactor: retired ? p.living.oldRate / 100 : 1,
    };
  }

  const normItem = (it, i, kind) => ({
    id: it.id || `${kind}${i}`,
    label: it.label || "",
    group: it.group || "",
    monthly: num(it.monthly, 0),
    from: yearOrNull(it.from),
    to: yearOrNull(it.to),
    untilRetire: !!it.untilRetire,
    inflate: it.inflate !== false,
    // 収入だけ：だれの収入か（その人が仕事をやめたら止まる）と昇給率
    owner: it.owner === "me" || it.owner === "partner" ? it.owner : "",
    raise: num(it.raise, 0),
    // 支出だけ：資産に残るお金か
    saving: !!it.saving,
  });

  /** 足りない値を既定でうめる。古い保存データを読んでも落ちないように、ここを必ず通す */
  function normalize(plan) {
    const p = plan || {};
    const me = p.me || {};
    const partner = p.partner || {};
    const living = p.living || {};
    const assets = p.assets || {};
    // 口座を1つでも入れてあれば、その合計がスタート地点。入れていなければ手打ちの額を使う
    const accountYen = (p.accounts || []).reduce((s, a) => s + num(a.yen, 0), 0);
    const startAssets = (p.accounts || []).length ? accountYen / 10000 : num(assets.now, 0);
    return {
      startYear: num(p.startYear, new Date().getFullYear()),
      horizonAge: num(p.horizonAge, 95),
      // 年齢は持たない。生年から出す（年をまたぐたびに入れ直す、という手間をなくすため）。
      // その年に迎える年齢＝ 西暦 − 生年。「65歳で退職」は「65歳になる年に辞める」
      me: {
        birthYear: num(me.birthYear, new Date().getFullYear() - 40),
        retireAge: num(me.retireAge, 65),
        severance: num(me.severance, 0),
        pension: num(me.pension, 170),
      },
      partner: {
        on: p.partner != null && partner.on !== false,
        birthYear: num(partner.birthYear, new Date().getFullYear() - 40),
        retireAge: num(partner.retireAge, 65),
        severance: num(partner.severance, 0),
        pension: num(partner.pension, 120),
      },
      living: { inflation: num(living.inflation, 1.5), oldRate: num(living.oldRate, 80) },
      // いま持っているお金を口座ごとに。単位は円（残高は円で見るものなので）。
      // asOf は「いつ時点の残高か」。古いまま置いておくと、この先の線が丸ごとずれる
      accounts: (p.accounts || []).map((a, i) => ({
        id: a.id || `a${i}`,
        label: a.label || "",
        yen: num(a.yen, 0),
        asOf: typeof a.asOf === "string" ? a.asOf : "",
      })),
      // 表に出す呼び名。画面側（preset.js）が入れる。無ければ役どころで呼ぶ
      people: {
        me: (p.people && p.people.me) || "あなた",
        partner: (p.people && p.people.partner) || "配偶者",
      },
      assets: { now: startAssets, yieldRate: num(assets.yieldRate, 1) },
      income: (p.income || []).map((it, i) => normItem(it, i, "i")),
      spend: (p.spend || []).map((it, i) => normItem(it, i, "s")),
      childAllowance: p.childAllowance === true,
      children: (p.children || []).map((c, i) => ({
        id: c.id || `c${i}`,
        name: c.name || "",
        birth: Array.isArray(c.birth) ? c.birth : null,   // 分かっていれば生年月日（表示用）
        birthYear: num(c.birth && c.birth[0], num(c.birthYear, new Date().getFullYear())),
        path: PATHS[c.path] ? c.path : "public",
        uni: EDU.dai[c.uni] != null ? c.uni : "national",
        // 教育費を自動で足すか。すでに月々の項目で払っているものと二重にしないため、
        // 既定は「足さない」。節目（入学など）の印だけは、足さなくても出す
        auto: c.auto === true,
      })),
      home: p.home
        ? {
            year: num(p.home.year, new Date().getFullYear() + 3),
            price: num(p.home.price, 4000),
            down: num(p.home.down, 500),
            fees: num(p.home.fees, 280),
            rate: num(p.home.rate, 1.5),
            years: num(p.home.years, 35),
            upkeepRate: num(p.home.upkeepRate, 1.2),
          }
        : null,
      events: (p.events || []).map((e, i) => ({
        id: e.id || `e${i}`,
        kind: e.kind === "income" ? "income" : "spend",
        label: e.label || "",
        year: num(e.year, new Date().getFullYear()),
        amount: num(e.amount, 0),
        repeat: Math.max(1, num(e.repeat, 1)),
      })),
    };
  }

  /** いまの月の収支（円）。グラフを見る前に、まずここが合っているかを確かめる */
  function monthlyNow(plan) {
    const p = normalize(plan);
    const income = p.income.reduce((s, it) => s + (alive(it, p.startYear, false) ? it.monthly : 0), 0);
    let spend = 0;
    let saving = 0;
    for (const it of p.spend) {
      if (!alive(it, p.startYear, false)) continue;
      if (it.saving) saving += it.monthly;
      else spend += it.monthly;
    }
    return { income, spend, saving, cash: income - spend - saving, keep: income - spend };
  }

  /**
   * 1年ずつ回して、収入・支出・残高を出す。
   *
   * 年の並びはこの順で考えている。
   *   1. 前の年までの資産に利回りをかける（マイナスのときは増えも減りもしない）
   *   2. その年の収入と支出を足し引きする
   * 資産がマイナスの年に利息を付けないのは、借金の利率まで見立てると
   * 「いくら借りるのか」という別の前提が要るため。マイナスは**警告として見る**ものにしてある。
   */
  function simulate(plan) {
    const p = normalize(plan);
    const rows = [];
    const endYear = p.me.birthYear + p.horizonAge;
    const loan = p.home ? loanPerYear(Math.max(0, p.home.price - p.home.down), p.home.rate, p.home.years) : 0;

    let balance = p.assets.now;

    for (let year = p.startYear; year <= endYear; year++) {
      const { t, age, pAge, retired, pRetired, infl, oldFactor } = yearFacts(p, year);
      const notes = [];

      /* ---- 入ってくるお金（項目） ---- */
      // 「だれの収入か」を決めてあるものは、その人が仕事をやめた時点で止まる。
      // 給与のたぐいは退職年齢を動かすたびに手で直すものではないので、ここで繋げておく
      let work = 0;
      const workBy = { me: 0, partner: 0, none: 0 };   // 内訳で「だれの収入か」を出すため
      for (const it of p.income) {
        if (!incomeLive(it, year, retired, pRetired)) continue;
        const amount = incomeYear(it, t);
        work += amount;
        workBy[it.owner || "none"] += amount;
      }

      // 年金は物価スライドを見込まない（マクロ経済スライドで実質は目減りするため、少なめに置く）
      const pension = (age >= PENSION_AGE ? p.me.pension : 0)
        + (p.partner.on && pAge >= PENSION_AGE ? p.partner.pension : 0);

      let severance = 0;
      if (age === p.me.retireAge && p.me.severance) {
        severance += p.me.severance;
        notes.push(`${p.people.me}の退職金`);
      }
      if (p.partner.on && pAge === p.partner.retireAge && p.partner.severance) {
        severance += p.partner.severance;
        notes.push(`${p.people.partner}の退職金`);
      }

      let allow = 0;
      let edu = 0;
      p.children.forEach((c, i) => {
        const cAge = year - c.birthYear;
        if (cAge < 0) return;
        if (c.auto) {
          edu += eduCost(c, cAge);
          if (p.childAllowance) allow += allowance(cAge, i + 1);
        }
        const nick = c.name || `子ども${i + 1}`;
        if (cAge === 0) notes.push(`${nick} 誕生`);
        if (cAge === 6) notes.push(`${nick} 小学校`);
        if (cAge === 12) notes.push(`${nick} 中学校`);
        if (cAge === 15) notes.push(`${nick} 高校`);
        if (cAge === 18 && c.uni !== "none") notes.push(`${nick} 大学`);
      });

      let otherIn = 0;
      let otherOut = 0;
      for (const e of p.events) {
        if (year < e.year || year >= e.year + e.repeat) continue;
        if (e.kind === "income") otherIn += e.amount;
        else otherOut += e.amount;
        if (e.label) notes.push(e.label);
      }

      /* ---- 出ていくお金（項目） ---- */
      // 退職したら生活費は oldRate ぶんに落ちる。項目ごとの「いつまで」で書けるところは
      // そちらが優先で、ここは書ききれない全体のゆるみを1本のつまみで表している
      let daily = 0;
      let saving = 0;
      for (const it of p.spend) {
        if (!alive(it, year, retired)) continue;
        const yearly = spendYear(it, infl, oldFactor);
        if (it.saving) saving += yearly;         // 資産に残るので出ていくお金には数えない
        else daily += yearly;
      }

      let rent = 0;   // 住まいの項目は月々の表に入っているので、ここでは扱わない
      let loanPay = 0;
      let upkeep = 0;
      let down = 0;
      if (p.home && year >= p.home.year) {
        if (year === p.home.year) {
          down = p.home.down + p.home.fees;   // 頭金と諸費用は買った年に一度だけ出ていく
          notes.push("住まいを買う");
        }
        if (year < p.home.year + p.home.years) loanPay = loan;
        else if (year === p.home.year + p.home.years) notes.push("ローン完済");
        upkeep = ((p.home.price * p.home.upkeepRate) / 100) * infl;
      }

      if (age === p.me.retireAge) notes.push(`${p.people.me}が退職`);
      if (age === PENSION_AGE) notes.push(`${p.people.me}の年金開始`);
      if (p.partner.on && pAge === p.partner.retireAge) notes.push(`${p.people.partner}が退職`);
      if (p.partner.on && pAge === PENSION_AGE) notes.push(`${p.people.partner}の年金開始`);

      const income = work + pension + severance + allow + otherIn;
      const spend = daily + loanPay + upkeep + down + edu + otherOut;
      const net = income - spend;

      if (balance > 0) balance *= 1 + p.assets.yieldRate / 100;
      balance += net;

      rows.push({
        year, t, age, partnerAge: pAge, retired,
        income: { work, workBy, pension, severance, allowance: allow, other: otherIn, total: income },
        spend: { daily, loan: loanPay, upkeep, down, edu, other: otherOut, total: spend, saving },
        net, balance, notes,
      });
    }

    return { plan: p, rows, summary: summarize(rows) };
  }

  function summarize(rows) {
    let low = rows[0] || null;
    let peak = rows[0] || null;
    let broke = null;
    for (const r of rows) {
      if (r.balance < low.balance) low = r;
      if (r.balance > peak.balance) peak = r;
      if (broke === null && r.balance < 0) broke = r;
    }
    return { last: rows[rows.length - 1] || null, first: rows[0] || null, low, peak, broke };
  }

  /**
   * その1年の、項目ごとの明細。
   *
   * simulate は年ごとの合計しか持たない（56年ぶんの明細を毎回作ると、
   * 打つそばから計算し直す作りに耐えない）。明細は開いたその年のぶんだけ、ここで作る。
   * 金額の出し方は simulate と同じ関数を通しているので、合計は必ず一致する。
   */
  function breakdown(plan, year) {
    const p = normalize(plan);
    const { t, age, pAge, retired, pRetired, infl, oldFactor } = yearFacts(p, year);

    const income = p.income
      .filter((it) => incomeLive(it, year, retired, pRetired))
      .map((it) => ({ label: it.label, owner: it.owner, amount: incomeYear(it, t) }));

    const live = p.spend.filter((it) => alive(it, year, retired));
    const toRow = (it) => ({
      group: it.group || "その他",
      label: it.label,
      amount: spendYear(it, infl, oldFactor),
    });

    // 出ていくお金はグループごとにまとめる。項目が30もあると、並べただけでは読めない
    const groups = [];
    for (const it of live) {
      if (it.saving) continue;
      const row = toRow(it);
      let g = groups.find((x) => x.name === row.group);
      if (!g) groups.push((g = { name: row.group, total: 0, items: [] }));
      g.items.push(row);
      g.total += row.amount;
    }

    const savings = live.filter((it) => it.saving).map(toRow);

    return {
      year, age, partnerAge: pAge, retired,
      income,
      groups,
      savings,
      savingTotal: savings.reduce((s, x) => s + x.amount, 0),
    };
  }

  const minBalance = (plan) => simulate(plan).summary.low.balance;

  /**
   * 「あと月いくら」を出す（円／月）。
   *
   * 資産が尽きるなら **月いくら減らせばもつか**、もつなら **月いくらまで増やせるか**。
   * 出したい答えは「で、どうすればいいのか」なので、毎月の支出をひとつのつまみとして
   * 上下させ、二分探索でぎりぎりの額を探す。貯蓄の項目は動かさない（減らしても資産は減らない）。
   */
  function monthlyRoom(plan) {
    const base = normalize(plan);
    const total = base.spend.reduce((s, it) => s + (it.saving ? 0 : it.monthly), 0);

    // 支出全体を一律の倍率で伸び縮みさせる。項目を1つだけ削るより、
    // 「暮らしぶりを何割変えるか」の方が判断につながる
    const withDelta = (deltaYen) => {
      const copy = JSON.parse(JSON.stringify(base));
      const scale = total > 0 ? Math.max(0, (total + deltaYen) / total) : 1;
      for (const it of copy.spend) if (!it.saving) it.monthly *= scale;
      return copy;
    };

    if (minBalance(base) >= 0) {
      const cap = 1000000;   // 月100万円まで見れば足りる
      if (minBalance(withDelta(cap)) >= 0) return { ok: true, delta: cap, capped: true };
      let lo = 0, hi = cap;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (minBalance(withDelta(mid)) >= 0) lo = mid; else hi = mid;
      }
      return { ok: true, delta: lo, capped: false };
    }

    // 尽きる場合：支出をゼロにしても足りないことがある。そのときは正直にそう返す
    if (minBalance(withDelta(-total)) < 0) return { ok: false, delta: null, impossible: true };
    let lo = 0, hi = total;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (minBalance(withDelta(-mid)) >= 0) hi = mid; else lo = mid;
    }
    return { ok: false, delta: hi, impossible: false };
  }

  scope.KakeiSim = {
    EDU, PATHS, PATH_LABEL, UNI_LABEL, PENSION_AGE,
    toMan, alive, normalize, simulate, breakdown, monthlyNow, monthlyRoom,
    loanPerYear, eduCost, allowance, minBalance,
  };
})(typeof self !== "undefined" ? self : globalThis);

// node から読めるようにする（_test.js 用。ブラウザでは module が無いので素通りする）
if (typeof module !== "undefined" && module.exports) {
  module.exports = (typeof self !== "undefined" ? self : globalThis).KakeiSim;
}
