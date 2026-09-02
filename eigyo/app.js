/*
  営業AIの作業台 ── 画面の動き

  やっていることは3つだけ。
  1. prompts.js に書かれた工程を、タブと入力欄にする
  2. 入力を端末の中（localStorage）に覚えておく
  3. 「プロンプトを作る」で文字列を組み立て、コピーできるようにする

  通信は一切しない。入力した内容がこの端末の外に出ることはない。
*/

(function () {
  "use strict";

  var STORE = "eigyo.v1.";      // 保存名の頭に付ける
  var LAST = "eigyo.v1.last";   // 最後に開いていた工程

  var tabs = document.getElementById("tabs");
  var lead = document.getElementById("lead");
  var form = document.getElementById("form");
  var out = document.getElementById("out");
  var outText = document.getElementById("out-text");
  var outName = document.getElementById("out-name");
  var copied = document.getElementById("copied");
  var current = null;

  /* ── タブを作る ── */
  PROMPTS.forEach(function (p, i) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = p.name;
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", "false");
    b.addEventListener("click", function () { open(i); });
    tabs.appendChild(b);
  });

  /* ── 工程をひらく ── */
  function open(i) {
    current = PROMPTS[i];
    save(LAST, String(i));

    Array.prototype.forEach.call(tabs.children, function (b, n) {
      b.setAttribute("aria-selected", String(n === i));
    });

    lead.textContent = current.lead;
    form.innerHTML = "";
    current.fields.forEach(function (f) { form.appendChild(fieldOf(f)); });

    out.classList.remove("show");
    copied.textContent = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ── 入力欄を1つ作る ── */
  function fieldOf(f) {
    var wrap = document.createElement("div");
    wrap.className = "field";

    var label = document.createElement("label");
    label.setAttribute("for", "f-" + f.k);
    label.textContent = f.label;
    if (f.req) {
      var req = document.createElement("span");
      req.className = "req";
      req.textContent = "必須";
      label.appendChild(req);
    }
    wrap.appendChild(label);

    var el;
    if (Array.isArray(f.type)) {
      el = document.createElement("select");
      f.type.forEach(function (opt) {
        var o = document.createElement("option");
        o.textContent = opt;
        el.appendChild(o);
      });
    } else if (f.type === "area") {
      el = document.createElement("textarea");
      if (f.ph) el.placeholder = f.ph;
    } else {
      el = document.createElement("input");
      el.type = f.type === "date" ? "date" : "text";
      if (f.ph) el.placeholder = f.ph;
    }
    el.id = "f-" + f.k;
    el.name = f.k;

    // 前に入れた値があればそれを、なければ def（最初から入れておく文字）を入れる。
    // ph（薄い文字の例）は値としては使わない。プロンプトに例文が紛れ込むため。
    var kept = load(STORE + current.id + "." + f.k);
    if (kept !== null) el.value = kept;
    else if (f.def) el.value = f.def;

    el.addEventListener("input", function () {
      save(STORE + current.id + "." + f.k, el.value);
      wrap.classList.remove("miss");
    });
    el.addEventListener("change", function () {
      save(STORE + current.id + "." + f.k, el.value);
    });

    wrap.appendChild(el);
    return wrap;
  }

  /* ── プロンプトを組み立てる ── */
  document.getElementById("make").addEventListener("click", function () {
    var v = {};
    var missing = [];

    current.fields.forEach(function (f) {
      var el = document.getElementById("f-" + f.k);
      var val = el.value.trim();
      v[f.k] = val;
      if (f.req && !val) {
        missing.push(f.label);
        el.parentNode.classList.add("miss");
      }
    });

    if (missing.length) {
      copied.textContent = "入力されていない項目があります：" + missing.join("、");
      out.classList.remove("show");
      document.querySelector(".field.miss").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    outText.value = current.build(v);
    outName.textContent = "（" + current.name + "／" + outText.value.length + "文字）";
    out.classList.add("show");
    copied.textContent = "";
    out.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  /* ── コピーする ── */
  document.getElementById("copy").addEventListener("click", function () {
    var text = outText.value;
    if (!text) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }

    function fallback() {
      outText.focus();
      outText.setSelectionRange(0, text.length);
      try {
        document.execCommand("copy") ? done() : ng();
      } catch (e) {
        ng();
      }
    }
    function done() { copied.textContent = "コピーしました。AIの入力欄に貼り付けてください。"; }
    function ng() { copied.textContent = "コピーできませんでした。下の文章を長押しして選択してください。"; }
  });

  /* ── 入力を消す ── */
  document.getElementById("clear").addEventListener("click", function () {
    if (!window.confirm("この工程の入力を消します。よろしいですか。")) return;
    current.fields.forEach(function (f) {
      remove(STORE + current.id + "." + f.k);
    });
    var i = PROMPTS.indexOf(current);
    open(i);
  });

  /* ── 保存まわり（使えない端末でも落ちないようにする） ── */
  function save(k, val) { try { localStorage.setItem(k, val); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function remove(k) { try { localStorage.removeItem(k); } catch (e) {} }

  /* ── 最初にひらく工程 ── */
  var last = parseInt(load(LAST), 10);
  open(last >= 0 && last < PROMPTS.length ? last : 0);
})();
