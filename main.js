(function () {
  var now = new Date();
  document.getElementById('year').textContent = now.getFullYear();
  document.getElementById('lastUpdated').textContent = now.toLocaleString();

  var helpVisible = false, helpBox = null;

  function showHelp() {
    if (helpVisible) return;
    helpVisible = true;
    helpBox = document.createElement('div');
    helpBox.innerHTML =
      '<b>键盘帮助</b><br>Tab：切换链接<br>Shift+Tab：返回<br>Enter：访问<br>H：高对比度模式<br>?：打开/关闭帮助';
    Object.assign(helpBox.style, {
      position: 'fixed', right: '12px', bottom: '12px',
      border: '1px solid #000', background: '#fff',
      padding: '8px 10px', fontFamily: '"Times New Roman", Times, serif',
      fontSize: '14px', zIndex: 99999, maxWidth: '300px'
    });
    document.body.appendChild(helpBox);
  }
  function hideHelp() {
    if (!helpVisible) return;
    helpVisible = false;
    helpBox.remove();
  }

  document.addEventListener('keydown', e => {
    if (e.key === '?' || (e.shiftKey && e.key === '/')) {
      helpVisible ? hideHelp() : showHelp();
      e.preventDefault();
    }
    if (e.key === 'h' || e.key === 'H') {
      document.body.classList.toggle('contrast-high');
      e.preventDefault();
    }
  });

  document.querySelectorAll('a').forEach(link => {
    link.addEventListener('focus', () => {
      const p = link.closest('p, li, div');
      if (p) { p.dataset.bg = p.style.backgroundColor; p.style.backgroundColor = '#ffffcc'; }
    });
    link.addEventListener('blur', () => {
      const p = link.closest('p, li, div');
      if (p) { p.style.backgroundColor = p.dataset.bg || ''; delete p.dataset.bg; }
    });
  });
})();
