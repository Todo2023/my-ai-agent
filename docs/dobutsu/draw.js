// 動物と背景を描く道具。canvas 2D だけで完結する。画像ファイルは1枚も使わない。
// 画面は 360 x 270 の座標系で描く（実際の大きさは app.js が拡大する）。
// 地面の高さは GROUND。動物は「足の位置」を y に渡して描く。

const W = 360, H = 270, GROUND = 214;

// 画面いっぱいに出すときは、絵の箱（360x270）より外にも 背景を のばす。
// いま見えている ひろさを app.js が ここに入れる。動物や小道具の場所は
// 箱の座標のままなので、お話を書くときに 気にしなくてよい。
let VIEW = { x: 0, y: 0, w: W, h: H };
function setView(x, y, w, h) { VIEW = { x: x, y: y, w: w, h: h }; }

/* ------------------------------------------------------------------ 部品 */

function el(g, x, y, rx, ry, c, rot) {
  g.beginPath();
  g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, Math.PI * 2);
  g.fillStyle = c;
  g.fill();
}

function rr(g, x, y, w, h, r, c) {
  g.beginPath();
  g.roundRect(x - w / 2, y - h / 2, w, h, r);
  g.fillStyle = c;
  g.fill();
}

function ln(g, pts, c, w, cap) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.strokeStyle = c;
  g.lineWidth = w;
  g.lineCap = cap || "round";
  g.lineJoin = "round";
  g.stroke();
}

function curve(g, x1, y1, cx, cy, x2, y2, c, w) {
  g.beginPath();
  g.moveTo(x1, y1);
  g.quadraticCurveTo(cx, cy, x2, y2);
  g.strokeStyle = c;
  g.lineWidth = w;
  g.lineCap = "round";
  g.stroke();
}

function tri(g, x1, y1, x2, y2, x3, y3, c) {
  g.beginPath();
  g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3);
  g.closePath();
  g.fillStyle = c;
  g.fill();
}

// 目。mood で表情が変わる。'happy' は閉じた笑い目、'sad' はしょんぼり。
function eye(g, x, y, r, mood, blink) {
  const ink = "#2b2b33";
  if (blink || mood === "happy" || mood === "sleep") {
    ln(g, [x - r, y, x, y + (mood === "sad" ? -r * 0.7 : r * 0.7), x + r, y], ink, r * 0.7);
    return;
  }
  el(g, x, y, r, r * 1.05, ink);
  el(g, x + r * 0.32, y - r * 0.34, r * 0.34, r * 0.34, "rgba(255,255,255,0.9)");
  if (mood === "sad") ln(g, [x - r * 1.3, y - r * 1.7, x + r * 1.1, y - r * 1.1], ink, r * 0.5);
  if (mood === "angry") ln(g, [x - r * 1.3, y - r * 1.9, x + r * 1.2, y - r * 1.2], ink, r * 0.55);
}

// 影。地面に落ちるだ円。
function shadow(g, x, y, w, a) {
  el(g, x, y + 2, w, w * 0.26, "rgba(30,40,30," + (a == null ? 0.16 : a) + ")");
}

function bounce(t, speed, amp) {
  return Math.abs(Math.sin(t * speed)) * amp;
}

/* -------------------------------------------------------------- 動物たち */
// どれも同じ約束で描く。
//   o = { x, y(足元), s(大きさ), flip(右を向かせるなら true), t(秒), walk, mood }
// どの動物も、そのままだと「左向き」に描かれる。
// 標準の大きさ s = 1 で、体の高さはだいたい 46px。

const A = {};

function begin(g, o) {
  g.save();
  g.translate(o.x, o.y);
  const s = o.s == null ? 1 : o.s;
  g.scale(o.flip ? -s : s, s);
  return { t: o.t || 0, walk: o.walk || 0, mood: o.mood, blink: o.blink };
}

// 歩く足。phase をずらして4本ぶん動かす。
function legs(g, xs, top, len, wdt, c, walk, t) {
  xs.forEach((x, i) => {
    const sw = walk ? Math.sin(t * 9 + i * Math.PI * 0.9) * len * 0.45 * walk : 0;
    ln(g, [x, top, x + sw, top + len], c, wdt);
  });
}

A.usagi = function (g, o) {                                   // うさぎ
  const m = begin(g, o), body = "#f6f2ee", ear = "#f7c6d0";
  shadow(g, 0, 0, 20 * (o.hop ? 0.7 : 1), o.hop ? 0.1 : 0.16);
  g.translate(0, -(o.hop || 0));
  el(g, 14, -12, 8, 8, body);                                  // しっぽ
  el(g, 0, -20, 17, 16, body);                                 // からだ
  legs(g, [-8, 8], -6, 7, 5, body, o.hop ? 0 : m.walk, m.t);
  el(g, -12, -38, 13, 12, body);                               // あたま
  el(g, -17, -55, 4.5, 13, body, -0.12);                       // 耳
  el(g, -8, -56, 4.5, 13, body, 0.14);
  el(g, -17, -55, 2.2, 9, ear, -0.12);
  el(g, -8, -56, 2.2, 9, ear, 0.14);
  eye(g, -18, -39, 2.4, m.mood, m.blink);
  el(g, -23, -35, 2.6, 2, "#f4b7c2");
  el(g, -24, -38, 1.6, 1.3, "#e58a9c");                        // はな
  g.restore();
};

A.kame = function (g, o) {                                     // かめ
  const m = begin(g, o);
  shadow(g, 0, 0, 20);
  g.translate(0, -(o.hop || 0));
  legs(g, [-10, 9], -8, 8, 6, "#e3c96d", m.walk, m.t);
  el(g, 0, -16, 21, 14, "#5c9a4e");                            // こうら
  el(g, 0, -14, 21, 8, "#4a8340");
  for (let i = -1; i <= 1; i++) el(g, i * 9, -19, 4.5, 4, "#7ab566");
  el(g, -20, -18, 9, 8, "#e3c96d");                            // あたま
  el(g, 21, -12, 6, 4, "#e3c96d");                             // しっぽ
  eye(g, -23, -20, 2.2, m.mood, m.blink);
  ln(g, [-27, -15, -23, -15], "#b99a3f", 1.6);
  g.restore();
};

A.kitsune = function (g, o) {                                  // きつね
  const m = begin(g, o), fur = "#e08a45", pale = "#fbe9d8";
  shadow(g, 0, 0, 22);
  g.translate(0, -(o.hop || 0));
  el(g, 20, -26, 12, 7, fur, -0.5);                            // しっぽ
  el(g, 26, -33, 6, 5, pale, -0.5);
  el(g, 0, -22, 18, 13, fur);
  el(g, -2, -16, 14, 7, pale);
  legs(g, [-10, 8], -10, 10, 5, fur, m.walk, m.t);
  el(g, -11, -30, 9, 8, fur);                                  // くび
  el(g, -16, -36, 11, 10, fur);                                // あたま
  tri(g, -24, -44, -20, -56, -14, -43, fur);                   // 耳
  tri(g, -13, -44, -8, -55, -5, -42, fur);
  el(g, -25, -33, 6, 4, pale, 0.2);                            // 口もと
  el(g, -29, -34, 1.8, 1.5, "#3a2a22");
  eye(g, -20, -38, 2.3, m.mood, m.blink);
  g.restore();
};

A.nezumi = function (g, o) {                                   // ねずみ
  const m = begin(g, o), fur = "#9aa1ad";
  shadow(g, 0, 0, 14);
  g.translate(0, -(o.hop || 0));
  curve(g, 12, -10, 26, -8, 22, -24, "#c9b3ad", 2.2);          // しっぽ
  el(g, 0, -12, 13, 10, fur);
  legs(g, [-6, 6], -4, 5, 4, fur, m.walk, m.t);
  el(g, -11, -20, 8, 7.5, fur);                                // あたま
  el(g, -13, -29, 6, 6, fur);                                  // 耳
  el(g, -13, -29, 3.4, 3.4, "#f0c3c9");
  eye(g, -15, -21, 2, m.mood, m.blink);
  el(g, -19, -18, 1.7, 1.4, "#e58a9c");
  ln(g, [-19, -18, -27, -22], "#8b8f99", 0.9);
  ln(g, [-19, -17, -27, -14], "#8b8f99", 0.9);
  g.restore();
};

A.lion = function (g, o) {                                     // ライオン
  const m = begin(g, o), fur = "#e2ac5b", mane = "#c07b34";
  shadow(g, 0, 0, 28);
  g.translate(0, -(o.hop || 0));
  curve(g, 22, -28, 34, -22, 30, -40, fur, 3);                 // しっぽ
  el(g, 32, -42, 4.5, 5, mane);
  el(g, 2, -26, 22, 15, fur);
  legs(g, [-12, 12], -12, 12, 7, fur, m.walk, m.t);
  el(g, -20, -44, 17, 16, mane);                               // たてがみ
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    el(g, -20 + Math.cos(a) * 16, -44 + Math.sin(a) * 15, 6, 6, mane);
  }
  el(g, -21, -43, 11, 10, fur);                                // かお
  eye(g, -25, -46, 2.4, m.mood, m.blink);
  eye(g, -17, -46, 2.4, m.mood, m.blink);
  el(g, -22, -39, 3, 2.2, "#8a5a33");
  curve(g, -22, -37, -26, -34, -29, -37, "#8a5a33", 1.4);
  curve(g, -22, -37, -18, -34, -15, -37, "#8a5a33", 1.4);
  g.restore();
};

A.karasu = function (g, o) {                                   // からす
  const m = begin(g, o), b = "#3a3f52", b2 = "#4c5268";
  if (!o.fly) shadow(g, 0, 0, 16);
  g.translate(0, -(o.hop || 0) - (o.fly || 0));
  const wing = o.fly ? Math.sin(m.t * 11) * 16 : 0;
  el(g, 12, -22, 12, 5, b2, -0.4 + wing * 0.03);               // しっぽ
  el(g, 0, -22, 16, 12, b);
  el(g, 1, -26, 12, 6, b2, -0.2 - wing * 0.04);                // つばさ
  if (!o.fly) {                                                // あし
    ln(g, [-5, -10, -5, -2], "#d8a54a", 2.4);
    ln(g, [5, -10, 5, -2], "#d8a54a", 2.4);
  } else {
    ln(g, [-4, -14, -1, -6], "#d8a54a", 2.2);
    ln(g, [4, -14, 7, -6], "#d8a54a", 2.2);
  }
  el(g, -14, -34, 8.5, 8, b);                                  // あたま
  tri(g, -21, -35, -30, -32, -21, -30, "#d8a54a");             // くちばし
  eye(g, -16, -36, 2.1, m.mood, m.blink);
  g.restore();
};

A.ari = function (g, o) {                                      // あり
  const m = begin(g, o), b = "#7a4230";
  shadow(g, 0, 0, 10);
  g.translate(0, -(o.hop || 0));
  el(g, 10, -12, 9, 7.5, b);                                   // おしり
  el(g, 0, -12, 5.5, 5, b);
  el(g, -9, -14, 7, 6.5, b);                                   // あたま
  legs(g, [-4, 2, 8], -9, 9, 2, b, m.walk, m.t);
  ln(g, [-12, -18, -17, -25], b, 1.6);                         // しょっかく
  ln(g, [-9, -19, -11, -27], b, 1.6);
  eye(g, -12, -15, 1.8, m.mood, m.blink);
  g.restore();
};

A.inu = function (g, o) {                                      // いぬ
  const m = begin(g, o), fur = "#c58a52", pale = "#f2e2cc";
  shadow(g, 0, 0, 22);
  g.translate(0, -(o.hop || 0));
  curve(g, 17, -26, 28, -34, 24, -20, fur, 3.4);               // しっぽ
  el(g, 0, -24, 18, 13, fur);
  el(g, -2, -18, 13, 7, pale);
  legs(g, [-10, 9], -12, 12, 6, fur, m.walk, m.t);
  el(g, -17, -38, 11, 10, fur);                                // あたま
  el(g, -24, -37, 5, 8, "#a06d3d", 0.25);                      // たれ耳
  el(g, -25, -33, 6.5, 4.5, pale, 0.15);
  el(g, -30, -34, 2, 1.7, "#3a2a22");
  eye(g, -19, -40, 2.3, m.mood, m.blink);
  rr(g, -14, -30, 12, 3.5, 2, "#d1544a");                      // くびわ
  g.restore();
};

A.zou = function (g, o) {                                      // ぞう
  const m = begin(g, o), gy = "#9aa3b2", gy2 = "#828b9c";
  shadow(g, 0, 0, 32);
  g.translate(0, -(o.hop || 0));
  el(g, 4, -34, 26, 21, gy);
  legs(g, [-14, 14], -16, 16, 11, gy2, m.walk, m.t);
  el(g, -20, -44, 16, 15, gy);                                 // あたま
  el(g, -12, -46, 11, 12, gy2);                                // 耳
  const lift = (o.trunk || 0) + Math.sin(m.t * 2.2) * 3;       // マイナスで はなを あげる
  curve(g, -32, -40, -45, -30 + lift * 0.5, -47, -13 + lift, gy, 7);   // ながい はな
  eye(g, -26, -47, 2.4, m.mood, m.blink);
  curve(g, 26, -40, 33, -36, 30, -28, gy2, 2.4);               // しっぽ
  g.restore();
};

/* -------------------------------------------------------------- 背景たち */

const BG = {};

function sky(g, top, bottom) {
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, top); gr.addColorStop(1, bottom);
  g.fillStyle = gr;
  g.fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
}

function hills(g, y, c) {
  const x0 = Math.floor(VIEW.x / 60) * 60 - 60, x1 = VIEW.x + VIEW.w + 60;
  const bottom = VIEW.y + VIEW.h;
  g.beginPath();
  g.moveTo(x0, bottom);
  g.lineTo(x0, y);
  for (let x = x0; x <= x1; x += 60) g.quadraticCurveTo(x + 30, y - 26, x + 60, y);
  g.lineTo(x1 + 60, bottom);
  g.fillStyle = c; g.fill();
}

function ground(g, c) {
  const x0 = VIEW.x, x1 = VIEW.x + VIEW.w, bottom = VIEW.y + VIEW.h;
  g.fillStyle = c;
  g.beginPath();
  g.moveTo(x0, GROUND + 4);
  g.quadraticCurveTo((x0 + x1) / 2, GROUND - 6, x1, GROUND + 4);
  g.lineTo(x1, bottom); g.lineTo(x0, bottom); g.closePath(); g.fill();
}

function grass(g, c, seed) {
  const n = Math.ceil(VIEW.w / 14);
  for (let i = 0; i < n; i++) {
    const x = VIEW.x + ((i * 97 + (seed || 0) * 31) % VIEW.w);
    const y = GROUND + 6 + ((i * 53) % 40);
    ln(g, [x, y, x - 2, y - 7], c, 1.6);
    ln(g, [x, y, x + 3, y - 6], c, 1.6);
  }
}

function tree(g, x, y, s, c1, c2) {
  rr(g, x, y - 14 * s, 7 * s, 30 * s, 3 * s, "#8a6a4a");
  el(g, x, y - 34 * s, 21 * s, 18 * s, c1);
  el(g, x - 12 * s, y - 26 * s, 13 * s, 11 * s, c2);
  el(g, x + 12 * s, y - 27 * s, 12 * s, 11 * s, c2);
}

function cloud(g, x, y, s, c) {
  el(g, x, y, 22 * s, 11 * s, c);
  el(g, x - 15 * s, y + 3 * s, 13 * s, 8 * s, c);
  el(g, x + 16 * s, y + 3 * s, 14 * s, 8 * s, c);
}

BG.hara = function (g, t) {                                     // はらっぱ
  sky(g, "#bfe6f5", "#e9f7ea");
  cloud(g, VIEW.x + (t * 6) % (VIEW.w + 90) - 45, VIEW.y + 42, 1, "rgba(255,255,255,0.92)");
  cloud(g, VIEW.x + (t * 4 + 200) % (VIEW.w + 90) - 45, VIEW.y + 70, 0.7, "rgba(255,255,255,0.75)");
  hills(g, 168, "#a8d59a");
  ground(g, "#8fc97f");
  grass(g, "#77b76a", 1);
};

BG.mori = function (g, t) {                                     // もり
  sky(g, "#cfe9f3", "#dff0dd");
  hills(g, 160, "#79b382");
  tree(g, 44, GROUND, 1.1, "#4e8a52", "#5f9c60");
  tree(g, 316, GROUND, 1.2, "#457f4c", "#57945a");
  tree(g, 180, GROUND - 10, 0.8, "#5a9a5c", "#6aac68");
  ground(g, "#82bd77");
  grass(g, "#6dae63", 3);
};

BG.michi = function (g, t) {                                    // みち（ゴールの旗つき）
  sky(g, "#bfe6f5", "#f2f6dd");
  cloud(g, VIEW.x + (t * 5 + 120) % (VIEW.w + 90) - 45, VIEW.y + 46, 0.9, "rgba(255,255,255,0.9)");
  hills(g, 172, "#a2d296");
  ground(g, "#d8c88f");
  el(g, W * 0.5, GROUND + 30, Math.max(200, VIEW.w * 0.55), 16, "#cbb87b");
  grass(g, "#8fbf72", 5);
};

BG.mizube = function (g, t) {                                   // みずべ
  sky(g, "#c3e8f7", "#e6f6f0");
  hills(g, 150, "#93cb9c");
  ground(g, "#8ec888");
  const x0 = VIEW.x, x1 = VIEW.x + VIEW.w, bottom = VIEW.y + VIEW.h;
  g.fillStyle = "#63b6d8";
  g.beginPath();
  g.moveTo(x0, GROUND + 22);
  g.quadraticCurveTo((x0 + x1) / 2, GROUND + 10, x1, GROUND + 24);
  g.lineTo(x1, bottom); g.lineTo(x0, bottom); g.closePath(); g.fill();
  for (let i = 0; i < 5; i++) {
    const y = GROUND + 34 + i * 9;
    curve(g, x0 + 20 + i * 12, y, (x0 + x1) / 2 + Math.sin(t * 1.5 + i) * 14, y - 5, x1 - 20 - i * 8, y, "rgba(255,255,255,0.4)", 2);
  }
};

BG.natsu = function (g, t) {                                    // なつ（あつい日）
  sky(g, "#ffe6a8", "#fdf3d8");
  const sx = 300, sy = VIEW.y + 44;
  el(g, sx, sy, 26, 26, "#ffd166");
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + t * 0.3;
    ln(g, [sx + Math.cos(a) * 32, sy + Math.sin(a) * 32, sx + Math.cos(a) * 42, sy + Math.sin(a) * 42], "#ffd166", 3);
  }
  hills(g, 172, "#c9d78a");
  ground(g, "#d5cf85");
  grass(g, "#b9bf6c", 7);
};

BG.fuyu = function (g, t) {                                     // ふゆ
  sky(g, "#c9d8ea", "#eef4fa");
  hills(g, 166, "#dde8f2");
  ground(g, "#f2f7fb");
  const n = Math.ceil(VIEW.w * VIEW.h / 3200);
  for (let i = 0; i < n; i++) {
    const x = VIEW.x + (i * 71 + t * 12) % VIEW.w;
    const y = VIEW.y + ((i * 37 + t * 26) % (VIEW.h + 20)) - 10;
    el(g, x, y, 2.2, 2.2, "rgba(255,255,255,0.9)");
  }
};

BG.yoru = function (g, t) {                                     // よる
  sky(g, "#1e2647", "#3a4570");
  const sh = Math.max(60, 150 - VIEW.y);
  const n = Math.ceil(VIEW.w * sh / 950);
  for (let i = 0; i < n; i++) {
    const x = VIEW.x + (i * 83) % VIEW.w, y = VIEW.y + (i * 47) % sh;
    el(g, x, y, 1.4, 1.4, "rgba(255,255,255," + (0.4 + 0.5 * Math.abs(Math.sin(t * 2 + i))) + ")");
  }
  el(g, 300, VIEW.y + 46, 20, 20, "#f6e9b0");
  el(g, 292, VIEW.y + 42, 17, 17, "#2b3358");
  hills(g, 172, "#2c3556");
  ground(g, "#39426a");
};

BG.ie = function (g, t) {                                       // うちの中（板の間）
  sky(g, "#f3e6cf", "#e8d6b6");
  const x0 = VIEW.x, x1 = VIEW.x + VIEW.w, bottom = VIEW.y + VIEW.h;
  g.fillStyle = "#d9c39b";
  g.fillRect(x0, GROUND, VIEW.w, bottom - GROUND);
  for (let x = Math.floor(x0 / 45) * 45; x < x1; x += 45) ln(g, [x, GROUND, x, bottom], "#c9b088", 2);
  ln(g, [x0, GROUND, x1, GROUND], "#b99f75", 3);
  rr(g, 70, 96, 74, 60, 6, "#c9a06b");                          // まど
  rr(g, 70, 96, 64, 50, 4, "#a8d8ee");
  ln(g, [70, 71, 70, 121], "#c9a06b", 4);
};

/* ------------------------------------------------------ わき役と小道具 */

A.kirigirisu = function (g, o) {                                // キリギリス（わき役）
  const m = begin(g, o), gr = "#7fb84a";
  shadow(g, 0, 0, 12);
  g.translate(0, -(o.hop || 0));
  el(g, 6, -14, 11, 7, gr, -0.15);
  el(g, -8, -18, 7, 6, gr);                                     // あたま
  ln(g, [-11, -22, -18, -30], gr, 1.6);
  ln(g, [-8, -23, -12, -32], gr, 1.6);
  ln(g, [-6, -13, -9, 0], gr, 2);                               // まえあし
  ln(g, [2, -10, 5, 0], gr, 2);
  ln(g, [10, -12, 4, -19, 13, 0], gr, 2.4);                     // うしろあし
  el(g, 8, -18, 10, 4, "#a6d472", -0.25);                       // はね
  eye(g, -10, -19, 1.8, m.mood, m.blink);
  if (o.violin) {                                               // バイオリン
    rr(g, -2, -24, 12, 5, 2.5, "#b5703a");
    ln(g, [-10, -30, 8, -22], "#8a5a2c", 1.4);
  }
  g.restore();
};

const P = {};

P.budou = function (g, x, y, t) {                               // ぶどう
  ln(g, [x + 90, y - 40, x - 60, y - 30], "#7a5a3c", 6);        // えだ
  el(g, x + 40, y - 34, 12, 6, "#5f9c60", -0.2);
  el(g, x - 30, y - 30, 11, 6, "#5f9c60", 0.15);
  ln(g, [x, y - 32, x, y - 12], "#6b8f3a", 3);
  el(g, x - 12, y - 28, 12, 6, "#7fb84a", -0.3);
  const sway = Math.sin(t * 1.6) * 1.5;
  for (let r = 0; r < 4; r++) for (let c = 0; c <= r; c++) {
    el(g, x + sway + (c - r / 2) * 9, y - 4 + r * 8, 5, 5, "#8e6bc0");
    el(g, x + sway + (c - r / 2) * 9 - 1.4, y - 6 + r * 8, 1.6, 1.6, "rgba(255,255,255,0.5)");
  }
};

P.ami = function (g, x, y, w, h) {                              // あみ
  g.save();
  g.strokeStyle = "rgba(90,70,55,0.85)";
  g.lineWidth = 1.4;
  for (let i = -w; i <= w; i += 11) { g.beginPath(); g.moveTo(x + i, y - h); g.lineTo(x + i + h, y + h); g.stroke(); }
  for (let i = -w; i <= w; i += 11) { g.beginPath(); g.moveTo(x + i, y - h); g.lineTo(x + i - h, y + h); g.stroke(); }
  g.restore();
};

P.mizusashi = function (g, x, y, s, level) {                    // みずさし（level 0〜1）
  const w = 26 * s, h = 44 * s;
  g.save();
  g.beginPath();
  g.roundRect(x - w / 2, y - h, w, h, [10 * s, 10 * s, 6 * s, 6 * s]);
  g.clip();
  g.fillStyle = "#e6dcc8"; g.fillRect(x - w, y - h - 5, w * 2, h + 10);
  g.fillStyle = "#63b6d8";
  g.fillRect(x - w, y - h * level, w * 2, h * level);
  g.restore();
  g.beginPath();
  g.roundRect(x - w / 2, y - h, w, h, [10 * s, 10 * s, 6 * s, 6 * s]);
  g.strokeStyle = "#b9a887"; g.lineWidth = 2.4 * s; g.stroke();
  el(g, x, y - h, w / 2, 4 * s, "#d8ccb2");
};

P.ishi = function (g, x, y, s, c) {                             // 小石
  el(g, x, y, 5 * s, 4 * s, c || "#a49a90");
};

P.niku = function (g, x, y, s) {                                // にく
  g.save(); g.translate(x, y); g.scale(s, s);
  el(g, 0, 0, 13, 8, "#d98a7a", -0.15);
  el(g, -4, -2, 6, 4, "#eba99a", -0.15);
  ln(g, [10, 2, 17, 5], "#f0e6d8", 5);
  g.restore();
};

P.kabe = function (g, x, y, w, h) {                             // かべ
  g.fillStyle = "#c9a07b";
  g.fillRect(x - w / 2, y - h, w, h);
  g.strokeStyle = "rgba(150,110,80,0.6)"; g.lineWidth = 1.4;
  for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(x - w / 2, y - h * i / 5); g.lineTo(x + w / 2, y - h * i / 5); g.stroke(); }
};

P.hata = function (g, x, y, t) {                                // ゴールの旗
  ln(g, [x, y, x, y - 54], "#8a6a4a", 3.4);
  g.beginPath();
  g.moveTo(x + 2, y - 54);
  g.quadraticCurveTo(x + 20, y - 48 + Math.sin(t * 3) * 3, x + 34, y - 44);
  g.quadraticCurveTo(x + 20, y - 40, x + 2, y - 34);
  g.fillStyle = "#e0603f"; g.fill();
};

P.fukidashi = function (g, x, y, w, h, tailx) {                 // ふきだし
  g.beginPath();
  g.roundRect(x - w / 2, y - h, w, h, 10);
  g.moveTo(tailx, y);
  g.lineTo(tailx + 8, y - 2);
  g.lineTo(tailx + 2, y + 10);
  g.closePath();
  g.fillStyle = "rgba(255,255,255,0.92)"; g.fill();
  g.strokeStyle = "rgba(60,60,70,0.25)"; g.lineWidth = 1.4; g.stroke();
};

P.mark = function (g, x, y, kind, s, a) {                       // ！ ？ ♪ zzz などの記号
  g.save();
  g.globalAlpha = a == null ? 1 : a;
  g.fillStyle = "#3d4356";
  g.font = "bold " + (22 * (s || 1)) + "px 'Hiragino Sans','Yu Gothic',system-ui,sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(kind, x, y);
  g.restore();
};

P.ase = function (g, x, y, t) {                                 // あせ
  for (let i = 0; i < 3; i++) {
    const p = ((t * 1.2 + i * 0.33) % 1);
    el(g, x + i * 7 - 7, y + p * 14, 2.4, 3.2, "rgba(90,170,220," + (1 - p) + ")");
  }
};

/* ------------------------------------------------- ここから 2回目に足した分 */

A.neko = function (g, o) {                                     // ねこ
  const m = begin(g, o), fur = "#b9a894", dark = "#8c7c68";
  shadow(g, 0, 0, 20);
  g.translate(0, -(o.hop || 0));
  curve(g, 16, -18, 30, -22, 26, -42, fur, 4.5);               // しっぽ
  el(g, 0, -20, 17, 13, fur);
  for (let i = -1; i <= 1; i++) el(g, i * 8, -26, 4.5, 2.4, dark);
  legs(g, [-9, 8], -8, 8, 5.5, fur, m.walk, m.t);
  el(g, -15, -33, 11.5, 10.5, fur);                            // あたま
  tri(g, -23, -40, -22, -51, -13, -41, fur);                   // 耳
  tri(g, -12, -41, -6, -50, -4, -39, fur);
  el(g, -21, -29, 6, 4, "#f0e6d8");                            // 口もと
  el(g, -24, -31, 2, 1.6, "#e58a9c");
  ln(g, [-24, -30, -33, -33], "#a89880", 1); ln(g, [-24, -29, -33, -26], "#a89880", 1);
  eye(g, -18, -34, 2.4, m.mood, m.blink);
  g.restore();
};

A.saru = function (g, o) {                                     // さる
  const m = begin(g, o), fur = "#8b6244", skin = "#f0c9a8";
  shadow(g, 0, 0, 20);
  g.translate(0, -(o.hop || 0));
  curve(g, 15, -26, 36, -34, 30, -12, fur, 3.4);               // しっぽ
  el(g, 0, -24, 15, 13, fur);
  el(g, -2, -20, 10, 8, skin);
  legs(g, [-8, 8], -12, 12, 5, fur, m.walk, m.t);
  el(g, -21, -38, 4.5, 5, fur); el(g, -7, -38, 4.5, 5, fur);   // 耳
  el(g, -14, -38, 12, 11, fur);                                // あたま
  el(g, -15, -36, 8.5, 8.5, skin);
  eye(g, -18, -38, 2.1, m.mood, m.blink);
  eye(g, -11, -38, 2.1, m.mood, m.blink);
  curve(g, -19, -31, -15, -28, -11, -31, "#a5744f", 1.5);
  g.restore();
};

A.tanuki = function (g, o) {                                   // たぬき
  const m = begin(g, o), fur = "#7d6a58", pale = "#dccbb4", dark = "#4a4038";
  shadow(g, 0, 0, 22);
  g.translate(0, -(o.hop || 0));
  el(g, 19, -22, 10, 6, fur, -0.2);                            // しっぽ
  el(g, 24, -24, 5, 4.5, dark);
  el(g, 0, -22, 18, 14, fur);
  el(g, -3, -17, 12, 8, pale);
  legs(g, [-9, 9], -9, 9, 6, dark, m.walk, m.t);
  el(g, -22, -43, 4.5, 4.5, fur); el(g, -9, -44, 4.5, 4.5, fur); // 耳
  el(g, -15, -35, 12.5, 11.5, fur);                            // あたま
  el(g, -19, -36, 5.5, 4.5, dark);                             // 目のまわりの もよう
  el(g, -21, -30, 6, 4.5, pale);
  el(g, -25, -31, 2, 1.6, "#3a2a22");
  eye(g, -19, -36, 2.1, m.mood, m.blink);
  g.restore();
};

A.kaeru = function (g, o) {                                    // かえる
  const m = begin(g, o), gr = "#6bb36a", pale = "#cfe6a8";
  const s2 = 1 + (o.puff || 0) * 0.5;                          // ふくらむ
  shadow(g, 0, 0, 16 * s2);
  g.translate(0, -(o.hop || 0));
  g.save(); g.scale(s2, s2);
  ln(g, [10, -6, 16, -2], gr, 4); ln(g, [-10, -6, -16, -2], gr, 4);
  el(g, 0, -12, 15, 12, gr);                                   // からだ
  el(g, 0, -8, 10, 7, pale);
  el(g, -8, -22, 6, 5.5, gr); el(g, 4, -23, 6, 5.5, gr);       // めだま
  eye(g, -8, -22, 2.6, m.mood, m.blink);
  eye(g, 4, -23, 2.6, m.mood, m.blink);
  curve(g, -13, -14, -6, -9, 4, -13, "#4e8f52", 1.6);
  g.restore();
  g.restore();
};

A.kuma = function (g, o) {                                     // くま
  const m = begin(g, o), fur = "#8a6146", pale = "#d9bfa2";
  shadow(g, 0, 0, 26);
  g.translate(0, -(o.hop || 0));
  el(g, 0, -28, 20, 17, fur);
  legs(g, [-11, 11], -12, 12, 8, fur, m.walk, m.t);
  el(g, -24, -53, 5.5, 5.5, fur); el(g, -9, -54, 5.5, 5.5, fur); // 耳
  el(g, -16, -43, 13.5, 12.5, fur);                            // あたま
  el(g, -23, -38, 7, 5, pale);
  el(g, -27, -40, 2.4, 1.9, "#3a2a22");
  eye(g, -19, -45, 2.4, m.mood, m.blink);
  g.restore();
};

A.hitsuji = function (g, o) {                                  // ひつじ
  const m = begin(g, o), wool = "#f7f3ea", dark = "#5a5560";
  shadow(g, 0, 0, 22);
  g.translate(0, -(o.hop || 0));
  legs(g, [-9, 9], -10, 10, 4.5, dark, m.walk, m.t);
  el(g, 0, -24, 17, 13, wool);                                 // もこもこ
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2;
    el(g, Math.cos(a) * 15, -24 + Math.sin(a) * 11, 7, 6.5, wool);
  }
  el(g, -19, -34, 8, 9, dark);                                 // かお
  el(g, -25, -38, 5, 3.2, dark, 0.3); el(g, -13, -39, 5, 3.2, dark, -0.3);
  el(g, -20, -42, 7, 5, wool);
  eye(g, -22, -34, 2.1, m.mood === "happy" ? "happy" : m.mood, m.blink);
  g.restore();
};

A.ookami = function (g, o) {                                   // おおかみ
  const m = begin(g, o), fur = "#7c8494", pale = "#dfe3ea";
  shadow(g, 0, 0, 24);
  g.translate(0, -(o.hop || 0));
  curve(g, 17, -24, 30, -22, 27, -6, fur, 6);                  // しっぽ
  el(g, 0, -24, 19, 14, fur);
  el(g, -2, -18, 14, 7, pale);
  legs(g, [-11, 9], -11, 11, 5.5, fur, m.walk, m.t);
  el(g, -13, -32, 9, 8, fur);
  el(g, -18, -39, 12, 11, fur);                                // あたま
  tri(g, -26, -47, -23, -59, -15, -46, fur);                   // 耳
  tri(g, -14, -47, -9, -58, -6, -45, fur);
  el(g, -28, -35, 7, 4.5, pale, 0.15);                         // 口もと
  el(g, -33, -36, 2, 1.7, "#2f3340");
  eye(g, -22, -41, 2.3, m.mood, m.blink);
  g.restore();
};

A.hato = function (g, o) {                                     // はと
  const m = begin(g, o), b = "#dfe4ec", b2 = "#c3cbd8";
  if (!o.fly) shadow(g, 0, 0, 15);
  g.translate(0, -(o.hop || 0) - (o.fly || 0));
  const wing = o.fly ? Math.sin(m.t * 10) * 14 : 0;
  el(g, 12, -22, 11, 5, b2, -0.35 + wing * 0.03);              // しっぽ
  el(g, 0, -22, 15, 11, b);
  el(g, 1, -25, 11, 5.5, b2, -0.2 - wing * 0.04);              // つばさ
  if (!o.fly) { ln(g, [-4, -11, -4, -2], "#e08a9a", 2.2); ln(g, [5, -11, 5, -2], "#e08a9a", 2.2); }
  el(g, -13, -33, 8, 7.5, b);                                  // あたま
  tri(g, -19, -34, -27, -32, -19, -30, "#e0a35a");             // くちばし
  eye(g, -15, -35, 2, m.mood, m.blink);
  g.restore();
};

A.kirin = function (g, o) {                                    // きりん
  const m = begin(g, o), fur = "#e8c46a", spot = "#b98b3f";
  shadow(g, 0, 0, 22);
  g.translate(0, -(o.hop || 0));
  legs(g, [-11, 11], -30, 30, 7, fur, m.walk, m.t);
  el(g, 0, -42, 19, 14, fur);                                  // からだ
  for (let i = 0; i < 5; i++) el(g, -12 + i * 7, -44 + (i % 2) * 8, 3.6, 3.2, spot);
  const bend = o.neck || 0;                                    // マイナスで くびを のばす
  ln(g, [-12, -46, -20 + bend * 0.4, -84 + bend], fur, 12);    // くび
  el(g, -22 + bend * 0.5, -70 + bend * 0.5, 3.4, 3, spot);
  el(g, -25 + bend * 0.5, -89 + bend, 9, 7, fur);              // あたま
  ln(g, [-27 + bend * 0.5, -95 + bend, -28 + bend * 0.5, -101 + bend], spot, 2.6);
  ln(g, [-21 + bend * 0.5, -95 + bend, -20 + bend * 0.5, -101 + bend], spot, 2.6);
  el(g, -32 + bend * 0.5, -87 + bend, 4, 3, fur);
  eye(g, -26 + bend * 0.5, -91 + bend, 2.1, m.mood, m.blink);
  g.restore();
};

A.kani = function (g, o) {                                     // かに（わき役）
  const m = begin(g, o), r = "#d1543f";
  shadow(g, 0, 0, 14);
  g.translate(0, -(o.hop || 0));
  legs(g, [-7, 0, 7], -8, 8, 2.4, r, m.walk, m.t);
  el(g, 0, -12, 14, 9, r);                                     // こうら
  el(g, -17, -14, 6, 5, r, -0.3); el(g, 17, -14, 6, 5, r, 0.3); // はさみ
  ln(g, [-11, -16, -13, -14], "#a63f2e", 2); ln(g, [11, -16, 13, -14], "#a63f2e", 2);
  ln(g, [-4, -19, -4, -24], r, 1.8); ln(g, [4, -19, 4, -24], r, 1.8);
  eye(g, -4, -25, 1.8, m.mood, m.blink);
  eye(g, 4, -25, 1.8, m.mood, m.blink);
  g.restore();
};

A.tsuru = function (g, o) {                                    // つる（わき役）
  const m = begin(g, o), w = "#fbfbf7";
  shadow(g, 0, 0, 16);
  g.translate(0, -(o.hop || 0));
  legs(g, [-4, 5], -26, 26, 3, "#4a4a52", m.walk, m.t);
  el(g, 0, -34, 16, 10, w);                                    // からだ
  el(g, 15, -33, 8, 4.5, "#3a3f52", 0.15);                     // しっぽ
  const bend = o.neck || 0;
  ln(g, [-10, -38, -20 + bend, -64], w, 6);                    // ながい くび
  el(g, -22 + bend, -67, 6.5, 5.5, w);                         // あたま
  el(g, -22 + bend, -71, 3.4, 2.2, "#d1544a");
  tri(g, -27 + bend, -68, -39 + bend, -66, -27 + bend, -65, "#3a3f52"); // くちばし
  eye(g, -23 + bend, -68, 1.7, m.mood, m.blink);
  g.restore();
};

/* ---------------------------------------------- 2回目に足した 小道具 */

P.suzu = function (g, x, y, s) {                                // すず
  s = s || 1;
  el(g, x, y, 6 * s, 6 * s, "#e8c04a");
  el(g, x, y + 2 * s, 6 * s, 3 * s, "#c9a02f");
  el(g, x, y + 5 * s, 1.6 * s, 1.6 * s, "#8a6a1f");
  el(g, x, y - 6 * s, 2 * s, 2 * s, "#c9a02f");
};

P.onigiri = function (g, x, y, s) {                             // おにぎり
  s = s || 1;
  g.beginPath();
  g.moveTo(x, y - 11 * s); g.lineTo(x + 10 * s, y + 7 * s); g.lineTo(x - 10 * s, y + 7 * s);
  g.closePath(); g.fillStyle = "#fbf6e8"; g.fill();
  rr(g, x, y + 3 * s, 12 * s, 7 * s, 1.5 * s, "#3f4a3f");
};

P.kinomi = function (g, x, y, t, n) {                           // 木の実（えだにつく）
  ln(g, [x - 70, y + 6, x + 70, y - 4], "#7a5a3c", 6);
  for (let i = 0; i < (n || 5); i++) {
    const bx = x - 52 + i * 26, by = y + 6 + Math.sin(t * 1.4 + i) * 1.5;
    el(g, bx, by, 6, 6, "#e07a3f");
    el(g, bx - 1.6, by - 2, 1.8, 1.6, "rgba(255,255,255,0.5)");
  }
};

P.hone = function (g, x, y, s, rot) {                           // ほね
  g.save(); g.translate(x, y); g.rotate(rot || 0); g.scale(s || 1, s || 1);
  rr(g, 0, 0, 18, 5, 2.5, "#f2ece0");
  el(g, -9, -3, 3.4, 3.4, "#f2ece0"); el(g, -9, 3, 3.4, 3.4, "#f2ece0");
  el(g, 9, -3, 3.4, 3.4, "#f2ece0"); el(g, 9, 3, 3.4, 3.4, "#f2ece0");
  g.restore();
};

P.hachinosu = function (g, x, y, t, bees) {                     // はちの す と はち
  ln(g, [x, y - 26, x, y - 14], "#7a5a3c", 3);
  el(g, x, y, 15, 17, "#d8a44a");
  for (let i = 0; i < 3; i++) el(g, x, y - 8 + i * 8, 15 - i, 3, "#b9862f");
  el(g, x, y + 14, 4, 3, "#6b4b1f");
  for (let i = 0; i < (bees || 0); i++) {
    const a = t * 2 + i * 2.1;
    const bx = x + Math.cos(a) * (26 + i * 5), by = y - 6 + Math.sin(a * 1.3) * 16;
    el(g, bx, by, 3.2, 2.6, "#e8c04a");
    ln(g, [bx - 1, by, bx + 2, by], "#4a3a1f", 1.2);
    el(g, bx, by - 3, 2.6, 1.4, "rgba(255,255,255,0.75)");
  }
};

P.mafura = function (g, x, y, s, col) {                         // マフラー
  s = s || 1;
  g.save(); g.translate(x, y); g.scale(s, s);
  rr(g, 0, 0, 30, 8, 4, col || "#d1544a");
  rr(g, 10, 9, 8, 14, 3, col || "#d1544a");
  g.restore();
};

P.keito = function (g, x, y, s) {                               // けいと玉
  s = s || 1;
  el(g, x, y, 10 * s, 10 * s, "#e0a0b0");
  for (let i = -2; i <= 2; i++) curve(g, x - 9 * s, y + i * 3.4 * s, x, y + i * 5 * s, x + 9 * s, y + i * 3.4 * s, "#c9808f", 1.2 * s);
};

P.konoha = function (g, x, y, rot) {                            // 木の葉
  g.save(); g.translate(x, y); g.rotate(rot || 0);
  el(g, 0, 0, 11, 5, "#6ba85e");
  ln(g, [-10, 0, 10, 0], "#4e8a4a", 1.2);
  g.restore();
};
