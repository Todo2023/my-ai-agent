/* 受講者向けページの共通処理。
   本文もスライドもここには入っていません。サーバー（Worker）が
   「その人に開いている回だけ」を返します。開いていない回は、
   URLを直接打っても本文が返りません。 */
(function () {
  var API = "https://todo-demo-tool.todo-inc-2023-10-13.workers.dev";
  var KEY = "todo-code";

  function code() {
    try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; }
  }
  function setCode(v) {
    try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch (e) {}
  }

  function api(path, body) {
    return fetch(API + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ code: code() }, body || {})),
    }).then(function (r) {
      return r.json().then(function (d) { return { ok: r.ok, status: r.status, d: d }; });
    });
  }

  /* rev はスライドの版。差し替えると変わるので、受講者のブラウザが
     古い画像を持ち続けることがなくなる */
  function slideUrl(slug, page, rev) {
    return API + "/slide?code=" + encodeURIComponent(code())
      + "&slug=" + encodeURIComponent(slug) + "&p=" + page
      + (rev ? "&v=" + encodeURIComponent(rev) : "");
  }

  /* 合言葉を聞く画面。パスワードのゲートと違い、
     ここで入れたものは実際にサーバーの判定に使われます */
  function askCode(where, onDone) {
    where.innerHTML =
      '<div class="signin">'
      + '<div class="kicker">受講者の方へ</div>'
      + '<h1>合言葉を入れてください</h1>'
      + '<p class="aim">お申し込みのときにお渡しした合言葉です。'
      + '一度入れると、この端末では次から聞きません。</p>'
      + '<form class="signin-form"><input type="text" autocomplete="off" '
      + 'autocapitalize="characters" spellcheck="false" aria-label="合言葉" placeholder="合言葉">'
      + '<button type="submit" class="deck-btn asker-send">入る</button></form>'
      + '<p class="signin-err" role="status"></p>'
      + '</div>';
    var form = where.querySelector("form");
    var input = where.querySelector("input");
    var err = where.querySelector(".signin-err");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var v = input.value.trim().toUpperCase();
      if (!v) return;
      setCode(v);
      err.textContent = "確かめています…";
      api("/me").then(function (res) {
        if (!res.ok) {
          setCode("");
          err.textContent = res.d.error || "入れませんでした";
          input.select();
          return;
        }
        onDone(res.d);
      }).catch(function () { err.textContent = "通信できませんでした"; });
    });
    input.focus();
  }

  window.Course = {
    api: api, code: code, setCode: setCode,
    slideUrl: slideUrl, askCode: askCode,
    esc: function (s) {
      return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
      });
    },
  };
})();
