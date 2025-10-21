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
  (function consentAndCounter(){
  var CONSENT_KEY = 'kalyna_consent_v1'; // 'all' 或 'necessary'
  var COUNT_KEY   = 'kalyna_hits_v1';

  function hasConsentAll(){
    try { return localStorage.getItem(CONSENT_KEY) === 'all'; } catch(e){ return false; }
  }
  function setConsent(val){
    try { localStorage.setItem(CONSENT_KEY, val); } catch(e){}
  }

  function runOptionalFeatures(){
    // 本地访问计数器（仅在允许“可选功能”后运行）
    try {
      var c = parseInt(localStorage.getItem(COUNT_KEY) || '0', 10) + 1;
      localStorage.setItem(COUNT_KEY, String(c));
      var txt = '[' + String(c).padStart(6, '0') + ']';
      var el = document.getElementById('hitCounter');
      if (el) el.textContent = txt;
    } catch(e){}
  }

  function showBanner(){
    var b = document.getElementById('consentBanner');
    if(!b) return;
    b.hidden = false;
    var allow = document.getElementById('consentAllow');
    var deny  = document.getElementById('consentDeny');
    if(allow) allow.addEventListener('click', function(){
      setConsent('all');
      runOptionalFeatures();
      b.remove();
    });
    if(deny) deny.addEventListener('click', function(){
      setConsent('necessary');
      b.remove();
    });
  }

  // 首次访问：无选择则弹出；已有选择则按选择执行
  try {
    var choice = localStorage.getItem(CONSENT_KEY);
    if (choice === 'all'){
      runOptionalFeatures();
    } else if (choice === 'necessary'){
      /* 不运行可选功能 */
    } else {
      showBanner();
    }
  } catch(e){
    // localStorage 不可用时，既不弹窗也不计数，静默退化
  }
})();
