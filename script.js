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

// ===== Kalyna Updates Loader (clean titles, excerpt, cover, paging=3) =====
(function () {
  const DATA_URL = 'data/updates.json?ts=' + Date.now();
  const PAGE_SIZE = 3; // ← 默认显示 3 条

  const elList = document.getElementById('updatesList');
  const elMore = document.getElementById('updatesLoadMore');
  const selPlatform = document.getElementById('filterPlatform');
  const inpTag = document.getElementById('filterTag');
  const btnApply = document.getElementById('filterApply');
  const btnReset = document.getElementById('filterReset');

  if (!elList) return;

  let allUpdates = [];
  let filtered = [];
  let page = 1;

  fetch(DATA_URL, { cache: 'no-store' })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(json => {
      if (!Array.isArray(json)) throw new Error('updates.json 不是数组');
      allUpdates = json.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      applyFilter();
      btnApply && btnApply.addEventListener('click', applyFilter);
      btnReset && btnReset.addEventListener('click', () => { if (selPlatform) selPlatform.value = ''; if (inpTag) inpTag.value = ''; applyFilter(); });
      elMore && elMore.addEventListener('click', () => { page++; render(); });
    })
    .catch(err => {
      elList.innerHTML = `<div class="warning-box"><b>加载失败：</b>${String(err.message || err)}</div>`;
    });

  function applyFilter() {
    const plat = (selPlatform && selPlatform.value || '').trim();
    const q = (inpTag && inpTag.value || '').trim().toLowerCase();
  
    filtered = allUpdates.filter(it => {
      // 平台筛选（保持不变）
      if (plat && String(it.platform) !== plat) return false;
      // 关键词：搜 title / excerpt / tags
      if (!q) return true;
      const hay = [
        it.title || '',
        it.excerpt || '',
        ...(Array.isArray(it.tags) ? it.tags : [])
      ].join(' ').toLowerCase();
  
      // 支持多词：输入 "drone Avdiivka" 时，两个词都要命中
      return q.split(/\s+/).every(w => w && hay.includes(w));
    });
  
    page = 1;
    render();
  }

  function render() {
    const end = PAGE_SIZE * page;
    const slice = filtered.slice(0, end);
    const byId = new Map(allUpdates.map(it => [it.id, it]));

    if (slice.length === 0) {
      elList.innerHTML = `<div class="warning-box"><b>无结果：</b>请清空筛选后再试。</div>`;
      if (elMore) elMore.hidden = true;
      return;
    }

    elList.innerHTML = slice.map(it => cardHTML(it, byId)).join('');
    if (elMore) elMore.hidden = filtered.length <= end;
  }

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function decodeEntities(s){
    const ta = document.createElement('textarea'); ta.innerHTML = String(s ?? ''); return ta.value;
  }
  function stripTags(s){ return String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g,' ').trim(); }
  function clampText(s, n){ s = String(s ?? ''); return s.length > n ? s.slice(0, n-1) + '…' : s; }

  function safeTitle(it){
    const t = (it.title && String(it.title).trim()) || '';
    if (t) return t;
    const body = stripTags(decodeEntities(it.excerpt || it.description || ''));
    return clampText(body, 36);
  }

  function safeExcerpt(it){
    const text = stripTags(decodeEntities(it.excerpt || it.description || ''));
    return clampText(text, 220);
  }

  function coverURL(it){
    return it.image ? String(it.image) : '';
  }

  function cardHTML(it, byId){
    const title = safeTitle(it);
    const excerpt = safeExcerpt(it);
    const cover = coverURL(it);

    const prev = it.prev && byId.get(it.prev);
    const next = it.next && byId.get(it.next);
    const related = Array.isArray(it.related) ? it.related.map(id => byId.get(id)).filter(Boolean) : [];

    const prevLink = prev ? `<a href="#updates" data-jump="${esc(prev.id)}" class="inline-link">上一篇</a>` : '';
    const nextLink = next ? `<a href="#updates" data-jump="${esc(next.id)}" class="inline-link">下一篇</a>` : '';
    const relatedLinks = related.length ? related.map(r => `<a href="#updates" data-jump="${esc(r.id)}" class="inline-link">${esc(safeTitle(r))}</a>`).join('、') : '';

    return `
      <article class="update-card" role="listitem" itemscope itemtype="https://schema.org/Article" id="${esc(it.id)}">
        ${cover ? `<img class="update-cover" loading="lazy" src="${esc(cover)}" alt="${esc(title)} 封面">` : ''}
        <div class="update-body">
          <h3 class="update-title">
            <a class="inline-link" href="${esc(it.url)}" target="_blank" rel="noopener" itemprop="headline">${esc(title)}</a>
          </h3>
          <div class="update-meta">
            ${it.date ? `<span><b>DATE:</b> ${esc(it.date)}</span>` : ''} ${it.platform ? ` • <span><b>PLATFORM:</b> ${esc(it.platform)}</span>` : ''}
          </div>
          ${excerpt ? `<p class="update-excerpt" itemprop="description">${esc(excerpt)}</p>` : ''}
          <div class="update-links">
            <a class="inline-link" href="${esc(it.url)}" target="_blank" rel="noopener">阅读原文 ↗</a>
            ${prevLink} ${nextLink}
            ${relatedLinks ? `<span style="opacity:.6">| 相关：</span> ${relatedLinks}` : ''}
          </div>
        </div>
      </article>
    `;
  }

  // 内部跳转（上一篇/下一篇/相关）
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[data-jump]');
    if (!a) return;
    e.preventDefault();
    const id = a.getAttribute('data-jump');
    const target = document.getElementById(id);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      target.classList.add('blink');
      setTimeout(() => target.classList.remove('blink'), 1200);
    }
  });
})();
