/*
  部屋を歩く画面（MTGルーム／カンファレンスルーム 共通）

  昔のRPGと同じ作りにしてある。
  マス目の部屋を1マスずつ歩き、担当者の正面に立って「はなす」を押すと話しかけられる。
  机は挟んでいてよい（カウンター越しに話す形）。

  絵はすべてこの中で描いている。画像ファイルもフォントも読み込まない。
  ドットの人は drawPerson() が四角を積んで描いている。

  ── 部屋ごとの違い ──
  各ページが、読み込む前に ROOM を用意する。ここは中身を知らない。

    ROOM = {
      map:   ["####…", …],   1文字が1マス
                             # 壁 ／ D 机 ／ P 観葉植物 ／ = 扉 ／ . 床
      spots: [[列, 行], …],  担当者が立つマス
      start: [列, 行],       自分の立ち位置
      mode:  "mtg" | "conference",
      door:  { url: "…", label: "…" }   扉の行き先
    }

  mtg        … 自社が迎えた担当だけが立つ。空いた席には椅子を置く
  conference … 名簿（STAFF）の全員が立つ
*/

(function () {
  "use strict";

  var T = 16;                       // 1マスの大きさ（ドット）
  var MAP = ROOM.map;
  var COLS = MAP[0].length, ROWS = MAP.length;

  var C = {
    floor: "#e6dcc6", floor2: "#dfd3ba",
    wall: "#4a5b73", wallTop: "#63789a",
    desk: "#8a6039", deskTop: "#a3764a",
    plant: "#4a8560", pot: "#96613c", door: "#2f3d52",
    shadow: "rgba(40,50,65,.16)"
  };

  var cv = document.getElementById("room");
  if (!cv) return;
  var ctx = cv.getContext("2d");
  var labels = document.getElementById("labels");
  var scale = 2;

  var me = { c: ROOM.start[0], r: ROOM.start[1], x: ROOM.start[0] * T, y: ROOM.start[1] * T,
             dir: "down", step: 0, moving: false };
  var npcs = [];
  var held = null;       // 押しっぱなしの向き
  var talking = false;   // 会話中は歩かせない

  /* ────────── 大きさを画面に合わせる ────────── */
  function fit() {
    var w = cv.parentNode.parentNode.clientWidth;   // .board ではなく .stage の幅で決める
    scale = Math.max(2, Math.floor(w / (COLS * T)));
    cv.width = COLS * T * scale;
    cv.height = ROWS * T * scale;
    cv.style.width = COLS * T * scale + "px";
    cv.style.height = ROWS * T * scale + "px";
    ctx.imageSmoothingEnabled = false;
    placeLabels();
  }
  window.addEventListener("resize", fit);

  /* ────────── 誰がどこに立つか ────────── */
  function sync() {
    npcs = [];
    ROOM.spots.forEach(function (pos, i) {
      var s = ROOM.mode === "conference" ? (STAFF[i] || null) : (OFFICE.seats()[i] ? staffById(OFFICE.seats()[i]) : null);
      if (ROOM.mode === "conference" && !s) return;      // 名簿より席が多ければ、そこは空にする
      npcs.push({ seat: i, staff: s, c: pos[0], r: pos[1],
                  dir: "down", turn: Math.random() * 4 });
    });
    placeLabels();
  }

  /* 名札はHTMLで置く。日本語をドットで描くと読めないため。
     人数が多い部屋では、横に並んだ名札がぶつかるので短い肩書にする。 */
  function placeLabels() {
    if (!labels) return;
    labels.innerHTML = "";
    var brief = npcs.length > 4;
    npcs.forEach(function (n) {
      var mine = n.staff && OFFICE.seats().indexOf(n.staff.id) >= 0;
      var el = document.createElement("div");
      el.className = "label" + (n.staff ? "" : " off") +
        (n.staff && n.staff.state === "準備中" ? " soon" : "") + (mine ? " mine" : "");
      el.textContent = n.staff
        ? n.staff.mark + " " + (brief ? n.staff.title : n.staff.name)
        : "空席";
      el.style.left = (n.c * T + T / 2) * scale + "px";
      el.style.top = (n.r * T - 9) * scale + "px";
      if (n.staff && n.staff.state !== "準備中") el.style.borderColor = n.staff.color;
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
        rect(x, y, T, T, (c + r) % 2 ? C.floor2 : C.floor);   // 床は市松に
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
     12×16のなかに四角を積んで描く。dir は向き、step は足（0か1）。 */
  function drawPerson(px, py, pal, dir, step, dim) {
    var x = px + 2, y = py;
    ctx.globalAlpha = dim ? 0.55 : 1;
    rect(px + 3, py + 15, 10, 2, C.shadow);

    rect(x + 3, y + 0, 6, 2, pal.hair);           // 髪
    rect(x + 2, y + 1, 8, 3, pal.hair);
    rect(x + 3, y + 3, 6, 4, pal.skin);           // 顔
    if (dir === "up") {
      rect(x + 3, y + 3, 6, 3, pal.hair);
    } else if (dir === "down") {
      rect(x + 3, y + 3, 6, 1, pal.hair);
      rect(x + 4, y + 5, 1, 1, "#2b3440");
      rect(x + 7, y + 5, 1, 1, "#2b3440");
    } else {
      rect(x + 3, y + 3, 6, 1, pal.hair);
      rect(dir === "left" ? x + 4 : x + 7, y + 5, 1, 1, "#2b3440");
    }
    rect(x + 3, y + 7, 6, 5, pal.cloth);          // 体
    rect(x + 3, y + 7, 6, 1, pal.clothHi);
    rect(x + 2, y + 8, 1, 3, pal.cloth);          // 腕
    rect(x + 9, y + 8, 1, 3, pal.cloth);
    rect(x + 2, y + 11, 1, 1, pal.skin);
    rect(x + 9, y + 11, 1, 1, pal.skin);
    var a = step ? 1 : 0, b = step ? 0 : 1;       // 足
    rect(x + 3, y + 12, 2, 3 + a, pal.pants);
    rect(x + 7, y + 12, 2, 3 + b, pal.pants);
    rect(x + 3, y + 15, 2, 1, "#3a4452");
    rect(x + 7, y + 15, 2, 1, "#3a4452");
    ctx.globalAlpha = 1;
  }

  /* 迎えた担当の頭の上に出す印 */
  function drawMark(px, py) {
    rect(px + 6, py - 7, 4, 4, "#e0602f");
    rect(px + 7, py - 6, 2, 2, "#fff");
  }

  /* 空席には人を描かず、椅子だけ置く */
  function drawChair(px, py) {
    rect(px + 3, py + 15, 10, 2, C.shadow);
    rect(px + 3, py + 3, 10, 6, "#9aa6b4");
    rect(px + 3, py + 3, 10, 2, "#b3bdc9");
    rect(px + 2, py + 9, 12, 3, "#8894a3");
    rect(px + 4, py + 12, 2, 4, "#77828f");
    rect(px + 10, py + 12, 2, 4, "#77828f");
  }

  function palOf(s) {
    return { hair: "#3b3a3c", skin: "#f0c9a8", cloth: s.color,
             clothHi: tint(s.color, 26), pants: "#3f4a5a" };
  }
  // 自分（クライアント）はオレンジ。担当と見分けがつくようにしてある
  var MY_PAL = { hair: "#4a3a2c", skin: "#f2cfae", cloth: "#e0602f", clothHi: "#ef8154", pants: "#2f3d52" };

  function tint(hex, n) {
    var v = parseInt(hex.slice(1), 16);
    return "rgb(" + Math.min(255, (v >> 16) + n) + "," +
      Math.min(255, ((v >> 8) & 255) + n) + "," + Math.min(255, (v & 255) + n) + ")";
  }
  function rect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x * scale, y * scale, w * scale, h * scale);
  }

  /* ────────── 毎フレーム ────────── */
  var last = 0;
  function loop(now) {
    var dt = Math.min(50, now - last); last = now;

    if (me.moving) {
      var tx = me.c * T, ty = me.r * T, sp = 0.09 * dt;
      me.x += Math.sign(tx - me.x) * Math.min(sp, Math.abs(tx - me.x));
      me.y += Math.sign(ty - me.y) * Math.min(sp, Math.abs(ty - me.y));
      if (me.x === tx && me.y === ty) { me.moving = false; me.step ^= 1; }
    } else if (held && !talking) {
      tryMove(held);
    }

    npcs.forEach(function (n) {           // ときどき向きを変える
      n.turn += dt / 1000;
      if (n.turn > 4) { n.turn = 0; n.dir = ["down", "left", "right"][(Math.random() * 3) | 0]; }
    });

    ctx.clearRect(0, 0, cv.width, cv.height);
    drawMap();
    npcs.forEach(function (n) {
      if (!n.staff) { drawChair(n.c * T, n.r * T); return; }
      var soon = n.staff.state === "準備中";
      drawPerson(n.c * T, n.r * T, palOf(n.staff), n.dir, 0, soon);
      if (ROOM.mode === "conference" && OFFICE.seats().indexOf(n.staff.id) >= 0) {
        drawMark(n.c * T, n.r * T);       // もう迎えている担当に印
      }
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

  /* 目の前にあるもの。机は挟んでいてよい（カウンター越し）。壁は越えない。 */
  function inFront() {
    var d = D[me.dir];
    for (var step = 1; step <= 2; step++) {
      var c = me.c + d[0] * step, r = me.r + d[1] * step;
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS) break;
      for (var i = 0; i < npcs.length; i++) {
        if (npcs[i].c === c && npcs[i].r === r) return { npc: npcs[i] };
      }
      if (MAP[r][c] === "=") return { door: true };
      if (MAP[r][c] !== "D") break;
    }
    return {};
  }

  /* ────────── はなす ────────── */
  function talk() {
    var f = inFront();

    if (f.door && ROOM.door) {
      talking = true;
      OFFICE.say("扉がある。\n" + ROOM.door.label + "へ行きますか。", [
        { t: "行く", f: function () { location.href = ROOM.door.url; } }
      ]);
      return;
    }
    if (!f.npc) {
      talking = true;
      OFFICE.say("だれもいない。\n担当者の正面に立ってから、はなしかけてください。");
      return;
    }

    var n = f.npc;
    n.dir = { up: "down", down: "up", left: "right", right: "left" }[me.dir];   // こちらを向く
    talking = true;

    if (!n.staff) {
      OFFICE.say("ここは空席だ。\nカンファレンスルームで、来てもらう担当を選べる。",
        ROOM.door ? [{ t: ROOM.door.label + "へ行く", f: function () { location.href = ROOM.door.url; } }] : []);
      return;
    }

    if (n.staff.state === "準備中") {
      OFFICE.say(n.staff.hello + "\n\n（" + n.staff.name + "は、まだお迎えできません）", [
        { t: "話を聞く", f: function () { OFFICE.showProfile(n.staff, ROOM.mode); } }
      ]);
      return;
    }

    if (ROOM.mode === "conference") {
      var already = OFFICE.seats().indexOf(n.staff.id) >= 0;
      OFFICE.say(n.staff.hello, already
        ? [{ t: "話を聞く", f: function () { OFFICE.showProfile(n.staff, "conference"); } }]
        : [
            { t: "MTGルームに迎える", f: function () { OFFICE.hire(n.staff.id); } },
            { t: "話を聞く", f: function () { OFFICE.showProfile(n.staff, "conference"); } }
          ]);
      return;
    }

    OFFICE.say(n.staff.hello, [
      { t: "仕事を頼む", f: function () { OFFICE.showAsk(n.seat); } },
      { t: "話を聞く", f: function () { OFFICE.showProfile(n.staff, "mtg", n.seat); } }
    ]);
  }

  /* ────────── 操作 ────────── */
  document.querySelectorAll("[data-dir]").forEach(function (b) {
    var dir = b.dataset.dir;
    b.addEventListener("pointerdown", function (e) {
      e.preventDefault(); if (!talking) { held = dir; tryMove(dir); }
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (ev) {
      b.addEventListener(ev, function () { if (held === dir) held = null; });
    });
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

  OFFICE.onTalkEnd(function () { talking = false; held = null; });
  OFFICE.onChange(sync);

  sync();
  fit();
  requestAnimationFrame(loop);
})();
