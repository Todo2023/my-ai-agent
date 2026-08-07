/* 区画をスクロールに合わせて出す。動きを減らす設定の人には何もしない。 */
(function () {
  var blocks = document.querySelectorAll('.core, .region');
  var still = window.matchMedia('(prefers-reduced-motion: reduce)');

  // 動きを切っている場合と、IntersectionObserver がない場合は、そのまま出す
  if (still.matches || !('IntersectionObserver' in window)) {
    blocks.forEach(function (el) { el.classList.add('is-in'); });
    return;
  }

  var seen = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      seen.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

  blocks.forEach(function (el) { seen.observe(el); });
})();
