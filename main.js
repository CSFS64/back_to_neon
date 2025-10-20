(function () {
  // 年份与更新时间
  var now = new Date();
  var y = document.getElementById('year');
  var lu = document.getElementById('lastUpdated');
  if (y) y.textContent = now.getFullYear();
  if (lu) lu.textContent = now.toLocaleString();

  // 键盘帮助（?）与高对比度（H）
  var helpVisible = false, helpBox = null;
  function showHelp() {
    if (helpVisible) return;
    helpVisible = true;
    helpBox = document.createElement('div');
    helpBox.setAttribute('role', 'dialog');
    helpBox.setAttribute('aria-label', 'Keyboard Help');
    helpBox.innerHTML =
      '<b>键盘帮助</b><br>' +
      'Tab：在链接之间移动<br>' +
      'Shift+Tab：向后移动<br>' +
      'Enter：访问链接<br>' +
      'H：切换高对比度模式<br>' +
      '?：打开/关闭此帮助';
    Object.assign(helpBox.style, {
      position: 'fixed', right: '12px', bottom: '12px',
      border: '1px solid #000', background: '#fff',
      padding: '8px 10px', maxWidth: '320px',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Lucida Console", "DejaVu Sans Mono", "Courier New", monospace',
      fontSize: '14px', zIndex: 99999
    });
    document.body.appendChild(helpBox);
  }
  function hideHelp() {
    if (!helpVisible) return;
    helpVisible = false;
    if (helpBox && helpBox.parentNode) helpBox.parentNode.removeChild(helpBox);
    helpBox = null;
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === '?' || (e.shiftKey && e.key === '/')) {
      helpVisible ? hideHelp() : showHelp();
      e.preventDefault();
    }
    if (e.key === 'h' || e.key === 'H') {
      document.body.classList.toggle('contrast-high');
      e.preventDefault();
    }
  });

  // 链接聚焦时高亮所在段落（帮助识别“文字里藏链接”）
  (function addFocusHighlighting(){
    var links = document.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      links[i].addEventListener('focus', function () {
        var p = this.closest('p, li, div');
        if (p) {
          p.dataset._origBg = p.style.backgroundColor || '';
          p.style.backgroundColor = '#ffffcc';
        }
      });
      links[i].addEventListener('blur', function () {
        var p = this.closest('p, li, div');
        if (p) {
          p.style.backgroundColor = p.dataset._origBg || '';
          delete p.dataset._origBg;
        }
      });
    }
  })();

  // 移动端：文字菜单开关
  var menuToggle = document.getElementById('menuToggle');
  if (menuToggle) {
    menuToggle.addEventListener('click', function (e) {
      var open = document.body.classList.toggle('nav-open');
      menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      e.preventDefault();
    });
  }

  // 假访问计数器（localStorage）
  try {
    var key = 'abc_osint_hits_v1';
    var count = parseInt(localStorage.getItem(key) || '0', 10) + 1;
    localStorage.setItem(key, String(count));
    var txt = '[' + String(count).padStart(6, '0') + ']';
    var el = document.getElementById('hitCounter');
    if (el) el.textContent = txt;
  } catch (e) {
    /* 隐身/禁 JS 存储时静默忽略 */
  }
})();
