/* スクロールに合わせた控えめなフェードイン / 数字のカウントアップ(reduced-motionでは無効) */
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var els = document.querySelectorAll('.rv');
  if (reduce || !('IntersectionObserver' in window)) { els.forEach(function (e) { e.classList.add('in'); }); return; }
  function count(el) {
    var end = parseFloat(el.getAttribute('data-count')); if (isNaN(end)) return;
    var dec = (String(el.getAttribute('data-count')).split('.')[1] || '').length;
    var t0 = null, dur = 700, orig = el.textContent;
    function step(t) { if (!t0) t0 = t; var p = Math.min((t - t0) / dur, 1), v = end * (1 - Math.pow(1 - p, 3));
      el.textContent = p < 1 ? v.toLocaleString('ja-JP', { maximumFractionDigits: dec, minimumFractionDigits: dec }) : orig;
      if (p < 1) requestAnimationFrame(step); }
    requestAnimationFrame(step);
  }
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in');
      e.target.querySelectorAll('[data-count]').forEach(count); io.unobserve(e.target); } });
  }, { threshold: 0.12 });
  els.forEach(function (e) { io.observe(e); });
  window.addEventListener('beforeprint', function () { els.forEach(function (e) { e.classList.add('in'); }); });
})();
