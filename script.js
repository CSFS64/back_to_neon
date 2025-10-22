; (function () {
  var CONSENT_KEY = 'kalyna_consent_v1';
  var HIT_KEY = 'kalyna_hits_v1';
  var banner = document.getElementById('consentBanner');
  if (!banner) return;

  var choice = null;
  try { choice = localStorage.getItem(CONSENT_KEY); } catch (e) {}

  // —— 只在允许时更新访问计数
  function updateHitCounterIfAllowed() {
    if (choice !== 'allow') return;
    try {
      var count = parseInt(localStorage.getItem(HIT_KEY) || '0', 10) + 1;
      localStorage.setItem(HIT_KEY, String(count));
      var el = document.getElementById('hitCounter');
      if (el) el.textContent = '[' + String(count).padStart(6, '0') + ']';
    } catch (e) {}
  }

  // 初次访问：显示同意条；否则根据选择更新计数
  if (!choice) {
    banner.hidden = false;
  } else {
    updateHitCounterIfAllowed();
  }

  // 绑定按钮
  var allowBtn = document.getElementById('consentAllow');
  var denyBtn  = document.getElementById('consentDeny');

  if (allowBtn) allowBtn.addEventListener('click', function () {
    try { localStorage.setItem(CONSENT_KEY, 'allow'); } catch (e) {}
    choice = 'allow';
    updateHitCounterIfAllowed();
    banner.remove();
  });

  if (denyBtn) denyBtn.addEventListener('click', function () {
    try { localStorage.setItem(CONSENT_KEY, 'deny'); } catch (e) {}
    banner.remove();
  });
})();

; (function () {
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
})();

function copyTemplate(btn){
  var pre = btn.closest('.copy-card').querySelector('pre');
  var text = pre ? pre.innerText : '';
  if (!text) return;

  // 复制到剪贴板
  navigator.clipboard.writeText(text).then(function(){
    var old = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(function(){ btn.textContent = old; }, 1800);
  }).catch(function(){
    // 兜底：选中文本，让用户手动 Ctrl/Cmd+C
    var r = document.createRange();
    r.selectNodeContents(pre);
    var sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(r);
    alert('已选中内容，请按 Ctrl/Cmd + C 复制');
  });
}

