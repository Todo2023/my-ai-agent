/*
  執務室 ── 画面の動き

  やっていること。
  1. 席（3つ）に、誰が座っているかを描く
  2. 席をタップ → その担当者のプロフィール。空席なら候補から選んで配属
  3. 「仕事を頼む」→ 商談の予定を1件登録し、その席に積む
  4. 依頼の状態を「受付 → 準備中 → 納品済み」で表示する

  通信はしない。配属と依頼は、この端末の中（localStorage）にだけ残る。
  ※ 本番では、依頼はこちらのメールに届き、状態はこちらが進める。
     いまはデモなので、状態を進めるボタンを画面に出してある。
*/

(function () {
  "use strict";

  var SEATS_KEY = "office.v1.seats";
  var JOBS_KEY = "office.v1.jobs";
  var SEAT_N = 3;                       // 借りられる席の数
  var STATES = ["受付", "準備中", "納品済み"];

  var seats = load(SEATS_KEY) || ["shodan", null, null];
  var jobs = load(JOBS_KEY) || [];

  var desks = document.getElementById("desks");
  var sheet = document.getElementById("sheet");
  var panel = document.getElementById("panel");

  /* ────────── 似顔絵 ──────────
     画像を読み込まず、その場でSVGを組み立てる。
     色と記号だけが担当者ごとに変わる。 */
  function avatar(s, size) {
    var c = s ? s.color : "#c2ccd9";
    var id = "g" + (s ? s.id : "empty");
    return '' +
      '<svg width="' + size + '" height="' + size + '" viewBox="0 0 96 96" role="img" aria-label="' +
        esc(s ? s.name : "空席") + '">' +
        '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0" stop-color="' + c + '" stop-opacity=".18"/>' +
          '<stop offset="1" stop-color="' + c + '" stop-opacity=".05"/>' +
        '</linearGradient></defs>' +
        '<rect width="96" height="96" rx="20" fill="url(#' + id + ')"/>' +
        (s
          ? '<circle cx="48" cy="37" r="14.5" fill="' + c + '"/>' +
            '<path d="M17 88a31 31 0 0 1 62 0z" fill="' + c + '" opacity=".82"/>' +
            '<circle cx="76" cy="74" r="15" fill="#fff"/>' +
            '<text x="76" y="80" text-anchor="middle" font-size="17" font-weight="700" fill="' + c + '">' +
              esc(s.mark) + '</text>'
          : '<circle cx="48" cy="37" r="14.5" fill="none" stroke="#c9d6e5" stroke-width="2" stroke-dasharray="4 4"/>' +
            '<path d="M17 88a31 31 0 0 1 62 0z" fill="none" stroke="#c9d6e5" stroke-width="2" stroke-dasharray="4 4"/>') +
      '</svg>';
  }

  /* ────────── 席を描く ────────── */
  function render() {
    desks.innerHTML = "";
    seats.forEach(function (id, i) {
      desks.appendChild(id ? deskOf(staffById(id), i) : emptyDesk(i));
    });
    document.getElementById("filled").textContent = seats.filter(Boolean).length;
    document.getElementById("total").textContent = SEAT_N;
    save(SEATS_KEY, seats);
    save(JOBS_KEY, jobs);
  }

  function deskOf(s, i) {
    var mine = jobs.filter(function (j) { return j.seat === i; });
    var open = mine.filter(function (j) { return j.st < 2; });
    var st = open.length ? ["busy", "対応中（" + open.length + "件）"]
           : mine.length ? ["done", "今週の分は納品済み"]
           : ["idle", "待機中。仕事を渡せます"];

    var el = div("desk");
    el.innerHTML =
      '<div class="who">' + avatar(s, 66) +
        '<div class="t">' +
          '<div class="nm">' + esc(s.name) + '</div>' +
          '<span class="ttl">' + esc(s.title) + '</span>' +
          '<p class="fld">' + esc(s.field) + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="state ' + st[0] + '"><span class="dot"></span>' + st[1] + '</div>' +
      (mine.length ? '<ul class="jobs">' + mine.map(jobRow).join("") + '</ul>' : '') +
      '<div class="btn-row">' +
        '<button class="btn btn-primary" data-ask="' + i + '">仕事を頼む</button>' +
        '<button class="btn btn-ghost" data-who="' + s.id + '" data-seat="' + i + '">この担当を見る</button>' +
      '</div>';
    return el;
  }

  function jobRow(j) {
    return '<li>' +
      '<span class="badge s' + j.st + '">' + STATES[j.st] + '</span>' +
      '<span class="j"><b>' + esc(j.company) + '</b>' +
        '<span>' + esc(j.date || "商談日未定") + "／" + esc(j.who) + '</span></span>' +
      (j.st < 2 ? '<button class="next" data-next="' + j.id + '">進める</button>' : '') +
    '</li>';
  }

  function emptyDesk(i) {
    var el = div("desk empty");
    el.innerHTML =
      '<div class="who">' + avatar(null, 66) +
        '<div class="t">' +
          '<div class="nm">空席</div>' +
          '<span class="ttl">SEAT 0' + (i + 1) + '</span>' +
          '<p class="fld">この席に、担当を1人お迎えできます。</p>' +
        '</div>' +
      '</div>' +
      '<p class="empty-note">担当は月の途中でも入れ替えられます。合わなければ、別の担当に替えてください。</p>' +
      '<div class="btn-row"><button class="btn btn-ghost" data-hire="' + i + '">担当を選ぶ</button></div>';
    return el;
  }

  /* ────────── プロフィール ────────── */
  function showProfile(s, seat) {
    var seated = seats.indexOf(s.id) >= 0;
    open(
      '<div class="who" style="margin-bottom:16px">' + avatar(s, 76) +
        '<div class="t"><h2>' + esc(s.name) + '</h2>' +
        '<p class="sub" style="margin:4px 0 0">' + esc(s.field) + '</p></div>' +
      '</div>' +
      (s.career ? '<h3>これまで</h3><p class="career">' + esc(s.career) + '</p>' : '') +
      (s.can.length ? '<h3>できること</h3><ul>' + s.can.map(li).join("") + '</ul>' : '') +
      (s.cannot.length ? '<h3>できないこと</h3><ul class="no">' + s.cannot.map(li).join("") + '</ul>' : '') +
      '<div class="price"><span>月額</span>' + esc(s.price) + '</div>' +
      '<div class="btn-row">' +
        (seated
          ? '<button class="btn btn-ghost" data-fire="' + s.id + '">席から外す</button>'
          : s.state === "準備中"
            ? '<button class="btn btn-ghost" disabled>準備中です</button>'
            : '<button class="btn btn-primary" data-seat-in="' + s.id + '" data-at="' + seat + '">この席に来てもらう</button>') +
        '<button class="btn btn-quiet" data-close>閉じる</button>' +
      '</div>'
    );
  }

  /* ────────── 候補を選ぶ ────────── */
  function showPicks(seat) {
    var list = STAFF.filter(function (s) { return seats.indexOf(s.id) < 0; });
    open(
      '<h2>担当を選ぶ</h2>' +
      '<p class="sub">SEAT 0' + (seat + 1) + ' に来てもらう担当を選んでください。</p>' +
      '<div class="picks">' + list.map(function (s) {
        return '<button class="pick" data-who="' + s.id + '" data-seat="' + seat + '"' +
          (s.state === "準備中" ? " disabled" : "") + '>' +
          avatar(s, 46) +
          '<span class="t"><span class="nm">' + esc(s.name) +
            (s.state === "準備中" ? "（準備中）" : "") + '</span>' +
          '<span class="fld">' + esc(s.field) + '</span></span>' +
        '</button>';
      }).join("") + '</div>' +
      '<div class="btn-row"><button class="btn btn-quiet" data-close>閉じる</button></div>'
    );
  }

  /* ────────── 仕事を頼む ────────── */
  function showAsk(seat) {
    var s = staffById(seats[seat]);
    open(
      '<h2>' + esc(s.name) + 'に仕事を頼む</h2>' +
      '<p class="sub">商談を1件ぶん教えてください。月曜までにいただいたぶんは、火曜にお届けします。</p>' +
      '<div class="field"><label for="a-company">相手企業名<\/label>' +
        '<input type="text" id="a-company" placeholder="例）株式会社○○製作所" /><\/div>' +
      '<div class="field"><label for="a-date">商談日<\/label><input type="date" id="a-date" /><\/div>' +
      '<div class="field"><label for="a-who">お会いする方<\/label>' +
        '<input type="text" id="a-who" placeholder="例）代表取締役／事業開発部長" /><\/div>' +
      '<div class="field"><label for="a-goal">商談の目的<\/label><select id="a-goal">' +
        ["初回訪問（関係づくりと課題の把握）", "課題の深掘り", "提案・見積の提示", "クロージング", "既存顧客のフォロー"]
          .map(function (o) { return "<option>" + o + "<\/option>"; }).join("") +
      '<\/select><\/div>' +
      '<p class="msg" id="a-msg" role="status" aria-live="polite"><\/p>' +
      '<div class="btn-row">' +
        '<button class="btn btn-primary" data-send="' + seat + '">この内容で頼む<\/button>' +
        '<button class="btn btn-quiet" data-close>やめる<\/button>' +
      '</div>'
    );
  }

  /* ────────── 画面の開け閉め ────────── */
  function open(html) {
    panel.innerHTML = html;
    sheet.classList.add("open");
    panel.scrollTop = 0;
  }
  function close() { sheet.classList.remove("open"); }

  /* ────────── 押されたものを見て振り分ける ────────── */
  document.addEventListener("click", function (e) {
    var t = e.target.closest("button");
    if (!t) {
      if (e.target === sheet) close();
      return;
    }
    var d = t.dataset;

    if (d.close !== undefined) return close();
    if (d.hire !== undefined) return showPicks(+d.hire);
    if (d.who) return showProfile(staffById(d.who), +d.seat);
    if (d.ask !== undefined) return showAsk(+d.ask);

    if (d.seatIn) {
      seats[+d.at] = d.seatIn;
      close(); render();
      return;
    }
    if (d.fire) {
      var at = seats.indexOf(d.fire);
      if (jobs.some(function (j) { return j.seat === at && j.st < 2; })) {
        if (!window.confirm("この担当には、まだ終わっていない依頼があります。席から外しますか。")) return;
      }
      seats[at] = null;
      jobs = jobs.filter(function (j) { return j.seat !== at; });
      close(); render();
      return;
    }
    if (d.next) {
      jobs.forEach(function (j) { if (j.id === d.next && j.st < 2) j.st++; });
      render();
      return;
    }
    if (d.send !== undefined) {
      var company = val("a-company"), who = val("a-who");
      var miss = [];
      if (!company) miss.push("相手企業名");
      if (!who) miss.push("お会いする方");
      if (miss.length) {
        document.getElementById("a-msg").textContent = "入力されていない項目があります：" + miss.join("、");
        return;
      }
      jobs.push({
        id: "j" + Date.now(),
        seat: +d.send,
        company: company,
        date: val("a-date"),
        who: who,
        goal: val("a-goal"),
        st: 0
      });
      close(); render();
    }
  });

  /* ────────── こまごま ────────── */
  function div(cls) { var e = document.createElement("div"); e.className = cls; return e; }
  function li(s) { return "<li>" + esc(s) + "</li>"; }
  function val(id) { var e = document.getElementById(id); return e ? e.value.trim() : ""; }
  function esc(s) {
    return String(s === undefined || s === null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function load(k) {
    try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; }
  }

  render();
})();
