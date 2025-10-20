(function(){
  // 年份与更新时间
  const now = new Date();
  const y = document.getElementById('year');
  const lu = document.getElementById('lastUpdated');
  if (y) y.textContent = now.getFullYear();
  if (lu) lu.textContent = now.toLocaleString();

  // 假访问计数器
  try {
    const key = 'abc_osint_hits_v2';
    const count = parseInt(localStorage.getItem(key) || '0', 10) + 1;
    localStorage.setItem(key, String(count));
    const el = document.getElementById('hitCounter');
    if (el) el.textContent = '[' + String(count).padStart(6, '0') + ']';
  } catch(e){}
})();
