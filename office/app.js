/*
  中身（配属・依頼・画面の出し入れ）── MTGルームとカンファレンスルームで共通

  部屋を歩く画面は room.js が持っている。こちらはデータと、重ねて出す画面。
  room.js からは OFFICE.〜 だけを呼ぶ形にしてあるので、
  部屋の見た目を作り直しても、こちらは触らなくてよい。

  どちらの部屋も、同じ「迎えた担当（seats）」と「依頼（jobs）」を見ている。
  カンファレンスルームで迎えると、MTGルームにその担当が立つ。

  通信はしない。配属と依頼は、この端末の中（localStorage）にだけ残る。
  ※ 本番では、依頼はこちらのメールに届き、状態はこちらが進める。
     いまはデモなので、状態を進めるボタンを画面に出してある。
*/

var OFFICE = (function () {
  "use strict";

  var SEATS_KEY = "office.v1.seats";
  var JOBS_KEY = "office.v1.jobs";
  var SEAT_N = 3;
  var STATES = ["受付", "準備中", "納品済み"];

  var seats = load(SEATS_KEY) || ["shodan", null, null];
  var jobs = load(JOBS_KEY) || [];
  var changed = [];      // 席の中身が変わったときに呼ぶもの
  var talkEnd = [];      // 会話が終わったときに呼ぶもの

  var sheet = document.getElementById("sheet");
  var panel = document.getElementById("panel");
  var box = document.getElementById("msgbox");
  var msg = document.getElementById("msgtext");
  var msgBtns = document.getElementById("msgbtns");
  var list = document.getElementById("desks");

  /* ══════════════ 会話の窓（RPGの下に出るあれ） ══════════════ */
  function say(text, choices) {
    msg.textContent = text;
    msgBtns.innerHTML = "";
    (choices || []).forEach(function (ch, i) {
      var b = document.createElement("button");
      b.className = "btn btn-primary";
      b.textContent = ch.t;
      b.dataset.choice = i;
      msgBtns.appendChild(b);
    });
    var close = document.createElement("button");
    close.className = "btn btn-quiet";
    close.textContent = choices && choices.length ? "はなれる" : "とじる";
    close.dataset.choice = "x";
    msgBtns.appendChild(close);

    msgBtns.onclick = function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      var k = b.dataset.choice;
      hideMsg();
      if (k !== "x" && choices[+k]) choices[+k].f();
    };
    box.classList.add("open");
  }

  function hideMsg() {
    box.classList.remove("open");
    fire(talkEnd);
  }

  /* ══════════════ 重ねて出す画面 ══════════════ */
  function open(html) {
    panel.innerHTML = html;
    sheet.classList.add("open");
    panel.scrollTop = 0;
  }
  function close() {
    sheet.classList.remove("open");
    fire(talkEnd);
  }

  function showProfile(s, where) {
    var seated = seats.indexOf(s.id) >= 0;
    open(
      '<h2>' + esc(s.mark + " " + s.name) + '</h2>' +
      '<p class="sub">' + esc(s.field) + '</p>' +
      (s.state === "準備中"
        ? '<p class="soon-note">この担当は準備中です。まだお迎えできません。</p>' : '') +
      (s.career ? '<h3>これまで</h3><p class="career">' + esc(s.career) + '</p>' : '') +
      (s.can.length ? '<h3>できること</h3><ul>' + s.can.map(li).join("") + '</ul>' : '') +
      (s.cannot.length ? '<h3>できないこと</h3><ul class="no">' + s.cannot.map(li).join("") + '</ul>' : '') +
      '<div class="price"><span>月額</span>' + esc(s.price) + '</div>' +
      '<div class="btn-row">' +
        (seated
          ? '<button class="btn btn-ghost" data-fire="' + s.id + '">MTGルームから外す</button>'
          : s.state === "準備中"
            ? '<button class="btn btn-ghost" disabled>準備中です</button>'
            : '<button class="btn btn-primary" data-hire="' + s.id + '">MTGルームに迎える</button>') +
        '<button class="btn btn-quiet" data-close>閉じる</button>' +
      '</div>'
    );
  }

  /* カンファレンスルームから、MTGルームの空いている席へ迎える */
  function hire(id) {
    var s = staffById(id);
    if (seats.indexOf(id) >= 0) { say(s.name + "は、すでにMTGルームにいます。"); return; }
    var i = seats.indexOf(null);
    if (i < 0) {
      say("MTGルームの席が埋まっています。\n入れ替えるには、いまいる担当を先に外してください。", [
        { t: "MTGルームへ行く", f: function () { location.href = "index.html"; } }
      ]);
      return;
    }
    seats[i] = id;
    update();
    say(s.name + "が、MTGルームに来てくれることになった。", [
      { t: "MTGルームへ行く", f: function () { location.href = "index.html"; } }
    ]);
  }

  function showAsk(seat) {
    var s = staffById(seats[seat]);
    open(
      '<h2>' + esc(s.name) + 'に仕事を頼む</h2>' +
      '<p class="sub">商談を1件ぶん教えてください。月曜までにいただいたぶんは、火曜にお届けします。</p>' +
      '<div class="field"><label for="a-company">相手企業名</label>' +
        '<input type="text" id="a-company" placeholder="例）株式会社○○製作所" /></div>' +
      '<div class="field"><label for="a-date">商談日</label><input type="date" id="a-date" /></div>' +
      '<div class="field"><label for="a-who">お会いする方</label>' +
        '<input type="text" id="a-who" placeholder="例）代表取締役／事業開発部長" /></div>' +
      '<div class="field"><label for="a-goal">商談の目的</label><select id="a-goal">' +
        ["初回訪問（関係づくりと課題の把握）", "課題の深掘り", "提案・見積の提示", "クロージング", "既存顧客のフォロー"]
          .map(function (o) { return "<option>" + o + "</option>"; }).join("") +
      '</select></div>' +
      '<p class="msg" id="a-msg" role="status" aria-live="polite"></p>' +
      '<div class="btn-row">' +
        '<button class="btn btn-primary" data-send="' + seat + '">この内容で頼む</button>' +
        '<button class="btn btn-quiet" data-close>やめる</button>' +
      '</div>'
    );
  }

  /* ══════════════ 一覧（歩くのが難しいとき用） ══════════════ */
  function renderList() {
    if (!list) return;
    list.innerHTML = "";
    seats.forEach(function (id, i) {
      var s = id ? staffById(id) : null;
      var mine = jobs.filter(function (j) { return j.seat === i; });
      var openJobs = mine.filter(function (j) { return j.st < 2; });
      var st = !s ? ["idle", "空席"]
        : openJobs.length ? ["busy", "対応中（" + openJobs.length + "件）"]
        : mine.length ? ["done", "今週の分は納品済み"]
        : ["idle", "待機中。仕事を渡せます"];

      var el = document.createElement("div");
      el.className = "desk" + (s ? "" : " empty");
      el.innerHTML =
        '<div class="who">' +
          '<span class="chip big" style="background:' + (s ? s.color : "#c9d6e5") + '"></span>' +
          '<div class="t"><div class="nm">' + esc(s ? s.name : "空席") + '</div>' +
          '<span class="ttl">' + esc(s ? s.title : "SEAT 0" + (i + 1)) + '</span>' +
          '<p class="fld">' + esc(s ? s.field : "この席に、担当を1人お迎えできます。") + '</p></div>' +
        '</div>' +
        '<div class="state ' + st[0] + '"><span class="dot"></span>' + st[1] + '</div>' +
        (mine.length ? '<ul class="jobs">' + mine.map(jobRow).join("") + '</ul>' : '') +
        '<div class="btn-row">' + (s
          ? '<button class="btn btn-primary" data-ask="' + i + '">仕事を頼む</button>' +
            '<button class="btn btn-ghost" data-who="' + s.id + '">この担当を見る</button>'
          : '<a class="btn btn-ghost" href="conference.html">カンファレンスルームで選ぶ</a>') +
        '</div>';
      list.appendChild(el);
    });
  }

  function jobRow(j) {
    return '<li><span class="badge s' + j.st + '">' + STATES[j.st] + '</span>' +
      '<span class="j"><b>' + esc(j.company) + '</b>' +
      '<span>' + esc(j.date || "商談日未定") + "／" + esc(j.who) + '</span></span>' +
      (j.st < 2 ? '<button class="next" data-next="' + j.id + '">進める</button>' : '') + '</li>';
  }

  /* ══════════════ 押されたもの ══════════════ */
  document.addEventListener("click", function (e) {
    var t = e.target.closest("button");
    if (!t) { if (e.target === sheet) close(); return; }
    var d = t.dataset;

    if (d.close !== undefined) return close();
    if (d.who) return showProfile(staffById(d.who));
    if (d.ask !== undefined) return showAsk(+d.ask);
    if (d.hire) { close(); hire(d.hire); return; }

    if (d.fire) {
      var at = seats.indexOf(d.fire);
      if (jobs.some(function (j) { return j.seat === at && j.st < 2; })
        && !window.confirm("この担当には、まだ終わっていない依頼があります。席から外しますか。")) return;
      seats[at] = null;
      jobs = jobs.filter(function (j) { return j.seat !== at; });
      close(); update(); return;
    }

    if (d.next) {
      jobs.forEach(function (j) { if (j.id === d.next && j.st < 2) j.st++; });
      update(); return;
    }

    if (d.send !== undefined) {
      var company = val("a-company"), who = val("a-who"), miss = [];
      if (!company) miss.push("相手企業名");
      if (!who) miss.push("お会いする方");
      if (miss.length) {
        document.getElementById("a-msg").textContent = "入力されていない項目があります：" + miss.join("、");
        return;
      }
      jobs.push({ id: "j" + Date.now(), seat: +d.send, company: company,
                  date: val("a-date"), who: who, goal: val("a-goal"), st: 0 });
      close(); update();
      say(company + "の件、承りました。\n翌営業日には、準備一式をお届けします。");
    }
  });

  /* ══════════════ こまごま ══════════════ */
  function update() {
    save(SEATS_KEY, seats); save(JOBS_KEY, jobs);
    var f = document.getElementById("filled"), n = document.getElementById("total");
    if (f) f.textContent = seats.filter(Boolean).length;
    if (n) n.textContent = SEAT_N;
    renderList();
    fire(changed);
  }
  function fire(arr) { arr.forEach(function (f) { f(); }); }
  function li(s) { return "<li>" + esc(s) + "</li>"; }
  function val(id) { var e = document.getElementById(id); return e ? e.value.trim() : ""; }
  function esc(s) {
    return String(s === undefined || s === null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function load(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }

  update();

  return {
    seats: function () { return seats; },
    say: say,
    hire: hire,
    showProfile: showProfile,
    showAsk: showAsk,
    onChange: function (f) { changed.push(f); },
    onTalkEnd: function (f) { talkEnd.push(f); }
  };
})();
