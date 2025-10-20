(function () {
  // 年份与更新时间
  var now = new Date();
  var y = document.getElementById('year');
  var lu = document.getElementById('lastUpdated');
  if (y) y.textContent = now.getFullYear();
  if (lu) lu.textContent = now.toLocaleString();

  // 移动端：文字菜单开关（切 body.nav-open）
  var menuToggle = document.getElementById('menuToggle');
  if (menuToggle) {
    menuToggle.addEventListener('click', function (e) {
      e.preventDefault(); // 阻止跳转 #menu
      var open = document.body.classList.toggle('nav-open');
      menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // 假访问计数器（localStorage）
  try {
    var key = 'abc_osint_hits_v2';
    var count = parseInt(localStorage.getItem(key) || '0', 10) + 1;
    localStorage.setItem(key, String(count));
    var txt = '[' + String(count).padStart(6, '0') + ']';
    var el = document.getElementById('hitCounter');
    if (el) el.textContent = txt;
  } catch (e) {
    /* 隐身/禁 JS 存储时静默忽略 */
  }
})();
