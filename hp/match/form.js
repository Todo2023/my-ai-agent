/*
  事前登録フォームの入力チェックと送信

  ../app.js（メニューの開け閉め）とは別に、このページだけで読む。
  ../app.js は #contact-form がないページでは何もしないので、二重には動かない。

  やっていることは4つ。
    1. 入力チェック（必須／メール形式／自由記述の短すぎ）
    2. 下書きの自動保存（この端末の中だけ。送信できたら消す）
    3. 送信内容を profiles テーブルの形に組み立てる
    4. 送信（送信先が未設定のあいだは、送らずに内容を表示するだけ）
*/

(function () {
  "use strict";

  /* ══════════════════════════════════════════
     送信先の設定（タスク2でここを埋める）

     2つとも空のあいだは、送信ボタンを押しても
     「まだ送信しません」と出て、組み立てた内容を表示するだけ。

     Supabase のプロジェクトを作ったら、
     プロジェクト設定の URL と anon キーをここに入れる。
     anon キーはブラウザに出るので、必ず profiles テーブルの
     RLS を「挿入だけ許可・読み取りは不可」にしておくこと。
     （テーブルとポリシーの作り方は README.md に書いてある）
     ══════════════════════════════════════════ */
  var SUPABASE_URL = "";       // 例）https://xxxxxxxx.supabase.co
  var SUPABASE_ANON_KEY = "";  // 例）eyJhbGciOi...

  var TABLE = "profiles";
  var DRAFT_KEY = "todo-match-draft-v1";

  /* ── 入力項目の一覧 ──
     name = Supabase の profiles テーブルのカラム名。
     項目を足すときは、index.html の入力欄とここの両方に足す。

       required : 未入力ならエラー
       min      : 自由記述の最低文字数（短すぎるとマッチングが効かないため）
       kind     : text / email / checks（複数選択）/ check（単独）/ radio
  */
  var FIELDS = [
    { name: "name",                label: "お名前",             required: true },
    { name: "organization",        label: "所属機関・会社名",     required: true },
    { name: "title",               label: "役職・肩書き",         required: true },
    { name: "industry",            label: "業種・専門分野",       required: true },
    { name: "org_size",            label: "組織の規模" },
    { name: "email",               label: "連絡先メール",         required: true, kind: "email" },
    { name: "region",              label: "活動拠点",            required: true },

    { name: "background",          label: "経歴・専門分野",       required: true, min: 20 },
    { name: "current_work",        label: "現在取り組んでいること", required: true, min: 20 },
    { name: "strengths",           label: "得意なこと・提供価値",  required: true, min: 20 },

    { name: "target_profile",      label: "会いたい業種・職種",    required: true, min: 15 },
    { name: "purpose_tags",        label: "会う目的",            required: true, kind: "checks" },
    { name: "purpose_other",       label: "目的の補足" },

    { name: "pain_points",         label: "経営課題・関心テーマ" },
    { name: "near_term_goals",     label: "直近で解決したいこと" },
    { name: "offerable_resources", label: "提供できる知見・リソース" },

    { name: "ai_consent",          label: "AIによる代理プロフィールの生成", required: true, kind: "check" },
    { name: "ai_consent_note",     label: "同意についての補足" },
    { name: "visibility",          label: "相手方への公開範囲",    required: true, kind: "radio" },
    { name: "visibility_note",     label: "公開範囲の補足" }
  ];

  var form = document.getElementById("profile-form");
  var result = document.getElementById("form-result");
  var submitBtn = document.getElementById("submit-btn");
  if (!form || !result) return;

  /* ────────────────────────────────
     値の読み書き
     ──────────────────────────────── */

  function readValue(f) {
    if (f.kind === "checks") {
      var picked = [];
      form.querySelectorAll('input[name="' + f.name + '"]:checked').forEach(function (el) {
        picked.push(el.value);
      });
      return picked;
    }
    if (f.kind === "check") {
      var box = form.querySelector('input[name="' + f.name + '"]');
      return !!(box && box.checked);
    }
    if (f.kind === "radio") {
      var hit = form.querySelector('input[name="' + f.name + '"]:checked');
      return hit ? hit.value : "";
    }
    var el = form.elements[f.name];
    return el ? el.value.trim() : "";
  }

  function writeValue(f, value) {
    if (f.kind === "checks") {
      if (!Array.isArray(value)) return;
      form.querySelectorAll('input[name="' + f.name + '"]').forEach(function (el) {
        el.checked = value.indexOf(el.value) !== -1;
      });
      return;
    }
    if (f.kind === "check") return; // 同意は毎回チェックし直してもらう（下書きから戻さない）
    if (f.kind === "radio") {
      form.querySelectorAll('input[name="' + f.name + '"]').forEach(function (el) {
        el.checked = el.value === value;
      });
      return;
    }
    var el = form.elements[f.name];
    if (el && typeof value === "string") el.value = value;
  }

  /* 入力欄（またはチェックボックスのまとまり）を包んでいる .field を返す */
  function fieldBox(f) {
    var el = document.getElementById("g-" + f.name) || document.getElementById("f-" + f.name);
    return el ? el.closest(".field") : null;
  }

  /* ────────────────────────────────
     入力チェック
     ──────────────────────────────── */

  function checkOne(f) {
    var v = readValue(f);

    if (f.required) {
      var empty =
        f.kind === "check" ? v !== true :
        f.kind === "checks" ? v.length === 0 :
        v === "";
      if (empty) {
        if (f.kind === "check") return "「" + f.label + "」への同意にチェックを入れてください。";
        if (f.kind === "checks" || f.kind === "radio") return "「" + f.label + "」を選んでください。";
        return "「" + f.label + "」を入力してください。";
      }
    }
    if (f.kind === "email" && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      return "メールアドレスの形式をご確認ください。";
    }
    if (f.min && v && v.length < f.min) {
      return "「" + f.label + "」は" + f.min + "文字以上でお願いします。ここが短いと、お相手のご提案ができません。";
    }
    return "";
  }

  function showError(f, message) {
    var box = fieldBox(f);
    var slot = document.getElementById("e-" + f.name);
    if (box) box.classList.toggle("bad", !!message);
    if (!slot) return;
    slot.textContent = message;
    slot.hidden = !message;

    var input = document.getElementById("f-" + f.name);
    if (input) {
      if (message) {
        input.setAttribute("aria-invalid", "true");
        input.setAttribute("aria-describedby", "e-" + f.name);
      } else {
        input.removeAttribute("aria-invalid");
        input.removeAttribute("aria-describedby");
      }
    }
  }

  function validateAll() {
    var firstBad = null;
    FIELDS.forEach(function (f) {
      var message = checkOne(f);
      showError(f, message);
      if (message && !firstBad) firstBad = f;
    });
    return firstBad;
  }

  /* 一度エラーを出した項目は、直したその場で消す */
  form.addEventListener("input", onTouch);
  form.addEventListener("change", onTouch);

  function onTouch(e) {
    var target = e.target;
    if (!target || !target.name) return;
    var f = FIELDS.filter(function (x) { return x.name === target.name; })[0];
    if (f) {
      var box = fieldBox(f);
      if (box && box.classList.contains("bad")) showError(f, checkOne(f));
    }
    saveDraft();
  }

  /* ────────────────────────────────
     下書き（この端末の中だけ）
     ──────────────────────────────── */

  var saveTimer = null;

  function saveDraft() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      var draft = {};
      FIELDS.forEach(function (f) {
        if (f.kind === "check") return;
        draft[f.name] = readValue(f);
      });
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch (err) { /* 容量超過などは無視 */ }
    }, 400);
  }

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (err) { /* 無視 */ }
  }

  function restoreDraft() {
    var raw = null;
    try { raw = localStorage.getItem(DRAFT_KEY); } catch (err) { return; }
    if (!raw) return;

    var draft;
    try { draft = JSON.parse(raw); } catch (err) { clearDraft(); return; }
    if (!draft || typeof draft !== "object") return;

    var restored = false;
    FIELDS.forEach(function (f) {
      var v = draft[f.name];
      if (v === undefined || v === "" || (Array.isArray(v) && !v.length)) return;
      writeValue(f, v);
      restored = true;
    });

    var bar = document.getElementById("draft-bar");
    if (restored && bar) bar.hidden = false;
  }

  var clearBtn = document.getElementById("draft-clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      clearDraft();
      form.reset();
      FIELDS.forEach(function (f) { showError(f, ""); });
      var bar = document.getElementById("draft-bar");
      if (bar) bar.hidden = true;
      result.classList.remove("show", "ok", "ng");
    });
  }

  restoreDraft();

  /* ────────────────────────────────
     送信
     ──────────────────────────────── */

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    var firstBad = validateAll();
    if (firstBad) {
      var box = fieldBox(firstBad);
      if (box) {
        box.scrollIntoView({ behavior: "smooth", block: "center" });
        var input = box.querySelector("input, textarea, select");
        if (input) input.focus({ preventScroll: true });
      }
      show("ng", "入力を確認してください", "赤くなっている項目があります。上から順にご確認ください。");
      return;
    }

    // profiles テーブルに入れる形に組み立てる（キー = カラム名）
    var payload = {};
    FIELDS.forEach(function (f) { payload[f.name] = readValue(f); });

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      show(
        "ok",
        "この内容で受け付けます（まだ送信していません）",
        "保存先（Supabase）の接続はこれからです。いまは、送る内容の確認まで行えます。\n" +
        "form.js の SUPABASE_URL と SUPABASE_ANON_KEY を入れると、実際に登録されるようになります。",
        payload
      );
      return;
    }

    setSending(true);

    fetch(SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/" + TABLE, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": "Bearer " + SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        if (!res.ok) return res.text().then(function (t) { throw new Error(t || ("HTTP " + res.status)); });
        clearDraft();
        form.reset();
        var bar = document.getElementById("draft-bar");
        if (bar) bar.hidden = true;
        show(
          "ok",
          "ご登録ありがとうございました",
          "内容を受け付けました。相性の良いお相手が見つかりましたら、ご記入のメールアドレスにご連絡します。\n" +
          "しばらく経ってもご連絡がない場合は、まだお相手が見つかっていないだけですので、そのままお待ちください。"
        );
      })
      .catch(function (err) {
        show(
          "ng",
          "送信できませんでした",
          "通信に失敗しました。電波の良い場所で、もう一度お試しください。\n" +
          "何度も失敗する場合は、お手数ですがそのままご連絡ください（入力内容はこの端末に残しています）。\n\n" +
          "詳細：" + err.message
        );
      })
      .then(function () { setSending(false); });
  });

  function setSending(on) {
    if (!submitBtn) return;
    submitBtn.disabled = on;
    submitBtn.textContent = on ? "送信しています…" : "この内容で登録する";
  }

  /* 見出し＋本文＋（あれば）送信内容のプレビュー */
  function show(kind, heading, body, payload) {
    result.textContent = "";
    result.classList.remove("ok", "ng");
    result.classList.add("show", kind);

    var h = document.createElement("b");
    h.className = "big";
    h.textContent = heading;
    result.appendChild(h);
    result.appendChild(document.createTextNode(body));

    if (payload) {
      var pre = document.createElement("pre");
      pre.textContent = JSON.stringify(payload, null, 2);
      result.appendChild(pre);
    }
    result.scrollIntoView({ behavior: "smooth", block: "center" });
  }
})();
