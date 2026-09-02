/**
 * 絵の部品
 *
 * 絵本の絵を、共通の部品を組み合わせて作る。1枚ずつ手で描くより
 * **絵柄が揃う**のが利点。1冊だけなら手描きでよいが、10冊並べると
 * 揃っていないほうが目立つ。
 *
 * 使いかたは _make-books.mjs を見ること。
 *
 * 決めごと
 *   - 画面は 1600 x 1000（16:10）。ビューアがこの比で並べる
 *   - 色は少なくする。子どもの絵本は色数が多いと散らかって見える
 *   - 線は太く、角は丸く。小さい画面で見るため
 */

const W = 1600, H = 1000;

/** 同じ入力からは必ず同じ絵が出るようにする（作り直しても差分が出ない） */
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/* ── 空・地面 ────────────────────────────────── */

const SKIES = {
  night: ["#141d3a", "#2b3a63"],
  dawn:  ["#48507e", "#f2c98a"],
  day:   ["#9ed2e6", "#dcefe4"],
  dusk:  ["#6b4a72", "#e2915f"],
  sea:   ["#8fd0dd", "#2f7f95"],
  snow:  ["#c9d8e6", "#eef4f8"],
  room:  ["#3a2c20", "#5b4636"],
  forest:["#bfe0c2", "#7fae86"],
  rain:  ["#9aa9b8", "#c8d3dc"],
  spring:["#cfe6f2", "#f7e4ea"],
  autumn:["#e8b989", "#f3ddc0"],
  deep:  ["#1c4a5e", "#0d2a38"],
};

export function bg(kind = "day") {
  const [a, b] = SKIES[kind] || SKIES.day;
  return `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
<radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
<stop offset="0" stop-color="#ffe9b0" stop-opacity=".8"/><stop offset="1" stop-color="#ffe9b0" stop-opacity="0"/></radialGradient>
</defs><rect width="${W}" height="${H}" fill="url(#sky)"/>`;
}

export const stars = (seed = 1, n = 14) => {
  const r = rng(seed);
  let out = '<g fill="#fff" opacity=".85">';
  for (let i = 0; i < n; i++) {
    out += `<circle cx="${(r() * W) | 0}" cy="${(r() * 520) | 0}" r="${(r() * 2 + 1.5).toFixed(1)}"/>`;
  }
  return `${out}</g>`;
};

export const moon = (x = 1280, y = 220, rad = 90) =>
  `<circle cx="${x}" cy="${y}" r="${rad * 2.4}" fill="url(#glow)"/><circle cx="${x}" cy="${y}" r="${rad}" fill="#ffe9b0"/>`;

export const sun = (x = 300, y = 200, rad = 96) =>
  `<circle cx="${x}" cy="${y}" r="${rad * 2.2}" fill="url(#glow)"/><circle cx="${x}" cy="${y}" r="${rad}" fill="#ffd257"/>`;

export const ground = (y = 800, fill = "#8fae74") =>
  `<path d="M0 ${y} Q400 ${y - 60} 800 ${y - 10} T1600 ${y - 40} L1600 ${H} L0 ${H} Z" fill="${fill}"/>`;

export const hills = (fill = "#6f9a78", y = 760) =>
  `<path d="M-50 ${y + 80} Q250 ${y - 120} 600 ${y + 40} T1250 ${y - 20} T1700 ${y + 90} L1700 ${H} L-50 ${H} Z" fill="${fill}"/>`;

export const waves = (y = 720, fill = "#2f7f95") =>
  `<path d="M0 ${y} q100 -40 200 0 t200 0 t200 0 t200 0 t200 0 t200 0 t200 0 t200 0 L1600 ${H} L0 ${H} Z" fill="${fill}"/>`;

export const snowfall = (seed = 3, n = 40) => {
  const r = rng(seed);
  let out = '<g fill="#fff" stroke="#b9cbdb" stroke-width="2" opacity=".95">';
  for (let i = 0; i < n; i++) {
    out += `<circle cx="${(r() * W) | 0}" cy="${(r() * H) | 0}" r="${(r() * 7 + 5).toFixed(1)}"/>`;
  }
  return `${out}</g>`;
};

export const rainfall = (seed = 4, n = 45) => {
  const r = rng(seed);
  let out = '<g stroke="#7fa8c4" stroke-width="7" stroke-linecap="round" opacity=".85">';
  for (let i = 0; i < n; i++) {
    const x = (r() * W) | 0, y = (r() * 700) | 0;
    out += `<line x1="${x}" y1="${y}" x2="${x - 14}" y2="${y + 46}"/>`;
  }
  return `${out}</g>`;
};


/* ── 置きかた ────────────────────────────────── */
//
// いきものは「頭のまんなか」を原点に描いてある。地面に立たせるには、
// 体の高さぶん上に置く必要がある。毎回それを手で計算すると必ずずれるので、
// 地面の高さから逆算する関数にしてある。
//
// 絵本は**被写体を大きく**するほうがよい。余白が多いと、小さい画面で
// 何の絵なのか分からなくなる。倍率は 1.4 以上を目安にする。

/** 地面 g に立つ、いきものの原点 */
export const stand = (g, s) => g - 172 * s;
/** 地面 g に立つ、子どもの原点 */
export const standChild = (g, s) => g - 214 * s;

/** 雪や砂の上の足あと */
export const tracks = (y, from = 300, to = 1300, n = 6, fill = "#b9cbdb", s = 1) => {
  let out = `<g fill="${fill}">`;
  for (let i = 0; i < n; i++) {
    const x = from + ((to - from) * i) / (n - 1);
    const dy = i % 2 ? -18 * s : 18 * s;
    out += `<ellipse cx="${x | 0}" cy="${(y + dy) | 0}" rx="${28 * s}" ry="${18 * s}"/>`;
  }
  return `${out}</g>`;
};

/** 水たまり */
export const puddle = (x, y, rx = 240, ry = 66) =>
  `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#9ec9dd"/>`;

/** 本だな */
export const shelf = (y, from = 100, to = 1500) =>
  `<rect x="${from}" y="${y}" width="${to - from}" height="26" rx="8" fill="#7d5a3c"/>`;

/* ── 建物・もの ──────────────────────────────── */

export const house = (x = 800, y = 760, s = 1, wall = "#f0e2cc", roof = "#c76a4c", lit = true) => `
<g transform="translate(${x} ${y}) scale(${s}) translate(-800 -760)">
  <rect x="620" y="440" width="360" height="320" rx="14" fill="${wall}"/>
  <path d="M580 450 L800 310 L1020 450 Z" fill="${roof}"/>
  <rect x="672" y="520" width="120" height="100" rx="8" fill="${lit ? "#ffd98a" : "#8fa0b5"}"/>
  <rect x="816" y="520" width="120" height="100" rx="8" fill="${lit ? "#ffd98a" : "#8fa0b5"}"/>
  <rect x="756" y="660" width="92" height="100" rx="6" fill="#8a5a3b"/>
</g>`;

export const tree = (x, y, s = 1, leaf = "#4f8b5a") => `
<g transform="translate(${x} ${y}) scale(${s})">
  <rect x="-16" y="-90" width="32" height="96" rx="10" fill="#7d5a3c"/>
  <circle cx="0" cy="-140" r="80" fill="${leaf}"/>
  <circle cx="-58" cy="-96" r="52" fill="${leaf}"/>
  <circle cx="58" cy="-96" r="52" fill="${leaf}"/>
</g>`;

export const forest = (seed = 5, y = 780, n = 7) => {
  const r = rng(seed);
  let out = "";
  for (let i = 0; i < n; i++) {
    const x = 80 + (i * (W - 160)) / (n - 1) + (r() * 60 - 30);
    out += tree(x, y - r() * 50, 0.7 + r() * 0.5, r() > 0.5 ? "#4f8b5a" : "#3f7a52");
  }
  return out;
};

export const umbrella = (x, y, s = 1, color = "#d9524a") => `
<g transform="translate(${x} ${y}) scale(${s})">
  <path d="M-140 0 A140 140 0 0 1 140 0 Z" fill="${color}"/>
  <path d="M-140 0 q35 34 70 0 q35 34 70 0 q35 34 70 0" fill="${color}"/>
  <rect x="-7" y="0" width="14" height="150" rx="7" fill="#7d5a3c"/>
  <path d="M7 150 q0 34 -34 34" stroke="#7d5a3c" stroke-width="14" fill="none" stroke-linecap="round"/>
</g>`;

export const rainbow = (x = 800, y = 820, s = 1) => {
  const cols = ["#e2645a", "#eaa14e", "#efd469", "#79b96a", "#5aa7d6", "#8f7ac4"];
  return `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke-width="34">${
    cols.map((c, i) => `<path d="M-${420 - i * 34} 0 A${420 - i * 34} ${420 - i * 34} 0 0 1 ${420 - i * 34} 0" stroke="${c}"/>`).join("")
  }</g>`;
};

export const book = (x, y, s = 1, cover = "#c25b3a") => `
<g transform="translate(${x} ${y}) scale(${s})">
  <path d="M-110 -70 Q-55 -96 0 -70 L0 70 Q-55 44 -110 70 Z" fill="#fffaf2" stroke="${cover}" stroke-width="12" stroke-linejoin="round"/>
  <path d="M110 -70 Q55 -96 0 -70 L0 70 Q55 44 110 70 Z" fill="#fffaf2" stroke="${cover}" stroke-width="12" stroke-linejoin="round"/>
</g>`;

export const envelope = (x, y, s = 1) => `
<g transform="translate(${x} ${y}) scale(${s})">
  <rect x="-90" y="-60" width="180" height="120" rx="10" fill="#fffaf2" stroke="#c9b79a" stroke-width="8"/>
  <path d="M-90 -60 L0 10 L90 -60" fill="none" stroke="#c9b79a" stroke-width="8" stroke-linecap="round"/>
</g>`;

export const lamp = (x, y, s = 1) => `
<g transform="translate(${x} ${y}) scale(${s})">
  <circle cx="0" cy="0" r="150" fill="url(#glow)"/>
  <path d="M-46 -30 L46 -30 L30 40 L-30 40 Z" fill="#ffd98a" stroke="#c9964a" stroke-width="8" stroke-linejoin="round"/>
  <rect x="-8" y="-80" width="16" height="50" rx="8" fill="#7d5a3c"/>
</g>`;

export const seed = (x, y, s = 1, rot = 0) => `
<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
  <ellipse cx="0" cy="0" rx="18" ry="26" fill="#c9964a"/>
  <g stroke="#f2e3c8" stroke-width="6" stroke-linecap="round" fill="none">
    <path d="M0 -26 q-40 -30 -70 -16"/><path d="M0 -26 q-16 -44 6 -66"/><path d="M0 -26 q40 -26 70 -8"/>
  </g>
</g>`;

export const radio = (x, y, s = 1) => `
<g transform="translate(${x} ${y}) scale(${s})">
  <rect x="-130" y="-80" width="260" height="160" rx="18" fill="#a86a41" stroke="#7d4d2c" stroke-width="10"/>
  <circle cx="-55" cy="0" r="48" fill="#f2e3c8"/>
  <circle cx="-55" cy="0" r="30" fill="#7d4d2c" opacity=".35"/>
  <circle cx="66" cy="-26" r="16" fill="#f2e3c8"/><circle cx="66" cy="28" r="16" fill="#f2e3c8"/>
  <path d="M100 -80 L150 -170" stroke="#7d4d2c" stroke-width="10" stroke-linecap="round"/>
</g>`;

/* ── いきもの ────────────────────────────────── */

const EYE = (x, y, r = 9) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#241812"/>`;

/**
 * 動物。丸だけで作る。
 * kind で耳の形と体つきが変わる。色を変えれば別の子になる
 */
export function animal(kind, x, y, s = 1, color = "#8a5a3b") {
  const belly = "#f2e3c8";
  const ears = {
    bear:   `<circle cx="-46" cy="-52" r="30" fill="${color}"/><circle cx="46" cy="-52" r="30" fill="${color}"/>`,
    mouse:  `<circle cx="-46" cy="-46" r="34" fill="${color}"/><circle cx="46" cy="-46" r="34" fill="${color}"/>
             <circle cx="-46" cy="-46" r="18" fill="#e4b9bd"/><circle cx="46" cy="-46" r="18" fill="#e4b9bd"/>`,
    cat:    `<path d="M-62 -34 L-52 -92 L-16 -56 Z" fill="${color}"/><path d="M62 -34 L52 -92 L16 -56 Z" fill="${color}"/>`,
    rabbit: `<ellipse cx="-30" cy="-96" rx="18" ry="58" fill="${color}"/><ellipse cx="30" cy="-96" rx="18" ry="58" fill="${color}"/>
             <ellipse cx="-30" cy="-96" rx="9" ry="42" fill="#e4b9bd"/><ellipse cx="30" cy="-96" rx="9" ry="42" fill="#e4b9bd"/>`,
    fox:    `<path d="M-60 -32 L-54 -94 L-14 -58 Z" fill="${color}"/><path d="M60 -32 L54 -94 L14 -58 Z" fill="${color}"/>`,
    dog:    `<ellipse cx="-84" cy="-6" rx="28" ry="56" fill="${color}"/><ellipse cx="84" cy="-6" rx="28" ry="56" fill="${color}"/>`,
    sheep:  `<circle cx="-58" cy="-40" r="26" fill="#f2e3c8"/><circle cx="58" cy="-40" r="26" fill="#f2e3c8"/>
             <circle cx="-30" cy="-64" r="30" fill="#f2e3c8"/><circle cx="30" cy="-64" r="30" fill="#f2e3c8"/>
             <circle cx="0" cy="-74" r="30" fill="#f2e3c8"/>`,
    frog:   `<circle cx="-44" cy="-82" r="32" fill="${color}"/><circle cx="44" cy="-82" r="32" fill="${color}"/>
             <circle cx="-44" cy="-86" r="14" fill="#241812"/><circle cx="44" cy="-86" r="14" fill="#241812"/>`,
    bird:   "",
  }[kind] ?? "";

  const body = kind === "bird"
    ? `<ellipse cx="0" cy="46" rx="66" ry="56" fill="${color}"/>
       <path d="M-66 40 q-60 6 -86 42 q56 12 90 -14 Z" fill="${color}"/>
       <path d="M0 -6 l34 22 l-34 16 Z" fill="#e8a33c"/>`
    : `<ellipse cx="0" cy="96" rx="86" ry="76" fill="${color}"/>
       <ellipse cx="0" cy="112" rx="52" ry="50" fill="${belly}"/>`;

  const face = kind === "bird"
    ? `${EYE(-18, -8, 8)}${EYE(18, -8, 8)}`
    : `${EYE(-24, 4, 10)}${EYE(24, 4, 10)}
       <ellipse cx="0" cy="40" rx="28" ry="20" fill="${belly}"/>
       <circle cx="0" cy="32" r="8" fill="#241812"/>`;

  return `<g transform="translate(${x} ${y}) scale(${s})">
    ${body}${ears}<circle cx="0" cy="0" r="${kind === "bird" ? 46 : 72}" fill="${color}"/>${face}
  </g>`;
}

/** 魚。海の話で使う */
export const fish = (x, y, s = 1, color = "#e8a33c") => `
<g transform="translate(${x} ${y}) scale(${s})">
  <ellipse cx="0" cy="0" rx="70" ry="44" fill="${color}"/>
  <path d="M64 0 l52 -34 l0 68 Z" fill="${color}"/>
  ${EYE(-28, -10, 8)}
</g>`;

/** 子ども。頭・体・手足だけ */
export const child = (x, y, s = 1, clothes = "#d9524a", skin = "#f0c9a8") => `
<g transform="translate(${x} ${y}) scale(${s})">
  <path d="M-44 30 L44 30 L54 150 L-54 150 Z" fill="${clothes}"/>
  <rect x="-46" y="150" width="34" height="60" rx="16" fill="${skin}"/>
  <rect x="12" y="150" width="34" height="60" rx="16" fill="${skin}"/>
  <circle cx="0" cy="-24" r="62" fill="${skin}"/>
  <path d="M-62 -34 a62 62 0 0 1 124 0 q-62 -34 -124 0 Z" fill="#3d2b22"/>
  ${EYE(-22, -16, 8)}${EYE(22, -16, 8)}
  <path d="M-14 6 q14 12 28 0" stroke="#b9705c" stroke-width="6" fill="none" stroke-linecap="round"/>
</g>`;

/* ── 足した部品（2026-08-18） ────────────────────
   50冊に増やすにあたって足したぶん。10冊のときは足りていたが、
   同じ部品ばかりだと「使い回し」に見えるので種類を増やした      */

export const cloud = (x, y, s = 1, fill = "#fffaf2") => `
<g transform="translate(${x} ${y}) scale(${s})" fill="${fill}">
  <ellipse cx="0" cy="0" rx="120" ry="52"/><circle cx="-56" cy="-16" r="46"/><circle cx="44" cy="-24" r="56"/>
</g>`;

export const clouds = (seed = 7, n = 3, y = 220) => {
  const r = rng(seed);
  let out = "";
  for (let i = 0; i < n; i++) {
    out += cloud(140 + (i * (W - 280)) / Math.max(1, n - 1) + r() * 120 - 60, y + r() * 140 - 70, 0.7 + r() * 0.6);
  }
  return out;
};

export const mountain = (fill = "#8f9bb0", y = 720) =>
  `<path d="M-100 ${y + 200} L340 ${y - 260} L640 ${y + 60} L940 ${y - 200} L1340 ${y + 120} L1700 ${y - 60} L1700 ${H} L-100 ${H} Z" fill="${fill}"/>`;

export const flower = (x, y, s = 1, color = "#e2645a") => `
<g transform="translate(${x} ${y}) scale(${s})">
  <rect x="-5" y="0" width="10" height="90" rx="5" fill="#5f8f57"/>
  <path d="M-34 6 q22 22 34 0" stroke="#5f8f57" stroke-width="9" fill="none" stroke-linecap="round"/>
  <g fill="${color}"><circle cx="0" cy="-30" r="22"/><circle cx="-28" cy="-8" r="22"/><circle cx="28" cy="-8" r="22"/>
  <circle cx="-17" cy="24" r="22"/><circle cx="17" cy="24" r="22"/></g>
  <circle cx="0" cy="0" r="16" fill="#f2d06b"/>
</g>`;

export const flowers = (seed = 8, y = 880, n = 7) => {
  const r = rng(seed);
  const cols = ["#e2645a", "#f2d06b", "#e08fb0", "#fffaf2"];
  let out = "";
  for (let i = 0; i < n; i++) {
    out += flower(60 + (i * (W - 120)) / Math.max(1, n - 1) + r() * 70 - 35, y - r() * 40, 0.7 + r() * 0.7, cols[(r() * cols.length) | 0]);
  }
  return out;
};

export const butterfly = (x, y, s = 1, color = "#f2d06b") => `
<g transform="translate(${x} ${y}) scale(${s})">
  <ellipse cx="-30" cy="-14" rx="30" ry="38" fill="${color}"/><ellipse cx="30" cy="-14" rx="30" ry="38" fill="${color}"/>
  <ellipse cx="-24" cy="26" rx="22" ry="26" fill="${color}" opacity=".8"/><ellipse cx="24" cy="26" rx="22" ry="26" fill="${color}" opacity=".8"/>
  <rect x="-6" y="-34" width="12" height="76" rx="6" fill="#5b4636"/>
</g>`;

export const leaves = (seed = 9, n = 22) => {
  const r = rng(seed);
  const cols = ["#d98a4a", "#c25b3a", "#e0b062"];
  let out = "";
  for (let i = 0; i < n; i++) {
    out += `<ellipse cx="${(r() * W) | 0}" cy="${(r() * 820) | 0}" rx="20" ry="11"
      transform="rotate(${(r() * 360) | 0} ${(r() * W) | 0} ${(r() * 820) | 0})" fill="${cols[(r() * 3) | 0]}"/>`;
  }
  return out;
};

export const path = (y = 880, fill = "#d8c39a") =>
  `<path d="M700 ${H} Q780 ${y + 40} 800 ${y - 60} Q820 ${y - 160} 860 ${y - 220} L740 ${y - 220} Q700 ${y - 150} 660 ${y - 50} Q630 ${y + 40} 560 ${H} Z" fill="${fill}"/>`;

export const fence = (y = 860, from = 100, to = 1500, s = 1) => {
  let out = `<g fill="#c9b79a">`;
  for (let x = from; x <= to; x += 110 * s) out += `<rect x="${x}" y="${y - 110 * s}" width="${20 * s}" height="${120 * s}" rx="8"/>`;
  out += `<rect x="${from}" y="${y - 80 * s}" width="${to - from}" height="${16 * s}" rx="8"/></g>`;
  return out;
};

export const bench = (x, y, s = 1) => `
<g transform="translate(${x} ${y}) scale(${s})" fill="#a8763f">
  <rect x="-140" y="-10" width="280" height="22" rx="10"/><rect x="-140" y="-70" width="280" height="18" rx="9"/>
  <rect x="-120" y="10" width="18" height="70" rx="8"/><rect x="102" y="10" width="18" height="70" rx="8"/>
</g>`;

export const boat = (x, y, s = 1, sail = "#fffaf2") => `
<g transform="translate(${x} ${y}) scale(${s})">
  <path d="M-130 0 L130 0 L96 56 L-96 56 Z" fill="#a8763f"/>
  <rect x="-6" y="-160" width="12" height="160" rx="6" fill="#7d5a3c"/>
  <path d="M6 -150 L110 -14 L6 -14 Z" fill="${sail}"/>
</g>`;

export const kite = (x, y, s = 1, color = "#d9524a") => `
<g transform="translate(${x} ${y}) scale(${s})">
  <path d="M0 -80 L64 0 L0 80 L-64 0 Z" fill="${color}"/>
  <path d="M0 80 q26 50 -12 84 q40 24 12 74" stroke="#c9b79a" stroke-width="7" fill="none" stroke-linecap="round"/>
</g>`;

export const ball = (x, y, s = 1, color = "#e2645a") => `
<g transform="translate(${x} ${y}) scale(${s})">
  <circle cx="0" cy="0" r="60" fill="${color}"/>
  <path d="M-60 0 q60 -40 120 0" stroke="#fffaf2" stroke-width="10" fill="none"/>
  <path d="M-60 0 q60 40 120 0" stroke="#fffaf2" stroke-width="10" fill="none"/>
</g>`;

export const cake = (x, y, s = 1) => `
<g transform="translate(${x} ${y}) scale(${s})">
  <rect x="-110" y="-30" width="220" height="90" rx="14" fill="#f2e3c8"/>
  <path d="M-110 -30 q40 26 74 0 q40 26 74 0 q30 22 72 0 v-16 h-220 Z" fill="#e08fb0"/>
  <rect x="-8" y="-96" width="16" height="66" rx="8" fill="#fffaf2"/>
  <ellipse cx="0" cy="-104" rx="12" ry="20" fill="#ffd257"/>
</g>`;

export const pot = (x, y, s = 1) => `
<g transform="translate(${x} ${y}) scale(${s})">
  <path d="M-70 0 L70 0 L52 92 L-52 92 Z" fill="#c9764f"/><rect x="-80" y="-18" width="160" height="26" rx="12" fill="#d98a5f"/>
</g>`;

export const sprout = (x, y, s = 1) => `
<g transform="translate(${x} ${y}) scale(${s})">
  <rect x="-5" y="-56" width="10" height="60" rx="5" fill="#5f8f57"/>
  <path d="M0 -40 q-52 -30 -70 4 q46 26 70 -4" fill="#79b96a"/>
  <path d="M0 -52 q52 -30 70 4 q-46 26 -70 -4" fill="#5f8f57"/>
</g>`;

export const well = (x, y, s = 1) => `
<g transform="translate(${x} ${y}) scale(${s})">
  <rect x="-96" y="-20" width="192" height="110" rx="14" fill="#9aa3ab"/>
  <ellipse cx="0" cy="-20" rx="96" ry="26" fill="#5b6670"/>
  <rect x="-84" y="-170" width="16" height="150" rx="8" fill="#7d5a3c"/><rect x="68" y="-170" width="16" height="150" rx="8" fill="#7d5a3c"/>
  <path d="M-110 -170 L0 -220 L110 -170 Z" fill="#a8763f"/>
</g>`;

export const train = (x, y, s = 1, color = "#5aa7d6") => `
<g transform="translate(${x} ${y}) scale(${s})">
  <rect x="-200" y="-120" width="400" height="140" rx="20" fill="${color}"/>
  <rect x="-160" y="-96" width="110" height="76" rx="10" fill="#dff0f7"/>
  <rect x="-20" y="-96" width="110" height="76" rx="10" fill="#dff0f7"/>
  <rect x="120" y="-96" width="60" height="76" rx="10" fill="#dff0f7"/>
  <circle cx="-120" cy="34" r="32" fill="#40484f"/><circle cx="120" cy="34" r="32" fill="#40484f"/>
</g>`;

export const shootingStar = (x, y, s = 1) => `
<g transform="translate(${x} ${y}) scale(${s})">
  <path d="M0 0 L-190 74" stroke="#ffe9b0" stroke-width="9" stroke-linecap="round" opacity=".75"/>
  <circle cx="0" cy="0" r="15" fill="#fffaf2"/>
</g>`;

export const window = (x, y, s = 1, night = true) => `
<g transform="translate(${x} ${y}) scale(${s})">
  <rect x="-150" y="-120" width="300" height="240" rx="14" fill="${night ? "#1d2a44" : "#bfe0ee"}" stroke="#7d5a3c" stroke-width="16"/>
  <rect x="-10" y="-120" width="20" height="240" fill="#7d5a3c"/><rect x="-150" y="-12" width="300" height="20" fill="#7d5a3c"/>
</g>`;


/* ── もこ（きめられた いきもの） ────────────────────
   もらった絵をもとにした、この棚の看板になる子。
   青みの毛・オレンジの しっぽ・つぎはぎの セーター・どんぐり。

   水彩の絵をそのまま使うことはできない（この棚は塗りのSVGを
   組み合わせて作る）。**とくちょうだけを写して**、同じ絵柄に揃えてある。

   ほかの いきものと同じく、頭のまんなかが原点。足のうらは y=172。
   だから stand(地面, 倍率) がそのまま使える                        */

const FUR = "#4e6272";      // 青みの毛
const FUR_D = "#3d4e5c";
const CREAM = "#f6ecdc";    // 顔と おなか
const TAIL = "#e08a4a";     // しっぽ

/** つぎはぎのセーター。色の並びを変えると別の服になる */
const KNIT = ["#5f9e6a", "#e0a83c", "#c9524a", "#4f8fa8"];

export function moko(x, y, s = 1, opts = {}) {
  const { arm = "up", knit = KNIT } = opts;
  const sq = (px, py, c) => `<rect x="${px}" y="${py}" width="34" height="30" rx="6" fill="${c}"/>`;
  let patches = "";
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      patches += sq(-51 + c * 34, 46 + r * 30, knit[(r + c) % knit.length]);
    }
  }

  // 腕は線で描く。四角を回すと、肩から はなれて見える
  const armUp = `<path d="M54 74 L104 -10" stroke="${FUR}" stroke-width="28" stroke-linecap="round" fill="none"/>
    <circle cx="108" cy="-16" r="19" fill="${FUR}"/>`;
  const armDown = `<path d="M56 70 L74 132" stroke="${FUR}" stroke-width="28" stroke-linecap="round" fill="none"/>
    <circle cx="76" cy="136" r="18" fill="${FUR}"/>`;

  return `<g transform="translate(${x} ${y}) scale(${s})">
    <g transform="rotate(-22 -70 96)">
      <ellipse cx="-70" cy="96" rx="46" ry="82" fill="${TAIL}"/>
      <g fill="#fdf3e6"><circle cx="-80" cy="42" r="9"/><circle cx="-58" cy="86" r="8"/><circle cx="-84" cy="126" r="9"/></g>
    </g>
    <path d="M-56 78 L-84 138" stroke="${FUR}" stroke-width="28" stroke-linecap="round" fill="none"/>
    <circle cx="-86" cy="142" r="18" fill="${FUR}"/>
    <ellipse cx="0" cy="100" rx="72" ry="72" fill="${FUR}"/>
    <g>${patches}</g>
    ${arm === "up" ? armUp : armDown}
    <rect x="-44" y="152" width="36" height="26" rx="12" fill="#8a6a45"/>
    <rect x="8" y="152" width="36" height="26" rx="12" fill="#8a6a45"/>
    <circle cx="-46" cy="-52" r="27" fill="${FUR}"/><circle cx="46" cy="-52" r="27" fill="${FUR}"/>
    <circle cx="-46" cy="-52" r="14" fill="#e4b9bd"/><circle cx="46" cy="-52" r="14" fill="#e4b9bd"/>
    <circle cx="0" cy="0" r="72" fill="${FUR}"/>
    <path d="M-46 6 a46 46 0 0 0 92 0 a46 52 0 0 0 -92 0 Z" fill="${CREAM}"/>
    <path d="M-30 -62 q30 -22 60 -4 q-28 6 -60 4 Z" fill="${CREAM}"/>
    <circle cx="-26" cy="-4" r="10" fill="#241812"/><circle cx="26" cy="-4" r="10" fill="#241812"/>
    <circle cx="-44" cy="22" r="12" fill="#e79a9a" opacity=".55"/><circle cx="44" cy="22" r="12" fill="#e79a9a" opacity=".55"/>
    <ellipse cx="0" cy="20" rx="12" ry="9" fill="#8a5a4a"/>
    <path d="M-14 34 q14 14 28 0" stroke="#8a5a4a" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path d="M0 62 l0 24" stroke="#c9b79a" stroke-width="5"/>
    <path d="M0 86 q-20 10 -22 26 q20 4 22 -26 Z" fill="#8fc36a"/>
  </g>`;
}

/** どんぐり */
export const acorn = (x, y, s = 1) => `
<g transform="translate(${x} ${y}) scale(${s})">
  <path d="M-26 -6 q26 46 52 0 q-26 26 -52 0 Z" fill="#d9a04a"/>
  <ellipse cx="0" cy="6" rx="26" ry="30" fill="#e0b062"/>
  <path d="M-30 -10 a30 20 0 0 1 60 0 Z" fill="#8a6a45"/>
  <rect x="-4" y="-34" width="8" height="16" rx="4" fill="#8a6a45"/>
</g>`;

/** きのこ */
export const mushroom = (x, y, s = 1, cap = "#d9524a") => `
<g transform="translate(${x} ${y}) scale(${s})">
  <rect x="-13" y="-30" width="26" height="42" rx="12" fill="#f6ecdc"/>
  <path d="M-46 -26 a46 34 0 0 1 92 0 Z" fill="${cap}"/>
  <g fill="#fdf3e6"><circle cx="-20" cy="-36" r="7"/><circle cx="12" cy="-42" r="6"/><circle cx="26" cy="-30" r="5"/></g>
</g>`;

export const mushrooms = (seed = 11, y = 890, n = 5) => {
  const r = rng(seed);
  const caps = ["#d9524a", "#e0a83c", "#c47ab0"];
  let out = "";
  for (let i = 0; i < n; i++) {
    out += mushroom(70 + (i * (W - 140)) / Math.max(1, n - 1) + r() * 90 - 45, y - r() * 30, 0.7 + r() * 0.7, caps[(r() * 3) | 0]);
  }
  return out;
};

/** ほたるの ような ひかり。夜と 森の おくで つかう */
export const fireflies = (seed = 12, n = 16) => {
  const r = rng(seed);
  let out = "";
  for (let i = 0; i < n; i++) {
    const x = (r() * W) | 0, y = ((r() * 700) + 80) | 0;
    out += `<circle cx="${x}" cy="${y}" r="${(r() * 12 + 10).toFixed(0)}" fill="#ffe9b0" opacity=".22"/>
            <circle cx="${x}" cy="${y}" r="${(r() * 3 + 3).toFixed(1)}" fill="#fff6d6"/>`;
  }
  return out;
};

/** きの うえの いえ */
export const treehouse = (x, y, s = 1, lit = true) => `
<g transform="translate(${x} ${y}) scale(${s})">
  <rect x="-26" y="0" width="52" height="200" rx="14" fill="#7d5a3c"/>
  <rect x="-110" y="-40" width="220" height="26" rx="10" fill="#8a6a45"/>
  <rect x="-90" y="-160" width="180" height="124" rx="12" fill="#e0c9a4"/>
  <path d="M-116 -156 L0 -240 L116 -156 Z" fill="#a8763f"/>
  <rect x="-40" y="-120" width="80" height="60" rx="8" fill="${lit ? "#ffd98a" : "#7a8a9a"}"/>
  <g stroke="#7d5a3c" stroke-width="9" stroke-linecap="round">
    <path d="M-14 10 L-14 190"/><path d="M14 10 L14 190"/>
    <path d="M-14 40 L14 40"/><path d="M-14 90 L14 90"/><path d="M-14 140 L14 140"/>
  </g>
</g>`;


/* ── 海の部品（2026-08-21） ──────────────────────
   「トドくんの うみの だいぼうけん」のために足したぶん。
   もとの話は自作のスライド。**絵は1枚も持ち込んでいない**
   （スライドの写真は pngtree などの他人のもの。出典が11ページ目にある）。
   ここにあるのは、その話に合わせて描き直した部品。          */

const SEAL = "#d09257";        // トドの からだ
const SEAL_D = "#b0763f";      // ひれ・かげ
const SEAL_C = "#f2ddbe";      // おなかと 口もと

/**
 * トド。この棚の いきもの と同じで、**頭のまんなかが原点**。
 * 地面に すわらせるときは standTodo(地面, 倍率) を使う。
 *
 * pose
 *   sit  … すわって 上を むく（陸の絵）
 *   swim … よこむきに およぐ（海の中の絵）
 */
export function todo(x, y, s = 1, opts = {}) {
  const { pose = "sit", fur = SEAL, flip = false, scarf = true } = opts;
  const dark = pose === "sit" ? SEAL_D : SEAL_D;

  const face = `
    <ellipse cx="-58" cy="-32" rx="9" ry="19" transform="rotate(-22 -58 -32)" fill="${dark}"/>
    <ellipse cx="58" cy="-32" rx="9" ry="19" transform="rotate(22 58 -32)" fill="${dark}"/>
    <circle cx="0" cy="0" r="66" fill="${fur}"/>
    <ellipse cx="0" cy="30" rx="42" ry="30" fill="${SEAL_C}"/>
    <g stroke="${SEAL_C}" stroke-width="4" stroke-linecap="round" opacity=".95">
      <path d="M-30 24 L-92 12"/><path d="M-30 34 L-94 38"/>
      <path d="M30 24 L92 12"/><path d="M30 34 L94 38"/>
    </g>
    <ellipse cx="0" cy="16" rx="13" ry="10" fill="#3b2a22"/>
    <path d="M-15 40 q15 13 30 0" stroke="#3b2a22" stroke-width="6" fill="none" stroke-linecap="round"/>
    ${EYE(-27, -8, 11)}${EYE(27, -8, 11)}
    <circle cx="-47" cy="16" r="12" fill="#e79a9a" opacity=".45"/>
    <circle cx="47" cy="16" r="12" fill="#e79a9a" opacity=".45"/>`;

  // 首の あかい スカーフ。もらった水彩の絵と 同じ しるし。
  // かおの まえに 描くと あごが かくれるので、かおの まえ（うしろ側）に 置く
  const SC = "#c25b4a", SC_D = "#a8412f";
  const scarfSit = !scarf ? "" : `
    <path d="M-56 34 C-32 76, 32 76, 56 34 C56 82, 30 104, 0 104 C-30 104, -56 82, -56 34 Z" fill="${SC}"/>
    <g fill="#f0b8a4"><circle cx="-28" cy="68" r="5"/><circle cx="6" cy="82" r="5"/><circle cx="34" cy="62" r="5"/></g>
    <path d="M-10 92 L-40 128 L-18 136 L4 104 Z" fill="${SC}"/>
    <circle cx="-2" cy="92" r="14" fill="${SC_D}"/>`;
  const scarfSwim = !scarf ? "" : `
    <g transform="rotate(-14 -46 4)">
      <path d="M-30 -44 C-58 -34, -60 44, -34 56 C-8 46, -8 -32, -30 -44 Z" fill="${SC}"/>
      <path d="M-56 30 L-92 46 L-84 66 L-48 52 Z" fill="${SC}"/>
      <circle cx="-46" cy="34" r="13" fill="${SC_D}"/>
    </g>`;

  const sit = `
    <path d="M46 214 q92 6 132 -34 q-8 56 -58 72 q-44 12 -78 -8 Z" fill="${dark}"/>
    <path d="M-52 22 C-98 92, -104 190, -76 232 C-42 278, 58 278, 90 232 C116 188, 92 88, 52 22 Z" fill="${fur}"/>
    <ellipse cx="6" cy="168" rx="52" ry="76" fill="${SEAL_C}" opacity=".5"/>
    <path d="M-56 118 C-112 154, -128 216, -104 244 C-78 254, -50 218, -40 176 Z" fill="${dark}"/>
    <path d="M60 128 C112 162, 126 220, 102 246 C76 256, 50 222, 44 182 Z" fill="${dark}"/>
    ${scarfSit}${face}`;

  // およぐ かたち。頭は右、からだは 左へ のびる
  const swim = `
    <path d="M-272 -30 C-336 -66, -408 -74, -440 -40 C-392 -18, -320 -4, -272 4 Z" fill="${dark}"/>
    <path d="M-272 10 C-334 40, -396 74, -426 64 C-386 100, -316 68, -268 34 Z" fill="${dark}"/>
    <path d="M-30 -52 C-140 -68, -256 -50, -296 -6 C-256 46, -140 66, -26 48 Z" fill="${fur}"/>
    <path d="M-40 34 C-140 50, -230 38, -270 8 C-210 40, -130 54, -40 46 Z" fill="${SEAL_C}" opacity=".55"/>
    <path d="M-96 26 C-128 92, -92 136, -40 126 C-70 96, -74 60, -80 34 Z" fill="${dark}"/>
    <path d="M-120 -34 C-166 -92, -134 -140, -82 -136 C-108 -108, -108 -70, -104 -44 Z" fill="${dark}"/>
    ${scarfSwim}${face}`;

  return `<g transform="translate(${x} ${y}) scale(${flip ? -s : s} ${s})">${
    pose === "swim" ? swim : sit}</g>`;
}

/** 地面 g に すわる トドの原点 */
export const standTodo = (g, s) => g - 264 * s;

/** くじら。おおきさで 見せる ので、ほかより ずっと 大きい */
export const whale = (x, y, s = 1, color = "#4a7fa8") => `
<g transform="translate(${x} ${y}) scale(${s})">
  <path d="M-292 -10 C-370 -74, -448 -96, -486 -66 C-448 -34, -374 -12, -300 0
           C-374 12, -448 34, -486 66 C-448 96, -370 74, -292 10 Z" fill="${color}"/>
  <path d="M-300 0 C-300 -100, -120 -142, 60 -136 C210 -130, 300 -72, 300 -6
           C300 60, 200 110, 60 116 C-120 124, -300 90, -300 0 Z" fill="${color}"/>
  <path d="M40 92 C64 162, 146 182, 186 150 C132 142, 92 120, 72 86 Z" fill="${color}"/>
  <path d="M-240 78 C-100 120, 120 114, 262 52 C160 120, -80 134, -240 78 Z" fill="#d7e9f2"/>
  <path d="M-150 96 C-40 120, 110 112, 230 68" stroke="#d7e9f2" stroke-width="10" fill="none" opacity=".7"/>
  <path d="M118 68 C198 64, 260 42, 296 6" stroke="#2f5c7c" stroke-width="8" fill="none" stroke-linecap="round"/>
  <circle cx="204" cy="-26" r="13" fill="#241812"/>
  <g stroke="#e6f2f7" stroke-width="14" stroke-linecap="round" fill="none" opacity=".9">
    <path d="M166 -122 q-14 -74 -66 -112"/><path d="M172 -124 q18 -68 0 -118"/><path d="M178 -122 q40 -52 92 -70"/>
  </g>
</g>`;

/** こおり。すべりだいに つかう。flat=true で ただの 氷の いた */
export const iceHill = (x, y, s = 1, flat = false) => `
<g transform="translate(${x} ${y}) scale(${s})">
  ${flat
    ? `<path d="M-300 0 L-250 -44 L250 -44 L300 0 Z" fill="#eaf4fa"/>
       <path d="M-300 0 L300 0 L262 44 L-262 44 Z" fill="#c6dcea"/>`
    : `<path d="M-320 40 L-90 -190 L60 -190 L320 40 Z" fill="#eaf4fa"/>
       <path d="M-90 -190 L60 -190 L320 40 L150 40 Z" fill="#d5e8f3"/>
       <path d="M-320 40 L320 40 L286 84 L-286 84 Z" fill="#c6dcea"/>`}
</g>`;

/** すな。うみべの 地面 */
export const sand = (y = 880) =>
  `<path d="M0 ${y} Q400 ${y - 44} 800 ${y - 6} T1600 ${y - 30} L1600 1000 L0 1000 Z" fill="#e8d6ac"/>`;

/** おおきな なみ。まきこむ かたち */
export const bigWave = (x, y, s = 1, color = "#3f8fb0") => `
<g transform="translate(${x} ${y}) scale(${s})">
  <path d="M-560 520 C-520 120, -280 -140, 40 -142 C300 -144, 452 -20, 470 150 L470 520 Z" fill="${color}"/>
  <path d="M40 -142 C300 -144, 452 -20, 470 150 C420 20, 286 -64, 96 -62 C-70 -60, -220 30, -300 190
           C-250 -10, -110 -140, 40 -142 Z" fill="#eaf6fa"/>
  <g stroke="#eaf6fa" stroke-width="13" fill="none" opacity=".65" stroke-linecap="round">
    <path d="M-380 320 C-280 140, -140 40, 20 10"/>
    <path d="M-300 440 C-200 280, -70 190, 90 160"/>
  </g>
</g>`;

/** サーフボード */
export const surfboard = (x, y, s = 1, rot = -14, color = "#e8a33c") => `
<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
  <path d="M-170 0 C-120 -46, 120 -46, 170 0 C120 46, -120 46, -170 0 Z" fill="${color}"/>
  <path d="M-150 0 L150 0" stroke="#fdf3e6" stroke-width="9" stroke-linecap="round"/>
</g>`;

/** にんぎょ。子どもの 上はんぶんに、さかなの おびれ */
export const mermaid = (x, y, s = 1, tail = "#4fb0a8", hair = "#c2543f") => `
<g transform="translate(${x} ${y}) scale(${s})">
  <path d="M-40 40 C-70 130, -40 200, 10 236 C-70 250, -120 214, -140 250 C-90 300, 30 300, 70 236 C110 176, 90 80, 44 36 Z" fill="${tail}"/>
  <path d="M-64 -28 q0 -86 64 -86 q64 0 64 86 q4 96 -30 126 q12 -84 -34 -110 q-46 26 -34 110 q-34 -30 -30 -126 Z" fill="${hair}"/>
  <path d="M-30 30 L34 30 L44 120 L-40 120 Z" fill="#f0c9a8"/>
  <path d="M-46 116 a46 30 0 0 0 92 0 Z" fill="${tail}"/>
  <circle cx="0" cy="-30" r="58" fill="#f0c9a8"/>
  <path d="M-58 -44 a58 58 0 0 1 116 0 q-32 -30 -58 -26 q-26 -4 -58 26 Z" fill="${hair}"/>
  ${EYE(-20, -22, 8)}${EYE(20, -22, 8)}
  <path d="M-12 0 q12 12 24 0" stroke="#b9705c" stroke-width="6" fill="none" stroke-linecap="round"/>
</g>`;

/** サンゴ。海の そこに ならべる */
export const corals = (seed = 21, y = 900, n = 5) => {
  const r = rng(seed);
  const cols = ["#e08a9a", "#e0a83c", "#7fb8a8"];
  let out = "";
  for (let i = 0; i < n; i++) {
    const x = 90 + (i * (W - 180)) / Math.max(1, n - 1) + r() * 80 - 40;
    const s = 0.7 + r() * 0.6;
    const c = cols[(r() * 3) | 0];
    out += `<g transform="translate(${x | 0} ${(y - r() * 30) | 0}) scale(${s.toFixed(2)})" fill="${c}">
      <path d="M0 0 L0 -70" stroke="${c}" stroke-width="20" stroke-linecap="round"/>
      <path d="M0 -40 L-44 -96" stroke="${c}" stroke-width="17" stroke-linecap="round"/>
      <path d="M0 -50 L46 -110" stroke="${c}" stroke-width="17" stroke-linecap="round"/>
      <circle cx="0" cy="-78" r="15"/><circle cx="-50" cy="-104" r="14"/><circle cx="52" cy="-118" r="14"/>
      <ellipse cx="0" cy="-6" rx="34" ry="16"/><circle cx="-24" cy="-50" r="10"/><circle cx="26" cy="-62" r="10"/>
    </g>`;
  }
  return out;
};

/** 水の あわ */
export const bubbles = (seed = 22, n = 16) => {
  const r = rng(seed);
  let out = '<g fill="#ffffff" opacity=".38">';
  for (let i = 0; i < n; i++) {
    out += `<circle cx="${(r() * W) | 0}" cy="${(r() * 860) | 0}" r="${(r() * 16 + 6) | 0}"/>`;
  }
  return `${out}</g>`;
};

/** ほし。うちゅうの 絵に つかう */
export const planet = (x, y, s = 1, color = "#c47ab0", ring = false) => `
<g transform="translate(${x} ${y}) scale(${s})">
  <circle cx="0" cy="0" r="78" fill="${color}"/>
  <ellipse cx="-22" cy="-24" rx="26" ry="18" fill="#ffffff" opacity=".22"/>
  ${ring ? `<ellipse cx="0" cy="6" rx="132" ry="30" fill="none" stroke="#f2d06b" stroke-width="14" opacity=".9"/>` : ""}
</g>`;

/** うちゅうの ヘルメット。頭に かぶせる（頭の 原点に あわせる） */
export const helmet = (x, y, s = 1) => `
<g transform="translate(${x} ${y}) scale(${s})">
  <circle cx="0" cy="0" r="96" fill="#cfe8f2" opacity=".38"/>
  <circle cx="0" cy="0" r="96" fill="none" stroke="#eaf6fa" stroke-width="8"/>
  <path d="M-62 -52 a86 86 0 0 1 52 -30" stroke="#ffffff" stroke-width="12" fill="none" stroke-linecap="round" opacity=".8"/>
</g>`;

/** まほうの じゅうたん */
export const carpet = (x, y, s = 1, color = "#9a4f8f") => `
<g transform="translate(${x} ${y}) scale(${s})">
  <path d="M-260 30 C-140 -30, 140 -30, 260 30 C140 76, -140 76, -260 30 Z" fill="${color}"/>
  <path d="M-210 28 C-110 -6, 110 -6, 210 28" stroke="#f2d06b" stroke-width="9" fill="none"/>
  <g stroke="${color}" stroke-width="8" stroke-linecap="round">
    <path d="M-256 34 L-286 56"/><path d="M-200 52 L-222 78"/><path d="M-120 64 L-134 92"/>
    <path d="M0 70 L0 100"/><path d="M120 64 L134 92"/><path d="M200 52 L222 78"/><path d="M256 34 L286 56"/>
  </g>
</g>`;

/** 花の かんむり。頭の 原点に あわせて かぶせる */
export const flowerCrown = (x, y, s = 1) => {
  const cols = ["#e2645a", "#f2d06b", "#c47ab0", "#7fb8a8", "#e8a33c"];
  let out = `<g transform="translate(${x} ${y}) scale(${s})">
    <path d="M-66 -30 a66 40 0 0 1 132 0" stroke="#5f8f57" stroke-width="11" fill="none" stroke-linecap="round"/>`;
  for (let i = 0; i < 5; i++) {
    const a = (-160 + i * 40) * (Math.PI / 180);
    const px = (Math.cos(a) * 68).toFixed(0), py = (Math.sin(a) * 44 - 24).toFixed(0);
    out += `<g transform="translate(${px} ${py})" fill="${cols[i]}">
      <circle cx="0" cy="-11" r="11"/><circle cx="-11" cy="4" r="11"/><circle cx="11" cy="4" r="11"/>
      <circle cx="0" cy="0" r="8" fill="#fdf3e6"/></g>`;
  }
  return `${out}</g>`;
};

/* ── 水彩ふうの仕上げ ────────────────────────────
   紙のにじみと、ふちの ゆらぎ。**SVGのフィルタだけで作る。**
   画像を足さないので、容量も 通信も 増えない（0円のまま）。

   ■ 本物の水彩ではない
     塗りの かたちを ゆらして、紙の目を かさねているだけ。
     それでも、まっすぐな線と 均一な塗りは 消える。

   ■ 重さに気をつける
     feTurbulence は広いほど重い。ゆらぎは背景を除いた絵にだけ かける。
     古い端末で もたつくようなら、下の WATERCOLOR を false にすれば
     もとの平らな絵に戻る（作り直しは build のやり直しだけ）。          */
export const WATERCOLOR = false;

const WC_DEFS = `<defs>
<filter id="wc" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
  <!-- ふちを ゆらす。まっすぐな線を なくす -->
  <feTurbulence type="fractalNoise" baseFrequency="0.013" numOctaves="3" seed="7" result="n"/>
  <feDisplacementMap in="SourceGraphic" in2="n" scale="13" xChannelSelector="R" yChannelSelector="G" result="d"/>
  <feGaussianBlur in="d" stdDeviation="1.1" result="soft"/>

  <!-- にじみの ふち。水彩は かわくとき、ふちに 色が たまって 濃くなる。
       中を けずった ぶんを 引くと、ふちだけが 残る -->
  <feMorphology in="soft" operator="erode" radius="4" result="inner"/>
  <feComposite in="soft" in2="inner" operator="out" result="rim"/>
  <feGaussianBlur in="rim" stdDeviation="2" result="rimSoft"/>
  <feColorMatrix in="rimSoft" type="matrix"
    values="0.66 0 0 0 0  0 0.66 0 0 0  0 0 0.66 0 0  0 0 0 0.28 0" result="rimDark"/>

  <!-- 塗りの中の むら。均一な塗りは 絵の具に見えない -->
  <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="4" seed="19" result="m"/>
  <feColorMatrix in="m" type="matrix"
    values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.32 0 0 0 -0.19" result="mottleA"/>
  <feComposite in="mottleA" in2="soft" operator="in" result="mottle"/>

  <feMerge>
    <feMergeNode in="soft"/><feMergeNode in="mottle"/><feMergeNode in="rimDark"/>
  </feMerge>
</filter>

<filter id="paper" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="5" seed="5" result="t"/>
  <feColorMatrix in="t" type="matrix"
    values="0 0 0 0 0.45  0 0 0 0 0.42  0 0 0 0 0.36  0.55 0 0 0 -0.12"/>
</filter>
</defs>`;

/** 紙の目。いちばん上に かさねる */
const PAPER = `<rect width="${W}" height="${H}" filter="url(#paper)" opacity=".22"/>`;

/** 1ページぶんの SVG を組み立てる */
export function page(parts) {
  if (!WATERCOLOR) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img">${parts.join("")}</svg>\n`;
  }
  // parts[0] は かならず bg(...)。ここを ゆらすと、ふちに すきまが出る
  const [sky, ...art] = parts;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img">${
    WC_DEFS}${sky}<g filter="url(#wc)">${art.join("")}</g>${PAPER}</svg>\n`;
}
