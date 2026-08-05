(() => {
  "use strict";

  const W = 460, H = 720;
  const TRACK = { cx: 230, cy: 280, rx: 174, ry: 108 };
  const TODO = { x: 230, y: 568 };
  const PLATES = 11;
  const REACH = 0.34;              // sin(角度) がこれ以上なら手が届く

  // <head> をこちらで書けない場所（Artifact など）でも、
  // ホーム画面に追加したときアプリらしく開くようにしておく
  for (const [name, content] of [
    ["apple-mobile-web-app-capable", "yes"],
    ["mobile-web-app-capable", "yes"],
    ["apple-mobile-web-app-status-bar-style", "black-translucent"],
    ["apple-mobile-web-app-title", "晩酌"],
    ["theme-color", "#0b1220"],
  ]) {
    if (!document.querySelector(`meta[name="${name}"]`)) {
      const m = document.createElement("meta");
      m.name = name;
      m.content = content;
      document.head.appendChild(m);
    }
  }

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // --- お品書き ---------------------------------------------------------
  const MENU = [
    { id: "beer",  name: "ビール", color: "#e9a13b", deep: "#9c6316", lite: "#f6c377" },
    { id: "soda",  name: "ラムネ", color: "#46a8e5", deep: "#1a648f", lite: "#8fd0f5" },
    { id: "sushi", name: "寿司",   color: "#e8637a", deep: "#8d2440", lite: "#f5a3b2" },
    { id: "niku",  name: "肉",     color: "#a9714a", deep: "#5f3a20", lite: "#d2a480" },
    { id: "mame",  name: "枝豆",   color: "#62b96b", deep: "#2b6f36", lite: "#a2dda8" },
    { id: "budo",  name: "葡萄",   color: "#a06ad4", deep: "#5d3387", lite: "#c9a5ec" },
  ];
  const TOKUJO = { id: "tokujo", name: "特上", color: "#f6e08a", deep: "#b08c1e", lite: "#fdf3c4" };

  // 品のアイコン。原点中心・一辺1で描き、呼び出し側で拡大する。
  const INK = "#241713", PAPER = "#f6efe2";
  function drawIcon(kind, x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size, size);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.fillStyle = INK;
    ctx.strokeStyle = INK;

    if (kind.id === "beer") {
      ctx.beginPath();
      ctx.moveTo(-0.3, -0.16); ctx.lineTo(0.22, -0.16); ctx.lineTo(0.16, 0.42); ctx.lineTo(-0.24, 0.42);
      ctx.closePath(); ctx.fill();
      ctx.lineWidth = 0.09;
      ctx.beginPath(); ctx.arc(0.32, 0.04, 0.16, -Math.PI * 0.5, Math.PI * 0.5); ctx.stroke();
      ctx.fillStyle = PAPER;
      ctx.beginPath();
      ctx.arc(-0.22, -0.26, 0.13, 0, Math.PI * 2);
      ctx.arc(-0.02, -0.33, 0.16, 0, Math.PI * 2);
      ctx.arc(0.18, -0.25, 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-0.32, -0.26, 0.56, 0.14);
    } else if (kind.id === "soda") {
      ctx.beginPath();
      ctx.moveTo(-0.1, -0.44); ctx.lineTo(0.1, -0.44); ctx.lineTo(0.1, -0.24);
      ctx.quadraticCurveTo(0.28, -0.12, 0.28, 0.16);
      ctx.quadraticCurveTo(0.28, 0.44, 0, 0.44);
      ctx.quadraticCurveTo(-0.28, 0.44, -0.28, 0.16);
      ctx.quadraticCurveTo(-0.28, -0.12, -0.1, -0.24);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = PAPER;
      ctx.beginPath(); ctx.arc(0, -0.2, 0.075, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-0.09, 0.19, 0.06, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(0.08, 0.28, 0.045, 0, Math.PI * 2); ctx.fill();
    } else if (kind.id === "sushi") {
      ctx.fillStyle = PAPER;
      ctx.beginPath();
      ctx.moveTo(-0.42, 0.0);
      ctx.lineTo(0.42, 0.0);
      ctx.quadraticCurveTo(0.48, 0.04, 0.45, 0.24);
      ctx.quadraticCurveTo(0.42, 0.4, 0.2, 0.4);
      ctx.lineTo(-0.2, 0.4);
      ctx.quadraticCurveTo(-0.42, 0.4, -0.45, 0.24);
      ctx.quadraticCurveTo(-0.48, 0.04, -0.42, 0.0);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.ellipse(0, -0.16, 0.36, 0.15, -0.06, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PAPER;
      ctx.lineWidth = 0.045;
      ctx.beginPath(); ctx.moveTo(-0.18, -0.21); ctx.lineTo(-0.02, -0.25); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0.02, -0.11); ctx.lineTo(0.22, -0.15); ctx.stroke();
    } else if (kind.id === "mame") {
      ctx.save();
      ctx.rotate(-0.5);
      ctx.beginPath(); ctx.ellipse(0, 0, 0.46, 0.19, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = PAPER;
      for (const dx of [-0.24, 0, 0.24]) {
        ctx.beginPath(); ctx.ellipse(dx, 0, 0.1, 0.095, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.07;
      ctx.beginPath(); ctx.moveTo(0.24, -0.34); ctx.lineTo(0.36, -0.46); ctx.stroke();
    } else if (kind.id === "niku") {
      ctx.beginPath();
      ctx.moveTo(-0.34, 0.12);
      ctx.quadraticCurveTo(-0.44, -0.3, -0.04, -0.4);
      ctx.quadraticCurveTo(0.34, -0.46, 0.32, -0.06);
      ctx.quadraticCurveTo(0.3, 0.24, -0.02, 0.24);
      ctx.quadraticCurveTo(-0.28, 0.24, -0.34, 0.12);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = PAPER;
      ctx.lineWidth = 0.13;
      ctx.beginPath(); ctx.moveTo(-0.16, 0.2); ctx.lineTo(-0.36, 0.44); ctx.stroke();
      ctx.fillStyle = PAPER;
      ctx.beginPath(); ctx.arc(-0.42, 0.44, 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-0.3, 0.5, 0.09, 0, Math.PI * 2); ctx.fill();
    } else if (kind.id === "budo") {
      ctx.beginPath();
      for (const [bx, by] of [[-0.2, -0.02], [0.2, -0.02], [0, -0.14], [-0.12, 0.2], [0.12, 0.2], [0, 0.4]]) {
        ctx.moveTo(bx + 0.14, by);
        ctx.arc(bx, by, 0.14, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.07;
      ctx.beginPath(); ctx.moveTo(0, -0.2); ctx.lineTo(0.06, -0.42); ctx.stroke();
      ctx.fillStyle = PAPER;
      ctx.beginPath(); ctx.ellipse(0.19, -0.4, 0.13, 0.07, -0.5, 0, Math.PI * 2); ctx.fill();
    } else {
      // 特上：星
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? 0.19 : 0.44;
        i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // --- あそびかた（実際に触りながら進む） --------------------------------
  const TUT = [
    { focus: "todo",  wait: "tap",   lines: () => ["トドの口の中がご注文です。", `いまのご注文は「${S.want.name}」。`] },
    { focus: "belt",  wait: "tap",   lines: () => ["皿は蓋つきで回ってきます。", "中身は開けるまで分かりません。"] },
    { focus: "reach", wait: "tap",   lines: () => ["開けられるのは、手前の明るい", "ところまで来た皿だけです。"] },
    { focus: "reach", wait: "plate", lines: () => ["では一枚、開けてみましょう。", "光っている皿をタップ。"] },
    { focus: null,    wait: "tap",   lines: () => S.tut.result || ["", ""] },
    { focus: "mood",  wait: "tap",   lines: () => ["ごきげんは時間で減っていきます。", "尽きたら、おあいそ。"] },
    { focus: "mood",  wait: "tap",   lines: () => ["ごきげんが満タンになると満腹。", "トドがごろんと転がって、大入りです。"] },
    { focus: null,    wait: "tap",   lines: () => ["注文どおりに出すほど点が伸びます。", "では、ごゆっくり。"] },
  ];

  function tutStep() { return S.tut ? TUT[S.tut.i] : null; }

  function tutNext() {
    if (!S.tut) return;
    S.tut.i++;
    beep(520, 0.05, "sine", 0.03);
    if (S.tut.i >= TUT.length) { markTutorialSeen(); start(); }
  }

  // --- 状態 -------------------------------------------------------------
  let S = null;
  let best = 0;
  try { best = Number(localStorage.getItem("todo-kaiten-best")) || 0; } catch (e) {}

  function newGame() {
    S = {
      phase: "title",
      t: 0,
      score: 0,
      fed: 0,
      combo: 0,
      mood: 1,
      speed: 0.42,
      want: MENU[0],
      plates: [],
      flyers: [],
      puffs: [],
      todo: { chew: 0, face: 0, spit: 0, blink: 0, roll: 0 },
      hint: null,
      noren: { part: 0, sway: 0 },
      tut: null,
    };
    for (let i = 0; i < PLATES; i++) {
      S.plates.push({ ang: (Math.PI * 2 * i) / PLATES, kind: pick(), open: false, lid: 0, gone: false });
    }
    S.want = nextOrder();
  }

  function pick(bonus = true) {
    if (bonus && Math.random() < 0.06) return TOKUJO;
    return MENU[(Math.random() * MENU.length) | 0];
  }

  function level() { return 1 + Math.floor(S.fed / 5); }

  function tutorialSeen() {
    try { return localStorage.getItem("todo-kaiten-tut") === "1"; } catch (e) { return false; }
  }
  function markTutorialSeen() {
    try { localStorage.setItem("todo-kaiten-tut", "1"); } catch (e) {}
  }

  // のれんをくぐる。分かれた布の間を通り抜けてから店内が始まる。
  function enterShop() {
    if (S.phase !== "title") return;
    S.phase = "enter";
    S.enterT = 0;
    beep(300, 0.5, "sine", 0.035, 190);
    beep(880, 0.09, "triangle", 0.03, 1180);
  }

  function afterNoren() {
    if (tutorialSeen()) start();
    else startTutorial();
  }

  function start() {
    S.phase = "play";
    S.tut = null;
    say("いらっしゃい");
    beep(430, 0.12, "triangle", 0.05, 660);
  }

  function startTutorial() {
    S.phase = "tutorial";
    S.tut = { i: 0, lines: null };
    beep(430, 0.12, "triangle", 0.05, 660);
  }

  function say(text) { S.hint = { text, life: 1.6 }; }

  // --- レーン -----------------------------------------------------------
  function trackPos(ang) {
    const s = Math.sin(ang);
    return {
      x: TRACK.cx + Math.cos(ang) * TRACK.rx,
      y: TRACK.cy + s * TRACK.ry,
      scale: 0.7 + ((s + 1) / 2) * 0.46,
      near: s,
    };
  }

  function inReach(p) { return !p.gone && Math.sin(p.ang) >= REACH; }

  function tapAt(x, y) {
    if (S.phase !== "play" && S.phase !== "tutorial") return;
    let target = null, bestD = 1e9;
    for (const p of S.plates) {
      if (!inReach(p)) continue;
      const q = trackPos(p.ang);
      const d = Math.hypot(q.x - x, (q.y - y) * 1.4);
      if (d < 44 * q.scale && d < bestD) { bestD = d; target = p; }
    }
    if (target) openPlate(target);
  }

  function openPlate(p) {
    const known = p.open;
    p.open = true;
    if (!known) beep(540, 0.08, "triangle", 0.04, 720);

    const tutorial = S.phase === "tutorial" && tutStep().wait === "plate";
    const hit = p.kind.id === S.want.id || p.kind.id === "tokujo";
    if (tutorial) {
      S.tut.result = hit
        ? ["当たり。トドが食べて、ごきげんが戻ります。", "続けて当てるほど点数が伸びます。"]
        : ["はずれ。でも蓋は開いたままです。", "覚えておけば、次に注文されたとき出せます。"];
    }

    if (hit) {
      eat(p);
    } else {
      // はずれ。蓋は開いたまま回り続けるので、次の注文で使える
      S.combo = 0;
      S.mood = Math.max(0, S.mood - (known ? 0.10 : 0.04));
      S.todo.face = -1;
      S.todo.spit = 0.4;
      say(known ? "それはさっき見た" : `${p.kind.name}か……`);
      beep(190, 0.2, "sawtooth", 0.04, 90);
      if (S.mood <= 0 && S.phase === "play") gameOver();
    }
    if (tutorial) tutNext();
  }

  function eat(p) {
    const q = trackPos(p.ang);
    p.gone = true;
    p.respawn = 1.1;
    S.combo++;
    S.fed++;
    const mult = Math.min(5, 1 + Math.floor(S.combo / 3));
    S.score += (p.kind.id === "tokujo" ? 250 : 100) * mult;
    S.mood = Math.min(1, S.mood + (p.kind.id === "tokujo" ? 0.32 : 0.2));
    S.speed = 0.42 + Math.min(14, level()) * 0.05;
    S.flyers.push({ kind: p.kind, x: q.x, y: q.y, s: q.scale, life: 0.34, total: 0.34 });
    if (p.kind.id === "tokujo") say("特上いただき");
    else if (S.combo >= 3) say(`${S.combo} 皿つづけて`);
  }

  const ROLL_TIME = 1.5;

  function goRolling() {
    S.rollDir = Math.random() < 0.5 ? -1 : 1;
    S.todo.roll = ROLL_TIME;
    S.todo.face = 1;
    S.score += 500;
    S.mood = 0.62;               // 転がったぶん、また入る
    say("満腹。ごろん");
    puff(TODO.x, TODO.y, "#f0a63c", 22);
    beep(520, 0.1, "triangle", 0.05, 780);
    setTimeout(() => beep(660, 0.1, "triangle", 0.05, 990), 110);
    setTimeout(() => beep(880, 0.22, "triangle", 0.05, 1320), 230);
  }

  function swallow(kind) {
    S.todo.chew = 0.36;
    S.todo.face = 1;
    puff(TODO.x, TODO.y - 6, kind.color, 12);
    beep(620 + Math.min(6, S.combo) * 40, 0.1, "triangle", 0.05);
    S.want = nextOrder();
    // ごきげんが満タンまで来たら満腹。ごろんと転がる。
    if (S.mood >= 0.999 && S.todo.roll <= 0) goRolling();
  }

  // 注文は「いまレーンに乗っている品」から選ぶ。無い物を頼まれたら詰むため。
  function nextOrder() {
    const live = S.plates.filter((p) => !p.gone);
    const onBelt = live.map((p) => p.kind.id);
    const known = live.filter((p) => p.open).map((p) => p.kind.id);
    let pool = MENU.filter((k) => onBelt.includes(k.id) && k.id !== (S.want && S.want.id));
    if (!pool.length) pool = MENU.filter((k) => onBelt.includes(k.id));
    if (!pool.length) return pick(false);
    // 覚えている品をときどき指名して、探索のごほうびにする
    if (known.length && Math.random() < 0.4) {
      const hit = pool.filter((k) => known.includes(k.id));
      if (hit.length) pool = hit;
    }
    return pool[(Math.random() * pool.length) | 0];
  }

  function gameOver() {
    S.phase = "over";
    S.todo.face = -1;
    if (S.score > best) {
      best = S.score;
      try { localStorage.setItem("todo-kaiten-best", String(best)); } catch (e) {}
    }
    beep(300, 0.5, "sine", 0.05, 100);
  }

  function puff(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 130;
      S.puffs.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, r: 2 + Math.random() * 4, life: 1, color });
    }
  }

  // --- 音 ---------------------------------------------------------------
  let audio = null, muted = false;
  function beep(freq, dur, type = "sine", gain = 0.05, slideTo = null) {
    if (muted) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, audio.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, audio.currentTime + dur);
      g.gain.setValueAtTime(gain, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
      o.connect(g).connect(audio.destination);
      o.start();
      o.stop(audio.currentTime + dur + 0.02);
    } catch (e) {}
  }

  document.getElementById("muteBtn").addEventListener("click", (e) => {
    muted = !muted;
    e.currentTarget.textContent = muted ? "🔇 音なし" : "🔊 音あり";
  });
  document.getElementById("againBtn").addEventListener("click", () => { newGame(); start(); canvas.focus(); });
  document.getElementById("howBtn").addEventListener("click", () => { newGame(); startTutorial(); canvas.focus(); });

  // --- 入力 -------------------------------------------------------------
  function canvasXY(ev) {
    const r = canvas.getBoundingClientRect();
    return [(ev.clientX - r.left) * (W / r.width), (ev.clientY - r.top) * (H / r.height)];
  }

  canvas.addEventListener("pointerdown", (ev) => {
    canvas.focus();
    if (S.phase === "title") { enterShop(); return; }
    if (S.phase === "enter") return;
    if (S.phase === "over") { newGame(); start(); return; }
    const [x, y] = canvasXY(ev);
    if (S.phase === "tutorial") {
      if (tutStep().wait === "plate") tapAt(x, y);
      else tutNext();
      return;
    }
    tapAt(x, y);
  });

  // 正面（真下）にいちばん近い皿を開ける
  function openFrontPlate() {
    let target = null, bestD = 1e9;
    for (const p of S.plates) {
      if (!inReach(p)) continue;
      const d = Math.abs(Math.atan2(Math.sin(p.ang - Math.PI / 2), Math.cos(p.ang - Math.PI / 2)));
      if (d < bestD) { bestD = d; target = p; }
    }
    if (target) openPlate(target);
  }

  addEventListener("keydown", (e) => {
    if (e.key !== " " && e.key !== "Enter") return;
    e.preventDefault();
    if (S.phase === "title") { enterShop(); return; }
    if (S.phase === "enter") return;
    if (S.phase === "over") { newGame(); start(); return; }
    if (S.phase === "tutorial") {
      if (tutStep().wait === "plate") openFrontPlate();
      else tutNext();
      return;
    }
    openFrontPlate();
  });

  // --- 更新 -------------------------------------------------------------
  function update(dt) {
    S.t += dt;
    if (S.hint) { S.hint.life -= dt; if (S.hint.life <= 0) S.hint = null; }

    const td = S.todo;
    td.chew = Math.max(0, td.chew - dt);
    td.spit = Math.max(0, td.spit - dt);
    td.roll = Math.max(0, td.roll - dt);
    td.face *= Math.pow(0.22, dt);
    td.blink -= dt;
    if (td.blink < -3) td.blink = 0.14 + Math.random() * 0.06;

    if (S.phase === "title" || S.phase === "enter") {
      S.noren.sway = Math.sin(S.t * 1.1) * (REDUCED ? 0 : 1);
    }
    if (S.phase === "enter") {
      S.enterT += dt;
      const k = Math.min(1, S.enterT / (REDUCED ? 0.2 : 0.72));
      S.noren.part = 1 - Math.pow(1 - k, 3);
      if (S.enterT >= (REDUCED ? 0.25 : 0.92)) afterNoren();
    }

    if (S.phase === "play" || S.phase === "tutorial") {
      for (const p of S.plates) {
        p.ang = (p.ang + S.speed * dt) % (Math.PI * 2);
        p.lid += ((p.open ? 1 : 0) - p.lid) * Math.min(1, dt * 12);
        if (p.gone) {
          p.respawn -= dt;
          // 空いた枠は元の位置のまま流れていき、奥へ回り込んでから蓋つきで戻る
          if (p.respawn <= 0 && Math.sin(p.ang) < -0.1) {
            p.gone = false;
            p.open = false;
            p.lid = 0;
            p.kind = Math.random() < 0.32 ? S.want : pick();
          }
        }
      }
      if (S.phase === "play") {
        S.mood = Math.max(0, S.mood - (0.030 + level() * 0.0035) * dt);
        if (S.mood <= 0) gameOver();
      }
    }

    for (const f of S.flyers) {
      f.life -= dt;
      const k = Math.max(0, Math.min(1, 1 - f.life / f.total));
      const e = k * k * (3 - 2 * k);
      f.x += (TODO.x - f.x) * Math.min(1, e * 0.4 + dt * 7);
      f.y += (TODO.y - 8 - f.y) * Math.min(1, e * 0.4 + dt * 7);
      f.s += (0.5 - f.s) * dt * 4;
      if (f.life <= 0) { f.done = true; swallow(f.kind); }
    }
    S.flyers = S.flyers.filter((f) => !f.done);

    for (const p of S.puffs) {
      p.vy += 480 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt * 1.7;
    }
    S.puffs = S.puffs.filter((p) => p.life > 0);
  }

  // --- 描画 -------------------------------------------------------------
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function bg() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0a111d");
    g.addColorStop(0.45, "#14243a");
    g.addColorStop(1, "#0e1a2b");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const lamp = ctx.createRadialGradient(TRACK.cx, TRACK.cy + 60, 20, TRACK.cx, TRACK.cy + 60, 330);
    lamp.addColorStop(0, "rgba(240,166,60,0.20)");
    lamp.addColorStop(1, "rgba(240,166,60,0)");
    ctx.fillStyle = lamp;
    ctx.fillRect(0, 0, W, H);
  }

  function drawBelt() {
    ctx.save();
    // ベルト本体
    ctx.strokeStyle = "#2b3d52";
    ctx.lineWidth = 52;
    ctx.beginPath();
    ctx.ellipse(TRACK.cx, TRACK.cy, TRACK.rx, TRACK.ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#35506c";
    ctx.lineWidth = 44;
    ctx.beginPath();
    ctx.ellipse(TRACK.cx, TRACK.cy, TRACK.rx, TRACK.ry, 0, 0, Math.PI * 2);
    ctx.stroke();

    // 手の届く手前側だけ、灯りで明るい
    const a0 = Math.asin(REACH), a1 = Math.PI - Math.asin(REACH);
    ctx.strokeStyle = "rgba(240,166,60,0.38)";
    ctx.lineWidth = 46;
    ctx.beginPath();
    ctx.ellipse(TRACK.cx, TRACK.cy, TRACK.rx, TRACK.ry, 0, a0, a1);
    ctx.stroke();

    // 動いていることが分かる継ぎ目
    ctx.strokeStyle = "rgba(216,232,242,0.13)";
    ctx.lineWidth = 2;
    const phase = (S.t * S.speed) % 0.28;
    for (let a = 0; a < Math.PI * 2; a += 0.28) {
      const ang = a + phase;
      const inner = { x: TRACK.cx + Math.cos(ang) * (TRACK.rx - 21), y: TRACK.cy + Math.sin(ang) * (TRACK.ry - 12) };
      const outer = { x: TRACK.cx + Math.cos(ang) * (TRACK.rx + 21), y: TRACK.cy + Math.sin(ang) * (TRACK.ry + 12) };
      ctx.beginPath();
      ctx.moveTo(inner.x, inner.y);
      ctx.lineTo(outer.x, outer.y);
      ctx.stroke();
    }

    // レーンの内側（板場）
    const board = ctx.createLinearGradient(0, TRACK.cy - TRACK.ry, 0, TRACK.cy + TRACK.ry);
    board.addColorStop(0, "#243449");
    board.addColorStop(1, "#141f31");
    ctx.fillStyle = board;
    ctx.beginPath();
    ctx.ellipse(TRACK.cx, TRACK.cy, TRACK.rx - 26, TRACK.ry - 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(240,166,60,0.07)";
    ctx.beginPath();
    ctx.ellipse(TRACK.cx, TRACK.cy + 18, TRACK.rx - 54, TRACK.ry - 40, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPlate(p) {
    const q = trackPos(p.ang);
    const s = q.scale;
    const reach = inReach(p);
    ctx.save();
    ctx.translate(q.x, q.y);
    ctx.scale(s, s);
    ctx.globalAlpha = reach ? 1 : 0.72;

    // 皿
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(0, 6, 30, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#e9e2d4";
    ctx.beginPath(); ctx.ellipse(0, 0, 30, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#cbc2b1";
    ctx.beginPath(); ctx.ellipse(0, 1, 22, 7, 0, 0, Math.PI * 2); ctx.fill();

    // 中身（蓋が開くほど見える）
    if (p.lid > 0.05) {
      ctx.save();
      ctx.globalAlpha *= Math.min(1, p.lid * 1.4);
      ctx.fillStyle = p.kind.color;
      ctx.beginPath(); ctx.ellipse(0, -3, 17, 9, 0, 0, Math.PI * 2); ctx.fill();
      drawIcon(p.kind, 0, -9, 26);
      ctx.restore();
    }

    // 蓋（朱塗り）
    const lift = p.lid * 34;
    if (p.lid < 0.98) {
      ctx.save();
      ctx.globalAlpha *= 1 - p.lid * 0.85;
      ctx.translate(0, -lift);
      const dome = ctx.createLinearGradient(0, -26, 0, 2);
      dome.addColorStop(0, "#d9645a");
      dome.addColorStop(0.55, "#bb4239");
      dome.addColorStop(1, "#8d2b25");
      ctx.fillStyle = dome;
      ctx.beginPath();
      ctx.moveTo(-27, 0);
      ctx.bezierCurveTo(-27, -26, 27, -26, 27, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.beginPath(); ctx.ellipse(-9, -13, 7, 4, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#f0cf8a";
      ctx.beginPath(); ctx.ellipse(0, -25, 5, 3.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // 手が届く皿は縁が光る
    if (reach && (S.phase === "play" || S.phase === "tutorial")) {
      ctx.strokeStyle = "rgba(240,166,60,0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 0, 31, 12, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  function drawTodo() {
    const t = S.todo;
    const mouthOpen = Math.max(0.18, Math.min(1, 1 - t.chew * 1.7));
    const bob = REDUCED ? 0 : Math.sin(S.t * 1.4) * 3;

    // 影は回さない
    ctx.save();
    ctx.globalAlpha = t.roll > 0 ? 0.5 : 1;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(TODO.x + (t.roll > 0 ? Math.sin((1 - t.roll / ROLL_TIME) * Math.PI) * 74 * (S.rollDir || 1) : 0), TODO.y + 62, 62, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    if (t.roll > 0) {
      const k = 1 - t.roll / ROLL_TIME;                 // 0 → 1
      const spin = REDUCED ? 0 : k * Math.PI * 4;       // 二回転
      const swing = Math.sin(k * Math.PI);
      ctx.translate(TODO.x + swing * 74 * (S.rollDir || 1), TODO.y - Math.abs(Math.sin(k * Math.PI * 2)) * 14);
      ctx.translate(0, 18);
      ctx.rotate(spin * (S.rollDir || 1));
      ctx.translate(0, -18);
    } else {
      ctx.translate(TODO.x, TODO.y + bob);
    }


    // からだ
    const body = ctx.createLinearGradient(0, -50, 0, 62);
    body.addColorStop(0, "#9c8577");
    body.addColorStop(1, "#6a564c");
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, 18, 58, 44, 0, 0, Math.PI * 2); ctx.fill();

    // ひれ
    ctx.fillStyle = "#5d4a41";
    const flap = REDUCED ? 0 : Math.sin(S.t * 3) * 0.08 + t.chew * 0.5;
    ctx.beginPath(); ctx.ellipse(-52, 40, 20, 10, -0.5 - flap, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(52, 40, 20, 10, 0.5 + flap, 0, Math.PI * 2); ctx.fill();

    // あたま
    ctx.fillStyle = "#a68e7e";
    ctx.beginPath(); ctx.ellipse(0, -22, 44, 38, 0, 0, Math.PI * 2); ctx.fill();

    // 口（中身は今のご注文）
    const mh = 15 + 17 * mouthOpen;
    ctx.fillStyle = "#2a1a18";
    ctx.beginPath(); ctx.ellipse(0, -6, 27, mh, 0, 0, Math.PI * 2); ctx.fill();
    const want = (S.phase === "play" || S.phase === "tutorial") ? S.want : null;
    const rolling = t.roll > 0;
    if (want && !rolling) {
      ctx.save();
      ctx.globalAlpha = 0.94;
      ctx.fillStyle = want.color;
      ctx.shadowColor = want.color;
      ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.ellipse(0, -2, 20, Math.max(7, mh - 9), 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      drawIcon(want, 0, -2, 22);
    } else if (!rolling) {
      ctx.fillStyle = "#8ea6bb";
      ctx.font = "600 18px 'Hiragino Mincho ProN', 'Yu Mincho', serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("？", 0, -2);
    }

    // きば
    ctx.fillStyle = "#f2ead9";
    ctx.beginPath(); ctx.moveTo(-16, 6); ctx.lineTo(-9, 6); ctx.lineTo(-12, 30); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(9, 6); ctx.lineTo(16, 6); ctx.lineTo(12, 30); ctx.closePath(); ctx.fill();

    // ひげ
    ctx.strokeStyle = "rgba(242,234,217,0.5)";
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) {
      const yy = -10 + i * 7;
      ctx.beginPath(); ctx.moveTo(-26, yy); ctx.lineTo(-42, yy - 4 + i * 3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(26, yy); ctx.lineTo(42, yy - 4 + i * 3); ctx.stroke();
    }

    // 目：ふつう／うっとり／げんなり
    const happy = t.face > 0.3, bad = t.face < -0.3 || S.phase === "over";
    const blinking = t.blink > 0;
    ctx.lineCap = "round";
    for (const ex of [-27, 27]) {
      if (happy || bad || blinking) {
        ctx.strokeStyle = "#2a1a18";
        ctx.lineWidth = 3;
        ctx.beginPath();
        if (bad) { ctx.moveTo(ex - 6, -40); ctx.lineTo(ex + 6, -31); ctx.moveTo(ex + 6, -40); ctx.lineTo(ex - 6, -31); }
        else ctx.arc(ex, -36, 6.5, Math.PI * 1.08, Math.PI * 1.92);
        ctx.stroke();
      } else {
        ctx.fillStyle = "#f2ead9";
        ctx.beginPath(); ctx.ellipse(ex, -36, 7, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#2a1a18";
        ctx.beginPath(); ctx.arc(ex, -35, 3.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.beginPath(); ctx.arc(ex - 1.6, -38, 1.4, 0, Math.PI * 2); ctx.fill();
      }
    }

    // ごきげんが良いとほおが赤い
    if (S.mood > 0.7 && S.phase !== "over") {
      ctx.globalAlpha = Math.min(0.5, (S.mood - 0.7) * 1.6);
      ctx.fillStyle = "#e8687a";
      ctx.beginPath(); ctx.ellipse(-30, -18, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(30, -18, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawHud() {
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(216,232,242,0.55)";
    ctx.font = "10px 'Hiragino Sans', system-ui, sans-serif";
    ctx.fillText("てんすう", 18, 24);
    ctx.fillStyle = "#fbe3bd";
    ctx.font = "600 22px 'Hiragino Sans', system-ui, sans-serif";
    ctx.fillText(String(S.score), 18, 46);

    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(216,232,242,0.55)";
    ctx.font = "10px 'Hiragino Sans', system-ui, sans-serif";
    ctx.fillText(`さいこう ${best}`, W - 18, 24);
    ctx.fillStyle = "#fbe3bd";
    ctx.font = "600 14px 'Hiragino Mincho ProN', 'Yu Mincho', serif";
    ctx.fillText(`${S.fed} 皿目`, W - 18, 46);

    // ごきげん
    const bx = 18, by = 72, bw = W - 36, bh = 12;
    ctx.fillStyle = "rgba(216,232,242,0.10)";
    roundRect(bx, by, bw, bh, 6); ctx.fill();
    const warm = S.mood < 0.3;
    ctx.fillStyle = warm ? "#e8687a" : "#f0a63c";
    if (S.mood > 0.01) { roundRect(bx, by, Math.max(8, bw * S.mood), bh, 6); ctx.fill(); }
    ctx.fillStyle = "rgba(216,232,242,0.5)";
    ctx.font = "10px 'Hiragino Sans', system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("ごきげん", bx + 2, by - 4);

    // カウンター
    const cy = TODO.y + 76;
    const wood = ctx.createLinearGradient(0, cy, 0, cy + 46);
    wood.addColorStop(0, "#5b4433");
    wood.addColorStop(1, "#3a2c22");
    ctx.fillStyle = wood;
    ctx.fillRect(0, cy, W, 46);
    ctx.fillStyle = "rgba(240,166,60,0.28)";
    ctx.fillRect(0, cy, W, 3);

    ctx.textAlign = "center";
    ctx.fillStyle = "#f3e2c4";
    ctx.font = "600 15px 'Hiragino Mincho ProN', 'Yu Mincho', serif";
    if (S.phase === "play" || S.phase === "tutorial") {
      ctx.fillText(`ご注文　${S.want.name}`, W / 2, cy + 30);
    } else {
      ctx.fillText("ご注文　—", W / 2, cy + 30);
    }

    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(216,232,242,0.45)";
    ctx.font = "11px 'Hiragino Sans', system-ui, sans-serif";
    ctx.fillText(`${level()} 杯目の夜`, 18, cy + 30);
    ctx.textAlign = "right";
    if (S.combo >= 2) {
      ctx.fillStyle = "#f0a63c";
      ctx.fillText(`${S.combo} 連続`, W - 18, cy + 30);
    }
  }

  function drawOverlay(title, lines, sub) {
    ctx.fillStyle = "rgba(6,10,18,0.82)";
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#fbe3bd";
    ctx.font = "600 30px 'Hiragino Mincho ProN', 'Yu Mincho', serif";
    ctx.fillText(title, W / 2, H / 2 - 96);
    ctx.fillStyle = "#d8e8f2";
    ctx.font = "14px 'Hiragino Sans', system-ui, sans-serif";
    lines.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 - 54 + i * 25));
    if (sub) {
      ctx.globalAlpha = REDUCED ? 1 : 0.6 + Math.sin(S.t * 3) * 0.4;
      ctx.fillStyle = "#f0a63c";
      ctx.font = "600 16px 'Hiragino Sans', system-ui, sans-serif";
      ctx.fillText(sub, W / 2, H / 2 - 8 + lines.length * 25);
      ctx.globalAlpha = 1;
    }
  }


  // --- のれん -----------------------------------------------------------
  const NOREN = { top: 74, bottom: 472, panels: 4 };

  function drawNoren() {
    const pw = W / NOREN.panels;
    const part = S.noren.part;

    // 軒下の暗がり
    ctx.fillStyle = `rgba(6,10,18,${0.92 - part * 0.92})`;
    ctx.fillRect(0, 0, W, H);

    // 竿
    ctx.fillStyle = "#3d2b1e";
    ctx.fillRect(0, NOREN.top - 10, W, 10);
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.fillRect(0, NOREN.top - 10, W, 3);

    // 提灯
    for (const lx of [40, W - 40]) {
      ctx.save();
      ctx.translate(lx + S.noren.sway * 1.5, NOREN.top - 36);
      ctx.fillStyle = "rgba(240,166,60,0.22)";
      ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#e0603f";
      ctx.beginPath(); ctx.ellipse(0, 0, 17, 22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.22)";
      ctx.lineWidth = 1.4;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath(); ctx.ellipse(0, i * 7, 17 * Math.sqrt(Math.max(0.05, 1 - (i * 7 / 22) ** 2)), 2, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = "#2a1a18";
      ctx.fillRect(-7, -24, 14, 4);
      ctx.fillRect(-7, 20, 14, 4);
      ctx.restore();
    }

    // 四枚の布。中央から左右に割れる。
    const texts = [null, "晩酌", "トドの", null];
    for (let i = 0; i < NOREN.panels; i++) {
      const leftSide = i < NOREN.panels / 2;
      const dir = leftSide ? -1 : 1;
      const slide = part * (leftSide ? pw * 1.9 : pw * 1.9) * dir;
      const tilt = part * 0.14 * dir;
      ctx.save();
      ctx.translate(i * pw + pw / 2 + slide, NOREN.top);
      ctx.rotate(tilt + (REDUCED ? 0 : Math.sin(S.t * 1.1 + i) * 0.006 * (1 - part)));
      const h = NOREN.bottom - NOREN.top;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#27496b");
      g.addColorStop(0.6, "#1b3450");
      g.addColorStop(1, "#142639");
      ctx.fillStyle = g;
      // 裾がわずかに揺れる布
      ctx.beginPath();
      ctx.moveTo(-pw / 2 + 2, 0);
      ctx.lineTo(pw / 2 - 2, 0);
      ctx.lineTo(pw / 2 - 2, h - 8);
      for (let x = pw / 2 - 2; x >= -pw / 2 + 2; x -= 8) {
        ctx.lineTo(x, h - 8 + Math.sin(x / 14 + S.t * 1.6 + i) * 3);
      }
      ctx.closePath();
      ctx.fill();

      // 縫い目
      ctx.strokeStyle = "rgba(6,10,18,0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-pw / 2 + 2, 0); ctx.lineTo(-pw / 2 + 2, h - 10); ctx.stroke();

      if (!texts[i]) {
        ctx.strokeStyle = "rgba(243,231,207,0.75)";
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 132, 26, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = "rgba(243,231,207,0.85)";
        ctx.font = "600 26px 'Hiragino Mincho ProN', 'Yu Mincho', serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("酒", 0, 133);
      }

      if (texts[i]) {
        ctx.fillStyle = "#f3e7cf";
        ctx.font = "600 34px 'Hiragino Mincho ProN', 'Yu Mincho', serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const chars = [...texts[i]];
        chars.forEach((c, k) => ctx.fillText(c, 0, 96 + k * 44));
      }
      ctx.restore();
    }

    if (part < 0.02) {
      ctx.globalAlpha = REDUCED ? 1 : 0.6 + Math.sin(S.t * 3) * 0.4;
      ctx.fillStyle = "#f0a63c";
      ctx.font = "600 17px 'Hiragino Sans', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("タップしてのれんをくぐる", W / 2, NOREN.bottom + 64);
      ctx.globalAlpha = 1;
    }
  }

  // --- あそびかたの吹き出し ----------------------------------------------
  function drawTutorial() {
    const step = tutStep();
    if (!step) return;

    // 注目してほしいところを光らせる
    ctx.save();
    ctx.strokeStyle = "rgba(240,166,60,0.9)";
    ctx.lineWidth = 3;
    const pulse = REDUCED ? 1 : 0.7 + Math.sin(S.t * 4) * 0.3;
    ctx.globalAlpha = pulse;
    if (step.focus === "todo") {
      ctx.beginPath(); ctx.ellipse(TODO.x, TODO.y - 12, 58, 54, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (step.focus === "belt") {
      ctx.beginPath(); ctx.ellipse(TRACK.cx, TRACK.cy, TRACK.rx + 30, TRACK.ry + 22, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (step.focus === "reach") {
      const a0 = Math.asin(REACH), a1 = Math.PI - Math.asin(REACH);
      ctx.lineWidth = 48;
      ctx.strokeStyle = "rgba(240,166,60,0.22)";
      ctx.beginPath(); ctx.ellipse(TRACK.cx, TRACK.cy, TRACK.rx, TRACK.ry, 0, a0, a1); ctx.stroke();
    } else if (step.focus === "mood") {
      ctx.beginPath(); roundRect(14, 68, W - 28, 20, 10); ctx.stroke();
    }
    ctx.restore();

    // 説明の札
    const lines = step.lines();
    const cardY = 418, cardH = 84;
    ctx.fillStyle = "rgba(10,17,29,0.92)";
    roundRect(24, cardY, W - 48, cardH, 14); ctx.fill();
    ctx.strokeStyle = "rgba(240,166,60,0.45)";
    ctx.lineWidth = 1.5;
    roundRect(24, cardY, W - 48, cardH, 14); ctx.stroke();

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#f3e2c4";
    ctx.font = "14px 'Hiragino Sans', system-ui, sans-serif";
    lines.forEach((l, i) => ctx.fillText(l, W / 2, cardY + 30 + i * 22));

    ctx.fillStyle = "#f0a63c";
    ctx.font = "600 11px 'Hiragino Sans', system-ui, sans-serif";
    ctx.globalAlpha = REDUCED ? 1 : 0.6 + Math.sin(S.t * 3) * 0.4;
    ctx.fillText(step.wait === "plate" ? "光っている皿をタップ" : "タップでつぎへ", W / 2, cardY + cardH - 8);
    ctx.globalAlpha = 1;

    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(216,232,242,0.4)";
    ctx.font = "10px 'Hiragino Sans', system-ui, sans-serif";
    ctx.fillText(`${S.tut.i + 1} / ${TUT.length}`, W - 34, cardY + 16);
  }

  function draw() {
    bg();
    drawBelt();

    // 奥から手前の順に描く
    const order = S.plates.filter((p) => !p.gone).sort((a, b) => trackPos(a.ang).y - trackPos(b.ang).y);
    for (const p of order) drawPlate(p);

    drawTodo();

    for (const f of S.flyers) {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.scale(f.s, f.s);
      ctx.fillStyle = f.kind.color;
      ctx.beginPath(); ctx.ellipse(0, 0, 20, 12, 0, 0, Math.PI * 2); ctx.fill();
      drawIcon(f.kind, 0, -4, 28);
      ctx.restore();
    }

    for (const p of S.puffs) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    drawHud();

    if (S.hint) {
      ctx.globalAlpha = Math.min(1, S.hint.life * 1.8);
      ctx.textAlign = "center";
      ctx.fillStyle = "#fbe3bd";
      ctx.font = "600 20px 'Hiragino Mincho ProN', 'Yu Mincho', serif";
      ctx.fillText(S.hint.text, W / 2, 108);
      ctx.globalAlpha = 1;
    }

    if (S.phase === "tutorial") drawTutorial();

    if (S.phase === "title" || S.phase === "enter") drawNoren();

    if (S.phase === "over") {
      drawOverlay("おあいそ", [
        `${S.fed} 皿でごきげんが尽きました`,
        `${S.score} てん　／　さいこう ${best} てん`,
      ], "タップでもう一献");
    }
  }

  // --- ループ -----------------------------------------------------------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  function fit() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  fit();
  addEventListener("resize", fit);

  newGame();
  requestAnimationFrame(frame);
})();
