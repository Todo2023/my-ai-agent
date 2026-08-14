/*
  執務室 ── 部屋を歩く画面

  昔のRPGと同じ作りにしてある。
  マス目の部屋を、自分（プレイヤー）が1マスずつ歩く。担当者の前に立って
  「はなす」を押すと、話しかけられる。

  絵はすべてこの中で描いている。画像ファイルもフォントも読み込まない。
  ドットの人は drawPerson() が四角を積んで描いている。

  ── 部屋の形を変えたいとき ──
  下の MAP を書き換える。1文字が1マス。
    # 壁 ／ D 机 ／ P 観葉植物 ／ = 入口の扉 ／ . 床
  席の位置は SEATS。[列, 行] で、担当者はそこに立つ。
*/

(function () {
  "use strict";

  /* ────────── 部屋の形 ────────── */
  var MAP = [
    "############",
    "#..........#",
    "#.D..D..D..#",
    "#..........#",
    "#..........#",
    "#P........P#",
    "#..........#",
    "#..........#",
    "#..........#",
    "#..........#",
    "#####==#####"
  ];
  var SEATS = [[2, 1], [5, 1], [8, 1]];   // 担当者が立つマス（机の上）
  var START = [5, 8];                      // 自分の立ち位置
  var T = 16;                              // 1マスの大きさ（ドット）
  var COLS = 12, ROWS = 11;

  /* ────────── 色 ────────── */
  var C = {
    floor: "#e6dcc6", floor2: "#dfd3ba",
    wall: "#4a5b73", wallTop: "#63789a",
    desk: "#8a6039", deskTop: "#a3764a",
    plant: "#4a8560", pot: "#96613c", door: "#2f3d52",
    shadow: "rgba(40,50,65,.16)"
  };

  /* ────────── 部品 ────────── */
  var cv = document.getElementById("room");
  if (!cv) return;
  var ctx = cv.getContext("2d");
  var labels = document.getElementById("labels");
  var scale = 2;

  var me = { c: START[0], r: START[1], x: START[0] * T, y: START[1] * T, dir: "down", step: 0, moving: false };
  var npcs = [];
  var held = null;      // 押しっぱなしの向き
  var talking = false;  // 会話中は歩かせない

  /* ────────── 大きさを画面に合わせる ────────── */
  function fit() {
    var w = cv.parentNode.clientWidth;
    scale = Math.max(2, Math.floor(w / (COLS * T)));
    cv.width = COLS * T * scale;
    cv.height = ROWS * T * scale;
    cv.style.width = COLS * T * scale + "px";
    cv.style.height = ROWS * T * scale + "px";
    ctx.imageSmoothingEnabled = false;
    placeLabels();
  }
  window.addEventListener("resize", fit);

  /* ────────── 席にいる人を作り直す ────────── */
  function sync() {
    var seats = OFFICE.seats();
    npcs = [];
    SEATS.forEach(function (pos, i) {
      var s = seats[i] ? staffById(seats[i]) : null;
      npcs.push({ seat: i, staff: s, c: pos[0], r: pos[1], dir: "down", step: 0, bob: Math.random() * 3 });
    });
    placeLabels();
  }

  /* 名札はHTMLで置く。日本語をドットで描くと読めないため */
  function placeLabels() {
    if (!labels) return;
    labels.innerHTML = "";
    npcs.forEach(function (n) {
      var el = document.createElement("div");
      el.className = "label" + (n.staff ? "" : " off");
      el.textContent = n.staff ? n.staff.name : "空席";
      el.style.left = (n.c * T + T / 2) * scale + "px";
      el.style.top = (n.r * T - 9) * scale + "px";
      if (n.staff) el.style.borderColor = n.staff.color;
      labels.appendChild(el);
    });
  }

  /* ────────── 通れるマスか ────────── */
  function walkable(c, r) {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return false;
    if (MAP[r][c] !== ".") return false;
    for (var i = 0; i < npcs.length; i++) {
      if (npcs[i].c === c && npcs[i].r === r) return false;
    }
    return true;
  }

  /* ────────── 部屋を描く ────────── */
  function drawMap() {
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var t = MAP[r][c], x = c * T, y = r * T;
        // 床は市松に。奥行きが出る
        rect(x, y, T, T, (c + r) % 2 ? C.floor2 : C.floor);
        if (t === "#") {
          rect(x, y, T, T, C.wall);
          rect(x, y, T, 4, C.wallTop);
          rect(x, y + T - 2, T, 2, "rgba(0,0,0,.12)");
        } else if (t === "=") {
          rect(x, y, T, T, C.wall);
          rect(x + 2, y + 2, T - 4, T - 2, C.door);
          rect(x + 2, y + 2, T - 4, 2, "rgba(255,255,255,.14)");
        } else if (t === "D") {
          rect(x, y + 3, T, T - 5, C.desk);
          rect(x, y + 3, T, 4, C.deskTop);
          rect(x + 2, y + T - 3, T - 4, 2, C.shadow);
        } else if (t === "P") {
          rect(x + 5, y + 10, 6, 5, C.pot);
          rect(x + 4, y + 4, 8, 7, C.plant);
          rect(x + 6, y + 1, 4, 4, C.plant);
        }
      }
    }
  }

  /* ────────── ドットの人 ──────────
     12×16のなかに、四角を積んで描く。
     dir は向き、step は歩きの足（0か1）。 */
  function drawPerson(px, py, pal, dir, step) {
    var x = px + 2, y = py;          // 12幅を16マスの中央に置く
    rect(px + 3, py + 15, 10, 2, C.shadow);   // 足元の影

    // 髪
    rect(x + 3, y + 0, 6, 2, pal.hair);
    rect(x + 2, y + 1, 8, 3, pal.hair);
    // 顔
    rect(x + 3, y + 3, 6, 4, pal.skin);
    if (dir === "up") {
      rect(x + 3, y + 3, 6, 3, pal.hair);      // 後ろ姿は髪で埋める
    } else if (dir === "down") {
      rect(x + 3, y + 3, 6, 1, pal.hair);      // 前髪
      rect(x + 4, y + 5, 1, 1, "#2b3440");
      rect(x + 7, y + 5, 1, 1, "#2b3440");
    } else {
      rect(x + 3, y + 3, 6, 1, pal.hair);
      rect(dir === "left" ? x + 4 : x + 7, y + 5, 1, 1, "#2b3440");
    }
    // 体
    rect(x + 3, y + 7, 6, 5, pal.cloth);
    rect(x + 3, y + 7, 6, 1, pal.clothHi);
    // 腕
    rect(x + 2, y + 8, 1, 3, pal.cloth);
    rect(x + 9, y + 8, 1, 3, pal.cloth);
    rect(x + 2, y + 11, 1, 1, pal.skin);
    rect(x + 9, y + 11, 1, 1, pal.skin);
    // 足（歩くと前後する）
    var a = step ? 1 : 0, b = step ? 0 : 1;
    rect(x + 3, y + 12, 2, 3 + a, pal.pants);
    rect(x + 7, y + 12, 2, 3 + b, pal.pants);
    rect(x + 3, y + 15, 2, 1, "#3a4452");
    rect(x + 7, y + 15, 2, 1, "#3a4452");
  }

  /* 空席には人を描かず、椅子だけ置く */
  function drawChair(px, py) {
    rect(px + 3, py + 15, 10, 2, C.shadow);
    rect(px + 3, py + 3, 10, 6, "#9aa6b4");    // 背もたれ
    rect(px + 3, py + 3, 10, 2, "#b3bdc9");
    rect(px + 2, py + 9, 12, 3, "#8894a3");    // 座面
    rect(px + 4, py + 12, 2, 4, "#77828f");    // 脚
    rect(px + 10, py + 12, 2, 4, "#77828f");
  }

  /* 担当者の色から、その人のドット絵の色をつくる */
  function palOf(s) {
    return { hair: "#3b3a3c", skin: "#f0c9a8", cloth: s.color, clothHi: tint(s.color, 26), pants: "#3f4a5a" };
  }
  // 自分（クライアント）はオレンジ。担当者と見分けがつくようにしてある
  var MY_PAL = { hair: "#4a3a2c", skin: "#f2cfae", cloth: "#e0602f", clothHi: "#ef8154", pants: "#2f3d52" };

  function tint(hex, n) {
    var v = parseInt(hex.slice(1), 16);
    var r = Math.min(255, (v >> 16) + n), g = Math.min(255, ((v >> 8) & 255) + n), b = Math.min(255, (v & 255) + n);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function rect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x * scale, y * scale, w * scale, h * scale);
  }

  /* ────────── 毎フレーム ────────── */
  var last = 0;
  function loop(now) {
    var dt = Math.min(50, now - last); last = now;

    // 歩く
    if (me.moving) {
      var tx = me.c * T, ty = me.r * T;
      var sp = 0.09 * dt;
      me.x += Math.sign(tx - me.x) * Math.min(sp, Math.abs(tx - me.x));
      me.y += Math.sign(ty - me.y) * Math.min(sp, Math.abs(ty - me.y));
      if (me.x === tx && me.y === ty) { me.moving = false; me.step ^= 1; }
    } else if (held && !talking) {
      tryMove(held);
    }

    // 担当者はときどき向きを変える
    npcs.forEach(function (n) {
      n.bob += dt / 1000;
      if (n.bob > 4) { n.bob = 0; n.dir = ["down", "left", "right"][(Math.random() * 3) | 0]; }
    });

    ctx.clearRect(0, 0, cv.width, cv.height);
    drawMap();
    npcs.forEach(function (n) {
      if (n.staff) drawPerson(n.c * T, n.r * T, palOf(n.staff), n.dir, 0);
      else drawChair(n.c * T, n.r * T);
    });
    drawPerson(me.x, me.y, MY_PAL, me.dir, me.moving ? me.step : 0);

    requestAnimationFrame(loop);
  }

  /* ────────── 動かす ────────── */
  var D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  function tryMove(dir) {
    me.dir = dir;
    var d = D[dir], c = me.c + d[0], r = me.r + d[1];
    if (walkable(c, r)) { me.c = c; me.r = r; me.moving = true; }
  }

  /* 目の前にいる担当者。
     机は挟んでいてもよい（カウンター越しに話す形）。壁は越えない。 */
  function facing() {
    var d = D[me.dir];
    for (var step = 1; step <= 2; step++) {
      var c = me.c + d[0] * step, r = me.r + d[1] * step;
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS) break;
      for (var i = 0; i < npcs.length; i++) {
        if (npcs[i].c === c && npcs[i].r === r) return npcs[i];
      }
      if (MAP[r][c] !== "D") break;
    }
    return null;
  }

  /* ────────── はなす ────────── */
  function talk() {
    var n = facing();
    if (!n) { OFFICE.say("だれもいない。\n担当者の正面に立ってから、はなしかけてください。"); return; }
    n.dir = { up: "down", down: "up", left: "right", right: "left" }[me.dir];   // こちらを向く
    talking = true;
    if (!n.staff) {
      OFFICE.say("ここは空席だ。\nこの席には、担当を1人お迎えできる。", [
        { t: "担当を選ぶ", f: function () { OFFICE.showPicks(n.seat); } }
      ]);
      return;
    }
    OFFICE.say(n.staff.hello, [
      { t: "仕事を頼む", f: function () { OFFICE.showAsk(n.seat); } },
      { t: "話を聞く", f: function () { OFFICE.showProfile(n.staff, n.seat); } }
    ]);
  }

  /* ────────── 操作 ────────── */
  document.querySelectorAll("[data-dir]").forEach(function (b) {
    var dir = b.dataset.dir;
    var on = function (e) { e.preventDefault(); if (!talking) { held = dir; tryMove(dir); } };
    var off = function () { if (held === dir) held = null; };
    b.addEventListener("pointerdown", on);
    b.addEventListener("pointerup", off);
    b.addEventListener("pointercancel", off);
    b.addEventListener("pointerleave", off);
  });
  document.getElementById("talk").addEventListener("click", function () { if (!talking) talk(); });

  var KEYS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
               w: "up", s: "down", a: "left", d: "right" };
  document.addEventListener("keydown", function (e) {
    if (talking) return;
    var dir = KEYS[e.key];
    if (dir) { e.preventDefault(); held = dir; tryMove(dir); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); talk(); }
  });
  document.addEventListener("keyup", function (e) { if (KEYS[e.key] === held) held = null; });

  /* 会話が終わったら、また歩けるようにする */
  OFFICE.onTalkEnd(function () { talking = false; held = null; });
  OFFICE.onChange(sync);

  sync();
  fit();
  requestAnimationFrame(loop);
})();
