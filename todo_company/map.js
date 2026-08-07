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

  // 会社のFacebookページ。いまのところ、ここが発信の場所
  var FB_URL = 'https://www.facebook.com/profile.php?id=61553259485518';

  // 丸の種類。色は CSS 変数から取る（凡例と必ず同じ色になる）
  var CATS = {
    center: { name: 'brain',   label: '真ん中' },
    biz:    { name: 'biz',     label: '事業' },
    think:  { name: 'think',   label: '考え方' },
    fact:   { name: 'fact',    label: '会社の形' },
    blank:  { name: 'blank',   label: 'まだ白い' },
    src:    { name: 'src',     label: '出どころ' }
  };

  // ---------------------------------------------------------------
  // 地図の中身
  // ---------------------------------------------------------------
  var NODES = [
    { id: 'brain', cat: 'center', r: 26, label: '合同会社To doの脳内',
      body: 'この会社の頭の中を、事業の一覧ではなく地図として並べたもの。丸をドラッグで動かせます。押すと、その丸の中身と、そこから作った投稿文が出ます。',
      src: '新サイトの文言確認用プレビュー' },

    /* 考え方 ---------------------------------------------------- */
    { id: 'core', cat: 'think', r: 19, label: '誰の担当でもない仕事',
      body: '会社の中で「誰の担当でもないまま溜まっていく仕事」を引き受けている。地図のいちばん真ん中にあるのはこれ。',
      src: '会社概要', post: true },
    { id: 'small-start', cat: 'think', r: 13, label: '小さく始められる',
      body: '月に数時間ぶんの依頼から受ける。まず1つ困っていることを預かって、合いそうなら範囲を広げる。',
      src: 'トップ「依頼しやすい理由」', post: true },
    { id: 'one-door', cat: 'think', r: 13, label: '窓口はひとつ',
      body: '資料もデザインも事務もAIも同じ窓口。複数の外注先に同じ背景を説明し直す手間を、相手に持たせない。',
      src: 'トップ「依頼しやすい理由」', post: true },
    { id: 'dogfood', cat: 'think', r: 14, label: '自分たちで使ってから勧める',
      body: '請求書の自動作成や議事録の共有は、まず自社の業務で仕組みを作った。使ってみて手応えのあったものだけを人に勧める。',
      src: 'トップ・会社概要', post: true },
    { id: 'small-strong', cat: 'think', r: 13, label: '大きくないことが強み',
      body: '規模が小さいぶん窓口が分かれない。取引先の事情を覚えたまま続けられることを、いちばんの価値だと考えている。',
      src: '会社概要', post: true },

    /* 事業 ------------------------------------------------------ */
    { id: 'doc', cat: 'biz', r: 18, label: '営業・販促資料の作成',
      body: '伝わらない資料を、意思決定が進む資料に作り直す。たたき台 → 打ち合わせ → 納品。「何を載せるか決まっていない」段階から入れる。',
      src: '事業内容', post: true },
    { id: 'doc1', cat: 'biz', r: 7, label: '構成案の設計から' },
    { id: 'doc2', cat: 'biz', r: 7, label: '既存資料の作り直し' },
    { id: 'doc3', cat: 'biz', r: 7, label: 'PowerPoint等で納品' },

    { id: 'design', cat: 'biz', r: 18, label: 'ロゴ・名刺などのデザイン',
      body: '会社の顔になるものを、一式そろえて整える。ロゴと名刺をセットで頼まれることが多く、トーンを揃えたまま他のツールへ広げられる。',
      src: '事業内容', post: true },
    { id: 'des1', cat: 'biz', r: 7, label: 'ロゴ・名刺・印刷物' },
    { id: 'des2', cat: 'biz', r: 7, label: '複数案の提示' },
    { id: 'des3', cat: 'biz', r: 7, label: '入稿データで納品' },

    { id: 'back', cat: 'biz', r: 18, label: '秘書・バックオフィス代行',
      body: '月額で、事務まわりを継続的に預かる。単発の外注ではなく、社内の一員として動くことを重んじている。',
      src: '事業内容', post: true },
    { id: 'bk1', cat: 'biz', r: 7, label: '日程調整・連絡代行' },
    { id: 'bk2', cat: 'biz', r: 7, label: '資料整理' },
    { id: 'bk3', cat: 'biz', r: 8, label: '請求書発行などの経理事務' },

    { id: 'ai', cat: 'biz', r: 18, label: 'AI活用・業務自動化の支援',
      body: '「AIで何ができるか」を、その会社の業務に当てはめて考える。ツールを入れて終わりにせず、実際の業務フローに載るところまで付き添う。',
      src: '事業内容', post: true },
    { id: 'ai1', cat: 'biz', r: 7, label: '生成AIの導入と使い方の整理' },
    { id: 'ai2', cat: 'biz', r: 7, label: '定型業務の自動化' },
    { id: 'ai3', cat: 'biz', r: 7, label: '人が見る線引きの設計' },

    /* 会社の形 -------------------------------------------------- */
    { id: 'shape', cat: 'fact', r: 14, label: '体の形',
      body: '地図の縮尺にあたるところ。会社概要から。', src: '会社概要' },
    { id: 'f1', cat: 'fact', r: 9, label: '創業 2023年10月' },
    { id: 'f2', cat: 'fact', r: 9, label: '札幌市厚別区' },
    { id: 'f3', cat: 'fact', r: 9, label: 'T4011603004093',
      body: '適格請求書発行事業者の登録番号。', src: '会社概要' },
    { id: 'f4', cat: 'fact', r: 9, label: '平日 9:00〜18:00' },
    { id: 'contact', cat: 'fact', r: 12, label: '連絡先',
      body: 'TEL 070-9136-4879 ／ todo.inc.2023.10.13@gmail.com。相談と見積りは無料で、2営業日以内に返信。打ち合わせはオンラインでも。',
      src: 'お問い合わせ', post: true },
    { id: 'fb', cat: 'fact', r: 12, label: 'Facebookページ',
      body: '会社のFacebookページ。いまのところ、発信の出口はここ。丸から作った投稿文をコピーして、ここに貼る。',
      link: FB_URL, linkLabel: 'Facebookページを開く' },
    { id: 'news', cat: 'fact', r: 10, label: 'サイトを新しくした',
      body: '2026年8月7日、ホームページをリニューアル。事業内容を4つに整理し、それぞれ何を引き受けられるのかを具体的に書いた。',
      src: 'お知らせ', post: true },

    /* まだ白いところ -------------------------------------------- */
    { id: 'blank', cat: 'blank', r: 15, label: 'まだ白いところ',
      body: 'ホームページには書かれていない部分。ここは請求書を読まないと埋まらない。請求書（発行したぶんの一覧でも可）が入れば、下の4つが数字で埋まり、地図の丸の大きさも実際の比率に描き直せる。' },
    { id: 'b1', cat: 'blank', r: 10, label: '取引先の顔ぶれ',
      body: 'どんな業種・規模の会社と、何社くらい続いているか。' },
    { id: 'b2', cat: 'blank', r: 10, label: '継続とスポットの割合',
      body: '月額の継続支援と、単発の制作。どちらが体重を支えているか。' },
    { id: 'b3', cat: 'blank', r: 10, label: '忙しくなる月',
      body: '請求の波。手が足りなくなる時期がいつ来るか。' },
    { id: 'b4', cat: 'blank', r: 10, label: '事業ごとの実際の大きさ',
      body: '売上で見たとき、この地図の4つの丸はどんな大きさになるか。' },

    /* 出どころ -------------------------------------------------- */
    { id: 's-top', cat: 'src', r: 8, label: 'トップ' },
    { id: 's-biz', cat: 'src', r: 8, label: '事業内容' },
    { id: 's-com', cat: 'src', r: 8, label: '会社概要' },
    { id: 's-news', cat: 'src', r: 7, label: 'お知らせ' },
    { id: 's-ct', cat: 'src', r: 7, label: 'お問い合わせ' }
  ];

  var LINKS = [
    ['brain', 'core'], ['brain', 'doc'], ['brain', 'design'], ['brain', 'back'],
    ['brain', 'ai'], ['brain', 'shape'], ['brain', 'blank'],

    ['core', 'small-start'], ['core', 'one-door'], ['core', 'dogfood'], ['core', 'small-strong'],

    ['doc', 'doc1'], ['doc', 'doc2'], ['doc', 'doc3'],
    ['design', 'des1'], ['design', 'des2'], ['design', 'des3'],
    ['back', 'bk1'], ['back', 'bk2'], ['back', 'bk3'],
    ['ai', 'ai1'], ['ai', 'ai2'], ['ai', 'ai3'],

    ['shape', 'f1'], ['shape', 'f2'], ['shape', 'f3'], ['shape', 'f4'],
    ['shape', 'contact'], ['shape', 'news'],
    ['brain', 'fb'], ['fb', 'contact'], ['fb', 'news'],

    ['blank', 'b1'], ['blank', 'b2'], ['blank', 'b3'], ['blank', 'b4'],

    /* 意味のつながり。請求書は、まだ白いところの入口でもある */
    ['bk3', 'blank'], ['bk3', 'f3'],
    ['dogfood', 'ai'], ['one-door', 'back'], ['small-start', 'doc'],

    /* 出どころ */
    ['s-top', 'small-start'], ['s-top', 'one-door'], ['s-top', 'dogfood'],
    ['s-biz', 'doc'], ['s-biz', 'design'], ['s-biz', 'back'], ['s-biz', 'ai'],
    ['s-com', 'core'], ['s-com', 'small-strong'], ['s-com', 'shape'],
    ['s-news', 'news'], ['s-ct', 'contact']
  ];

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
      if (n.id === 'brain') { n.x = 0; n.y = 0; }
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
    var pickable = NODES.filter(function (n) { return n.r >= 9; });
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

  function postText(n) {
    var body = n.body || n.label;
    return n.label + '｜合同会社To do\n\n' + body + '\n\n#合同会社Todo #札幌';
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
    if (n.src) html += '<p class="essence__src">出どころ：' + esc(n.src) + '</p>';

    if (n.post) {
      html += '<div class="post">'
        + '<h3>投稿文の下ごしらえ</h3>'
        + '<textarea id="post-text" aria-label="投稿文"></textarea>'
        + '<div class="post__row">'
        + '<a class="btn" id="go" href="' + esc(FB_URL) + '" target="_blank" rel="noopener noreferrer">'
        + 'コピーしてFacebookを開く</a>'
        + '<button type="button" class="btn btn--quiet" id="copy">コピーだけ</button>'
        + '<span class="post__count" id="count"></span>'
        + '</div>'
        + '<p class="post__note">コピーしたら、開いたFacebookページに貼り付けてください。'
        + '押すだけで発信されるようにするには投稿用のつなぎ込みが要るので、そこはまだ手で貼る形です。</p>'
        + '</div>';
    } else if (n.cat === 'blank') {
      html += '<div class="post"><p class="post__note">この丸はまだ中身が無いので、投稿文は作っていません。'
        + '請求書が入れば、ここも発信できる中身になります。</p></div>';
    }

    panel.innerHTML = html;

    var ta = document.getElementById('post-text');
    if (ta) {
      ta.value = postText(n);
      count(ta);
      ta.addEventListener('input', function () { count(ta); });

      document.getElementById('copy').addEventListener('click', function () {
        copy(ta, 'コピーしました');
      });
      // Facebook を開く前に、同じ指の動きの中でコピーまで済ませる
      document.getElementById('go').addEventListener('click', function () {
        copy(ta, 'コピーしました。Facebookに貼り付けてください');
      });
    }
  }

  function count(ta) {
    var el = document.getElementById('count');
    if (!el) return;
    var len = Array.from(ta.value).length;   // 絵文字も1文字で数える
    el.textContent = len + ' 文字';
    el.setAttribute('data-over', String(len > 140));
    el.title = len > 140
      ? 'Facebookはこの長さでも大丈夫。Xにも出すなら140文字まで'
      : 'Xにも出せる長さ（140文字まで）';
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
    NODES.forEach(function (n) {
      if (n.r < 9) return;
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
