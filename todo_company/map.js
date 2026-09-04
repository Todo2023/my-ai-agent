/*
 * 脳内マップ本体。
 *
 *   NODES / LINKS ... 地図に出す中身。ここだけ直せば地図が変わる
 *   simulation   ... 丸どうしが押し合い、線が引き合う簡単な力学
 *   draw         ... canvas に線と丸と札を描く
 *   panel        ... 丸を押したときに横に出る「エッセンス」と投稿文
 *
 * 外部のライブラリは使っていない（読み込みが塞がれている場所でも動くように）。
 */
(function () {
  'use strict';

  // 地図の中身は map.data.js が持っている
  var DATA = (typeof MAP_DATA !== 'undefined') ? MAP_DATA : null;
  if (!DATA) { throw new Error('map.data.js が先に読み込まれていません'); }

  var FB_URL = DATA.FB_URL;
  var CATS = DATA.CATS;
  var SURE = DATA.SURE;
  var NODES = DATA.NODES;
  var LINKS = DATA.LINKS;

  // ---------------------------------------------------------------
  // 下ごしらえ
  // ---------------------------------------------------------------
  var byId = {};
  NODES.forEach(function (n) { byId[n.id] = n; });

  var links = LINKS.map(function (l) { return { a: byId[l[0]], b: byId[l[1]] }; })
    .filter(function (l) { return l.a && l.b; });

  // 隣り合っている丸を覚えておく（選んだときに線を光らせる）
  links.forEach(function (l) {
    (l.a.near || (l.a.near = [])).push(l.b.id);
    (l.b.near || (l.b.near = [])).push(l.a.id);
  });

  var canvas = document.getElementById('map');
  var panel = document.getElementById('essence');
  var indexList = document.getElementById('index-list');
  var resetBtn = document.getElementById('reset');
  var toastEl = document.getElementById('toast');
  if (!canvas || !panel) return;

  var ctx = canvas.getContext('2d');
  var still = window.matchMedia('(prefers-reduced-motion: reduce)');

  // CSS 変数から色を取る
  var css = getComputedStyle(document.documentElement);
  var COLOR = {};
  Object.keys(CATS).forEach(function (k) {
    COLOR[k] = css.getPropertyValue('--c-' + k).trim() || '#8fa3ad';
  });
  var LINE = css.getPropertyValue('--line').trim() || 'rgba(232,240,237,0.14)';
  var INK = css.getPropertyValue('--ink').trim() || '#e8f0ed';
  var MUTED = css.getPropertyValue('--muted').trim() || '#93a6a0';

  var W = 0, H = 0, dpr = 1;
  var selected = null, hovered = null, dragging = null;
  var pointerDown = null, moved = false;

  // ---------------------------------------------------------------
  // 置きはじめの位置。中心から放射状に散らしておくとほどけやすい
  // ---------------------------------------------------------------
  function seed() {
    var i = 0;
    NODES.forEach(function (n) {
      if (n.cat === 'center') { n.x = 0; n.y = 0; }
      else {
        var ang = (i * 2.399963); // 黄金角。重ならないように散る
        var rad = 60 + Math.sqrt(i) * 34;
        n.x = Math.cos(ang) * rad;
        n.y = Math.sin(ang) * rad;
        i++;
      }
      n.vx = 0; n.vy = 0;
    });
  }

  // ---------------------------------------------------------------
  // 力学ひと押しぶん
  // ---------------------------------------------------------------
  function step() {
    var i, j, a, b, dx, dy, d, f;

    // 板が広いときは、そのぶん広がるようにする
    var spread = Math.max(0.85, Math.min(1.7, Math.min(W, H) / 520));

    // 押し合う
    for (i = 0; i < NODES.length; i++) {
      a = NODES[i];
      for (j = i + 1; j < NODES.length; j++) {
        b = NODES[j];
        dx = b.x - a.x; dy = b.y - a.y;
        d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        f = (620 + a.r * b.r * 2.2) * spread * spread / (d * d);
        if (f > 2.2) f = 2.2;
        dx /= d; dy /= d;
        a.vx -= dx * f; a.vy -= dy * f;
        b.vx += dx * f; b.vy += dy * f;

        // 重なったぶんは、その場で引き離す
        var min = a.r + b.r + 9;
        if (d < min) {
          var push = (min - d) * 0.5;
          a.x -= dx * push; a.y -= dy * push;
          b.x += dx * push; b.y += dy * push;
        }
      }
    }

    // 線が引き合う
    for (i = 0; i < links.length; i++) {
      a = links[i].a; b = links[i].b;
      dx = b.x - a.x; dy = b.y - a.y;
      d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      var rest = (a.r + b.r + 58) * spread;
      f = (d - rest) * 0.012;
      dx /= d; dy /= d;
      a.vx += dx * f; a.vy += dy * f;
      b.vx -= dx * f; b.vy -= dy * f;
    }

    // 真ん中へゆるく寄せる
    for (i = 0; i < NODES.length; i++) {
      a = NODES[i];
      a.vx -= a.x * 0.0016;
      a.vy -= a.y * 0.0016;
    }

    // 動かして、減衰させて、枠の中に収める
    var mx = W / 2 - 16, my = H / 2 - 16;
    for (i = 0; i < NODES.length; i++) {
      a = NODES[i];
      if (a === dragging) { a.vx = 0; a.vy = 0; continue; }
      a.vx *= 0.84; a.vy *= 0.84;
      a.x += a.vx; a.y += a.vy;
      if (a.x < -mx + a.r) { a.x = -mx + a.r; a.vx *= -0.4; }
      if (a.x > mx - a.r) { a.x = mx - a.r; a.vx *= -0.4; }
      if (a.y < -my + a.r) { a.y = -my + a.r; a.vy *= -0.4; }
      if (a.y > my - a.r) { a.y = my - a.r; a.vy *= -0.4; }
    }
  }

  function energy() {
    var e = 0;
    for (var i = 0; i < NODES.length; i++) e += NODES[i].vx * NODES[i].vx + NODES[i].vy * NODES[i].vy;
    return e;
  }

  // ---------------------------------------------------------------
  // 描く
  // ---------------------------------------------------------------
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, H / 2);

    var focus = selected || hovered;

    // 線
    for (var i = 0; i < links.length; i++) {
      var l = links[i];
      var on = focus && (l.a === focus || l.b === focus);
      ctx.beginPath();
      ctx.moveTo(l.a.x, l.a.y);
      ctx.lineTo(l.b.x, l.b.y);
      ctx.strokeStyle = on ? withAlpha(COLOR[focus.cat], 0.55) : LINE;
      ctx.lineWidth = on ? 1.6 : 1;
      ctx.stroke();
    }

    // 丸
    for (i = 0; i < NODES.length; i++) {
      var n = NODES[i];
      var dim = focus && n !== focus && focus.near && focus.near.indexOf(n.id) < 0;
      var col = COLOR[n.cat] || MUTED;

      ctx.globalAlpha = dim ? 0.3 : 1;

      if (n === focus || n.cat === 'center') {
        ctx.shadowColor = withAlpha(col, 0.85);
        ctx.shadowBlur = n === focus ? 22 : 16;
      }

      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);

      if (n.cat === 'blank') {
        // 中身がまだ無いので、塗らずに点線の輪だけ
        ctx.fillStyle = withAlpha(col, 0.1);
        ctx.fill();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = col;
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      if (n === selected) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r + 6, 0, Math.PI * 2);
        ctx.strokeStyle = withAlpha(INK, 0.8);
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    drawLabels(focus);
    ctx.restore();
  }

  // 札。大きい丸から順に置いて、ぶつかるものは出さない
  function drawLabels(focus) {
    // 選んだ丸と真ん中は先に置いて、必ず名前を出す。残りは大きい順に、空いていれば置く
    function rank(n) {
      return (n === focus ? 200 : 0) + (n.cat === 'center' ? 100 : 0) + n.r;
    }
    var order = NODES.slice().sort(function (p, q) { return rank(q) - rank(p); });
    var placed = [];
    ctx.textBaseline = 'middle';

    for (var i = 0; i < order.length; i++) {
      var n = order[i];
      var big = n.r >= 12;
      // 小さい丸の札は、選ばれているか隣り合っているときだけ出す
      if (!big && !(focus && (n === focus || (focus.near && focus.near.indexOf(n.id) >= 0)))) continue;

      var size = n.cat === 'center' ? 14 : (big ? 12.5 : 11);
      ctx.font = '600 ' + size + 'px ' + bodyFont();
      var w = ctx.measureText(n.label).width;
      var h = size + 7;
      var gap = n.r + 8;

      // 右→左→下→上の順に置き場所を探す。どこにも置けなければ札を出さない
      var spots = [
        { x: n.x + gap, y: n.y },
        { x: n.x - gap - w, y: n.y },
        { x: n.x - w / 2, y: n.y + gap + h * 0.4 },
        { x: n.x - w / 2, y: n.y - gap - h * 0.4 }
      ];

      // 選んだ丸と真ん中の札は、多少ぶつかっても必ず出す
      var must = n === focus || n.cat === 'center';

      var box = null, fallback = null, fewest = Infinity;
      for (var s = 0; s < spots.length; s++) {
        var cand = { x: spots[s].x - 3, y: spots[s].y - h / 2, w: w + 6, h: h };
        // 板からはみ出す置き方は、必ず出す札でも使わない
        if (cand.x < -W / 2 + 6 || cand.x + cand.w > W / 2 - 6) continue;
        if (cand.y < -H / 2 + 4 || cand.y + cand.h > H / 2 - 4) continue;

        var clash = countNodes(cand, n) + (hits(cand, placed) ? 1 : 0);
        if (clash === 0) { box = cand; break; }
        // どこも空いていなかったとき用に、いちばんぶつかりの少ない置き方を覚えておく
        if (clash < fewest) { fewest = clash; fallback = cand; }
      }
      if (!box && must) box = fallback;
      if (!box) continue;

      var x = box.x + 3;
      var y = box.y + h / 2;
      placed.push(box);

      ctx.fillStyle = n === focus ? INK : (n.r >= 14 ? INK : MUTED);
      ctx.globalAlpha = focus && n !== focus && focus.near && focus.near.indexOf(n.id) < 0 ? 0.35 : 1;
      // 線の上でも読めるように、うしろを暗く縁取る
      ctx.strokeStyle = 'rgba(10,16,14,0.9)';
      ctx.lineWidth = 3.4;
      ctx.lineJoin = 'round';
      ctx.strokeText(n.label, x, y);
      ctx.fillText(n.label, x, y);
      ctx.globalAlpha = 1;
    }
  }

  // 札が、自分以外のいくつの丸に乗っているか
  function countNodes(box, self) {
    var hit = 0;
    for (var i = 0; i < NODES.length; i++) {
      var n = NODES[i];
      if (n === self) continue;
      // 丸に一番近い札の点との距離で見る
      var cx = Math.max(box.x, Math.min(n.x, box.x + box.w));
      var cy = Math.max(box.y, Math.min(n.y, box.y + box.h));
      var dx = n.x - cx, dy = n.y - cy;
      if (dx * dx + dy * dy < (n.r + 2) * (n.r + 2)) hit++;
    }
    return hit;
  }

  function hits(box, list) {
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (box.x < o.x + o.w && box.x + box.w > o.x && box.y < o.y + o.h && box.y + box.h > o.y) return true;
    }
    return false;
  }

  function bodyFont() {
    return '"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",Meiryo,system-ui,sans-serif';
  }

  function withAlpha(c, a) {
    c = (c || '').trim();
    if (c.charAt(0) === '#') {
      var hex = c.length === 4
        ? c[1] + c[1] + c[2] + c[2] + c[3] + c[3]
        : c.slice(1);
      var num = parseInt(hex, 16);
      return 'rgba(' + ((num >> 16) & 255) + ',' + ((num >> 8) & 255) + ',' + (num & 255) + ',' + a + ')';
    }
    return c;
  }

  // ---------------------------------------------------------------
  // 動かし続ける
  // ---------------------------------------------------------------
  var raf = null, quiet = 0;

  function loop() {
    raf = null;
    step();
    draw();
    if (energy() < 0.02 && !dragging) {
      if (++quiet > 30) return;   // 落ち着いたら止める（電池のため）
    } else { quiet = 0; }
    raf = requestAnimationFrame(loop);
  }

  function wake() {
    quiet = 0;
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function settle(times) {
    for (var i = 0; i < times; i++) step();
    draw();
  }

  // ---------------------------------------------------------------
  // 大きさ合わせ
  // ---------------------------------------------------------------
  function resize() {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (still.matches) { settle(1); } else { wake(); }
  }

  // ---------------------------------------------------------------
  // 指とマウス
  // ---------------------------------------------------------------
  function at(ev) {
    var rect = canvas.getBoundingClientRect();
    return { x: ev.clientX - rect.left - W / 2, y: ev.clientY - rect.top - H / 2 };
  }

  function pick(p) {
    var best = null, bestD = Infinity;
    for (var i = 0; i < NODES.length; i++) {
      var n = NODES[i];
      var dx = n.x - p.x, dy = n.y - p.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < n.r + 9 && d < bestD) { best = n; bestD = d; }
    }
    return best;
  }

  canvas.addEventListener('pointerdown', function (ev) {
    var p = at(ev);
    var n = pick(p);
    pointerDown = p; moved = false;
    if (n) {
      dragging = n;
      canvas.classList.add('is-grabbing');
      canvas.setPointerCapture(ev.pointerId);
    }
  });

  canvas.addEventListener('pointermove', function (ev) {
    var p = at(ev);
    if (dragging) {
      dragging.x = p.x; dragging.y = p.y;
      dragging.vx = 0; dragging.vy = 0;
      if (pointerDown && Math.abs(p.x - pointerDown.x) + Math.abs(p.y - pointerDown.y) > 4) moved = true;
      if (still.matches) settle(1); else wake();
      return;
    }
    if (ev.pointerType === 'mouse') {
      var n = pick(p);
      if (n !== hovered) {
        hovered = n;
        canvas.style.cursor = n ? 'pointer' : 'grab';
        if (still.matches) draw(); else wake();
      }
    }
  });

  function release(ev) {
    if (dragging && !moved) select(dragging);
    else if (!dragging && !moved && pointerDown) select(null);
    dragging = null; pointerDown = null;
    canvas.classList.remove('is-grabbing');
    if (ev && ev.pointerId != null && canvas.hasPointerCapture && canvas.hasPointerCapture(ev.pointerId)) {
      canvas.releasePointerCapture(ev.pointerId);
    }
    if (still.matches) draw(); else wake();
  }

  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  // キーボードでも順に見ていけるように
  canvas.setAttribute('tabindex', '0');
  canvas.addEventListener('keydown', function (ev) {
    var pickable = NODES;
    if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft' && ev.key !== 'Enter') return;
    ev.preventDefault();
    var i = pickable.indexOf(selected);
    if (ev.key === 'ArrowRight') i = (i + 1) % pickable.length;
    else if (ev.key === 'ArrowLeft') i = (i - 1 + pickable.length) % pickable.length;
    else if (i < 0) i = 0;
    select(pickable[i]);
  });

  // ---------------------------------------------------------------
  // エッセンスの札
  // ---------------------------------------------------------------
  function select(n) {
    selected = n;
    renderPanel(n);
    if (still.matches) draw(); else wake();
  }

  // ---------------------------------------------------------------
  // 配信するところ
  //
  // 配信先ごとの違いは、この CHANNELS だけに閉じ込めてある。
  // 自動投稿をつなぐときも、触るのは各 channel の deliver() だけ。
  // ---------------------------------------------------------------
  var CHANNELS = {
    fb: {
      label: 'Facebook',
      limit: 0,                     // 実用上、長さで困らない
      open: 'コピーしてFacebookを開く',
      note: 'Facebookは文章を先に入れた状態で開けないので、コピー → 貼り付け、の順になります。',
      // Facebookページを開くだけ。文章は持ち込めないので、先にコピーする
      deliver: function (text) {
        return { copy: true, url: FB_URL };
      }
    },
    x: {
      label: 'X',
      limit: 140,                   // 日本語は1文字2カウント。280の半分
      open: 'Xの投稿画面をひらく',
      note: 'Xは文章を入れた状態で投稿画面がひらきます。中身を確かめて、投稿を押してください。',
      // 投稿画面に文章を載せて開く。押すのは人。ここは今日から動く
      deliver: function (text) {
        return { copy: false, url: 'https://x.com/intent/post?text=' + encodeURIComponent(text) };
      }
    }
  };

  /*
   * 押すだけで飛ぶ「自動配信」にするときは、上の deliver() を
   * 投稿を受け取る置き場へ送る形に差し替える。例：
   *
   *   deliver: function (text) {
   *     return fetch(ENDPOINT, {
   *       method: 'POST',
   *       headers: { 'content-type': 'application/json' },
   *       body: JSON.stringify({ channel: 'fb', text: text })
   *     }).then(...);
   *   }
   *
   * ここ（見る人のブラウザ）にトークンを置いてはいけない。ページを開いた人
   * 全員に読めてしまい、会社のアカウントを触られる。トークンは必ず置き場側で
   * 預かり、このページからは文章だけを渡す。
   */

  var TAGS = '#合同会社Todo #札幌';

  // 長い版。Facebook はこれをそのまま出す
  function longText(n) {
    var body = n.body || n.label;
    // 会社そのものの丸だけは、見出しに会社名を重ねない
    var head = n.id === 'todo' ? n.label : n.label + '｜合同会社To do';
    return head + '\n\n' + body + '\n\n' + TAGS;
  }

  // 上限のある配信先用。文の途中で切らず、入る文だけを残す
  function fitText(n, limit) {
    var head = n.id === 'todo' ? n.label : n.label + '｜合同会社To do';
    var tail = '\n\n' + TAGS;
    var room = limit - len(head) - len(tail) - 2;   // 2 は本文前の改行ぶん
    var body = n.short || n.body || '';

    if (len(body) > room) {
      var kept = '';
      // 「。」で区切って、入るところまで足す
      var parts = body.split('。');
      for (var i = 0; i < parts.length; i++) {
        if (!parts[i]) continue;
        var next = kept + parts[i] + '。';
        if (len(next) > room) break;
        kept = next;
      }
      body = kept || body.slice(0, Math.max(0, room - 1)) + '…';
    }
    return head + '\n\n' + body + tail;
  }

  function len(s) { return Array.from(s).length; }   // 絵文字も1文字で数える

  function draftFor(n, ch) {
    var c = CHANNELS[ch];
    return c.limit ? fitText(n, c.limit) : longText(n);
  }

  function renderPanel(n) {
    if (!n) {
      panel.innerHTML = '<p class="essence__empty">丸を押すと、その中身と、そこから作った投稿文がここに出ます。</p>';
      return;
    }

    var color = COLOR[n.cat] || MUTED;
    var html = '';
    html += '<span class="essence__cat" style="--cat-color:' + esc(color) + '">' + esc(CATS[n.cat].label) + '</span>';
    html += '<h2>' + esc(n.label) + '</h2>';
    html += '<p class="essence__body">' + esc(n.body || 'この丸には、まだ短い言葉しか入っていません。') + '</p>';
    if (n.link) {
      html += '<p class="essence__link"><a href="' + esc(n.link) + '" target="_blank" rel="noopener noreferrer">'
        + esc(n.linkLabel || n.link) + ' ↗</a></p>';
    }
    // どこまで確かな話なのかを、丸ごとに出す
    var s = SURE[n.sure || (n.src ? 'site' : 'guess')];
    html += '<p class="essence__src"><span class="sure" data-sure="' + esc(n.sure || (n.src ? 'site' : 'guess')) + '">'
      + esc(s.label) + '</span>' + esc(s.note)
      + (n.src ? '（' + esc(n.src) + '）' : '') + '</p>';

    if (n.post) {
      html += '<div class="post">'
        + '<h3>配信</h3>'
        + '<div class="post__tabs" role="tablist" aria-label="配信先">'
        + '<button type="button" role="tab" class="post__tab" data-ch="fb" aria-selected="true">Facebook</button>'
        + '<button type="button" role="tab" class="post__tab" data-ch="x" aria-selected="false">X</button>'
        + '</div>'
        + '<textarea id="post-text" aria-label="投稿文"></textarea>'
        + '<div class="post__row">'
        + '<a class="btn" id="go" target="_blank" rel="noopener noreferrer"></a>'
        + '<button type="button" class="btn btn--quiet" id="copy">コピーだけ</button>'
        + '<span class="post__count" id="count"></span>'
        + '</div>'
        + '<p class="post__note" id="note"></p>'
        + '</div>';
    } else if (n.waiting) {
      html += '<div class="post"><p class="post__note">' + esc(n.waiting) + '</p></div>';
    }

    panel.innerHTML = html;

    var ta = document.getElementById('post-text');
    if (!ta) return;

    // 配信先ごとの下書きを持っておく。切り替えても書き直しが消えない
    var drafts = { fb: draftFor(n, 'fb'), x: draftFor(n, 'x') };
    var cur = 'fb';

    function show(ch) {
      cur = ch;
      ta.value = drafts[ch];
      Array.prototype.forEach.call(document.querySelectorAll('.post__tab'), function (t) {
        t.setAttribute('aria-selected', String(t.dataset.ch === ch));
      });
      document.getElementById('go').textContent = CHANNELS[ch].open;
      document.getElementById('note').textContent = CHANNELS[ch].note;
      sync();
    }

    // 文字数と、ひらく先のアドレスを、いまの文章に合わせる
    function sync() {
      var text = ta.value;
      drafts[cur] = text;

      var c = CHANNELS[cur];
      var el = document.getElementById('count');
      var n2 = len(text);
      el.textContent = c.limit ? n2 + ' / ' + c.limit + ' 文字' : n2 + ' 文字';
      el.setAttribute('data-over', String(!!c.limit && n2 > c.limit));

      var out = c.deliver(text);
      var go = document.getElementById('go');
      go.href = out.url;
      go.dataset.copy = String(!!out.copy);
    }

    Array.prototype.forEach.call(document.querySelectorAll('.post__tab'), function (t) {
      t.addEventListener('click', function () { show(t.dataset.ch); });
    });
    ta.addEventListener('input', sync);

    document.getElementById('copy').addEventListener('click', function () {
      copy(ta, 'コピーしました');
    });
    document.getElementById('go').addEventListener('click', function () {
      // 文章を持ち込めない配信先だけ、開く前にコピーしておく
      if (this.dataset.copy === 'true') copy(ta, 'コピーしました。貼り付けてください');
    });

    show('fb');
  }

  function copy(ta, msg) {
    // 新しいやり方 → 古いやり方 → 手で、の順に落とす
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ta.value).then(
        function () { toast(msg); },
        function () { legacy(ta, msg); }
      );
      return;
    }
    legacy(ta, msg);
  }

  function legacy(ta, msg) {
    ta.focus();
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    toast(ok ? msg : '選びました。長押し／Ctrl+C でコピーしてください');
  }

  var toastTimer = null;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2200);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------------------------------------------------------------
  // 索引（指でもキーボードでも開ける入口）
  // ---------------------------------------------------------------
  if (indexList) {
    // 種類ごとにまとめる。小さい丸も全部載せる（ここが指以外の入口なので）
    Object.keys(CATS).forEach(function (cid) {
      var group = NODES.filter(function (n) { return n.cat === cid; });
      if (!group.length) return;

      var head = document.createElement('li');
      head.className = 'index__head';
      head.textContent = CATS[cid].label;
      indexList.appendChild(head);

      group.forEach(function (n) {
        var li = document.createElement('li');
        var b = document.createElement('button');
        b.type = 'button';
        b.innerHTML = '<i style="--dot:' + esc(COLOR[n.cat]) + '"></i>';
        b.appendChild(document.createTextNode(n.label));
        b.addEventListener('click', function () {
          select(n);
          canvas.scrollIntoView({ behavior: still.matches ? 'auto' : 'smooth', block: 'center' });
        });
        li.appendChild(b);
        indexList.appendChild(li);
      });
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      seed();
      if (still.matches) settle(260); else wake();
    });
  }

  // ---------------------------------------------------------------
  // 出発
  // ---------------------------------------------------------------
  seed();
  renderPanel(null);
  resize();
  if (still.matches) settle(260);

  if (window.ResizeObserver) {
    new ResizeObserver(resize).observe(canvas.parentNode);
  } else {
    window.addEventListener('resize', resize);
  }
})();
