/*
 * のりもの ぶーん。
 * 画面のどこを押しても、扉がひらいてのりものが出てくる。まちがいはない。
 * 通信は一切しない。絵は SVG をその場で組み立て、音は Web Audio で作る。
 *
 * 遊び方は2つ。
 *   ぶーんモード … 扉をひらく。出てきたのりものをさわると、クラクションが鳴る
 *   おとモード   … 9つのボタンをたたくと音が鳴る
 * 会ったのりものは「みつけた」に残る（端末の中だけ。どこにも送らない）。
 */

const VERSION = "2"; // みつけたの下に出す。どの版が動いているかを確かめるため

// ── 出てくるのりもの（どれも自作の絵）───────────────────────────
const CHARAS = [
  { name: "しょうぼうしゃ", body: "#e5484d", roof: "#c2373c", win: "#cfe9ff", kind: "truck",
    ladder: true, light: "#ff5a5a", note: [523, 659, 784],
    cry: "うーうー", sfx: [[700, 1050, 0.42, "square", 0.2], [1050, 700, 0.42, "square", 0.2],
                          [700, 1050, 0.42, "square", 0.2]],
    tuneName: "じぶんの うた（自作）",
    tune: [["C4",1],["E4",1],["G4",1],["E4",1],["C4",1],["G4",1],["C5",2],
      ["A4",1],["G4",1],["E4",1],["G4",1],["A4",1],["G4",1],["E4",2],
      ["G4",1],["G4",1],["E4",1],["E4",1],["D4",1],["D4",1],["C4",2],
      ["C4",1],["E4",1],["G4",1],["C5",1],["G4",1],["E4",1],["C4",2]] },

  { name: "パトカー", body: "#f4f4f6", roof: "#2b2f4a", win: "#cfe9ff", kind: "car",
    light: "#5aa9ff", note: [587, 740, 880],
    cry: "ぴーぽー", sfx: [[880, 660, 0.5, "triangle", 0.2], [660, 880, 0.5, "triangle", 0.2],
                           [880, 660, 0.5, "triangle", 0.2]],
    tuneName: "じぶんの うた（自作）",
    tune: [["E4",1],["G4",1],["A4",1],["G4",1],["E4",1],["D4",1],["C4",2],
      ["D4",1],["E4",1],["G4",1],["E4",1],["D4",1],["C4",1],["D4",2],
      ["G4",1],["A4",1],["G4",1],["E4",1],["D4",1],["E4",1],["C4",2]] },

  { name: "きゅうきゅうしゃ", body: "#fbfbfd", roof: "#e5484d", win: "#cfe9ff", kind: "truck",
    light: "#ff5a5a", note: [494, 622, 740],
    cry: "ぴーぽーぴーぽー", sfx: [[960, 720, 0.4, "sine", 0.2], [720, 960, 0.4, "sine", 0.2],
                                   [960, 720, 0.4, "sine", 0.2], [720, 960, 0.4, "sine", 0.2]],
    tuneName: "じぶんの うた（自作）",
    tune: [["G4",1],["E4",1],["G4",1],["A4",1],["G4",1],["E4",1],["D4",1],["C4",2],
      ["E4",1],["D4",1],["E4",1],["F4",1],["E4",1],["D4",1],["C4",1],["C4",2]] },

  { name: "でんしゃ", body: "#4fae5a", roof: "#3f8f52", win: "#d8f0ff", kind: "train",
    stripe: "#ffe066", note: [440, 554, 659],
    cry: "がたんごとん", sfx: [[180, 120, 0.12, "square", 0.22], [150, 100, 0.12, "square", 0.2],
                              [180, 120, 0.12, "square", 0.22], [150, 100, 0.12, "square", 0.2],
                              [330, 260, 0.5, "sawtooth", 0.14]],
    tuneName: "線路は続くよどこまでも（アメリカ民謡・PD）",
    tune: [["C4",1],["E4",1],["G4",1],["G4",1],["E4",1],["G4",2],
      ["F4",1],["E4",1],["D4",1],["C4",2],["G4",2],
      ["C5",1],["C5",1],["B4",1],["A4",1],["G4",1],["A4",2],
      ["G4",1],["F4",1],["E4",1],["D4",1],["C4",2]] },

  { name: "しんかんせん", body: "#eef2f7", roof: "#3a6ea5", win: "#cfe9ff", kind: "train",
    stripe: "#5aa9ff", fast: true, note: [659, 831, 988],
    cry: "しゅーん", sfx: [[300, 1400, 0.5, "sawtooth", 0.16], [1400, 500, 0.5, "sawtooth", 0.12]],
    tuneName: "じぶんの うた（自作）",
    tune: [["C5",1],["D5",1],["E5",1],["G5",1],["E5",1],["D5",1],["C5",2],
      ["G4",1],["A4",1],["C5",1],["D5",1],["E5",1],["D5",1],["C5",2],
      ["E5",1],["G5",1],["A5",1],["G5",1],["E5",1],["D5",1],["C5",2]] },

  { name: "バス", body: "#ffb347", roof: "#e39227", win: "#d8f0ff", kind: "bus",
    stripe: "#fff", note: [392, 494, 587],
    cry: "ぷっぷー", sfx: [[330, 300, 0.28, "square", 0.22], [300, 270, 0.34, "square", 0.22]],
    tuneName: "バスのうた（伝承・PD）",
    tune: [["C4",1],["F4",1],["F4",1],["F4",1],["F4",1],["A4",1],["C5",2],
      ["A4",1],["F4",1],["G4",1],["A4",1],["G4",1],["F4",2],
      ["C4",1],["F4",1],["F4",1],["F4",1],["F4",1],["A4",1],["C5",2],
      ["A4",1],["G4",1],["F4",2]] },

  { name: "ショベルカー", body: "#ffd166", roof: "#e0b34a", win: "#d8f0ff", kind: "digger",
    note: [349, 440, 523],
    cry: "がががが", sfx: [[110, 90, 0.16, "square", 0.22], [110, 90, 0.16, "square", 0.22],
                          [110, 90, 0.16, "square", 0.22], [130, 80, 0.3, "sawtooth", 0.16]],
    tuneName: "むすんでひらいて（ルソー・PD）",
    tune: [["G4",1],["E4",1],["G4",1],["A4",1],["G4",1],["E4",1],["D4",1],["C4",2],
      ["E4",1],["D4",1],["E4",1],["F4",1],["E4",1],["D4",1],["C4",1],["C4",2]] },

  { name: "ひこうき", body: "#e9f2fb", roof: "#8ec5ff", win: "#cfe9ff", kind: "plane",
    stripe: "#5aa9ff", note: [698, 880, 1046],
    cry: "ごおおお", sfx: [[200, 900, 0.7, "sawtooth", 0.14], [900, 1200, 0.6, "sawtooth", 0.1]],
    tuneName: "じぶんの うた（自作）",
    tune: [["C5",1],["G4",1],["C5",1],["E5",1],["G5",2],["E5",1],["C5",2],
      ["D5",1],["E5",1],["F5",1],["E5",1],["D5",1],["C5",2],
      ["G4",1],["C5",1],["E5",1],["G5",1],["C5",2]] },

  { name: "ロケット", body: "#f4f6fb", roof: "#e5484d", win: "#8ecfff", kind: "rocket",
    encore: 0, note: [523, 784, 1046],
    cry: "しゅぱーん", sfx: [[120, 60, 0.5, "sawtooth", 0.2], [200, 2000, 0.8, "sawtooth", 0.14]],
    tuneName: "きらきら星（フランス民謡・PD）",
    tune: [["C5",1],["C5",1],["G5",1],["G5",1],["A5",1],["A5",1],["G5",2],
      ["F5",1],["F5",1],["E5",1],["E5",1],["D5",1],["D5",1],["C5",2],
      ["G5",1],["G5",1],["F5",1],["F5",1],["E5",1],["E5",1],["D5",2],
      ["G5",1],["G5",1],["F5",1],["F5",1],["E5",1],["E5",1],["D5",2],
      ["C5",1],["C5",1],["G5",1],["G5",1],["A5",1],["A5",1],["G5",2],
      ["F5",1],["F5",1],["E5",1],["E5",1],["D5",1],["D5",1],["C5",2]] },
];

const BG = ["#ffe9c7", "#d9f2ff", "#ffe3ef", "#e6f7d9", "#efe6ff", "#fff3cf"];
const CLOTH = [
  ["#ff9aa2", "#ffb7b2"],
  ["#8ec5ff", "#a9d6ff"],
  ["#ffd166", "#ffe29a"],
  ["#a0e7a0", "#c4f0c4"],
  ["#c9a7ff", "#ddc7ff"],
];

// ── 絵をつくる ─────────────────────────────────────────────
// 9マスのボタンに出す小さな絵（正面ではなく横から見た形）
function faceSvg(c, opt = {}) {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <g transform="translate(-10,10) scale(1.0)">${vehicleInner(c, opt, true)}</g>
  </svg>`;
}

/* のりものの本体。横から見た形。
   viewBox は 0 0 120 100 のつもりで描き、外側で位置を合わせる。 */
function vehicleInner(c, opt = {}, small = false) {
  const body = opt.gray ? "#e2ded8" : c.body;
  const roof = opt.gray ? "#cfcac3" : c.roof;
  const win  = opt.gray ? "#dcd8d2" : c.win;
  const tire = opt.gray ? "#cfcac3" : "#3a3a42";
  const rim  = opt.gray ? "#e2ded8" : "#c9ccd6";

  const wheel = (x, y, r) =>
    `<g class="wheel"><circle cx="${x}" cy="${y}" r="${r}" fill="${tire}"/>
      <circle cx="${x}" cy="${y}" r="${r * 0.45}" fill="${rim}"/>
      <rect x="${x - r * 0.12}" y="${y - r * 0.9}" width="${r * 0.24}" height="${r * 1.8}"
            rx="${r * 0.12}" fill="${rim}" opacity=".8"/></g>`;

  const lamp = c.light && !opt.gray
    ? `<g class="lamp"><rect x="44" y="24" width="18" height="9" rx="4" fill="${c.light}"/></g>`
    : "";

  switch (c.kind) {
    case "plane":
      return `<path d="M8 62 Q26 44 60 44 L92 44 Q108 44 110 54 Q108 64 92 64 L26 66 Z" fill="${body}"/>
        <path d="M52 46 L78 18 L88 18 L70 46 Z" fill="${roof}"/>
        <path d="M96 44 L112 26 L118 26 L112 46 Z" fill="${roof}"/>
        <path d="M40 64 L58 82 L68 82 L54 64 Z" fill="${roof}"/>
        <path d="M20 54 Q26 48 36 48 L44 48 L44 60 L26 60 Q20 58 20 54 Z" fill="${win}"/>
        <circle cx="58" cy="54" r="5" fill="${win}"/><circle cx="72" cy="54" r="5" fill="${win}"/>
        <circle cx="86" cy="54" r="5" fill="${win}"/>`;

    case "rocket":
      return `<path d="M60 6 Q84 34 84 62 L36 62 Q36 34 60 6 Z" fill="${body}"/>
        <path d="M36 50 L20 76 L36 70 Z" fill="${roof}"/>
        <path d="M84 50 L100 76 L84 70 Z" fill="${roof}"/>
        <rect x="46" y="62" width="28" height="12" rx="4" fill="${roof}"/>
        <circle cx="60" cy="36" r="13" fill="${win}"/>
        <circle cx="60" cy="36" r="13" fill="none" stroke="${roof}" stroke-width="3"/>
        <path d="M52 31 Q60 26 68 31" stroke="rgba(255,255,255,.7)" stroke-width="3"
              fill="none" stroke-linecap="round"/>
        ${opt.gray ? "" : `<g class="flame"><path d="M50 74 Q60 96 70 74 Z" fill="#ffb347"/>
          <path d="M55 74 Q60 88 65 74 Z" fill="#ffe066"/></g>`}`;

    case "train":
    case "bus": {
      const long = c.kind === "bus" ? 0 : 6;
      return `<rect x="${10 - long}" y="30" width="${96 + long * 2}" height="40" rx="10" fill="${body}"/>
        <rect x="${10 - long}" y="30" width="${96 + long * 2}" height="12" rx="6" fill="${roof}"/>
        ${c.stripe ? `<rect x="${10 - long}" y="54" width="${96 + long * 2}" height="6" fill="${c.stripe}"/>` : ""}
        <rect x="${64 - long}" y="38" width="16" height="14" rx="3" fill="${win}"/>
        <rect x="${84 - long}" y="38" width="16" height="14" rx="3" fill="${win}"/>
        <rect x="${20 - long}" y="38" width="26" height="14" rx="3" fill="${win}"/>
        <rect x="${44 - long}" y="38" width="16" height="14" rx="3" fill="${win}"/>
        ${wheel(30, 72, 11)}${wheel(84, 72, 11)}`;
    }

    case "digger":
      return `<rect x="26" y="34" width="60" height="34" rx="8" fill="${body}"/>
        <rect x="26" y="34" width="60" height="10" rx="5" fill="${roof}"/>
        <path d="M86 44 L112 26 L118 32 L96 52 Z" fill="${roof}"/>
        <path d="M112 30 L124 44 L108 50 Z" fill="${opt.gray ? "#cfcac3" : "#8c8f99"}"/>
        <rect x="34" y="40" width="26" height="18" rx="4" fill="${win}"/>
        <rect x="64" y="46" width="16" height="12" rx="3" fill="${win}"/>
        ${wheel(40, 70, 14)}${wheel(78, 72, 11)}`;

    case "car":
      return `<path d="M14 52 Q20 34 44 32 L74 32 Q92 34 100 52 L100 62 Q100 68 92 68 L22 68
                Q14 68 14 62 Z" fill="${body}"/>
        <path d="M30 40 Q34 26 56 26 L68 26 Q84 28 90 40 Z" fill="${roof}"/>
        ${lamp}
        <path d="M34 38 Q38 28 56 28 L56 40 L34 40 Z" fill="${win}"/>
        <path d="M60 28 Q78 28 86 40 L60 40 Z" fill="${win}"/>
        ${wheel(34, 68, 11)}${wheel(84, 68, 11)}`;

    default: // truck（しょうぼうしゃ・きゅうきゅうしゃ）
      return `<rect x="12" y="30" width="52" height="40" rx="8" fill="${body}"/>
        <path d="M64 42 L92 42 Q102 42 104 52 L104 70 L64 70 Z" fill="${body}"/>
        <rect x="12" y="30" width="52" height="10" rx="5" fill="${roof}"/>
        ${c.ladder && !opt.gray ? `<rect x="16" y="24" width="46" height="5" rx="2" fill="#c9ccd6"/>
          <rect x="16" y="19" width="46" height="4" rx="2" fill="#e2e5ee"
                transform="rotate(-6 16 21)"/>` : ""}
        ${lamp}
        <rect x="70" y="48" width="18" height="12" rx="3" fill="${win}"/>
        <rect x="20" y="44" width="18" height="14" rx="3" fill="${win}"/>
        <rect x="42" y="44" width="16" height="14" rx="3" fill="${win}"/>
        ${wheel(32, 70, 12)}${wheel(88, 70, 11)}`;
  }
}

/* クローズアップ用。走るところを見せる */
function bodySvg(c) {
  // タイヤの下で切って、道路や線路にきちんと着くようにする
  return `<svg viewBox="0 12 130 72" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    ${vehicleInner(c)}
  </svg>`;
}

// ── 音 ────────────────────────────────────────────────────
let ac = null;
let bus = null; // 声と曲の出口。押し直したら、ここごと切って止める
let soundOn = localStorage.getItem("norimono-sound") !== "off";

/* ── 音いろ ────────────────────────────────────────────
 * のこぎり波1本だと電子音になる。倍音を何本か重ね、減衰のしかたを
 * 楽器ごとに変えると、それらしく聞こえる。音源ファイルは持たない。
 *   partials: [周波数の倍率, 音量の割合, 減衰の速さ]
 */
const INSTRUMENTS = [
  { name: "オルゴール", type: "sine", attack: 0.004, decay: 2.4,
    partials: [[1, 1, 1], [2.76, 0.34, 1.4], [5.4, 0.12, 1.8], [8.9, 0.05, 2.2]] },
  { name: "もっきん",   type: "sine", attack: 0.003, decay: 0.5,
    partials: [[1, 1, 1], [3.99, 0.4, 1.6], [9.2, 0.12, 2.4]] },
  { name: "ピアノ",     type: "triangle", attack: 0.006, decay: 1.4,
    partials: [[1, 1, 1], [2, 0.42, 1.3], [3, 0.2, 1.6], [4, 0.09, 2]] },
  { name: "ふえ",       type: "sine", attack: 0.08, decay: 0.5, hold: true, vibrato: 5,
    partials: [[1, 1, 1], [2, 0.16, 1], [3, 0.06, 1]] },
  { name: "ギター",     type: "sawtooth", attack: 0.004, decay: 1.0, filter: true,
    partials: [[1, 1, 1], [2, 0.3, 1.2], [3, 0.12, 1.5]] },
];

let instIdx = Number(localStorage.getItem("norimono-inst") || 0) % INSTRUMENTS.length;

function playNote(f, at, dur, vol = 0.2) {
  if (!ac) return;
  const ins = INSTRUMENTS[instIdx];
  const t = ac.currentTime + at;
  const dest = out();

  ins.partials.forEach(([ratio, level, decay]) => {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = ins.type;
    osc.frequency.setValueAtTime(f * ratio, t);

    if (ins.vibrato) { // ふえ。息の揺れ
      const lfo = ac.createOscillator();
      const amt = ac.createGain();
      lfo.frequency.value = ins.vibrato;
      amt.gain.value = f * ratio * 0.008;
      lfo.connect(amt).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.4);
    }

    const peak = Math.max(0.0002, vol * level);
    const life = ins.hold ? dur : Math.min(dur + ins.decay, ins.decay / decay + 0.1);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + ins.attack);
    if (ins.hold) g.gain.setValueAtTime(peak, t + Math.max(ins.attack, dur - 0.08));
    g.gain.exponentialRampToValueAtTime(0.0001, t + life);

    let node = osc;
    if (ins.filter) { // ギター。はじいた直後だけ明るく
      const lp = ac.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(3400, t);
      lp.frequency.exponentialRampToValueAtTime(600, t + life);
      osc.connect(lp);
      node = lp;
    }
    node.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + life + 0.05);
  });
}

function tone(freq, at, dur, type = "triangle", vol = 0.22) {
  const t = ac.currentTime + at;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(out());
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function out() {
  return bus || ac.destination;
}

// 前の音を止めて、新しい出口を作る
function newBus() {
  if (bus) { try { bus.disconnect(); } catch (_) {} }
  bus = ac.createGain();
  bus.gain.value = 1.8; // 帯域フィルタを通ると痩せるぶん、ここで持ち上げる
  bus.connect(ac.destination);
  return bus;
}

function audio() {
  if (!soundOn) return false;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === "suspended") ac.resume();
    return true;
  } catch (_) {
    return false; // 音が出せない端末でも遊べる
  }
}

function beep(freqs) {
  if (!audio()) return;
  freqs.forEach((f, i) => playNote(f, i * 0.09, 0.34, 0.2));
}

// 高さを滑らせる音。鳴き声はこれを並べて作る
function glide(f0, f1, at, dur, type = "square", vol = 0.2) {
  const t = ac.currentTime + at;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(out());
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/* ── 声を作る ──────────────────────────────────────────
 * 音の高さを変えるだけでは言葉にならない。母音は「フォルマント」という
 * 山が2〜3本あることで あ・い・う に聞こえる。のこぎり波を帯域フィルタに
 * 通して山を立て、山の位置を動かして「わ」（う→あ）のような音にする。
 * 音源ファイルは持たないので、圏外でも同じ声が出る。
 */
const VOWELS = {
  a: [800, 1250, 2800],
  i: [320, 2300, 3000],
  u: [350, 900, 2300],
  e: [520, 1850, 2500],
  o: [460, 880, 2500],
  n: [260, 1000, 2200], // ん。こもらせる
};

let noiseBuf = null;

// 子音のはじけ。か行・ぱ行は雑音、ば行・が行は低い音
function burst(kind, at) {
  const t = ac.currentTime + at;
  if (kind === "b") {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.05);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(g).connect(out());
    osc.start(t);
    osc.stop(t + 0.06);
    return 0.05;
  }
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.2), ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ac.createBufferSource();
  const bp = ac.createBiquadFilter();
  const g = ac.createGain();
  src.buffer = noiseBuf;
  bp.type = "bandpass";
  bp.frequency.value = kind === "ch" ? 3200 : kind === "air" ? 1100 : 2200;
  bp.Q.value = kind === "air" ? 1 : 2;
  const dur = kind === "ch" ? 0.05 : kind === "air" ? 0.14 : 0.03;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(kind === "ch" ? 0.16 : kind === "air" ? 0.1 : 0.2, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp).connect(g).connect(out());
  src.start(t);
  src.stop(t + dur + 0.02);
  return dur;
}

// 母音ひとつ。seg.to があると、その母音へ滑る（「わ」＝う→あ）
function vowel(seg, at, base) {
  const t = ac.currentTime + at;
  const from = VOWELS[seg.v];
  const to = VOWELS[seg.to || seg.v];
  const dur = seg.d;
  const p0 = base * (seg.p0 || 1);
  const p1 = base * (seg.p1 || seg.p0 || 1);

  const osc = ac.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(p0, t);
  osc.frequency.linearRampToValueAtTime(p1, t + dur);

  const out = ac.createGain();
  // 声が高いほど、基本の音が第1フォルマントより上に出て痩せる。高い子は持ち上げる
  const lift = Math.min(3, Math.max(1, (base / 300) ** 1.4));
  const level = (seg.v === "n" ? 0.2 : 0.38) * lift;
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(level, t + 0.03);
  out.gain.setValueAtTime(level, t + Math.max(0.04, dur - 0.04));
  out.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.02);
  out.connect(bus || ac.destination);

  from.forEach((f, i) => {
    const bp = ac.createBiquadFilter();
    const g = ac.createGain();
    bp.type = "bandpass";
    bp.Q.value = 9;
    bp.frequency.setValueAtTime(f, t);
    bp.frequency.linearRampToValueAtTime(to[i], t + dur);
    g.gain.value = [1, 0.55, 0.22][i];
    osc.connect(bp).connect(g).connect(out);
  });

  // 素の音も少しだけ混ぜて、声に芯を持たせる
  const direct = ac.createGain();
  direct.gain.value = 0.09;
  osc.connect(direct).connect(out);

  osc.start(t);
  osc.stop(t + dur + 0.05);
  return dur;
}

// 音の名前（C4 など）を周波数に直す
const SCALE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function noteFreq(n) {
  const step = SCALE[n[0]] + (parseInt(n.slice(1), 10) - 4) * 12;
  return 440 * Math.pow(2, (step - 9) / 12);
}

/* のりものの音。サイレン・クラクション・エンジン。
   音の高さを行き来させて作る（[はじめ, おわり, 長さ, 波のかたち, 音量]）。
   音源ファイルは持たないので、圏外でも同じ音が出る。 */
function playSfx(sfx) {
  if (!audio() || !sfx) return 0;
  let at = 0;
  sfx.forEach(([f0, f1, dur, type, vol]) => {
    glide(f0, f1, at, dur, type, vol);
    at += dur + 0.04;
  });
  return at;
}

/* 実際に鳴らす並び。前半をもう一度くり返して長くする。
   きらきら星（ねずみ）は6行フルで元から長いので、くり返さない（encore: 0）。 */
function tuneSeq(c) {
  if (!c.tune) return [];
  if (c.encore === 0) return c.tune;
  return c.tune.concat(c.tune.slice(0, Math.floor(c.tune.length / 2)));
}

/* 曲を鳴らす。使うのは著作権の切れた民謡か、自作のものだけ。
   音源ファイルは持たないので、圏外でも鳴る。 */
function playTune(c, at = 0) {
  if (!c.tune) return 0;
  const beat = 0.34;
  let t = at;
  tuneSeq(c).forEach(([n, len]) => {
    const dur = beat * len;
    const f = noteFreq(n);
    playNote(f, t, dur * 0.92, 0.22);
    t += dur;
  });
  return t - at;
}

// 子音のはじけの長さ。鳴らす前に長さだけ知りたいので表にしておく
const BURST_LEN = { b: 0.05, ch: 0.05, air: 0.14, k: 0.03, p: 0.03 };

// 鳴き声の長さ。音が出せない端末でも、絵は同じ長さで見せる
function voiceLen(c) {
  let at = 0;
  (c.voice || []).forEach((seg) => {
    at += seg.gap ? seg.gap : seg.burst ? (BURST_LEN[seg.burst] || 0.03) : seg.d;
  });
  return at;
}

function tuneLen(c) {
  return tuneSeq(c).reduce((t, [, len]) => t + 0.34 * len, 0);
}

// 音を鳴らさずに長さだけ知る。音が切れていても、絵は同じ長さで見せる
function voiceLen(c) {
  return (c.sfx || []).reduce((t, [, , dur]) => t + dur + 0.04, 0);
}

function cry(c) {
  return playSfx(c.sfx);
}

// 「ぶーん！」＝エンジンがかかる音、「ぷっぷー」＝クラクション
const SFX_START = [[90, 200, 0.3, "sawtooth", 0.18], [200, 320, 0.35, "sawtooth", 0.14]];
const SFX_HORN  = [[330, 300, 0.22, "square", 0.22], [300, 270, 0.28, "square", 0.22]];

function say(sfx) {
  return playSfx(sfx);
}

// ── みつけた（会った子を端末の中だけに残す）────────────────────────
function seen() {
  try {
    return JSON.parse(localStorage.getItem("norimono-seen") || "[]");
  } catch (_) {
    return [];
  }
}

function remember(name) {
  const list = seen();
  if (list.includes(name)) return false;
  list.push(name);
  try { localStorage.setItem("norimono-seen", JSON.stringify(list)); } catch (_) {}
  return true; // はじめて会った
}

// ── 画面 ──────────────────────────────────────────────────
const stage = document.getElementById("stage");
const chara = document.getElementById("chara");
const word = document.getElementById("word");
const sndBtn = document.getElementById("snd");
const modeBtn = document.getElementById("mode");
const bookBtn = document.getElementById("book");
const sheet = document.getElementById("sheet");
const instBtn = document.getElementById("inst");
const pads = document.getElementById("pads");
const zoom = document.getElementById("zoom");

let open = false;
let busy = false;
let last = -1;
let current = null;
let mode = "baa";

function pick(arr) {
  let i = Math.floor(Math.random() * arr.length);
  if (arr === CHARAS && i === last) i = (i + 1) % arr.length;
  if (arr === CHARAS) last = i;
  return arr[i];
}

function sparkle(x = null, y = null, n = 10) {
  for (let i = 0; i < n; i++) {
    const s = document.createElement("div");
    const a = (Math.PI * 2 * i) / n;
    const d = 90 + Math.random() * 70;
    s.className = "spark";
    s.style.left = x === null ? "50%" : `${x}px`;
    s.style.top = y === null ? "45%" : `${y}px`;
    s.style.background = ["#ffd166", "#ff8fab", "#8ec5ff", "#a8e6a3"][i % 4];
    s.style.setProperty("--dx", `${Math.cos(a) * d}px`);
    s.style.setProperty("--dy", `${Math.sin(a) * d}px`);
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 950);
  }
}

function paint(bg, cloth) {
  document.documentElement.style.setProperty("--bg", bg);
  if (cloth) {
    document.documentElement.style.setProperty("--cloth-a", cloth[0]);
    document.documentElement.style.setProperty("--cloth-b", cloth[1]);
  }
  document.querySelector('meta[name="theme-color"]').setAttribute("content", bg);
}

function show() {
  current = pick(CHARAS);
  paint(pick(BG), pick(CLOTH));

  chara.innerHTML = faceSvg(current);
  chara.className = "";
  void chara.offsetWidth; // アニメを最初から流し直す
  chara.className = "pop";
  chara.addEventListener("animationend", () => {
    if (chara.className === "pop") chara.className = "wobble";
  }, { once: true });

  const first = remember(current.name);
  word.textContent = first ? "はじめまして！" : "ぶーん！";
  word.className = "";
  void word.offsetWidth;
  word.className = "show";

  document.body.classList.add("open");
  if (audio()) newBus(); // 続けて押されたとき、前の音を残さない
  beep(current.note);
  say(SFX_START);
  sparkle(null, null, first ? 18 : 10);
  if (navigator.vibrate) navigator.vibrate(20);
  open = true;
}

function hide() {
  document.body.classList.remove("open");
  chara.className = "";
  word.className = "";
  open = false;
}

// 出ているのりものをさわると、クラクションを鳴らして車体がゆれる
function tickle() {
  if (!current) return;
  chara.innerHTML = faceSvg(current);
  chara.className = "";
  void chara.offsetWidth;
  chara.className = "tickle";
  word.textContent = "ぷっぷー";
  word.className = "";
  void word.offsetWidth;
  word.className = "show";
  if (audio()) newBus();
  say(SFX_HORN);
  sparkle(null, null, 8);
  if (navigator.vibrate) navigator.vibrate([12, 40, 12]);
  chara.addEventListener("animationend", () => {
    chara.innerHTML = faceSvg(current);
    chara.className = "wobble";
    word.textContent = "ぶーん！";
  }, { once: true });
}

function hitFace(e) {
  const r = chara.getBoundingClientRect();
  return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
}

// ── おとモード（たたくと音が鳴る）──────────────────────────────
// 5音だけ使うので、どこを押しても外れて聞こえない
const PAD_NOTES = [523, 587, 659, 784, 880, 1046, 392, 440, 494];
// 色みが重ならないよう、色の輪を9等分するように選ぶ。上下の濃淡もつける
const PAD_COLORS = [
  ["#ff8fab", "#ff6f92"], // もも
  ["#ffb347", "#ff9a2e"], // だいだい
  ["#ffe066", "#ffd12e"], // きいろ
  ["#b6e07a", "#9ed05c"], // きみどり
  ["#6fd08c", "#4fbd73"], // みどり
  ["#7fd8d8", "#59c6c6"], // みずいろ
  ["#8ec5ff", "#6aaeff"], // あお
  ["#b7a3ff", "#9b83ff"], // むらさき
  ["#d9a06b", "#c2884f"], // ちゃいろ
];

let zoomTimer = null;
let walkTimer = null;
let noteTimer = null;

/* 押した子を大きく出す → 鳴く → そのまま短いおはなし（曲＋歩く）。
   もう一度どこかを押すと、前の音を切って新しい子に替わる。 */
/* 景色。子ごとに変える。画像は1枚も持たず、色と丸と三角で描く。 */
const SCENES = {
  // しょうぼうしゃ／パトカー／きゅうきゅうしゃ → まちの道路
  しょうぼうしゃ: { sky: "#8fd3ff,#cceeff,#eaf8ff", ground: "#8b8f9c", edge: "#767a86",
              buildings: 5, road: true, sun: "#ffe066", clouds: 3, birds: 2 },
  パトカー: { sky: "#8fd3ff,#cceeff,#eaf8ff", ground: "#8b8f9c", edge: "#767a86",
              buildings: 6, road: true, signal: true, sun: "#ffe066", clouds: 2 },
  きゅうきゅうしゃ: { sky: "#bfe4ff,#dcf2ff,#eef9ff", ground: "#8b8f9c", edge: "#767a86",
              buildings: 4, road: true, house: "#f4f4f6", sun: "#ffe066", clouds: 3, bushes: 2 },

  // でんしゃ／しんかんせん → 線路
  でんしゃ: { sky: "#a8dcff,#cdeeff,#eaf8ff", ground: "#b39d7d", edge: "#9c8767",
              rails: true, hills: ["#8fd08a", "#a8e6a3"], sun: "#ffe066", clouds: 3,
              birds: 3, flowers: 5, bushes: 2 },
  しんかんせん: { sky: "#bfe9ff,#dcf4ff,#eefaff", ground: "#b8bcc6", edge: "#a2a6b0",
              rails: true, mountains: true, hills: ["#9fc7a0", "#bcdcbb"], sun: "#ffe066",
              clouds: 2, birds: 2 },

  // バス → まちなみ
  バス:     { sky: "#ffd9a8,#ffeccd,#fff6e6", ground: "#8b8f9c", edge: "#767a86",
              buildings: 5, road: true, house: "#e8b06a", sun: "#ffcf5c", clouds: 2, birds: 2 },

  // ショベルカー → こうじげんば
  ショベルカー: { sky: "#ffe9c7,#fff3de,#fffaf0", ground: "#c8925f", edge: "#ab7a4c",
              cones: 4, sandpiles: 2, sun: "#ffcf5c", clouds: 2, stones: 3 },

  // ひこうき → 雲の上
  ひこうき: { sky: "#5aa9ff,#9ed3ff,#d8efff", ground: "#eaf6ff", edge: "#d3e9f7",
              cloudSea: true, clouds: 5, sun: "#ffe066", birds: 2 },

  // ロケット → 夜の空。きらきら星に合わせて
  ロケット: { sky: "#0b1030,#1a2350,#2f3a6b", ground: "#2a3160", edge: "#222a52",
              moon: true, stars: 30, shooting: true, hills: ["#232b56", "#2a3260"], planet: true },
};



function scene(c) {
  const sc = SCENES[c.name] || SCENES["いぬ"];
  const bg = `linear-gradient(${sc.sky.split(",").map((v, i) => `${v} ${[0, 58, 100][i]}%`).join(",")})`;
  let html = `<div class="scene" style="background:${bg}">`;

  if (sc.mountains) {
    html += `<div class="mount m1"></div><div class="mount m2"></div>`;
  }

  if (sc.sun)  html += `<div class="sun" style="background:${sc.sun};box-shadow:0 0 0 14px ${sc.sun}59"></div>`;
  if (sc.moon) html += `<div class="sun moon"></div>`;

  for (let i = 0; i < (sc.stars || 0); i++) {
    html += `<div class="star" style="left:${(Math.random() * 96).toFixed(1)}%;
             top:${(Math.random() * 55).toFixed(1)}%;
             animation-delay:${(Math.random() * 2).toFixed(1)}s"></div>`;
  }

  for (let i = 0; i < (sc.clouds || 0); i++) {
    html += `<div class="cloud${sc.gray ? " gray" : ""}" style="top:${4 + i * 9}%;
             left:${-30 - i * 22}%;width:${96 - i * 12}px;
             animation-duration:${16 + i * 6}s"></div>`;
  }

  for (let i = 0; i < (sc.birds || 0); i++) {
    html += `<div class="bird" style="top:${8 + Math.random() * 26}%;left:${-20 - i * 18}%;
             animation-duration:${18 + i * 5}s;animation-delay:${i * 2}s"></div>`;
  }

  if (sc.shooting) html += `<div class="shooting"></div>`;
  if (sc.rainbow)  html += `<div class="rainbow"></div>`;

  (sc.hills || []).forEach((color, i) => {
    html += `<div class="hill" style="background:${color};${i === 0
      ? "left:-12%;width:78%;height:26%"
      : "right:-14%;width:66%;height:20%"}"></div>`;
  });

  for (let i = 0; i < (sc.trees || 0); i++) {
    const left = 2 + i * 14 + Math.random() * 5;
    const h = 22 + Math.random() * 12;
    html += `<div class="tree${sc.jungle ? " jungle" : ""}"
             style="left:${left}%;height:${h}%;--leaf:${sc.jungle ? "#2f8f4a" : "#3f8f52"}"></div>`;
  }

  for (let i = 0; i < (sc.buildings || 0); i++) {
    const h = 16 + Math.random() * 20;
    html += `<div class="bldg" style="left:${2 + i * 17 + Math.random() * 4}%;height:${h}%;
             --wall:${["#c8ccd6", "#dfe3ec", "#b9bfcc", "#e8d9c2"][i % 4]}"></div>`;
  }

  if (sc.planet) html += `<div class="planet"></div>`;
  if (sc.cloudSea) html += `<div class="cloudsea"></div>`;

  for (let i = 0; i < (sc.sandpiles || 0); i++) {
    html += `<div class="sandpile" style="left:${12 + i * 46}%"></div>`;
  }

  if (sc.house) {
    html += `<div class="house" style="--wall:${sc.house}"></div>`;
  }

  if (sc.bigTree) html += `<div class="bigtree"></div>`;

  for (let i = 0; i < (sc.vines || 0); i++) {
    html += `<div class="vine" style="left:${12 + i * 33}%;height:${18 + Math.random() * 16}%"></div>`;
  }

  html += `<div class="ground" style="background:${sc.ground};box-shadow:inset 0 6px 0 ${sc.edge}"></div>`;

  for (let i = 0; i < (sc.bushes || 0); i++) {
    html += `<div class="bush" style="left:${5 + i * 31 + Math.random() * 8}%;
             bottom:${2 + Math.random() * 9}%;width:${44 + Math.random() * 26}px"></div>`;
  }

  for (let i = 0; i < (sc.stones || 0); i++) {
    html += `<div class="stone" style="left:${12 + i * 29 + Math.random() * 10}%;
             bottom:${2 + Math.random() * 8}%"></div>`;
  }

  for (let i = 0; i < (sc.nuts || 0); i++) {
    html += `<div class="nut" style="left:${10 + i * 18 + Math.random() * 8}%;
             bottom:${2 + Math.random() * 9}%"></div>`;
  }

  for (let i = 0; i < (sc.mushrooms || 0); i++) {
    html += `<div class="mush" style="left:${8 + i * 23 + Math.random() * 8}%;
             bottom:${2 + Math.random() * 8}%"></div>`;
  }

  for (let i = 0; i < (sc.fireflies || 0); i++) {
    html += `<div class="firefly" style="left:${5 + Math.random() * 90}%;
             bottom:${4 + Math.random() * 34}%;animation-delay:${(Math.random() * 3).toFixed(1)}s"></div>`;
  }

  for (let i = 0; i < (sc.flyers || 0); i++) {
    html += `<div class="flyer" style="top:${30 + Math.random() * 40}%;left:${-15 - i * 25}%;
             animation-duration:${12 + i * 4}s;animation-delay:${i}s"></div>`;
  }

  for (let i = 0; i < (sc.ripples || 0); i++) {
    html += `<div class="ripple" style="left:${14 + i * 30}%;bottom:${3 + i * 4}%;
             animation-delay:${(i * 0.7).toFixed(1)}s"></div>`;
  }

  if (sc.road)  html += `<div class="road"></div>`;
  if (sc.rails) html += `<div class="rails"></div>`;
  if (sc.signal) html += `<div class="signal"></div>`;

  for (let i = 0; i < (sc.cones || 0); i++) {
    html += `<div class="cone" style="left:${10 + i * 22 + Math.random() * 6}%"></div>`;
  }

  if (sc.fence) html += `<div class="fence"></div>`;
  if (sc.lily) {
    for (let i = 0; i < 3; i++) {
      html += `<div class="lily" style="left:${8 + i * 34}%;bottom:${2 + i * 4}%"></div>`;
    }
  }
  if (sc.rain) {
    for (let i = 0; i < 26; i++) {
      html += `<div class="rain" style="left:${(Math.random() * 100).toFixed(1)}%;
               animation-delay:${(Math.random() * 0.9).toFixed(2)}s;
               animation-duration:${(0.6 + Math.random() * 0.4).toFixed(2)}s"></div>`;
    }
  }

  html += flowers(sc.flowers || 0);
  return html + `</div>`;
}

/* 草に咲く花。位置と色と大きさを毎回ちらす。
   画像は持たず、円を5枚ならべて花びらにする。 */
const PETALS = ["#ff8fab", "#ffd166", "#fff", "#c9a7ff", "#ff9ec7"];

function flowers(n) {
  let out = "";
  for (let i = 0; i < n; i++) {
    const left = (4 + i * (92 / Math.max(1, n)) + Math.random() * 6) % 96;
    const bottom = 1 + Math.random() * 13;
    const size = 16 + Math.random() * 12;
    const color = PETALS[Math.floor(Math.random() * PETALS.length)];
    out += `<div class="flower" style="left:${left}%;bottom:${bottom}%;width:${size}px;
             height:${size}px;--petal:${color};animation-delay:${(i * 0.3).toFixed(1)}s"></div>`;
  }
  return out;
}

// うしろに出てくるお友達。毎回ちがう2人
function friendsOf(c) {
  const rest = CHARAS.filter((x) => x !== c);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return rest.slice(0, 2);
}

function showZoom(c) {
  // 外の景色。空・お日さま・雲・丘・草。絵はCSSだけで、画像は持たない
  zoom.innerHTML = scene(c) + `
    <div class="friends">${friendsOf(c).map((f, i) =>
      `<div class="friend f${i}"><div class="bob">${bodySvg(f)}</div></div>`).join("")}</div>
    <div class="zoomface"><div class="bob">${bodySvg(c)}</div></div>`;
  zoom.className = "";
  void zoom.offsetWidth; // アニメを最初から流し直す
  zoom.className = "on";
  clearTimeout(zoomTimer);
  clearTimeout(walkTimer);
  clearInterval(noteTimer);

  // 長さは音の有無によらず同じ。音が出せない端末でも、歩く姿は最後まで見せる
  const cryLen = voiceLen(c);
  const songLen = tuneLen(c);

  if (audio()) {
    newBus();                     // 前に鳴っていた音を切る
    playSfx(c.sfx);               // のりものの音
    playTune(c, cryLen + 0.25);   // そのあとに曲
  }

  const face = zoom.querySelector(".zoomface");
  walkTimer = setTimeout(() => {
    if (!face.isConnected) return;
    face.style.animationDuration = "4s";
    face.style.animationIterationCount = String(Math.max(1, Math.round(songLen / 4)));
    face.classList.add("walk");
    // 曲に合わせて、音符のかわりの玉を飛ばす
    noteTimer = setInterval(() => sparkle(null, window.innerHeight * 0.62, 3), 340);
  }, (cryLen + 0.25) * 1000);

  zoomTimer = setTimeout(() => {
    zoom.className = "";
    clearInterval(noteTimer);
  }, (cryLen + 0.35 + songLen) * 1000);
}

// 画面の下に、少しのあいだ出す文字（音いろの名前）
let toastTimer = null;

function toast(text) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("on"), 1400);
}

// たたいたところから広がる輪
function ring(x, y) {
  const r = document.createElement("div");
  r.className = "ring";
  r.style.left = `${x}px`;
  r.style.top = `${y}px`;
  document.body.appendChild(r);
  setTimeout(() => r.remove(), 620);
}

/* だれも押していないとき、ときどき1枚だけ跳ねて「押して」と誘う。
   ぜんぶ動くとうるさいので、1枚ずつ。 */
let peekTimer = null;

function startPeek() {
  clearInterval(peekTimer);
  peekTimer = setInterval(() => {
    if (mode !== "drum" || document.body.classList.contains("book")) return;
    const list = pads.children;
    if (!list.length) return;
    const b = list[Math.floor(Math.random() * list.length)];
    b.classList.remove("peek");
    void b.offsetWidth;
    b.classList.add("peek");
  }, 2600);
}

function buildPads() {
  pads.innerHTML = "";
  PAD_NOTES.forEach((f, i) => {
    const b = document.createElement("button");
    b.className = "pad";
    b.type = "button";
    const [c1, c2] = PAD_COLORS[i];
    b.style.background = `linear-gradient(160deg, ${c1}, ${c2})`;
    b.style.animationDelay = `${(i * 0.18).toFixed(2)}s`;
    b.setAttribute("aria-label", "おと");
    const c = CHARAS[i % CHARAS.length];
    b.innerHTML = `<div class="padface">${faceSvg(c)}</div>`;
    b.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      // 先に showZoom。ここで音の出口を作り直すので、太鼓の音はそのあとに出す
      // （逆にすると、出したそばから自分で切ってしまう）
      showZoom(c);
      if (audio()) playNote(f, 0, 0.6, 0.26);
      b.classList.remove("hit");
      void b.offsetWidth;
      b.classList.add("hit");
      ring(e.clientX, e.clientY);
      sparkle(e.clientX, e.clientY, 6);
      if (navigator.vibrate) navigator.vibrate(12);
    });
    pads.appendChild(b);
  });
}

function setMode(next) {
  mode = next;
  if (zoom) zoom.className = "";
  clearTimeout(zoomTimer);
  clearTimeout(walkTimer);
  clearInterval(noteTimer);
  if (ac) newBus();
  hide();
  closeBook();
  document.body.classList.toggle("drum", mode === "drum");
  modeBtn.textContent = mode === "drum" ? "🙈" : "🥁";
  paint(mode === "drum" ? "#2b2f4a" : pick(BG), null);
  if (mode === "drum" && !pads.children.length) buildPads();
  if (mode === "drum") startPeek();
  else clearInterval(peekTimer);
}

// ── みつけた（図鑑）─────────────────────────────────────────
function openBook() {
  const got = seen();
  sheet.innerHTML = `<h1>みつけた ${got.length} / ${CHARAS.length}</h1><div class="grid">` +
    CHARAS.map((c) => {
      const has = got.includes(c.name);
      return `<div class="cell${has ? "" : " yet"}">${faceSvg(c, { gray: !has })}
              <span>${has ? c.name : "？"}</span></div>`;
    }).join("") +
    `</div><p class="note">さわると とじます ・ ばん ${VERSION}</p>`;
  document.body.classList.add("book");
  if (got.length === CHARAS.length) sparkle(null, null, 20);
}

function closeBook() {
  document.body.classList.remove("book");
}

// ── 操作 ──────────────────────────────────────────────────
function tap(e) {
  if (document.body.classList.contains("book")) { closeBook(); return; }
  if (mode === "drum") return;
  if (busy) return;
  busy = true;
  if (open) {
    if (hitFace(e)) tickle();
    else hide();
    setTimeout(() => { busy = false; }, 260);
  } else {
    show();
    setTimeout(() => { busy = false; }, 420);
  }
}

// 手（布）が画面の一番上にあるので、受け取りは文書ぜんぶで
document.addEventListener("pointerdown", tap);
document.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("dblclick", (e) => e.preventDefault());

/* 音の入切は「長押し」にしてある。
   軽く触っただけでは変わらない。子供が当てて音が消えたことがあったため。 */
function paintSnd() {
  sndBtn.textContent = soundOn ? "♪" : "×";
  sndBtn.classList.toggle("off", !soundOn);
  sndBtn.title = soundOn ? "長押しで音を切る" : "長押しで音を出す";
}

let sndHold = null;

sndBtn.addEventListener("pointerdown", (e) => {
  e.stopPropagation();
  sndBtn.classList.add("holding");
  sndHold = setTimeout(() => {
    soundOn = !soundOn;
    localStorage.setItem("norimono-sound", soundOn ? "on" : "off");
    paintSnd();
    if (soundOn) { newBusIfPossible(); beep([523, 784]); }
    if (navigator.vibrate) navigator.vibrate(30);
  }, 700);
});

["pointerup", "pointerleave", "pointercancel"].forEach((ev) =>
  sndBtn.addEventListener(ev, (e) => {
    e.stopPropagation();
    clearTimeout(sndHold);
    sndBtn.classList.remove("holding");
  })
);

function newBusIfPossible() {
  if (audio()) newBus();
}

paintSnd();

modeBtn.addEventListener("pointerdown", (e) => {
  e.stopPropagation();
  setMode(mode === "baa" ? "drum" : "baa");
});

// 音いろを変える。押すたびに次の楽器へ
instBtn.addEventListener("pointerdown", (e) => {
  e.stopPropagation();
  instIdx = (instIdx + 1) % INSTRUMENTS.length;
  localStorage.setItem("norimono-inst", String(instIdx));
  toast(INSTRUMENTS[instIdx].name);
  if (audio()) {
    newBus();
    [523, 659, 784].forEach((f, i) => playNote(f, i * 0.12, 0.5, 0.22));
  }
});

bookBtn.addEventListener("pointerdown", (e) => {
  e.stopPropagation();
  if (document.body.classList.contains("book")) closeBook();
  else openBook();
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
