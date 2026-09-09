// えらぶ画面と、おはなしの再生。どちらも canvas に毎コマ描いている。
// 動画ファイルは持たない（重いうえに、作るのに お金の かかる 道具が いるため）。

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function fit(canvas, w, h) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return g;
  }

  /* ------------------------------------------------------- よみあげ（無料） */
  // 端末が持っている音声を使う。使えない端末では黙って何もしない。

  const speech = {
    ok: "speechSynthesis" in window,
    on: localStorage.getItem("dobutsu.voice") !== "off",
    busy: false,                        // いま しゃべっている さいちゅうか
    say(text) {
      this.busy = false;
      if (!this.ok || !this.on) return;
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "ja-JP";
        u.rate = 0.92;
        u.pitch = 1.05;
        u.onend = u.onerror = () => { this.busy = false; };
        this.busy = true;
        speechSynthesis.speak(u);
      } catch (e) { this.busy = false; /* 読み上げが無くても お話は進む */ }
    },
    // ほんとうに いま しゃべっているか（声が入っていない端末で 止まらないように）
    isSpeaking() {
      if (!this.ok || !this.on || !this.busy) return false;
      try { return speechSynthesis.speaking || speechSynthesis.pending; } catch (e) { return false; }
    },
    stop() { this.busy = false; if (this.ok) { try { speechSynthesis.cancel(); } catch (e) {} } },
    set(v) {
      this.on = v;
      localStorage.setItem("dobutsu.voice", v ? "on" : "off");
      if (!v) this.stop();
      $("voice").checked = v;
      $("voiceHome").checked = v;
    },
  };

  // 見ているあいだ 画面が 暗くならないように。対応していない端末では 何もしない。
  let wake = null;
  function keepAwake(on) {
    try {
      if (on && !wake && "wakeLock" in navigator) {
        navigator.wakeLock.request("screen").then((w) => { wake = w; w.addEventListener("release", () => { wake = null; }); }).catch(() => {});
      } else if (!on && wake) {
        wake.release().catch(() => {});
        wake = null;
      }
    } catch (e) { /* 使えなくても お話は見られる */ }
  }

  /* --------------------------------------------------------------- カード */

  const cards = [];

  function buildGrid() {
    const grid = $("grid");
    STORIES.forEach((s, i) => {
      const b = document.createElement("button");
      b.className = "card";
      b.type = "button";
      b.setAttribute("aria-label", s.name + "。" + s.title + " を みる");
      const cv = document.createElement("canvas");
      cv.width = 120; cv.height = 96;
      b.appendChild(cv);
      const n = document.createElement("span");
      n.className = "n"; n.textContent = s.name;
      const d = document.createElement("span");
      d.className = "s"; d.textContent = s.title;
      b.appendChild(n); b.appendChild(d);
      b.addEventListener("click", () => open(i));
      grid.appendChild(b);
      cards.push({ story: s, g: fit(cv, 120, 96) });
    });
  }

  function paintCards(t) {
    cards.forEach((c, i) => {
      const g = c.g;
      g.clearRect(0, 0, 120, 96);
      const gr = g.createLinearGradient(0, 0, 0, 96);
      gr.addColorStop(0, "#ffffff");
      gr.addColorStop(1, c.story.color);
      g.fillStyle = gr;
      g.beginPath(); g.roundRect(0, 0, 120, 96, 12); g.fill();
      g.save();
      g.beginPath(); g.roundRect(0, 0, 120, 96, 12); g.clip();
      c.story.card(g, reduce ? 0 : t + i * 0.7);
      g.restore();
    });
  }

  /* --------------------------------------------------------- おはなし再生 */

  const stage = $("stage");
  const gs = stage.getContext("2d");

  // 絵は、あいている場所いっぱいに 広げる（たてよこの ひはそのまま）。
  // 大きく出しても ぼやけないように、画面の細かさに あわせて 点の数も ふやす。
  function layoutStage() {
    const wrap = stage.parentElement;
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) return;
    const k = Math.min(w / W, h / H);
    const cw = Math.max(1, Math.floor(W * k)), ch = Math.max(1, Math.floor(H * k));
    stage.style.width = cw + "px";
    stage.style.height = ch + "px";
    stage.width = Math.round(cw * dpr);
    stage.height = Math.round(ch * dpr);
    gs.setTransform((cw / W) * dpr, 0, 0, (ch / H) * dpr, 0, 0);
  }

  let opener = null;               // どのカードから 開いたか（もどったとき ここに かえす）

  const play = {
    story: null,
    scene: 0,
    at: 0,           // その場面が はじまってからの秒
    wait: 0,         // 読み上げの終わりを まっている秒
    running: false,
    done: false,
  };

  function open(index) {
    opener = document.activeElement;
    play.story = STORIES[index];
    play.scene = 0; play.at = 0; play.wait = 0; play.running = true; play.done = false;
    $("title").textContent = play.story.title;
    $("player").hidden = false;
    $("player").setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    buildDots();
    layoutStage();
    showScene(true);
    setPlayIcon();
    keepAwake(true);
    $("back").focus();
  }

  function close() {
    play.running = false;
    play.story = null;
    speech.stop();
    keepAwake(false);
    $("player").hidden = true;
    $("player").setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (opener && opener.focus) opener.focus();
  }

  function buildDots() {
    const d = $("dots");
    d.textContent = "";
    play.story.scenes.forEach(() => d.appendChild(document.createElement("i")));
  }

  function showScene(speak) {
    const sc = play.story.scenes[play.scene];
    $("caption").textContent = sc.text;
    layoutStage();
    [].forEach.call($("dots").children, (el, i) => {
      el.className = i === play.scene ? "on" : "";
    });
    if (speak) speech.say(sc.text);
  }

  function go(delta) {
    const n = play.scene + delta;
    if (n < 0 || n >= play.story.scenes.length) return;
    play.scene = n; play.at = 0; play.wait = 0; play.done = false;
    play.running = true;
    keepAwake(true);
    setPlayIcon();
    showScene(true);
  }

  function setPlayIcon() {
    const b = $("play");
    if (play.done) { b.textContent = "↺"; b.setAttribute("aria-label", "はじめから"); }
    else if (play.running) { b.textContent = "■"; b.setAttribute("aria-label", "とめる"); }
    else { b.textContent = "▶"; b.setAttribute("aria-label", "つづき"); }
  }

  function restart() {
    play.scene = 0; play.at = 0; play.wait = 0; play.done = false; play.running = true;
    showScene(true);
    setPlayIcon();
    keepAwake(true);
  }

  function drawStage(t, dt) {
    const st = play.story;
    if (!st) return;
    const sc = st.scenes[play.scene];

    if (play.running && !play.done) {
      play.at += dt;
      if (play.at >= sc.sec) {
        // まだ しゃべっている とちゅうなら、言い終わるまで まつ
        if (speech.isSpeaking() && play.wait < 8) {
          play.at = sc.sec;
          play.wait += dt;
        } else if (play.scene < st.scenes.length - 1) {
          play.scene++; play.at = 0; play.wait = 0;
          showScene(true);
        } else {
          play.at = sc.sec; play.wait = 0;
          play.running = false; play.done = true;
          keepAwake(false);
          setPlayIcon();
        }
      }
    }

    const cur = st.scenes[play.scene];
    const p = Math.max(0, Math.min(1, play.at / cur.sec));
    gs.clearRect(0, 0, W, H);
    gs.save();
    gs.translate(W / 2, H); gs.scale(1.12, 1.12); gs.translate(-W / 2, -H);  // すこし寄る
    (BG[cur.bg] || BG.hara)(gs, t);
    cur.act(gs, p, t);
    gs.restore();

    // 場面の進み具合を、いちばん下の細い線で出す
    gs.fillStyle = "rgba(255,255,255,0.45)";
    gs.fillRect(0, H - 3, W, 3);
    gs.fillStyle = "rgba(47,122,74,0.85)";
    gs.fillRect(0, H - 3, W * ((play.scene + p) / st.scenes.length), 3);
  }

  /* ------------------------------------------------------------- コマ送り */

  let last = performance.now();

  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;                 // 裏に回っていた分は進めない
    const t = now / 1000;
    if (play.story) drawStage(t, dt);
    else paintCards(t);
    requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------- つなぎこみ */

  buildGrid();

  $("back").addEventListener("click", close);
  $("again").addEventListener("click", restart);
  $("prev").addEventListener("click", () => go(-1));
  $("next").addEventListener("click", () => go(1));
  $("play").addEventListener("click", () => {
    if (play.done) { restart(); return; }
    play.running = !play.running;
    keepAwake(play.running);
    if (play.running) speech.say(play.story.scenes[play.scene].text);
    else speech.stop();
    setPlayIcon();
  });

  stage.addEventListener("click", () => $("play").click());

  [$("voice"), $("voiceHome")].forEach((el) => {
    el.checked = speech.on;
    el.addEventListener("change", () => speech.set(el.checked));
  });
  if (!speech.ok) {
    document.querySelectorAll(".voice").forEach((el) => { el.hidden = true; });
  }

  document.addEventListener("keydown", (e) => {
    if (!play.story) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowRight") go(1);
    if (e.key === "ArrowLeft") go(-1);
    if (e.key === " ") { e.preventDefault(); $("play").click(); }
  });

  window.addEventListener("resize", layoutStage);
  window.addEventListener("orientationchange", () => setTimeout(layoutStage, 250));

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && play.story) {
      play.running = false;
      speech.stop();
      keepAwake(false);
      setPlayIcon();
    }
  });

  requestAnimationFrame(frame);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
})();
