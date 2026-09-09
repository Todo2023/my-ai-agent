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
const VERSION = "23"; // みつけたの下に出す。どの版が動いているかを確かめるため

const CHARAS = [
  { name: "いぬ",   wag: true, fur: "#fbf8f2", ear: "drop",  earColor: "#d8c6a8", note: [523, 659, 784],
    fluffy: true, eyeR: 9, eyeX: 17, noseR: 8,
    cry: "わんわん", base: 300, voice: [
      { v: "u", to: "a", d: 0.17, p0: 1.15, p1: 0.95 }, { v: "n", d: 0.11, p0: 0.9 }, { gap: 0.06 },
      { v: "u", to: "a", d: 0.17, p0: 1.1, p1: 0.9 },   { v: "n", d: 0.13, p0: 0.85 }],
    tuneName: "じぶんの うた（自作）",
    tune: [["C4",1],["E4",1],["G4",1],["E4",1],["C4",1],["G4",1],["C5",2],
      ["A4",1],["G4",1],["E4",1],["G4",1],["A4",1],["G4",1],["E4",2],
      ["G4",1],["G4",1],["E4",1],["E4",1],["D4",1],["D4",1],["C4",2],
      ["C4",1],["E4",1],["G4",1],["C5",1],["G4",1],["E4",1],["C4",2]] },

  { name: "ねこ",   fur: "#b9c9ff", ear: "up",    earColor: "#8fa4e8", whiskers: "#7d8bb5", note: [587, 740, 880],
    cry: "にゃーん", base: 430, voice: [
      { v: "i", to: "a", d: 0.32, p0: 1.15, p1: 0.95 }, { v: "n", d: 0.16, p0: 0.88 }],
    tuneName: "じぶんの うた（自作）",
    tune: [["E4",1],["G4",1],["A4",1],["G4",1],["E4",1],["D4",1],["C4",2],
      ["D4",1],["E4",1],["G4",1],["E4",1],["D4",1],["C4",1],["D4",2],
      ["G4",1],["A4",1],["G4",1],["E4",1],["D4",1],["E4",1],["C4",2],
      ["E4",1],["G4",1],["A4",1],["G4",1],["E4",1],["D4",1],["C4",2]] },

  { name: "ぶた",   fur: "#ffc2d4", ear: "up",    earColor: "#f299b4", note: [392, 494, 587],
    noseR: 11, snout: true,
    cry: "ぶーぶー", base: 190, voice: [
      { burst: "b" }, { v: "u", d: 0.24, p0: 1.0, p1: 0.9 }, { gap: 0.07 },
      { burst: "b" }, { v: "u", d: 0.26, p0: 0.98, p1: 0.86 }],
    tuneName: "むすんでひらいて（ルソー・PD）",
    tune: [["G4",1],["E4",1],["G4",1],["A4",1],["G4",1],["E4",1],["D4",1],["C4",2],
      ["E4",1],["D4",1],["E4",1],["F4",1],["E4",1],["D4",1],["C4",1],["C4",2],
      ["G4",1],["G4",1],["A4",1],["A4",1],["G4",1],["G4",1],["E4",2],
      ["E4",1],["D4",1],["C4",1],["D4",1],["E4",1],["E4",1],["C4",2]] },

  { name: "くま",   fur: "#c69c7b", ear: "round", earColor: "#a67e5f", note: [440, 554, 659],
    muzzle: "#e8cdb4",
    cry: "がおー", base: 150, voice: [
      { burst: "b" }, { v: "a", d: 0.22, p0: 1.05, p1: 0.98 }, { v: "o", d: 0.4, p0: 0.98, p1: 0.8 }],
    tuneName: "森のくまさん（アメリカ民謡・PD）",
    tune: [["C4",1],["E4",1],["G4",1],["G4",1],["A4",1],["G4",1],["E4",1],["C4",2],
      ["D4",1],["E4",1],["F4",1],["E4",1],["D4",1],["C4",1],["D4",1],["C4",2],
      ["G4",1],["G4",1],["A4",1],["A4",1],["G4",1],["G4",1],["E4",2],
      ["C4",1],["E4",1],["G4",1],["E4",1],["D4",1],["C4",2]] },

  { name: "ねずみ", encore: 0, fur: "#dcdce6", whiskers: "#a9a5b3", ear: "round", earColor: "#c6c6d4", innerEar: "#ffc7db",
    earR: 16, earX: 21, earY: 20, note: [494, 622, 740],
    cry: "ちゅーちゅー", base: 620, voice: [
      { burst: "ch" }, { v: "u", d: 0.16, p0: 1.05, p1: 1.2 }, { gap: 0.06 },
      { burst: "ch" }, { v: "u", d: 0.16, p0: 1.05, p1: 1.25 }],
    tuneName: "きらきら星（フランス民謡・PD）",
    tune: [["C5",1],["C5",1],["G5",1],["G5",1],["A5",1],["A5",1],["G5",2],
      ["F5",1],["F5",1],["E5",1],["E5",1],["D5",1],["D5",1],["C5",2],
      ["G5",1],["G5",1],["F5",1],["F5",1],["E5",1],["E5",1],["D5",2],
      ["G5",1],["G5",1],["F5",1],["F5",1],["E5",1],["E5",1],["D5",2],
      ["C5",1],["C5",1],["G5",1],["G5",1],["A5",1],["A5",1],["G5",2],
      ["F5",1],["F5",1],["E5",1],["E5",1],["D5",1],["D5",1],["C5",2]] },

  { name: "ちょうちょ", fur: "#f7b6d2", ear: "antenna", earColor: "#5b4033",
    wing: "#ffe066", wing2: "#ff9ec7", note: [698, 880, 1046],
    cry: "ひらひら", base: 700, voice: [
      { burst: "air" }, { gap: 0.09 }, { burst: "air" }, { gap: 0.09 }, { burst: "air" }],
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
      ["A4",1],["A4",1],["A4",1],["A4",1],["G4",1],["F4",1],["G4",1],["A4",1],["F4",2],
      ["C5",1],["C5",1],["A4",1],["A4",1],["F4",1],["F4",1],["G4",1],["A4",1],["F4",2]] },

  { name: "ひつじ", fur: "#5b5148", ear: "drop",  earColor: "#4a4238", wool: "#faf5e9",
    note: [330, 415, 494],
    cry: "めえめえ", base: 320, voice: [
      { v: "n", d: 0.05 }, { v: "e", d: 0.3, p0: 1.05, p1: 0.92 }, { gap: 0.07 },
      { v: "n", d: 0.05 }, { v: "e", d: 0.34, p0: 1.02, p1: 0.88 }],
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
    case "antenna": // ちょうちょの触角
      return `<path d="M40 26 Q32 8 22 4" stroke="${e}" stroke-width="3" fill="none" stroke-linecap="round"/>
              <path d="M60 26 Q68 8 78 4" stroke="${e}" stroke-width="3" fill="none" stroke-linecap="round"/>
              <circle cx="22" cy="4" r="4" fill="${e}"/><circle cx="78" cy="4" r="4" fill="${e}"/>`;
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
function faceInner(c, opt = {}) {
  const eyeY = c.ear === "frog" ? 26 : 52;
  const eyeX = c.ear === "frog" ? 20 : (c.eyeX || 14);
  const eyeR = c.eyeR || 5.5;
  const noseR = c.noseR || 5;
  const fur = opt.gray ? "#e2ded8" : c.fur;
  const earColor = opt.gray ? "#cfcac3" : c.earColor;
  const ink = opt.gray ? "#cfcac3" : "#5b4033";
  const mouthY = 76 + (noseR - 5);

  const wool = c.wool && !opt.gray
    ? `<path d="${fluffPath(50, 54, 40, 15)}" fill="${c.wool}" stroke="rgba(0,0,0,.08)" stroke-width="1.5"/>`
    : "";
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

  return `${wool}${ears({ ...c, earColor, fur })}
    ${c.wool && !opt.gray ? `<circle cx="50" cy="58" r="26" fill="${c.fur}"/>` : face}
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
    ${c.whiskers && !opt.gray ? `<g stroke="${c.whiskers}" stroke-width="1.6" stroke-linecap="round" fill="none">
       <path d="M40 ${mouthY - 6} L18 ${mouthY - 11}"/><path d="M40 ${mouthY - 2} L16 ${mouthY - 2}"/>
       <path d="M40 ${mouthY + 2} L18 ${mouthY + 7}"/>
       <path d="M60 ${mouthY - 6} L82 ${mouthY - 11}"/><path d="M60 ${mouthY - 2} L84 ${mouthY - 2}"/>
       <path d="M60 ${mouthY + 2} L82 ${mouthY + 7}"/></g>` : ""}
    ${mouth}`;
}

function faceSvg(c, opt = {}) {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    ${faceInner(c, opt)}
  </svg>`;
}

/* 全身。クローズアップのときだけ使う。
   体と足を描いて、その上に顔を載せる。足は歩くときに前後に振る。 */
function bodySvg(c) {
  const leg = (x, cls) =>
    `<rect class="${cls}" x="${x}" y="96" width="13" height="26" rx="6" fill="${c.earColor || c.fur}"/>`;
  const tail = c.ear === "frog"
    ? ""
    : `<g class="tail${c.wag ? " wag" : ""}"><path d="M92 84 Q106 78 102 64"
             stroke="${c.earColor || c.fur}" stroke-width="7"
             fill="none" stroke-linecap="round"/></g>`;

  if (c.wing) {
    return `<svg viewBox="0 0 120 132" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g class="wingL"><ellipse cx="26" cy="80" rx="26" ry="30" fill="${c.wing}"/>
        <ellipse cx="24" cy="104" rx="18" ry="18" fill="${c.wing2}"/></g>
      <g class="wingR"><ellipse cx="94" cy="80" rx="26" ry="30" fill="${c.wing}"/>
        <ellipse cx="96" cy="104" rx="18" ry="18" fill="${c.wing2}"/></g>
      <ellipse cx="60" cy="92" rx="13" ry="30" fill="${c.fur}" stroke="rgba(0,0,0,.10)" stroke-width="1.5"/>
      <g transform="translate(20,-6) scale(0.8)">${faceInner(c)}</g>
    </svg>`;
  }

  return `<svg viewBox="0 0 120 132" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    ${leg(28, "legB")}
    ${leg(79, "legA")}
    ${tail}
    ${c.wool
      ? `<path d="${fluffPath(60, 88, 30, 14)}" fill="${c.wool}" stroke="rgba(0,0,0,.08)" stroke-width="1.5"/>`
      : `<ellipse cx="60" cy="88" rx="33" ry="27" fill="${c.fur}" stroke="rgba(0,0,0,.10)" stroke-width="1.5"/>`}
    ${c.wool ? "" : `<ellipse cx="60" cy="95" rx="19" ry="16" fill="${c.muzzle || "rgba(255,255,255,.35)"}"/>`}
    ${leg(38, "legA")}
    ${leg(69, "legB")}
    <g transform="translate(20,-4) scale(0.8)">${faceInner(c)}</g>
  </svg>`;
}

// ── 音 ────────────────────────────────────────────────────
let ac = null;
let bus = null; // 声と曲の出口。押し直したら、ここごと切って止める
let soundOn = localStorage.getItem("baa-sound") !== "off";

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

let instIdx = Number(localStorage.getItem("baa-inst") || 0) % INSTRUMENTS.length;

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
  // いぬ／自作の行進曲 → 昼の草原
  いぬ:     { sky: "#8fd3ff,#cceeff,#eaf8ff", ground: "#7ec97a", edge: "#6bbd67",
              hills: ["#8fd08a", "#a8e6a3"], sun: "#ffe066", clouds: 3, flowers: 7,
              birds: 3, mountains: true, bushes: 3, stones: 2 },

  // ねこ／自作のしずかな曲 → 夕方
  ねこ:     { sky: "#ff8f6b,#ffb87a,#ffe3b0", ground: "#8c5a44", edge: "#714735",
              hills: ["#a9654c", "#c07a5c"], sun: "#ff9d5c", clouds: 3, flowers: 4,
              birds: 4, mountains: true, house: "#8a5a4a", bushes: 2 },

  // ぶた／むすんでひらいて → のうじょう
  ぶた:     { sky: "#ffd9a8,#ffeccd,#fff6e6", ground: "#c8925f", edge: "#ab7a4c",
              hills: ["#9fbf76", "#b9d38f"], sun: "#ffcf5c", clouds: 2, fence: true, flowers: 3,
              house: "#c9705a", birds: 2, bushes: 2, stones: 3 },

  // くま／森のくまさん → 森
  くま:     { sky: "#bfe4ff,#d8f0ff,#eaf8ff", ground: "#5faa5c", edge: "#4e9450",
              trees: 6, sun: "#ffe066", clouds: 2, flowers: 3,
              mushrooms: 4, birds: 2, bushes: 3 },

  // ねずみ／きらきら星 → 夜。星がまたたく
  ねずみ:   { sky: "#161d44,#2b3566,#4a4f86", ground: "#3a4470", edge: "#2f3860",
              hills: ["#2b3560", "#333d6b"], moon: true, stars: 26, clouds: 1, flowers: 3,
              fireflies: 9, shooting: true, house: "#2f3860", bushes: 2 },

  // ちょうちょ／ちょうちょう → お花ばたけ
  ちょうちょ: { sky: "#cdf0ff,#e4f8ff,#f4fcff", ground: "#8fd88a", edge: "#7cc877",
              hills: ["#a8e6a3", "#c4f0c0"], sun: "#ffe066", clouds: 2, flowers: 18,
              flyers: 4, birds: 2, bushes: 2 },

  // さる／大きな栗の木の下で → 大きな木の下。木の実が落ちている
  さる:     { sky: "#bfe9ff,#dcf4ff,#eefaff", ground: "#6fbf68", edge: "#5aa957",
              hills: ["#8fd08a", "#a8e6a3"], bigTree: true, sun: "#ffe066", clouds: 2,
              nuts: 5, birds: 2, bushes: 2, flowers: 3 },

  // ひつじ／メリーさんのひつじ → まきば
  ひつじ:   { sky: "#cdeaff,#e2f4ff,#f2fbff", ground: "#93d68c", edge: "#7cc877",
              hills: ["#b6e5a0", "#d5f0bd"], sun: "#ffe066", clouds: 4, fence: true, flowers: 6,
              house: "#e8b06a", mountains: true, birds: 3, bushes: 3, stones: 2 },

  // かえる／かえるの合唱 → 雨のいけ
  かえる:   { sky: "#93b6c7,#b5d2dd,#d7e9ef", ground: "#6fb7c9", edge: "#589eb0",
              hills: ["#6fa06a", "#87b47f"], clouds: 3, gray: true, rain: true, lily: true,
              flowers: 2, rainbow: true, ripples: 3, bushes: 2 },
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
    speak(c);                     // 鳴き声
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
    localStorage.setItem("baa-sound", soundOn ? "on" : "off");
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
  localStorage.setItem("baa-inst", String(instIdx));
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
