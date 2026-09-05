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

  /* 合鍵の欄に「見る」ボタンを足す。
     打ち間違えても気づけないのが、いちばん時間を溶かす。
     4つの運営用画面が同じ形の欄を持っているので、ここで一度に付ける。

     ■ 既定は隠したまま
       押したときだけ出す。画面を人に見せている最中の事故を防ぐ。
     ■ 離れたら隠す
       出したまま放置されると、肩越しに読まれる。欄から離れたら戻す。 */
  function eyeUp(input) {
    if (!input || input.dataset.eye) return;
    input.dataset.eye = "1";

    var wrap = document.createElement("span");
    wrap.className = "keyeye-wrap";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "keyeye";
    btn.setAttribute("aria-label", "合鍵を表示する");
    btn.setAttribute("aria-pressed", "false");
    btn.innerHTML = eyeSvg(false);
    wrap.appendChild(btn);

    function set(show) {
      input.type = show ? "text" : "password";
      btn.setAttribute("aria-pressed", show ? "true" : "false");
      btn.setAttribute("aria-label", show ? "合鍵を隠す" : "合鍵を表示する");
      btn.innerHTML = eyeSvg(show);
    }
    /* 押した瞬間に欄からフォーカスが外れると、下の blur が即座に隠してしまう。
       mousedown を止めて、フォーカスを欄に残したままにする */
    btn.addEventListener("mousedown", function (e) { e.preventDefault(); });
    btn.addEventListener("click", function () {
      set(input.type === "password");
      input.focus();
    });
    input.addEventListener("blur", function () { set(false); });
  }

  /* 目の形。開いているか、斜線が入っているか */
  function eyeSvg(open) {
    var eye = '<path d="M1 8s2.6-4.5 7-4.5S15 8 15 8s-2.6 4.5-7 4.5S1 8 1 8z" '
      + 'fill="none" stroke="currentColor" stroke-width="1.3"></path>'
      + '<circle cx="8" cy="8" r="1.9" fill="none" stroke="currentColor" stroke-width="1.3"></circle>';
    var slash = open ? "" : '<path d="M2.5 13.5 13.5 2.5" fill="none" stroke="currentColor" '
      + 'stroke-width="1.3" stroke-linecap="round"></path>';
    return '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" '
      + 'focusable="false">' + eye + slash + "</svg>";
  }

  /* 画面が組み上がったら、合鍵の欄に自動で付ける。
     あとから差し込まれる欄にも効くよう、読み込み後にもう一度見る */
  function eyeAll() {
    var list = document.querySelectorAll('input[type="password"]');
    for (var i = 0; i < list.length; i++) eyeUp(list[i]);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", eyeAll);
  } else {
    eyeAll();
  }

  window.Course = {
    eyeUp: eyeUp, eyeAll: eyeAll,
    api: api, code: code, setCode: setCode,
    slideUrl: slideUrl, askCode: askCode,
    esc: function (s) {
      return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
      });
    },
  };
})();
