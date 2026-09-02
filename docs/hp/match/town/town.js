/*
  ビジネスタウン 本体

  やっていること
    1. data.js の建物・人から、通れる／通れないのマス目を組み立てる
    2. その地図を canvas にドット絵で描く（画像ファイルは使わない）
    3. 十字キー／矢印キーで歩く
    4. 目の前の人や建物に「はなす」と、RPGの枠でプロフィールが出る
    5. 気になった人は端末の中に控える。連絡は人が確認してから（勝手に送らない）
*/

(function () {
  "use strict";

  var D = window.TOWN_DATA;

  /* ── マス目の種類 ── */
  var GRASS = 0, PAVE = 1, ROAD = 2, WALL = 3, DOOR = 4, TREE = 5, BENCH = 6, BOARD = 7;
  var BLOCKED = { 3: true, 4: true, 5: true, 6: true, 7: true };

  var TILE = 16;
  var MAP_W = 34, MAP_H = 26;
  var VIEW_W = 240, VIEW_H = 176;      // canvas の実サイズ（15×11マス）
  var SPEED = 72;                       // 1秒に進むドット数

  /* ════════════════════════════════════════
     地図を組み立てる
     ════════════════════════════════════════ */

  var map = [];
  (function buildMap() {
    var x, y;
    for (y = 0; y < MAP_H; y++) {
      map[y] = [];
      for (x = 0; x < MAP_W; x++) {
        // 外周は草、それ以外は歩道
        map[y][x] = (x < 2 || x > MAP_W - 3 || y < 2 || y > MAP_H - 3) ? GRASS : PAVE;
      }
    }
    // 通り（縦2本・横2本）
    for (y = 0; y < MAP_H; y++) { map[y][10] = ROAD; map[y][11] = ROAD; map[y][22] = ROAD; map[y][23] = ROAD; }
    for (x = 0; x < MAP_W; x++) { map[7][x] = ROAD; map[8][x] = ROAD; map[17][x] = ROAD; map[18][x] = ROAD; }

    // 建物
    D.places.forEach(function (p) {
      for (y = p.y; y < p.y + p.h; y++) {
        for (x = p.x; x < p.x + p.w; x++) map[y][x] = WALL;
      }
      map[p.door[1]][p.door[0]] = DOOR;
    });

    // 飾り
    D.decor.forEach(function (d) {
      map[d.y][d.x] = d.type === "tree" ? TREE : d.type === "bench" ? BENCH : BOARD;
    });
  })();

  function tileAt(x, y) {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return WALL;
    return map[y][x];
  }
  function npcAt(x, y) {
    for (var i = 0; i < D.people.length; i++) {
      if (D.people[i].x === x && D.people[i].y === y) return D.people[i];
    }
    return null;
  }
  function isBlocked(x, y) {
    return !!BLOCKED[tileAt(x, y)] || !!npcAt(x, y);
  }

  /* ════════════════════════════════════════
     主人公
     ════════════════════════════════════════ */

  var hero = {
    tx: D.start.x, ty: D.start.y,
    px: D.start.x * TILE, py: D.start.y * TILE,
    dir: "down", moving: false, walked: 0
  };
  var DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  var heldDir = null;

  function tryStep(dir) {
    hero.dir = dir;
    var d = DIRS[dir];
    var nx = hero.tx + d[0], ny = hero.ty + d[1];
    if (isBlocked(nx, ny)) return false;
    hero.tx = nx; hero.ty = ny; hero.moving = true;
    return true;
  }

  function facing() {
    var d = DIRS[hero.dir];
    return { x: hero.tx + d[0], y: hero.ty + d[1] };
  }

  /* ════════════════════════════════════════
     描画
     ════════════════════════════════════════ */

  var canvas = document.getElementById("canvas");
  var ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  var cam = { x: 0, y: 0 };
  function updateCamera() {
    cam.x = Math.max(0, Math.min(hero.px + TILE / 2 - VIEW_W / 2, MAP_W * TILE - VIEW_W));
    cam.y = Math.max(0, Math.min(hero.py + TILE / 2 - VIEW_H / 2, MAP_H * TILE - VIEW_H));
  }

  function px(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x - cam.x), Math.round(y - cam.y), w, h);
  }

  function drawGround() {
    var x0 = Math.floor(cam.x / TILE), y0 = Math.floor(cam.y / TILE);
    for (var y = y0; y <= y0 + VIEW_H / TILE + 1; y++) {
      for (var x = x0; x <= x0 + VIEW_W / TILE + 1; x++) {
        var t = tileAt(x, y), wx = x * TILE, wy = y * TILE;
        if (t === GRASS || t === TREE) {
          px(wx, wy, TILE, TILE, "#3d6b42");
          if ((x + y) % 2 === 0) px(wx + 4, wy + 5, 2, 2, "#4a7d4f");
          if ((x * 3 + y) % 5 === 0) px(wx + 10, wy + 11, 2, 2, "#356038");
        } else if (t === ROAD) {
          px(wx, wy, TILE, TILE, "#4b4e57");
          if (y === 7 && x % 2 === 0) px(wx + 3, wy + 15, 10, 1, "#c9b45a");
          if (y === 17 && x % 2 === 0) px(wx + 3, wy + 15, 10, 1, "#c9b45a");
          if (x === 10 && y % 2 === 0) px(wx + 15, wy + 3, 1, 10, "#c9b45a");
          if (x === 22 && y % 2 === 0) px(wx + 15, wy + 3, 1, 10, "#c9b45a");
        } else {
          px(wx, wy, TILE, TILE, "#9aa2ad");            // 歩道
          px(wx, wy, TILE, 1, "#8b939e");
          px(wx, wy, 1, TILE, "#8b939e");
        }
      }
    }
  }

  function drawDecor() {
    D.decor.forEach(function (d) {
      var wx = d.x * TILE, wy = d.y * TILE;
      if (d.type === "tree") {
        px(wx + 7, wy + 9, 2, 6, "#6b4a2f");
        px(wx + 3, wy + 2, 10, 8, "#2f6b3a");
        px(wx + 5, wy + 1, 6, 3, "#3d8049");
        px(wx + 4, wy + 4, 3, 2, "#579a63");
      } else if (d.type === "bench") {
        px(wx + 2, wy + 7, 12, 3, "#8a5f3c");
        px(wx + 2, wy + 4, 12, 2, "#a2734a");
        px(wx + 3, wy + 10, 2, 4, "#5d4028");
        px(wx + 11, wy + 10, 2, 4, "#5d4028");
      } else {
        px(wx + 3, wy + 9, 2, 6, "#6b4a2f");
        px(wx + 11, wy + 9, 2, 6, "#6b4a2f");
        px(wx + 1, wy + 1, 14, 9, "#c8b184");
        px(wx + 2, wy + 2, 12, 7, "#f2e2bd");
        px(wx + 3, wy + 4, 8, 1, "#8a7452");
        px(wx + 3, wy + 6, 6, 1, "#8a7452");
      }
    });
  }

  function drawPlaces() {
    D.places.forEach(function (p) {
      var wx = p.x * TILE, wy = p.y * TILE, w = p.w * TILE, h = p.h * TILE;
      var wall = p.colors[0], roof = p.colors[1], win = p.colors[2];

      px(wx + 2, wy + h - 3, w, 3, "rgba(0,0,0,.28)");   // 影
      px(wx, wy, w, h, wall);                            // 建物全体

      // 屋根。入口が上の行にあるときは、その列だけ空ける（入口が屋根に埋まらないように）
      var doorLeft = (p.door[0] - p.x) * TILE;
      if (p.door[1] === p.y) {
        px(wx, wy, doorLeft, TILE, roof);
        px(wx + doorLeft + TILE, wy, w - doorLeft - TILE, TILE, roof);
      } else {
        px(wx, wy, w, TILE, roof);
      }
      px(wx, wy + TILE, w, 2, "rgba(0,0,0,.18)");
      px(wx, wy + TILE - 3, w, 3, "rgba(255,255,255,.10)");

      // 窓（入口の列は空ける）
      var doorLocalX = doorLeft;
      for (var ry = wy + TILE + 6; ry < wy + h - 14; ry += 14) {
        for (var rx = wx + 6; rx < wx + w - 8; rx += 14) {
          if (Math.abs(rx - (wx + doorLocalX)) < 12 && ry > wy + h - 30) continue;
          px(rx, ry, 8, 8, "rgba(0,0,0,.25)");
          px(rx, ry, 7, 7, win);
          px(rx, ry, 7, 3, "rgba(255,255,255,.35)");
        }
      }

      // 入口
      var dx = p.door[0] * TILE, dy = p.door[1] * TILE;
      px(dx + 2, dy + 2, 12, 14, "#3a2b1e");
      px(dx + 3, dy + 3, 10, 13, "#6b4a2f");
      px(dx + 7, dy + 9, 2, 2, "#f0d089");
      px(dx + 2, dy, 12, 3, "#d9c48a");                  // 看板
    });
  }

  function drawPerson(wx, wy, color, dir, frame) {
    px(wx + 4, wy + 14, 8, 2, "rgba(0,0,0,.25)");        // 影
    px(wx + 5, wy + 1, 6, 5, "#2b2118");                 // 髪
    px(wx + 5, wy + 4, 6, 4, "#f2c9a0");                 // 顔
    if (dir === "down") { px(wx + 6, wy + 6, 1, 1, "#2b2118"); px(wx + 9, wy + 6, 1, 1, "#2b2118"); }
    if (dir === "left")  px(wx + 6, wy + 6, 1, 1, "#2b2118");
    if (dir === "right") px(wx + 9, wy + 6, 1, 1, "#2b2118");
    px(wx + 4, wy + 8, 8, 5, color);                     // 体
    px(wx + 4, wy + 8, 8, 1, "rgba(255,255,255,.35)");
    if (frame === 1) { px(wx + 4, wy + 13, 3, 3, "#39424f"); px(wx + 9, wy + 13, 3, 2, "#39424f"); }
    else if (frame === 2) { px(wx + 4, wy + 13, 3, 2, "#39424f"); px(wx + 9, wy + 13, 3, 3, "#39424f"); }
    else { px(wx + 4, wy + 13, 3, 3, "#39424f"); px(wx + 9, wy + 13, 3, 3, "#39424f"); }
  }

  function drawActors() {
    var actors = D.people.map(function (p) {
      return { y: p.y * TILE, draw: function () { drawPerson(p.x * TILE, p.y * TILE, p.color, "down", 0); } };
    });
    actors.push({
      y: hero.py,
      draw: function () {
        var f = hero.moving ? (Math.floor(hero.walked / 8) % 2) + 1 : 0;
        drawPerson(hero.px, hero.py, "#ff6b6b", hero.dir, f);
      }
    });
    actors.sort(function (a, b) { return a.y - b.y; });
    actors.forEach(function (a) { a.draw(); });
  }

  function render() {
    updateCamera();
    ctx.fillStyle = "#3d6b42";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    drawGround();
    drawDecor();
    drawPlaces();
    drawActors();
  }

  /* ════════════════════════════════════════
     メッセージ枠
     ════════════════════════════════════════ */

  var win = document.getElementById("window");
  var msgEl = document.getElementById("msg");
  var nextEl = document.getElementById("next");
  var choicesEl = document.getElementById("choices");
  var pages = [], pageIndex = 0, typing = null, fullText = "";

  var talking = function () { return !win.hidden; };

  function showPages(list, choices) {
    pages = list.slice();
    pageIndex = 0;
    win.hidden = false;
    choicesEl.hidden = true;
    choicesEl.innerHTML = "";
    win.dataset.choices = choices ? "1" : "";
    win._choices = choices || null;
    typePage();
  }

  function typePage() {
    fullText = pages[pageIndex];
    msgEl.textContent = "";
    nextEl.hidden = true;
    var i = 0;
    clearInterval(typing);
    typing = setInterval(function () {
      i += 1;
      msgEl.textContent = fullText.slice(0, i);
      if (i >= fullText.length) { clearInterval(typing); typing = null; afterPage(); }
    }, 18);
  }

  function afterPage() {
    if (pageIndex < pages.length - 1) { nextEl.hidden = false; return; }
    if (win._choices) {
      choicesEl.innerHTML = "";
      win._choices.forEach(function (c) {
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = c.label;
        b.addEventListener("click", function (e) { e.stopPropagation(); c.run(); });
        choicesEl.appendChild(b);
      });
      choicesEl.hidden = false;
    } else {
      nextEl.hidden = false;
    }
  }

  function advance() {
    if (typing) {                       // 表示中なら全部出す
      clearInterval(typing); typing = null;
      msgEl.textContent = fullText;
      afterPage();
      return;
    }
    if (!choicesEl.hidden) return;      // 選択肢待ち
    if (pageIndex < pages.length - 1) { pageIndex++; typePage(); return; }
    closeWindow();
  }

  function closeWindow() {
    clearInterval(typing); typing = null;
    win.hidden = true;
    choicesEl.hidden = true;
    win._choices = null;
  }

  win.addEventListener("click", function () { advance(); });

  /* ════════════════════════════════════════
     気になるリスト（この端末の中だけ）
     ════════════════════════════════════════ */

  var KEY = "todo-town-kininaru";
  function kininaru() {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; }
  }
  function addKininaru(id) {
    var list = kininaru();
    if (list.indexOf(id) === -1) list.push(id);
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* 保存できなくても続行 */ }
  }

  /* ════════════════════════════════════════
     話しかける
     ════════════════════════════════════════ */

  function talkTo(p) {
    var already = kininaru().indexOf(p.id) !== -1;
    showPages([
      p.organization + "の " + p.title + "、\n" + p.name + " です。\n\n" + p.tagline,
      "【いま やっていること】\n" + p.current_work,
      "【できること】\n" + p.strengths,
      "【会いたい相手】\n" + p.target_profile
    ], [
      {
        label: already ? "きになる（登録ずみ）" : "きになる",
        run: function () {
          addKininaru(p.id);
          showPages([p.name + " を きになるリストに 加えた。\n\nマッチング事務局に行くと、\nこれまでに加えた人を確認できる。"]);
        }
      },
      { label: "とじる", run: closeWindow }
    ]);
  }

  function enterPlace(place) {
    var here = D.people.filter(function (p) { return p.place === place.id; });
    var who = here.length
      ? "いまは " + here.map(function (p) { return p.name; }).join("、") + " が このあたりにいる。"
      : "いまは 誰もいないようだ。";

    if (place.id === "guild") {
      var list = kininaru();
      var names = D.people.filter(function (p) { return list.indexOf(p.id) !== -1; })
        .map(function (p) { return "・" + p.name + "（" + p.organization + "）"; });
      showPages([
        "マッチング事務局。\n\n" + place.about,
        names.length
          ? "きになるリスト（" + names.length + "人）\n\n" + names.join("\n")
          : "きになるリストは まだ空です。\n\n街を歩いて、気になった人に\n話しかけてみてください。",
        "ここから先は、人が内容を確認してから\nご本人に連絡します。\n\nAIが勝手に送ることはありません。"
      ]);
      return;
    }
    showPages([place.name + "。\n\n" + place.about, who]);
  }

  function interact() {
    if (talking()) { advance(); return; }
    var f = facing();
    var p = npcAt(f.x, f.y);
    if (p) { talkTo(p); return; }

    var t = tileAt(f.x, f.y);
    if (t === DOOR) {
      var place = D.places.filter(function (q) { return q.door[0] === f.x && q.door[1] === f.y; })[0];
      if (place) enterPlace(place);
      return;
    }
    if (t === BOARD) {
      var lines = D.places.map(function (q) { return "・" + q.name; });
      showPages([
        "けいじばん\n\nこの街にある場所",
        lines.join("\n"),
        "右上の「一覧」からは、\n街にいる人をまとめて見られる。"
      ]);
      return;
    }
    if (t === BENCH) { showPages(["ベンチだ。\nすこし休んでいく人が多い。"]); return; }
    if (t === WALL)  { showPages(["建物の壁だ。\n入口は別のところにある。"]); return; }
    if (t === TREE)  { showPages(["よく手入れされた植え込みだ。"]); return; }
    showPages(["とくに 何もない。"]);
  }

  /* ════════════════════════════════════════
     いまいる場所の名前
     ════════════════════════════════════════ */

  var areaEl = document.getElementById("area");
  function areaName() {
    var near = null, best = 99;
    D.places.forEach(function (p) {
      var dx = Math.max(p.x - hero.tx, 0, hero.tx - (p.x + p.w - 1));
      var dy = Math.max(p.y - hero.ty, 0, hero.ty - (p.y + p.h - 1));
      var d = dx + dy;
      if (d < best) { best = d; near = p; }
    });
    if (near && best <= 2) return near.name + "の まえ";
    if (tileAt(hero.tx, hero.ty) === ROAD) return "とおり";
    if (hero.tx >= 12 && hero.tx <= 21 && hero.ty >= 9 && hero.ty <= 16) return "まちの ひろば";
    return "ビジネスタウン";
  }

  /* 目の前に何かあるときのしるし */
  var hintEl = document.getElementById("hint");
  var hintText = document.getElementById("hint-text");
  function updateHint() {
    if (talking()) { hintEl.hidden = true; return; }
    var f = facing(), label = null;
    var p = npcAt(f.x, f.y);
    if (p) label = p.name;
    else if (tileAt(f.x, f.y) === DOOR) {
      var place = D.places.filter(function (q) { return q.door[0] === f.x && q.door[1] === f.y; })[0];
      if (place) label = place.name;
    } else if (tileAt(f.x, f.y) === BOARD) label = "けいじばん";
    if (label) { hintText.textContent = label; hintEl.hidden = false; }
    else hintEl.hidden = true;
  }

  /* ════════════════════════════════════════
     操作
     ════════════════════════════════════════ */

  var KEYMAP = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    w: "up", s: "down", a: "left", d: "right"
  };

  document.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); interact(); return; }
    if (e.key === "Escape") { closeWindow(); return; }
    var dir = KEYMAP[e.key];
    if (dir) { e.preventDefault(); heldDir = dir; }
  });
  document.addEventListener("keyup", function (e) {
    if (KEYMAP[e.key] && heldDir === KEYMAP[e.key]) heldDir = null;
  });

  Array.prototype.forEach.call(document.querySelectorAll(".dpad button"), function (b) {
    var dir = b.getAttribute("data-dir");
    var start = function (e) { e.preventDefault(); heldDir = dir; };
    var stop = function () { if (heldDir === dir) heldDir = null; };
    b.addEventListener("pointerdown", start);
    b.addEventListener("pointerup", stop);
    b.addEventListener("pointerleave", stop);
    b.addEventListener("pointercancel", stop);
  });

  document.getElementById("a-btn").addEventListener("click", function () { interact(); });

  /* ── 一覧 ── */
  var panel = document.getElementById("list-panel");
  var body = document.getElementById("list-body");

  function openList() {
    body.innerHTML = "";
    var mine = kininaru();
    D.people.forEach(function (p) {
      var place = D.places.filter(function (q) { return q.id === p.place; })[0];
      var b = document.createElement("button");
      b.type = "button";
      b.className = "person-card";
      b.innerHTML =
        "<b>" + esc(p.name) + (mine.indexOf(p.id) !== -1 ? " ★" : "") + "</b>" +
        '<span class="role">' + esc(p.organization) + "　" + esc(p.title) + "／" + esc(p.industry) + "</span>" +
        '<span class="where">' + esc(place ? place.name + " のあたり" : "ひろば") + "　▶ ここへ行く</span>";
      b.addEventListener("click", function () { goTo(p); });
      body.appendChild(b);
    });
    panel.hidden = false;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* 一覧から選んだ人の前まで移動する */
  function goTo(p) {
    var spots = [[p.x, p.y + 1, "up"], [p.x, p.y - 1, "down"], [p.x - 1, p.y, "right"], [p.x + 1, p.y, "left"]];
    for (var i = 0; i < spots.length; i++) {
      var s = spots[i];
      if (!isBlocked(s[0], s[1])) {
        hero.tx = s[0]; hero.ty = s[1];
        hero.px = s[0] * TILE; hero.py = s[1] * TILE;
        hero.dir = s[2]; hero.moving = false;
        break;
      }
    }
    panel.hidden = true;
    closeWindow();
  }

  document.getElementById("list-btn").addEventListener("click", openList);
  document.getElementById("list-close").addEventListener("click", function () { panel.hidden = true; });

  /* ════════════════════════════════════════
     毎フレーム
     ════════════════════════════════════════ */

  var last = 0;
  function loop(now) {
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    if (hero.moving) {
      var tx = hero.tx * TILE, ty = hero.ty * TILE;
      var step = SPEED * dt;
      hero.walked += step;
      if (Math.abs(tx - hero.px) <= step) hero.px = tx; else hero.px += Math.sign(tx - hero.px) * step;
      if (Math.abs(ty - hero.py) <= step) hero.py = ty; else hero.py += Math.sign(ty - hero.py) * step;
      if (hero.px === tx && hero.py === ty) hero.moving = false;
    } else if (heldDir && !talking() && panel.hidden) {
      tryStep(heldDir);
    }

    render();
    areaEl.textContent = areaName();
    updateHint();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  /* テストから中身を見るための入口（画面には影響しない） */
  window.__TOWN = {
    map: map, hero: hero, data: D,
    isBlocked: isBlocked, tileAt: tileAt, npcAt: npcAt,
    interact: interact, kininaru: kininaru,
    consts: { TILE: TILE, MAP_W: MAP_W, MAP_H: MAP_H, DOOR: DOOR }
  };
})();
