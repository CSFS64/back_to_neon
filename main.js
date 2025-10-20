// 动态更新时间与年份
(function(){
  const now = new Date();
  const y = document.getElementById("year");
  const lu = document.getElementById("lastUpdated");
  if (y) y.textContent = now.getFullYear();
  if (lu) lu.textContent = now.toLocaleString();
})();
