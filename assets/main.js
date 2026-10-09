// 中華料理 大門 — 小さなスクリプト(なくてもサイトは読めます)
(function () {
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 今日の営業案内(目安。臨時休業はお知らせ欄・インスタで案内)
  var st = document.getElementById('status');
  if (st) {
    var jst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
    var wd = jst.getDay(), names = '日月火水木金土';
    var closed = (st.getAttribute('data-closed') || '').split(',').map(Number);
    st.textContent = closed.indexOf(wd) >= 0
      ? '今日(' + names[wd] + '曜日)は定休日です'
      : '今日(' + names[wd] + '曜日)は営業日です';
  }

  // ふわっと現れる
  var items = document.querySelectorAll('.reveal');
  if (items.length) {
    if (reduce || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('in'); });
    } else {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
      }, { rootMargin: '0px 0px -8% 0px' });
      items.forEach(function (el) { io.observe(el); });
    }
  }

  // メニューのカテゴリナビ: いま見ている場所を光らせる
  var nav = document.getElementById('catnav');
  if (nav && 'IntersectionObserver' in window) {
    var links = {};
    nav.querySelectorAll('a[data-cat]').forEach(function (a) { links[a.getAttribute('data-cat')] = a; });
    var set = function (id) {
      Object.keys(links).forEach(function (k) {
        links[k].classList.toggle('on', k === id);
        if (k === id) links[k].setAttribute('aria-current', 'true'); else links[k].removeAttribute('aria-current');
      });
      var a = links[id];
      if (a && a.parentNode.scrollTo) {
        var box = a.parentNode, left = a.offsetLeft - box.clientWidth / 2 + a.clientWidth / 2;
        box.scrollTo({ left: left, behavior: reduce ? 'auto' : 'smooth' });
      }
    };
    var obs = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) set(e.target.id); });
    }, { rootMargin: '-90px 0px -65% 0px' });
    Object.keys(links).forEach(function (k) { var h = document.getElementById(k); if (h) obs.observe(h); });
    set('lunch');
  }
})();
