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

// ===== Kalyna Updates Loader =====
(function(){
  const DATA_URL = 'data/updates.json';     // JSON 路径
  const PAGE_SIZE = 9;                      // 每页卡片数
  let allUpdates = [];
  let filtered = [];
  let page = 1;

  const elList = document.getElementById('updatesList');
  const elMore = document.getElementById('updatesLoadMore');
  const selPlatform = document.getElementById('filterPlatform');
  const inpTag = document.getElementById('filterTag');
  const btnApply = document.getElementById('filterApply');
  const btnReset = document.getElementById('filterReset');

  if(!elList) return; // 当前页没有 Updates 区域

  fetch(DATA_URL, {cache:'no-store'})
    .then(r => r.json())
    .then(json => {
      // 1) 规整 + 按日期倒序
      allUpdates = (json || []).slice().sort((a,b) => (b.date || '').localeCompare(a.date || ''));
      // 2) 初始筛选（全部）
      applyFilter();
      // 3) 绑定事件
      btnApply?.addEventListener('click', () => { applyFilter(); });
      btnReset?.addEventListener('click', () => { selPlatform.value=''; inpTag.value=''; applyFilter(); });
      elMore?.addEventListener('click', () => { page++; render(); });
    })
    .catch(err => {
      console.error('Load updates.json failed:', err);
      elList.innerHTML = `<div class="warning-box"><b>提示：</b>暂时无法加载更新列表，请稍后再试。</div>`;
    });

  function applyFilter(){
    const plat = (selPlatform?.value || '').trim();
    const tag = (inpTag?.value || '').trim().toLowerCase();
    filtered = allUpdates.filter(it => {
      const okPlat = !plat || it.platform === plat;
      const okTag = !tag || (Array.isArray(it.tags) && it.tags.some(t => String(t).toLowerCase().includes(tag)));
      return okPlat && okTag;
    });
    page = 1;
    render();
  }

  function render(){
    const start = 0, end = PAGE_SIZE * page;
    const slice = filtered.slice(start, end);

    // 建立一个 id -> item 索引，方便 prev/next/related 拼接
    const byId = new Map(allUpdates.map(it => [it.id, it]));

    elList.innerHTML = slice.map(it => cardHTML(it, byId)).join('');
    // 控制 “加载更多”
    if(elMore){
      elMore.hidden = filtered.length <= end;
    }
  }

  function cardHTML(it, byId){
    const cover = it.image ? `<img class="update-cover" src="${esc(it.image)}" alt="${esc(it.title)} 封面">` : '';
    const meta = [
      it.date ? `<span><b>DATE:</b> ${esc(it.date)}</span>` : '',
      it.platform ? `<span><b>PLATFORM:</b> ${esc(it.platform)}</span>` : ''
    ].filter(Boolean).join('  •  ');

    // 上下篇与相关
    const prev = it.prev && byId.get(it.prev) ? byId.get(it.prev) : null;
    const next = it.next && byId.get(it.next) ? byId.get(it.next) : null;
    const related = Array.isArray(it.related) ? it.related.map(id => byId.get(id)).filter(Boolean) : [];

    const prevLink = prev ? `<a href="#updates" data-jump="${esc(prev.id)}" class="inline-link">上一篇</a>` : '';
    const nextLink = next ? `<a href="#updates" data-jump="${esc(next.id)}" class="inline-link">下一篇</a>` : '';
    const relatedLinks = related.length ? related.map(r => `<a href="#updates" data-jump="${esc(r.id)}" class="inline-link">${esc(r.title)}</a>`).join('、') : '';

    // 注意：标题指向原文；卡片内另给 “阅读原文” 按钮
    return `
      <article class="update-card" role="listitem" itemscope itemtype="https://schema.org/Article" id="${esc(it.id)}">
        ${cover}
        <div class="update-body">
          <h3 class="update-title">
            <a class="inline-link" href="${esc(it.url)}" target="_blank" rel="noopener" itemprop="headline">${esc(it.title)}</a>
          </h3>
          <div class="update-meta">${meta}</div>
          ${it.excerpt ? `<p class="update-excerpt" itemprop="description">${esc(it.excerpt)}</p>` : ''}

          <div class="update-links">
            <a class="inline-link" href="${esc(it.url)}" target="_blank" rel="noopener">阅读原文 ↗</a>
            ${prevLink} ${nextLink}
            ${relatedLinks ? `<span style="opacity:.6">| 相关：</span> ${relatedLinks}` : ''}
          </div>
        </div>
      </article>
    `;
  }

  // 简易转义
  function esc(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // 内部跳转（点击“上一篇/下一篇/相关”时滚到对应卡片）
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-jump]');
    if(!a) return;
    e.preventDefault();
    const id = a.getAttribute('data-jump');
    const target = document.getElementById(id);
    if(target){
      target.scrollIntoView({behavior:'smooth', block:'start'});
      target.classList.add('blink');
      setTimeout(() => target.classList.remove('blink'), 1200);
    }
  });
})();
