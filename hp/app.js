/*
  合同会社To do サイト 共通スクリプト

  やっていることは2つだけ。
  1. スマホのハンバーガーメニューの開け閉め
  2. お問い合わせフォームの送信

  どちらも、そのページに要素がなければ何もしない。
*/

(function () {
  "use strict";

  /* ────────────────────────────────────────
     送信先のメールアドレス

     空のあいだは、送信ボタンを押しても
     「デモ版のため送信しません」と表示されるだけ。

     ここにアドレスを入れると、メールアプリが開く形になる。
     （このファイル1か所を直せば、全ページに効く）
     ──────────────────────────────────────── */
  var CONTACT_EMAIL = "";

  /* ── メニュー ── */
  var btn = document.getElementById("menu-btn");
  var drawer = document.getElementById("drawer");

  if (btn && drawer) {
    btn.addEventListener("click", function () {
      var open = drawer.classList.toggle("open");
      btn.setAttribute("aria-expanded", String(open));
      btn.setAttribute("aria-label", open ? "メニューを閉じる" : "メニューを開く");
    });
    drawer.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        drawer.classList.remove("open");
        btn.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ── お問い合わせフォーム ── */
  var form = document.getElementById("contact-form");
  var result = document.getElementById("form-result");
  if (!form || !result) return;

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var f = form.elements;

    var missing = [];
    if (!f.company.value.trim()) missing.push("御社名");
    if (!f.name.value.trim()) missing.push("ご担当者名");
    if (!f.email.value.trim()) missing.push("メールアドレス");
    if (missing.length) {
      show("入力されていない項目があります：" + missing.join("、"));
      return;
    }

    // どの事業ページから送られたか分かるようにしておく
    var about = f.about ? f.about.value : (form.dataset.about || "お問い合わせ");

    var lines = [
      "ご用件：" + about,
      "御社名：" + f.company.value.trim(),
      "ご担当者名：" + f.name.value.trim(),
      "メールアドレス：" + f.email.value.trim(),
      "サイトURL：" + (f.url && f.url.value.trim() ? f.url.value.trim() : "（未記入）"),
      "",
      "ご相談内容：",
      f.body.value.trim() || "（未記入）"
    ].join("\n");

    if (CONTACT_EMAIL) {
      location.href = "mailto:" + CONTACT_EMAIL +
        "?subject=" + encodeURIComponent("【" + about + "】お問い合わせ") +
        "&body=" + encodeURIComponent(lines);
      show("メールアプリが開きます。そのまま送信してください。");
    } else {
      show("これはデモ版のため、送信は行いません。実際の運用では、この内容がメールで届きます。\n\n" + lines);
    }
  });

  function show(msg) {
    result.textContent = msg;
    result.classList.add("show");
    result.scrollIntoView({ behavior: "smooth", block: "center" });
  }
})();
