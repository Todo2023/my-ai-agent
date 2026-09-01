/* 簡易パスワードゲート（公開前の限定共有用）
   ※ 静的サイトのためクライアント側判定です。ページのHTMLは
   ブラウザの開発者ツールから読めます。機密情報は載せないでください。 */
(function () {
  /* 鍵は2つある。どちらを使うかは、読み込む側の script タグで指定する。
     指定が無ければLP用（既定）。ファイルを2つに分けないのは、
     直す場所を1か所に保つため。 */
  var GATES = {
    site:   { hash: '642905494fc12dfadc1787f908d2783cced3b48a9c62261a432db88ce297ec32',
              key: 'todo-site-gate',
              lead: '公開前のプレビューです。ご案内したパスワードを入力してください。' },
    lesson: { hash: '28a9541e7c11809449fa1accc220bd07c1a46f0ef85c6039dffdb7242121c307',
              key: 'todo-lesson-gate',
              lead: '受講者向けの資料です。お申し込み後にご案内したパスワードを入力してください。' }
  };
  var me = document.currentScript;
  var gateName = (me && me.getAttribute('data-gate')) || 'site';
  var conf = GATES[gateName] || GATES.site;
  var HASH = conf.hash;
  var KEY = conf.key;

  try { if (sessionStorage.getItem(KEY) === HASH) return; } catch (e) {}

  var style = document.createElement('style');
  style.textContent =
    'html.gated body>*:not(.gate){display:none!important;}' +
    'html.gated body{background:#faf9f5;}' +
    '.gate{position:fixed;inset:0;z-index:9999;display:flex!important;align-items:center;justify-content:center;padding:28px;background:#faf9f5;}' +
    '.gate-box{width:100%;max-width:380px;}' +
    '.gate-box .k{font-size:11px;letter-spacing:.22em;color:#ad3527;margin-bottom:14px;text-transform:uppercase;}' +
    '.gate-box h1{font-family:"Shippori Mincho",serif;font-weight:600;font-size:20px;margin:0 0 10px;color:#181816;}' +
    '.gate-box p{font-size:13px;color:#726d61;margin:0 0 22px;line-height:1.9;}' +
    '.gate-box form{display:flex;gap:10px;flex-wrap:wrap;}' +
    '.gate-box input{flex:1;min-width:180px;font:inherit;font-size:14px;padding:12px 14px;border:1px solid #cdc5ac;background:#fff;color:#181816;}' +
    '.gate-box input:focus{outline:2px solid #ad3527;outline-offset:2px;}' +
    '.gate-box button{font:inherit;font-size:14px;padding:12px 24px;border:1px solid transparent;background:#181816;color:#fff;cursor:pointer;}' +
    '.gate-box button:hover{background:#87291d;}' +
    '.gate-err{margin:14px 0 0;font-size:12.5px;color:#87291d;min-height:1.2em;}';
  document.head.appendChild(style);
  document.documentElement.classList.add('gated');

  function sha256(text) {
    var buf = new TextEncoder().encode(text);
    return crypto.subtle.digest('SHA-256', buf).then(function (d) {
      return Array.from(new Uint8Array(d)).map(function (b) {
        return b.toString(16).padStart(2, '0');
      }).join('');
    });
  }

  function mount() {
    var gate = document.createElement('div');
    gate.className = 'gate';
    gate.innerHTML =
      '<div class="gate-box">' +
      '<div class="k">Preview</div>' +
      '<h1>合同会社Todo — 思考力×AI講座</h1>' +
      '<p>' + conf.lead + '</p>' +
      '<form><input type="password" autocomplete="current-password" aria-label="パスワード" placeholder="パスワード" autofocus><button type="submit">表示する</button></form>' +
      '<p class="gate-err" role="status"></p>' +
      '</div>';
    document.body.appendChild(gate);

    var form = gate.querySelector('form');
    var input = gate.querySelector('input');
    var err = gate.querySelector('.gate-err');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      sha256(input.value).then(function (h) {
        if (h === HASH) {
          try { sessionStorage.setItem(KEY, HASH); } catch (e2) {}
          document.documentElement.classList.remove('gated');
          gate.remove();
        } else {
          err.textContent = 'パスワードが違います。';
          input.select();
        }
      });
    });
    input.focus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
