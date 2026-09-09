/*
 * いないいないばあ。
 * 画面のどこを押しても、手がひらいて誰かが出てくる。まちがいはない。
 * 通信は一切しない。絵は SVG をその場で組み立て、音は Web Audio で作る。
 *
 * 遊び方は2つ。
 *   ばあモード … 手をひらく。出てきた顔をさわると、くすぐったがる
 *   おとモード … 9つのボタンをたたくと音が鳴る
 * 会った子は「みつけた」に残る（端末の中だけ。どこにも送らない）。
 */

// ── 出てくる子たち（どれも自作。実在のキャラクターは使わない）───────────
const CHARAS = [
  { name: "いぬ",   fur: "#fbf8f2", ear: "drop",  earColor: "#d8c6a8", note: [523, 659, 784],
    fluffy: true, eyeR: 9, eyeX: 17, noseR: 8,
    cry: "わんわん", base: 300, voice: [
      { v: "u", to: "a", d: 0.17, p0: 1.15, p1: 0.95 }, { v: "n", d: 0.11, p0: 0.9 }, { gap: 0.06 },
      { v: "u", to: "a", d: 0.17, p0: 1.1, p1: 0.9 },   { v: "n", d: 0.13, p0: 0.85 }],
    tuneName: "じぶんの うた（自作）",
    tune: [["C4",1],["E4",1],["G4",1],["E4",1],["C4",1],["G4",1],["C5",2],
      ["A4",1],["G4",1],["E4",1],["G4",1],["A4",1],["G4",1],["E4",1],["C4",2]] },

  { name: "ねこ",   fur: "#b9c9ff", ear: "up",    earColor: "#8fa4e8", note: [587, 740, 880],
    cry: "にゃーん", base: 430, voice: [
      { v: "i", to: "a", d: 0.32, p0: 1.15, p1: 0.95 }, { v: "n", d: 0.16, p0: 0.88 }],
    tuneName: "じぶんの うた（自作）",
    tune: [["E4",1],["G4",1],["A4",1],["G4",1],["E4",1],["D4",1],["C4",2],
      ["D4",1],["E4",1],["G4",1],["E4",1],["D4",1],["C4",1],["D4",1],["C4",2]] },

  { name: "ぶた",   fur: "#ffc2d4", ear: "up",    earColor: "#f299b4", note: [392, 494, 587],
    noseR: 11, snout: true,
    cry: "ぶーぶー", base: 190, voice: [
      { burst: "b" }, { v: "u", d: 0.24, p0: 1.0, p1: 0.9 }, { gap: 0.07 },
      { burst: "b" }, { v: "u", d: 0.26, p0: 0.98, p1: 0.86 }],
    tuneName: "むすんでひらいて（ルソー・PD）",
    tune: [["G4",1],["E4",1],["G4",1],["A4",1],["G4",1],["E4",1],["D4",1],["C4",2],
      ["E4",1],["D4",1],["E4",1],["F4",1],["E4",1],["D4",1],["C4",1],["C4",2]] },

  { name: "くま",   fur: "#c69c7b", ear: "round", earColor: "#a67e5f", note: [440, 554, 659],
    muzzle: "#e8cdb4",
    cry: "がおー", base: 150, voice: [
      { burst: "b" }, { v: "a", d: 0.22, p0: 1.05, p1: 0.98 }, { v: "o", d: 0.4, p0: 0.98, p1: 0.8 }],
    tuneName: "森のくまさん（アメリカ民謡・PD）",
    tune: [["C4",1],["E4",1],["G4",1],["G4",1],["A4",1],["G4",1],["E4",1],["C4",2],
      ["D4",1],["E4",1],["F4",1],["E4",1],["D4",1],["C4",1],["D4",1],["C4",2]] },

  { name: "ねずみ", fur: "#dcdce6", ear: "round", earColor: "#c6c6d4", innerEar: "#ffc7db",
    earR: 16, earX: 21, earY: 20, note: [494, 622, 740],
    cry: "ちゅーちゅー", base: 620, voice: [
      { burst: "ch" }, { v: "u", d: 0.16, p0: 1.05, p1: 1.2 }, { gap: 0.06 },
      { burst: "ch" }, { v: "u", d: 0.16, p0: 1.05, p1: 1.25 }],
    tuneName: "きらきら星（フランス民謡・PD）",
    tune: [["C5",1],["C5",1],["G5",1],["G5",1],["A5",1],["A5",1],["G5",2],
      ["F5",1],["F5",1],["E5",1],["E5",1],["D5",1],["D5",1],["C5",2]] },

  { name: "ひよこ", fur: "#ffe066", ear: "none",  earColor: "#f0c419", note: [698, 880, 1046],
    cry: "ぴよぴよ", base: 700, voice: [
      { burst: "p" }, { v: "i", d: 0.07, p0: 1.1 }, { v: "o", d: 0.13, p0: 1.0, p1: 0.92 }, { gap: 0.05 },
      { burst: "p" }, { v: "i", d: 0.07, p0: 1.12 }, { v: "o", d: 0.14, p0: 1.0, p1: 0.9 }],
    tuneName: "ちょうちょう（ドイツ民謡・PD）",
    tune: [["G5",1],["E5",1],["E5",2],["F5",1],["D5",1],["D5",2],
      ["C5",1],["D5",1],["E5",1],["F5",1],["G5",1],["G5",1],["G5",2],
      ["G5",1],["E5",1],["E5",1],["E5",1],["F5",1],["D5",1],["D5",2],
      ["C5",1],["E5",1],["G5",1],["G5",1],["E5",2]] },

  { name: "さる",   fur: "#e0b083", ear: "round", earColor: "#d3a173", innerEar: "#f4d3b4",
    earR: 15, earX: 14, earY: 52, muzzle: "#ffe8d2", note: [349, 440, 523],
    cry: "うっきー", base: 540, voice: [
      { v: "u", d: 0.11, p0: 0.9 }, { gap: 0.07 },
      { burst: "k" }, { v: "i", d: 0.3, p0: 1.0, p1: 1.28 }],
    tuneName: "大きな栗の木の下で（イギリス民謡・PD）",
    tune: [["C5",1],["F4",1],["F4",1],["F4",1],["G4",1],["A4",1],["A4",1],["G4",1],["F4",2],
      ["A4",1],["A4",1],["A4",1],["A4",1],["G4",1],["F4",1],["G4",1],["A4",1],["F4",2]] },

  { name: "うし",   fur: "#f6f2ea", ear: "drop",  earColor: "#cfc6b8", note: [330, 415, 494],
    noseR: 11, snout: true, patch: "#4a4238", horn: true,
    cry: "もーもー", base: 170, voice: [
      { v: "o", d: 0.42, p0: 1.0, p1: 0.86 }, { gap: 0.08 },
      { v: "o", d: 0.46, p0: 0.96, p1: 0.8 }],
    tuneName: "メリーさんのひつじ（アメリカ民謡・PD）",
    tune: [["E4",1],["D4",1],["C4",1],["D4",1],["E4",1],["E4",1],["E4",2],
      ["D4",1],["D4",1],["D4",2],["E4",1],["G4",1],["G4",2],
      ["E4",1],["D4",1],["C4",1],["D4",1],["E4",1],["E4",1],["E4",1],["E4",1],
      ["D4",1],["D4",1],["E4",1],["D4",1],["C4",2]] },
  { name: "かえる", fur: "#a8e6a3", ear: "frog",  earColor: "#7fcf7a", note: [294, 370, 440],
    cry: "けろけろ", base: 270, voice: [
      { burst: "k" }, { v: "e", d: 0.11, p0: 1.0 }, { v: "o", d: 0.13, p0: 0.9 }, { gap: 0.05 },
      { burst: "k" }, { v: "e", d: 0.11, p0: 1.0 }, { v: "o", d: 0.14, p0: 0.88 }],
    tuneName: "かえるの合唱（ドイツ民謡・PD）",
    tune: [["C4",1],["D4",1],["E4",1],["F4",1],["E4",1],["D4",1],["C4",2],
      ["E4",1],["F4",1],["G4",1],["A4",1],["G4",1],["F4",1],["E4",2],
      ["C4",1],["C4",1],["C4",1],["C4",1],
      ["C4",1],["C4",1],["D4",1],["D4",1],["E4",1],["E4",1],["F4",1],["F4",1],
      ["E4",1],["D4",1],["C4",2]] },
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
function ears(c) {
  const e = c.earColor;
  switch (c.ear) {
    case "drop":  // 垂れ耳
      return (c.horn ? `<path d="M22 28 Q12 14 22 10 Q26 18 34 24 Z" fill="#e8dcc8"/>
              <path d="M78 28 Q88 14 78 10 Q74 18 66 24 Z" fill="#e8dcc8"/>` : "") +
             `<ellipse cx="14" cy="54" rx="12" ry="21" fill="${e}"/>
              <ellipse cx="86" cy="54" rx="12" ry="21" fill="${e}"/>`;
    case "up":    // とんがり耳
      return `<path d="M23 30 L30 6 L46 22 Z" fill="${e}"/>
              <path d="M77 30 L70 6 L54 22 Z" fill="${e}"/>`;
    case "long":  // ながい耳
      return `<ellipse cx="36" cy="16" rx="8" ry="20" fill="${e}"/>
              <ellipse cx="64" cy="16" rx="8" ry="20" fill="${e}"/>`;
    case "round": { // まるい耳
      const r = c.earR || 13, x = c.earX || 24, y = c.earY || 26;
      return `<circle cx="${x}" cy="${y}" r="${r}" fill="${e}"/>
              <circle cx="${100 - x}" cy="${y}" r="${r}" fill="${e}"/>` +
             (c.innerEar ? `<circle cx="${x}" cy="${y}" r="${r * 0.55}" fill="${c.innerEar}"/>
              <circle cx="${100 - x}" cy="${y}" r="${r * 0.55}" fill="${c.innerEar}"/>` : "");
    }
    case "frog":  // 目が上に出ている
      return `<circle cx="30" cy="26" r="14" fill="${c.fur}"/>
              <circle cx="70" cy="26" r="14" fill="${c.fur}"/>`;
    default:
      return "";
  }
}

function fluffPath(cx, cy, r, bumps) {
  // 円のふちに山を並べて、もこもこに見せる
  let d = "";
  for (let i = 0; i < bumps; i++) {
    const a0 = (Math.PI * 2 * i) / bumps;
    const a1 = (Math.PI * 2 * (i + 1)) / bumps;
    const am = (a0 + a1) / 2;
    const out = r * 1.16;
    const x0 = cx + Math.cos(a0) * r, y0 = cy + Math.sin(a0) * r;
    const x1 = cx + Math.cos(a1) * r, y1 = cy + Math.sin(a1) * r;
    const xm = cx + Math.cos(am) * out, ym = cy + Math.sin(am) * out;
    d += (i === 0 ? `M${x0.toFixed(1)} ${y0.toFixed(1)}` : "") +
         ` Q${xm.toFixed(1)} ${ym.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return d + "Z";
}

/* opt.laugh: くすぐったいときの顔（目を閉じて口をあける）
   opt.gray:  まだ会っていない子（「みつけた」で影にする） */
function faceSvg(c, opt = {}) {
  const eyeY = c.ear === "frog" ? 26 : 52;
  const eyeX = c.ear === "frog" ? 20 : (c.eyeX || 14);
  const eyeR = c.eyeR || 5.5;
  const noseR = c.noseR || 5;
  const fur = opt.gray ? "#e2ded8" : c.fur;
  const earColor = opt.gray ? "#cfcac3" : c.earColor;
  const ink = opt.gray ? "#cfcac3" : "#5b4033";
  const mouthY = 76 + (noseR - 5);

  const face = c.fluffy
    ? `<path d="${fluffPath(50, 54, 35, 13)}" fill="${fur}" stroke="rgba(0,0,0,.10)" stroke-width="1.5"/>`
    : `<circle cx="50" cy="54" r="38" fill="${fur}" stroke="rgba(0,0,0,.10)" stroke-width="1.5"/>`;

  // 目。笑っているときは弧にする
  const eyes = opt.laugh
    ? `<path d="M${50 - eyeX - eyeR} ${eyeY + 2} Q${50 - eyeX} ${eyeY - eyeR - 2} ${50 - eyeX + eyeR} ${eyeY + 2}"
             stroke="#3d3d3d" stroke-width="3.2" fill="none" stroke-linecap="round"/>
       <path d="M${50 + eyeX - eyeR} ${eyeY + 2} Q${50 + eyeX} ${eyeY - eyeR - 2} ${50 + eyeX + eyeR} ${eyeY + 2}"
             stroke="#3d3d3d" stroke-width="3.2" fill="none" stroke-linecap="round"/>`
    : `${c.eyeR ? `<circle cx="${50 - eyeX}" cy="${eyeY}" r="${eyeR + 1.5}" fill="#fff"/>
       <circle cx="${50 + eyeX}" cy="${eyeY}" r="${eyeR + 1.5}" fill="#fff"/>` : ""}
       <circle cx="${50 - eyeX}" cy="${eyeY}" r="${eyeR}" fill="${opt.gray ? "#cfcac3" : "#3d3d3d"}"/>
       <circle cx="${50 + eyeX}" cy="${eyeY}" r="${eyeR}" fill="${opt.gray ? "#cfcac3" : c.patch ? "#fff" : "#3d3d3d"}"/>
       ${opt.gray ? "" : `<circle cx="${50 - eyeX + eyeR * 0.35}" cy="${eyeY - eyeR * 0.35}" r="${eyeR * 0.34}" fill="#fff"/>
       <circle cx="${50 + eyeX + eyeR * 0.35}" cy="${eyeY - eyeR * 0.35}" r="${eyeR * 0.34}" fill="#fff"/>`}`;

  // 口。笑っているときは大きくあける
  const mouth = opt.laugh
    ? `<path d="M37 ${mouthY - 2} Q50 ${mouthY + 16} 63 ${mouthY - 2} Z" fill="#8a4a4a"/>
       <ellipse cx="50" cy="${mouthY + 8}" rx="6" ry="4" fill="#ff8fab"/>`
    : `<path d="M38 ${mouthY} Q50 ${mouthY + 12} 62 ${mouthY}" stroke="${ink}" stroke-width="3.5"
             fill="none" stroke-linecap="round"/>`;

  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    ${ears({ ...c, earColor, fur })}
    ${face}
    ${c.patch && !opt.gray ? `<ellipse cx="${50 + (c.eyeX || 14) + 3}" cy="52" rx="13" ry="12" fill="${c.patch}"/>` : ""}
    ${c.muzzle && !opt.gray ? `<ellipse cx="50" cy="70" rx="21" ry="15" fill="${c.muzzle}"/>` : ""}
    ${eyes}
    <circle cx="26" cy="68" r="7" fill="#ff9db0" opacity="${opt.gray ? 0 : opt.laugh ? 0.7 : 0.45}"/>
    <circle cx="74" cy="68" r="7" fill="#ff9db0" opacity="${opt.gray ? 0 : opt.laugh ? 0.7 : 0.45}"/>
    <ellipse cx="50" cy="${64 + (noseR - 5) * 0.6}" rx="${noseR}" ry="${noseR * 0.82}"
             fill="${c.snout && !opt.gray ? "#f2a2b8" : ink}"/>
    ${opt.gray ? "" : `<ellipse cx="${50 - noseR * 0.3}" cy="${62 + (noseR - 5) * 0.6}" rx="${noseR * 0.22}"
             ry="${noseR * 0.16}" fill="#fff" opacity=".6"/>`}
    ${c.snout && !opt.gray ? `<ellipse cx="${50 - noseR * 0.38}" cy="${64 + (noseR - 5) * 0.6}" rx="${noseR * 0.16}"
             ry="${noseR * 0.26}" fill="#a8536e"/>
       <ellipse cx="${50 + noseR * 0.38}" cy="${64 + (noseR - 5) * 0.6}" rx="${noseR * 0.16}"
             ry="${noseR * 0.26}" fill="#a8536e"/>` : ""}
    ${mouth}
  </svg>`;
}

// ── 音 ────────────────────────────────────────────────────
let ac = null;
let bus = null; // 声と曲の出口。押し直したら、ここごと切って止める
let soundOn = localStorage.getItem("baa-sound") !== "off";

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
  freqs.forEach((f, i) => tone(f, i * 0.09, 0.34));
}

// くすぐったい笑い声のかわり。短い音を跳ねさせる
function giggle() {
  if (!audio()) return;
  const base = 700 + Math.random() * 200;
  for (let i = 0; i < 6; i++) {
    tone(base * (i % 2 ? 1.18 : 1), i * 0.075, 0.1, "sine", 0.18);
  }
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
  bp.frequency.value = kind === "ch" ? 3200 : 2200;
  bp.Q.value = 2;
  const dur = kind === "ch" ? 0.05 : 0.03;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(kind === "ch" ? 0.16 : 0.2, t + 0.008);
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

/* 曲を鳴らす。使うのは著作権の切れた民謡か、自作のものだけ。
   音源ファイルは持たないので、圏外でも鳴る。 */
function playTune(c, at = 0) {
  if (!c.tune) return 0;
  const beat = 0.34;
  let t = at;
  c.tune.forEach(([n, len]) => {
    const dur = beat * len;
    const f = noteFreq(n);
    tone(f, t, dur * 0.92, "triangle", 0.2);
    tone(f * 2, t, dur * 0.5, "sine", 0.05);
    t += dur;
  });
  return t - at;
}

function speak(c) {
  if (!c.voice) return 0;
  let at = 0;
  c.voice.forEach((seg) => {
    if (seg.gap) { at += seg.gap; return; }
    if (seg.burst) { at += burst(seg.burst, at); return; }
    at += vowel(seg, at, c.base || 300);
  });
  return at;
}

// 端末の読み上げは、日本語の声が入っていないと何も鳴らない。
// どの端末でも同じ声になるよう、自分で作った声だけを使う。
function cry(c) {
  if (!audio()) return 0;
  return speak(c);
}

// 「ばあ」と笑い声も、端末の読み上げに頼らず自分で作る
const VOICE_BAA    = { base: 330, voice: [{ burst: "b" }, { v: "a", d: 0.45, p0: 1.3, p1: 0.95 }] };
const VOICE_GIGGLE = { base: 540, voice: [
  { burst: "k" }, { v: "i", to: "a", d: 0.1, p0: 1.15 }, { gap: 0.04 },
  { v: "a", d: 0.1, p0: 1.05 }, { gap: 0.04 }, { v: "a", d: 0.12, p0: 1.1, p1: 0.95 }] };

function say(v) {
  if (!audio()) return 0;
  return speak(v);
}

// ── みつけた（会った子を端末の中だけに残す）────────────────────────
function seen() {
  try {
    return JSON.parse(localStorage.getItem("baa-seen") || "[]");
  } catch (_) {
    return [];
  }
}

function remember(name) {
  const list = seen();
  if (list.includes(name)) return false;
  list.push(name);
  try { localStorage.setItem("baa-seen", JSON.stringify(list)); } catch (_) {}
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
  word.textContent = first ? "はじめまして！" : "ばあ！";
  word.className = "";
  void word.offsetWidth;
  word.className = "show";

  document.body.classList.add("open");
  if (audio()) newBus(); // 続けて押されたとき、前の音を残さない
  beep(current.note);
  say(VOICE_BAA);
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

// 出ている顔をさわると、くすぐったがる
function tickle() {
  if (!current) return;
  chara.innerHTML = faceSvg(current, { laugh: true });
  chara.className = "";
  void chara.offsetWidth;
  chara.className = "tickle";
  word.textContent = "きゃはは";
  word.className = "";
  void word.offsetWidth;
  word.className = "show";
  if (audio()) newBus();
  giggle();
  say(VOICE_GIGGLE);
  sparkle(null, null, 8);
  if (navigator.vibrate) navigator.vibrate([12, 40, 12]);
  chara.addEventListener("animationend", () => {
    chara.innerHTML = faceSvg(current);
    chara.className = "wobble";
    word.textContent = "ばあ！";
  }, { once: true });
}

function hitFace(e) {
  const r = chara.getBoundingClientRect();
  return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
}

// ── おとモード（たたくと音が鳴る）──────────────────────────────
// 5音だけ使うので、どこを押しても外れて聞こえない
const PAD_NOTES = [523, 587, 659, 784, 880, 1046, 392, 440, 494];
const PAD_COLORS = ["#ff8fab", "#ffd166", "#8ec5ff", "#a8e6a3", "#c9a7ff",
                    "#ffb37a", "#7fd8d8", "#ffa3d1", "#b6e07a"];

let zoomTimer = null;
let walkTimer = null;
let noteTimer = null;

/* 押した子を大きく出す → 鳴く → そのまま短いおはなし（曲＋歩く）。
   もう一度どこかを押すと、前の音を切って新しい子に替わる。 */
function showZoom(c) {
  zoom.innerHTML = `<div class="zoomface"><div class="bob">${faceSvg(c)}</div></div>`;
  zoom.className = "";
  void zoom.offsetWidth; // アニメを最初から流し直す
  zoom.className = "on";
  clearTimeout(zoomTimer);
  clearTimeout(walkTimer);
  clearInterval(noteTimer);

  if (!audio()) {
    zoomTimer = setTimeout(() => { zoom.className = ""; }, 1100);
    return;
  }

  newBus();                       // 前に鳴っていた音を切る
  const cryLen = speak(c);        // 鳴き声
  const tuneLen = playTune(c, cryLen + 0.25);  // そのあとに曲

  const face = zoom.querySelector(".zoomface");
  walkTimer = setTimeout(() => {
    if (!face.isConnected) return;
    face.style.animationDuration = "4s";
    face.style.animationIterationCount = String(Math.max(1, Math.round(tuneLen / 4)));
    face.classList.add("walk");
    // 曲に合わせて、音符のかわりの玉を飛ばす
    noteTimer = setInterval(() => sparkle(null, window.innerHeight * 0.62, 3), 340);
  }, (cryLen + 0.25) * 1000);

  zoomTimer = setTimeout(() => {
    zoom.className = "";
    clearInterval(noteTimer);
  }, (cryLen + 0.35 + tuneLen) * 1000);
}

function buildPads() {
  pads.innerHTML = "";
  PAD_NOTES.forEach((f, i) => {
    const b = document.createElement("button");
    b.className = "pad";
    b.type = "button";
    b.style.background = PAD_COLORS[i];
    b.setAttribute("aria-label", "おと");
    const c = CHARAS[i % CHARAS.length];
    b.innerHTML = `<div class="padface">${faceSvg(c)}</div>`;
    b.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      // 先に showZoom。ここで音の出口を作り直すので、太鼓の音はそのあとに出す
      // （逆にすると、出したそばから自分で切ってしまう）
      showZoom(c);
      if (audio()) {
        tone(f, 0, 0.5, "triangle", 0.26);
        tone(f * 2, 0, 0.22, "sine", 0.08);
      }
      b.classList.remove("hit");
      void b.offsetWidth;
      b.classList.add("hit");
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
    `</div><p class="note">さわると とじます</p>`;
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

sndBtn.textContent = soundOn ? "♪" : "×";
sndBtn.addEventListener("pointerdown", (e) => {
  e.stopPropagation();
  soundOn = !soundOn;
  localStorage.setItem("baa-sound", soundOn ? "on" : "off");
  sndBtn.textContent = soundOn ? "♪" : "×";
  if (soundOn) beep([523, 784]);
});

modeBtn.addEventListener("pointerdown", (e) => {
  e.stopPropagation();
  setMode(mode === "baa" ? "drum" : "baa");
});

bookBtn.addEventListener("pointerdown", (e) => {
  e.stopPropagation();
  if (document.body.classList.contains("book")) closeBook();
  else openBook();
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
