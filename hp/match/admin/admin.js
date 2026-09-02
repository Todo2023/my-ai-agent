/*
  マッチング管理画面

  Supabase へは素の fetch で話す（外部ライブラリを読み込まない決まりのため）。
  読めるデータは「ログインした管理者本人の権限」で決まる。
  service_role キーはここには存在しない。

  流れ
    ログイン（メールのリンク）
      → 登録者を見る
      → 「相手を探す」で Edge Function を呼ぶ（Claude API。押したときだけ）
      → 出てきた下書きを直して承認
      → 承認したものだけメールで送る
*/

(function () {
  "use strict";

  var CFG = window.TODO_MATCH_CONFIG || {};
  var URL_BASE = (CFG.SUPABASE_URL || "").replace(/\/+$/, "");
  var ANON = CFG.SUPABASE_ANON_KEY || "";
  var FN = CFG.GENERATE_FUNCTION || "generate-matches";
  var SESSION_KEY = "todo-match-admin-session";

  var $ = function (id) { return document.getElementById(id); };
  var session = null;

  /* ────────────────────────────────
     セッション
     ──────────────────────────────── */

  function loadSession() {
    // メールのリンクから戻ってきた直後は、URLの # にトークンが入っている
    if (location.hash.indexOf("access_token=") !== -1) {
      var h = new URLSearchParams(location.hash.slice(1));
      var s = {
        access_token: h.get("access_token"),
        refresh_token: h.get("refresh_token"),
        expires_at: Number(h.get("expires_at") || 0) * 1000
      };
      if (s.access_token) {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
        history.replaceState(null, "", location.pathname + location.search);
        return s;
      }
    }
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); }
    catch (e) { return null; }
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
    session = null;
  }

  function refresh() {
    if (!session || !session.refresh_token) return Promise.reject(new Error("再ログインが必要です"));
    return fetch(URL_BASE + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      headers: { apikey: ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    }).then(function (r) {
      if (!r.ok) throw new Error("再ログインが必要です");
      return r.json();
    }).then(function (d) {
      session = {
        access_token: d.access_token,
        refresh_token: d.refresh_token,
        expires_at: Date.now() + (d.expires_in || 3600) * 1000
      };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    });
  }

  /* ────────────────────────────────
     Supabase への問い合わせ
     ──────────────────────────────── */

  function api(path, opts, retried) {
    opts = opts || {};
    var headers = {
      apikey: ANON,
      Authorization: "Bearer " + (session ? session.access_token : ANON),
      "Content-Type": "application/json"
    };
    if (opts.headers) for (var k in opts.headers) headers[k] = opts.headers[k];

    return fetch(URL_BASE + path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      if (r.status === 401 && !retried) {
        return refresh().then(function () { return api(path, opts, true); });
      }
      return r.text().then(function (t) {
        var data = null;
        try { data = t ? JSON.parse(t) : null; } catch (e) { data = t; }
        if (!r.ok) {
          var msg = (data && (data.message || data.error || data.error_description)) || ("HTTP " + r.status);
          throw new Error(msg);
        }
        return data;
      });
    });
  }

  var rest = function (q) { return api("/rest/v1/" + q); };

  /* ────────────────────────────────
     画面の出し分け
     ──────────────────────────────── */

  function show(which) {
    ["setup", "login", "app"].forEach(function (id) { $(id).hidden = id !== which; });
    $("logout").hidden = which !== "app";
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function note(el, msg, kind) {
    el.textContent = msg;
    el.className = "note" + (kind ? " " + kind : "");
    el.hidden = !msg;
  }

  /* ────────────────────────────────
     ログイン
     ──────────────────────────────── */

  $("send-link").addEventListener("click", function () {
    var email = $("login-email").value.trim();
    var box = $("login-note");
    if (!email) return note(box, "メールアドレスを入れてください。", "ng");

    note(box, "送信しています…");
    fetch(URL_BASE + "/auth/v1/otp?redirect_to=" + encodeURIComponent(location.href.split("#")[0]), {
      method: "POST",
      headers: { apikey: ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, create_user: true })
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(t || "HTTP " + r.status); });
      note(box, "メールを送りました。届いたリンクを開くとログインできます。", "ok");
    }).catch(function (e) {
      note(box, "送れませんでした：" + e.message, "ng");
    });
  });

  $("logout").addEventListener("click", function () {
    clearSession();
    location.reload();
  });

  /* ────────────────────────────────
     今月の実費
     ──────────────────────────────── */

  function loadCost() {
    rest("monthly_cost?select=*&limit=1").then(function (rows) {
      var m = rows && rows[0];
      if (!m) {
        $("cost-num").textContent = "$0.00";
        $("cost-detail").textContent = "今月はまだ生成していません。";
        return;
      }
      $("cost-num").textContent = "$" + Number(m.est_cost_usd || 0).toFixed(2);
      $("cost-detail").textContent =
        m.runs + "回　入力 " + (m.input_tokens || 0).toLocaleString() +
        " / 出力 " + (m.output_tokens || 0).toLocaleString() + " トークン";
    }).catch(function (e) {
      $("cost-detail").textContent = "読み込めませんでした：" + e.message;
    });
  }

  /* ────────────────────────────────
     確認待ちのマッチ
     ──────────────────────────────── */

  var SELECT_MATCH =
    "matches?select=id,created_at,score,reason,message_draft,status,approved_message," +
    "sender:profiles!matches_from_profile_fkey(id,name,email,organization)," +
    "receiver:profiles!matches_to_profile_fkey(id,name,email,organization,title)" +
    "&status=in.(pending,approved)&order=created_at.desc";

  function loadMatches() {
    var box = $("matches");
    rest(SELECT_MATCH).then(function (rows) {
      if (!rows.length) {
        box.innerHTML = '<p class="note">確認待ちはありません。</p>';
        return;
      }
      box.innerHTML = "";
      rows.forEach(function (m) { box.appendChild(matchCard(m)); });
    }).catch(function (e) {
      box.innerHTML = '<p class="note ng">読み込めませんでした：' + esc(e.message) + "</p>";
    });
  }

  function matchCard(m) {
    var sender = m.sender || {}, receiver = m.receiver || {};
    var el = document.createElement("div");
    el.className = "card match" + (m.status === "approved" ? " approved" : "");
    el.innerHTML =
      '<div class="match-head">' +
        '<span class="pair">' + esc(sender.name) + " → " + esc(receiver.name) + "</span>" +
        '<span class="score">相性 ' + esc(m.score) + "</span>" +
        '<span class="badge ' + esc(m.status) + '">' +
          (m.status === "approved" ? "承認済み・未送信" : "確認待ち") + "</span>" +
      "</div>" +
      '<p class="org">' + esc(receiver.organization) + "　" + esc(receiver.title) + "</p>" +
      '<div class="field"><label>会う理由（AIの下書き）</label>' +
        '<textarea rows="4" data-f="reason">' + esc(m.reason) + "</textarea></div>" +
      '<div class="field"><label>初回メッセージ案</label>' +
        '<textarea rows="6" data-f="message">' + esc(m.approved_message || m.message_draft) + "</textarea></div>" +
      '<div class="row">' +
        '<button type="button" class="btn btn-ghost small" data-a="ask">本人に確認を依頼</button>' +
        '<button type="button" class="btn btn-ghost small" data-a="approve">この内容で承認</button>' +
        '<button type="button" class="btn btn-primary small" data-a="send"' +
          (m.status === "approved" ? "" : " disabled") + ">相手に送る</button>" +
        '<button type="button" class="btn btn-ghost small danger" data-a="reject">見送る</button>' +
      "</div>" +
      '<div class="note" data-role="msg" hidden></div>';

    var msgBox = el.querySelector('[data-role="msg"]');
    var textOf = function (f) { return el.querySelector('[data-f="' + f + '"]').value.trim(); };

    el.addEventListener("click", function (e) {
      var act = e.target.getAttribute && e.target.getAttribute("data-a");
      if (!act) return;

      if (act === "ask") {
        // 本人に、下書きのまま確認してもらう（送信は本人の承認後）
        var body =
          sender.name + " 様\n\n" +
          "お会いすると良さそうな方が見つかりましたので、ご確認をお願いします。\n\n" +
          "【お相手】" + receiver.organization + "　" + receiver.title + "\n\n" +
          "【会うと良さそうな理由】\n" + textOf("reason") + "\n\n" +
          "【最初にお送りするメッセージ案】\n" + textOf("message") + "\n\n" +
          "この文面のままで良いか、直したいところがあるかをお返事ください。\n" +
          "お返事をいただくまで、お相手には何もお送りしません。\n\n" +
          "合同会社To do";
        location.href = "mailto:" + encodeURIComponent(sender.email) +
          "?subject=" + encodeURIComponent("【ご確認】お会いすると良さそうな方のご提案") +
          "&body=" + encodeURIComponent(body);
        note(msgBox, "メールアプリが開きます。本人の返事を待ってから承認してください。");
        return;
      }

      if (act === "approve") {
        update(m.id, { status: "approved", approved_message: textOf("message"), decided_at: new Date().toISOString() },
          "承認しました。「相手に送る」が押せるようになります。");
        return;
      }

      if (act === "reject") {
        if (!confirm("この提案を見送りますか。")) return;
        update(m.id, { status: "rejected", decided_at: new Date().toISOString() }, "見送りました。");
        return;
      }

      if (act === "send") {
        if (m.status !== "approved") return;
        var mail =
          receiver.name + " 様\n\n" + textOf("message") + "\n\n" +
          "――\nこのご連絡は、ご登録いただいた内容をもとに、合同会社To do がお取り次ぎしています。";
        location.href = "mailto:" + encodeURIComponent(receiver.email) +
          "?subject=" + encodeURIComponent("お引き合わせのご連絡") +
          "&body=" + encodeURIComponent(mail);
        update(m.id, { status: "sent", sent_at: new Date().toISOString() },
          "送信済みにしました。メールアプリで実際に送信してください。");
      }
    });

    function update(id, patch, okMsg) {
      note(msgBox, "更新しています…");
      api("/rest/v1/matches?id=eq." + id, { method: "PATCH", body: patch })
        .then(function () { note(msgBox, okMsg, "ok"); setTimeout(loadMatches, 800); })
        .catch(function (e) { note(msgBox, "失敗しました：" + e.message, "ng"); });
    }

    return el;
  }

  /* ────────────────────────────────
     登録された人
     ──────────────────────────────── */

  function loadProfiles() {
    var box = $("profiles");
    rest("profiles?select=id,created_at,name,organization,title,industry,region,status&order=created_at.desc&limit=100")
      .then(function (rows) {
        if (!rows.length) {
          box.innerHTML = '<p class="note">まだ登録がありません。</p>';
          return;
        }
        box.innerHTML = "";
        rows.forEach(function (p) { box.appendChild(profileRow(p)); });
      }).catch(function (e) {
        box.innerHTML = '<p class="note ng">読み込めませんでした：' + esc(e.message) + "</p>";
      });
  }

  function profileRow(p) {
    var el = document.createElement("div");
    el.className = "card person";
    el.innerHTML =
      '<div class="person-head">' +
        "<b>" + esc(p.name) + "</b>" +
        '<span class="badge ' + esc(p.status) + '">' +
          ({ "new": "未確認", active: "有効", paused: "停止中", withdrawn: "取り下げ" }[p.status] || esc(p.status)) +
        "</span>" +
      "</div>" +
      '<p class="org">' + esc(p.organization) + "　" + esc(p.title) + "　/　" +
        esc(p.industry) + "　/　" + esc(p.region) + "</p>" +
      '<div class="row">' +
        (p.status === "new" ? '<button type="button" class="btn btn-ghost small" data-a="activate">確認した（有効にする）</button>' : "") +
        '<button type="button" class="btn btn-primary small" data-a="generate"' +
          (p.status === "active" ? "" : " disabled") + ">相手を探す</button>" +
      "</div>" +
      '<div class="note" data-role="msg" hidden></div>';

    var msgBox = el.querySelector('[data-role="msg"]');

    el.addEventListener("click", function (e) {
      var act = e.target.getAttribute && e.target.getAttribute("data-a");
      if (act === "activate") {
        note(msgBox, "更新しています…");
        api("/rest/v1/profiles?id=eq." + p.id, { method: "PATCH", body: { status: "active" } })
          .then(function () { loadProfiles(); })
          .catch(function (err) { note(msgBox, "失敗しました：" + err.message, "ng"); });
        return;
      }
      if (act !== "generate") return;

      // ① まず費用ゼロの確認（何人と照合するか）
      note(msgBox, "確認しています…");
      callFn({ from_profile: p.id, dry_run: true }).then(function (d) {
        if (!d.candidates) {
          note(msgBox, d.note || "照合できる相手がいません。");
          return;
        }
        // ② 概算を見せてから、人が判断する
        //    入力＝プロフィール1人ぶん約700トークン＋指示文1500、出力＝多くて2000とみて計算。
        //    単価は Opus 5（100万トークンあたり 入力$5 / 出力$25）。実費はログに残る。
        var inTok = d.candidates * 700 + 1500;
        var outTok = 2000;
        var est = (inTok / 1e6) * 5 + (outTok / 1e6) * 25;
        if (!confirm(
          d.candidates + "名と照合して、相手候補を最大3件つくります。\n\n" +
          "Claude API を呼ぶので費用が発生します。\n" +
          "概算：$" + est.toFixed(2) + "（約" + Math.ceil(est * 150) + "円）\n\n" +
          "実行しますか。"
        )) { note(msgBox, "やめました。費用は発生していません。"); return; }

        note(msgBox, "生成しています…（数十秒かかります）");
        return callFn({ from_profile: p.id }).then(function (r) {
          note(msgBox,
            r.matches_created + "件つくりました。" +
            "（実費 $" + Number(r.est_cost_usd || 0).toFixed(4) + " / 入力 " +
            r.usage.input_tokens + " ・ 出力 " + r.usage.output_tokens + " トークン）", "ok");
          loadMatches();
          loadCost();
        });
      }).catch(function (err) {
        note(msgBox, "失敗しました：" + err.message, "ng");
      });
    });

    return el;
  }

  function callFn(body) {
    return api("/functions/v1/" + FN, { method: "POST", body: body });
  }

  /* ────────────────────────────────
     起動
     ──────────────────────────────── */

  $("reload").addEventListener("click", function () { loadMatches(); loadProfiles(); loadCost(); });

  if (!URL_BASE || !ANON) {
    show("setup");
    return;
  }

  session = loadSession();
  if (!session || !session.access_token) {
    show("login");
    return;
  }

  // 管理者かどうかを先に確かめる（違えばログイン画面に戻す）
  api("/rest/v1/rpc/is_admin", { method: "POST", body: {} }).then(function (ok) {
    if (ok !== true) {
      clearSession();
      show("login");
      note($("login-note"), "このアドレスは管理者として登録されていません。", "ng");
      return;
    }
    show("app");
    loadCost();
    loadMatches();
    loadProfiles();
  }).catch(function () {
    clearSession();
    show("login");
    note($("login-note"), "ログインの期限が切れました。もう一度リンクを送ってください。");
  });
})();
