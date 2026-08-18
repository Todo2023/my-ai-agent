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

/** 1ページぶんの SVG を組み立てる */
export function page(parts) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img">${parts.join("")}</svg>\n`;
}
