/* 連絡先に追加する。スマホの電話帳にそのまま入る形（vCard）で渡す。 */
(function () {
  'use strict';

  var VCARD = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'N:竹田;彩香;;;',
    'FN:竹田 彩香',
    // 電話帳はふりがなで並ぶので、読みも渡しておく
    'X-PHONETIC-LAST-NAME:タケダ',
    'X-PHONETIC-FIRST-NAME:アヤカ',
    'ORG:合同会社To do',
    'TEL;TYPE=CELL,VOICE:+81-70-9136-4879',
    'EMAIL;TYPE=INTERNET:todo.inc.2023.10.13@gmail.com',
    'ADR;TYPE=WORK:;;北海道札幌市厚別区厚別南1-4-3 Asterope厚別南101;札幌市;北海道;004-0022;日本',
    'URL:https://www.facebook.com/profile.php?id=61553259485518',
    'NOTE:営業・販促資料の作成／ロゴ・名刺などのデザイン／秘書・バックオフィス代行／AI活用・業務自動化の支援',
    'END:VCARD'
  ].join('\r\n') + '\r\n';

  var NAME = 'todo-takeda.vcf';
  var btn = document.getElementById('vcard');
  var toastEl = document.getElementById('toast');
  if (!btn) return;

  var timer = null;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(timer);
    timer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2600);
  }

  btn.addEventListener('click', function () {
    // Artifact の中では、ページから始めた保存は止められる。
    // 用意されている保存の口があれば、そちらを使う
    var d = window.claude && window.claude.downloads;
    if (d && d.save) {
      d.save({ filename: NAME, data: VCARD }).then(
        function () { toast('連絡先を保存しました'); },
        function () { toast('保存できませんでした'); }
      );
      return;
    }

    var blob = new Blob([VCARD], { type: 'text/vcard;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = NAME;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('連絡先ファイルを開きました');
  });
})();
