/* LINEの友だち追加ボタンを出す。
   **URLが入るまで、ボタンは出ません。**
   空のリンクを出すと、押した人が行き止まりに落ちるためです。

   アカウントを作ったら、下の1行に友だち追加のURLを入れてください。
   （LINE Official Account Manager →「友だち追加ガイド」→ URLをコピー）
   形は https://lin.ee/xxxxxxx です。

   ここを直すだけで、置いてある全部のボタンが一度に出ます。 */
var TODO_LINE_URL = '';

(function () {
  var boxes = document.querySelectorAll('[data-line]');
  for (var i = 0; i < boxes.length; i++) {
    if (!TODO_LINE_URL) continue;          // 未設定なら、そのまま隠しておく
    var a = boxes[i].querySelector('a');
    if (a) a.href = TODO_LINE_URL;
    boxes[i].hidden = false;
  }
})();
