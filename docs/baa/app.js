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
    fluffy: true, eyeR: 9, eyeX: 17, noseR: 8 },
  { name: "ねこ",   fur: "#b9c9ff", ear: "up",    earColor: "#8fa4e8", note: [587, 740, 880] },
  { name: "うさぎ", fur: "#fff1f6", ear: "long",  earColor: "#ffc7db", note: [659, 831, 988] },
  { name: "くま",   fur: "#c69c7b", ear: "round", earColor: "#a67e5f", note: [440, 554, 659] },
  { name: "ぱんだ", fur: "#ffffff", ear: "round", earColor: "#3d3d3d", note: [494, 622, 740] },
  { name: "ひよこ", fur: "#ffe066", ear: "none",  earColor: "#f0c419", note: [698, 880, 1046] },
  { name: "まるくん", fur: "#ffcf8f", ear: "none", earColor: "#e0a95f", note: [392, 494, 587] },
  { name: "かえる", fur: "#a8e6a3", ear: "frog",  earColor: "#7fcf7a", note: [349, 440, 523] },
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
      return `<ellipse cx="14" cy="54" rx="12" ry="21" fill="${e}"/>
              <ellipse cx="86" cy="54" rx="12" ry="21" fill="${e}"/>`;
    case "up":    // とんがり耳
      return `<path d="M23 30 L30 6 L46 22 Z" fill="${e}"/>
              <path d="M77 30 L70 6 L54 22 Z" fill="${e}"/>`;
    case "long":  // ながい耳
      return `<ellipse cx="36" cy="16" rx="8" ry="20" fill="${e}"/>
              <ellipse cx="64" cy="16" rx="8" ry="20" fill="${e}"/>`;
    case "round": // まるい耳
      return `<circle cx="24" cy="26" r="13" fill="${e}"/>
              <circle cx="76" cy="26" r="13" fill="${e}"/>`;
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
       <circle cx="${50 + eyeX}" cy="${eyeY}" r="${eyeR}" fill="${opt.gray ? "#cfcac3" : "#3d3d3d"}"/>
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
    ${eyes}
    <circle cx="26" cy="68" r="7" fill="#ff9db0" opacity="${opt.gray ? 0 : opt.laugh ? 0.7 : 0.45}"/>
    <circle cx="74" cy="68" r="7" fill="#ff9db0" opacity="${opt.gray ? 0 : opt.laugh ? 0.7 : 0.45}"/>
    <ellipse cx="50" cy="${64 + (noseR - 5) * 0.6}" rx="${noseR}" ry="${noseR * 0.82}" fill="${ink}"/>
    ${opt.gray ? "" : `<ellipse cx="${50 - noseR * 0.3}" cy="${62 + (noseR - 5) * 0.6}" rx="${noseR * 0.22}"
             ry="${noseR * 0.16}" fill="#fff" opacity=".6"/>`}
    ${mouth}
  </svg>`;
}

// ── 音 ────────────────────────────────────────────────────
let ac = null;
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
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
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

function say(text) {
  if (!soundOn || !("speechSynthesis" in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP";
    u.rate = 0.95;
    u.pitch = 1.5;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch (_) { /* 読み上げが無い端末は音だけ */ }
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
  beep(current.note);
  say(first ? "はじめまして" : "ばあ");
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
  giggle();
  say("きゃはは");
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

function showZoom(c) {
  zoom.innerHTML = `<div class="zoomface">${faceSvg(c)}</div><div class="zoomname">${c.name}</div>`;
  zoom.className = "";
  void zoom.offsetWidth; // アニメを最初から流し直す
  zoom.className = "on";
  clearTimeout(zoomTimer);
  zoomTimer = setTimeout(() => { zoom.className = ""; }, 1100);
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
      if (audio()) {
        tone(f, 0, 0.5, "triangle", 0.26);
        tone(f * 2, 0, 0.22, "sine", 0.08);
      }
      b.classList.remove("hit");
      void b.offsetWidth;
      b.classList.add("hit");
      showZoom(c);
      say(c.name);
      sparkle(e.clientX, e.clientY, 6);
      if (navigator.vibrate) navigator.vibrate(12);
    });
    pads.appendChild(b);
  });
}

function setMode(next) {
  mode = next;
  if (zoom) zoom.className = "";
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
