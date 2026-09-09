/*
 * いないいないばあ。
 * 画面のどこを押しても、手がひらいて誰かが出てくる。まちがいはない。
 * 通信は一切しない。絵は SVG をその場で組み立て、音は Web Audio で作る。
 */

// ── 出てくる子たち（どれも自作。実在のキャラクターは使わない）───────────
const CHARAS = [
  { name: "いぬ",   fur: "#fbf8f2", ear: "drop",  earColor: "#d8c6a8", note: [523, 659, 784], word: "ばあ！",
    fluffy: true, eyeR: 9, eyeX: 17, noseR: 8 },
  { name: "ねこ",   fur: "#b9c9ff", ear: "up",    earColor: "#8fa4e8", note: [587, 740, 880], word: "ばあ！" },
  { name: "うさぎ", fur: "#fff1f6", ear: "long",  earColor: "#ffc7db", note: [659, 831, 988], word: "ばあ！" },
  { name: "くま",   fur: "#c69c7b", ear: "round", earColor: "#a67e5f", note: [440, 554, 659], word: "ばあ！" },
  { name: "ぱんだ", fur: "#ffffff", ear: "round", earColor: "#3d3d3d", note: [494, 622, 740], word: "ばあ！" },
  { name: "ひよこ", fur: "#ffe066", ear: "none",  earColor: "#f0c419", note: [698, 880, 1046], word: "ばあ！" },
  { name: "まるくん", fur: "#ffcf8f", ear: "none", earColor: "#e0a95f", note: [392, 494, 587], word: "ばあ！" },
  { name: "かえる", fur: "#a8e6a3", ear: "frog",  earColor: "#7fcf7a", note: [349, 440, 523], word: "ばあ！" },
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

function faceSvg(c) {
  const eyeY = c.ear === "frog" ? 26 : 52;
  const eyeX = c.ear === "frog" ? 20 : (c.eyeX || 14);
  const eyeR = c.eyeR || 5.5;
  const noseR = c.noseR || 5;
  const face = c.fluffy
    ? `<path d="${fluffPath(50, 54, 35, 13)}" fill="${c.fur}" stroke="rgba(0,0,0,.10)" stroke-width="1.5"/>`
    : `<circle cx="50" cy="54" r="38" fill="${c.fur}" stroke="rgba(0,0,0,.10)" stroke-width="1.5"/>`;
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    ${ears(c)}
    ${face}
    ${c.eyeR ? `<circle cx="${50 - eyeX}" cy="${eyeY}" r="${eyeR + 1.5}" fill="#fff"/>
    <circle cx="${50 + eyeX}" cy="${eyeY}" r="${eyeR + 1.5}" fill="#fff"/>` : ""}
    <circle cx="${50 - eyeX}" cy="${eyeY}" r="${eyeR}" fill="#3d3d3d"/>
    <circle cx="${50 + eyeX}" cy="${eyeY}" r="${eyeR}" fill="#3d3d3d"/>
    <circle cx="${50 - eyeX + eyeR * 0.35}" cy="${eyeY - eyeR * 0.35}" r="${eyeR * 0.34}" fill="#fff"/>
    <circle cx="${50 + eyeX + eyeR * 0.35}" cy="${eyeY - eyeR * 0.35}" r="${eyeR * 0.34}" fill="#fff"/>
    <circle cx="26" cy="68" r="7" fill="#ff9db0" opacity=".45"/>
    <circle cx="74" cy="68" r="7" fill="#ff9db0" opacity=".45"/>
    <ellipse cx="50" cy="${64 + (noseR - 5) * 0.6}" rx="${noseR}" ry="${noseR * 0.82}" fill="#5b4033"/>
    <ellipse cx="${50 - noseR * 0.3}" cy="${62 + (noseR - 5) * 0.6}" rx="${noseR * 0.22}" ry="${noseR * 0.16}" fill="#fff" opacity=".6"/>
    <path d="M38 ${76 + (noseR - 5)} Q50 ${88 + (noseR - 5)} 62 ${76 + (noseR - 5)}" stroke="#5b4033" stroke-width="3.5" fill="none" stroke-linecap="round"/>
  </svg>`;
}

// ── 音 ────────────────────────────────────────────────────
let ac = null;
let soundOn = localStorage.getItem("baa-sound") !== "off";

function beep(freqs) {
  if (!soundOn) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === "suspended") ac.resume();
    freqs.forEach((f, i) => {
      const t = ac.currentTime + i * 0.09;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      osc.connect(gain).connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.36);
    });
  } catch (_) { /* 音が出せない端末でも遊べる */ }
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

// ── 画面 ──────────────────────────────────────────────────
const stage = document.getElementById("stage");
const chara = document.getElementById("chara");
const word = document.getElementById("word");
const sndBtn = document.getElementById("snd");

let open = false;
let busy = false;
let last = -1;

function pick(arr) {
  let i = Math.floor(Math.random() * arr.length);
  if (arr === CHARAS && i === last) i = (i + 1) % arr.length;
  if (arr === CHARAS) last = i;
  return arr[i];
}

function sparkle() {
  const n = 10;
  for (let i = 0; i < n; i++) {
    const s = document.createElement("div");
    const a = (Math.PI * 2 * i) / n;
    const d = 90 + Math.random() * 70;
    s.className = "spark";
    s.style.left = "50%";
    s.style.top = "45%";
    s.style.background = ["#ffd166", "#ff8fab", "#8ec5ff", "#a8e6a3"][i % 4];
    s.style.setProperty("--dx", `${Math.cos(a) * d}px`);
    s.style.setProperty("--dy", `${Math.sin(a) * d}px`);
    stage.appendChild(s);
    setTimeout(() => s.remove(), 950);
  }
}

function show() {
  const c = pick(CHARAS);
  const bg = pick(BG);
  const cloth = pick(CLOTH);

  document.documentElement.style.setProperty("--bg", bg);
  document.documentElement.style.setProperty("--cloth-a", cloth[0]);
  document.documentElement.style.setProperty("--cloth-b", cloth[1]);
  document.querySelector('meta[name="theme-color"]').setAttribute("content", bg);

  chara.innerHTML = faceSvg(c);
  chara.className = "";
  void chara.offsetWidth; // アニメを最初から流し直す
  chara.className = "pop";
  chara.addEventListener("animationend", () => { chara.className = "wobble"; }, { once: true });

  word.textContent = c.word;
  word.className = "";
  void word.offsetWidth;
  word.className = "show";

  document.body.classList.add("open");
  beep(c.note);
  say("ばあ");
  sparkle();
  if (navigator.vibrate) navigator.vibrate(20);
  open = true;
}

function hide() {
  document.body.classList.remove("open");
  chara.className = "";
  word.className = "";
  open = false;
}

function tap() {
  if (busy) return;
  busy = true;
  if (open) {
    hide();
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

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
