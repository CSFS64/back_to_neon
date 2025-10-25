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

// ===== Kalyna Updates Loader (all/最新切换, clean titles, excerpt, cover, paging) =====
(function () {
  const PAGE_SIZE = 12; // 默认每页 12 条，更适合滚动
  const qs = new URLSearchParams(location.search);
  const wantAll = qs.get('all') === '1'; // ?all=1 使用全量
  const DATA_URL_LATEST = () => 'data/updates.json?ts=' + Date.now();
  const DATA_URL_ALL    = () => 'data/updates-all.json?ts=' + Date.now();

  // DOM
  const elList   = document.getElementById('updatesList');
  const elMore   = document.getElementById('updatesLoadMore');
  const selPlat  = document.getElementById('filterPlatform');
  const inpTag   = document.getElementById('filterTag');
  const btnApply = document.getElementById('filterApply');
  const btnReset = document.getElementById('filterReset');
  const chkAll   = document.getElementById('filterAll'); // 可选：页面上勾选“全量”
  const elCount  = document.getElementById('updatesCounter'); // 可选：显示计数

  if (!elList) return;

  // 状态
  let allUpdates = [];
  let filtered = [];
  let page = 1;
  let usingAll = wantAll || (chkAll && chkAll.checked);

  // 事件
  btnApply && btnApply.addEventListener('click', applyFilter);
  btnReset && btnReset.addEventListener('click', () => {
    if (selPlat) selPlat.value = '';
    if (inpTag)  inpTag.value = '';
    if (chkAll)  chkAll.checked = false;
    usingAll = wantAll; // 也还原回 URL 指定
    page = 1;
    loadData();
  });
  elMore && elMore.addEventListener('click', () => { page++; render(); });
  chkAll && chkAll.addEventListener('change', () => {
    usingAll = !!chkAll.checked;
    page = 1;
    loadData();
    // 同步地址栏但不跳转
    try {
      const u = new URL(location.href);
      if (usingAll) u.searchParams.set('all', '1'); else u.searchParams.delete('all');
      history.replaceState(null, '', u.toString());
    } catch {}
  });

  // 初始载入
  loadData();

  /* ---------------- core ---------------- */
  function dataURL() {
    return usingAll ? DATA_URL_ALL() : DATA_URL_LATEST();
  }

  function loadData() {
    elList.innerHTML = `<div class="loading">载入中…</div>`;
    fetch(dataURL(), { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(json => {
        if (!Array.isArray(json)) throw new Error('数据不是数组');
        // 统一清洗并排序（后端已处理，这里再兜底一次）
        allUpdates = json.slice().map(normalizeItem)
          .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.title||'').localeCompare(a.title||''));
        buildPlatformOptions(allUpdates);
        page = 1;
        applyFilter();
      })
      .catch(err => {
        elList.innerHTML = `<div class="warning-box"><b>加载失败：</b>${esc(err.message || err)}</div>`;
        if (elMore) elMore.hidden = true;
      });
  }

  function applyFilter() {
    const plat = (selPlat && selPlat.value || '').trim();
    const qRaw = (inpTag && inpTag.value || '').trim().toLowerCase();
    const terms = qRaw ? qRaw.split(/\s+/).filter(Boolean) : [];

    filtered = allUpdates.filter(it => {
      if (plat && String(it.platform) !== plat) return false;
      if (!terms.length) return true;
      const hay = [
        it.title || '',
        it.excerpt || '',
        ...(Array.isArray(it.tags) ? it.tags : [])
      ].join(' ').toLowerCase();
      // 所有词都命中
      return terms.every(w => hay.includes(w));
    });

    // 重新分页&渲染
    page = 1;
    render();
  }

  function render() {
    const end = PAGE_SIZE * page;
    const slice = filtered.slice(0, end);

    // 为空时提示
    if (slice.length === 0) {
      elList.innerHTML = `<div class="warning-box"><b>无结果：</b>请清空筛选后再试。</div>`;
      if (elMore) elMore.hidden = true;
      if (elCount) elCount.textContent = `0 / ${filtered.length}`;
      return;
    }

    // 计算“上一篇/下一篇”：基于当前 filtered 的顺序
    for (let i = 0; i < filtered.length; i++) {
      const it = filtered[i];
      it.__prevId = i > 0 ? filtered[i - 1].id : '';
      it.__nextId = i < filtered.length - 1 ? filtered[i + 1].id : '';
    }
    const byId = new Map(filtered.map(x => [x.id, x]));

    elList.innerHTML = slice.map(it => cardHTML(it, byId)).join('');
    if (elMore) elMore.hidden = filtered.length <= end;
    if (elCount) elCount.textContent = `${Math.min(end, filtered.length)} / ${filtered.length}`;
  }

  /* ---------------- utils ---------------- */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function decodeEntities(s){ const ta = document.createElement('textarea'); ta.innerHTML = String(s ?? ''); return ta.value; }
  function stripTags(s){ return String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g,' ').trim(); }
  function clampText(s, n){ s = String(s ?? ''); return s.length > n ? s.slice(0, n-1) + '…' : s; }

  // 标准化一条记录（防御空字段）
  function normalizeItem(it) {
    const title = safeTitle(it);
    const excerpt = safeExcerpt(it);
    const date = (it.date || '').slice(0,10);
    const platform = it.platform || '';
    const url = it.url || '';
    const image = it.image || '';

    return {
      ...it,
      id: String(it.id || url || title || Math.random().toString(36).slice(2)),
      title, excerpt, date, platform, url, image,
      tags: Array.isArray(it.tags) ? it.tags : []
    };
  }

  function safeTitle(it){
    const t = (it.title && String(it.title).trim()) || '';
    if (t) return clampText(t, 120);
    const body = stripTags(decodeEntities(it.excerpt || it.description || ''));
    return clampText(body, 60);
  }

  function safeExcerpt(it){
    const text = stripTags(decodeEntities(it.excerpt || it.description || ''));
    return clampText(text, 240);
  }

  function coverURL(it){
    return it.image ? String(it.image) : '';
  }

  // 动态填充平台下拉（首项为空=全部）
  function buildPlatformOptions(items) {
    if (!selPlat) return;
    const cur = selPlat.value;
    const set = new Set(items.map(x => x.platform).filter(Boolean));
    const opts = ['<option value="">全部平台</option>']
      .concat([...set].sort().map(p => `<option value="${esc(p)}">${esc(p)}</option>`));
    selPlat.innerHTML = opts.join('');
    // 保留用户原选择
    if ([...set].includes(cur)) selPlat.value = cur;
  }

  function cardHTML(it, byId){
    const title = it.title;
    const excerpt = it.excerpt;
    const cover = coverURL(it);

    const prev = it.__prevId && byId.get(it.__prevId);
    const next = it.__nextId && byId.get(it.__nextId);

    const prevLink = prev ? `<a href="#updates" data-jump="${esc(prev.id)}" class="inline-link">上一篇</a>` : '';
    const nextLink = next ? `<a href="#updates" data-jump="${esc(next.id)}" class="inline-link">下一篇</a>` : '';

    // 相关：基于同平台同天可做个简单推荐（可选）
    const related = [];
    if (it.date && it.platform) {
      const sameDay = filtered.filter(x => x.id !== it.id && x.platform === it.platform && x.date === it.date).slice(0, 3);
      for (const r of sameDay) related.push(r);
    }
    const relatedLinks = related.length ? related
      .map(r => `<a href="#updates" data-jump="${esc(r.id)}" class="inline-link">${esc(safeTitle(r))}</a>`)
      .join('、') : '';

    return `
      <article class="update-card" role="listitem" itemscope itemtype="https://schema.org/Article" id="${esc(it.id)}">
        ${cover ? `<img class="update-cover" loading="lazy" src="${esc(cover)}" alt="${esc(title)} 封面" />` : ''}
        <div class="update-body">
          <h3 class="update-title">
            ${it.url ? `<a class="inline-link" href="${esc(it.url)}" target="_blank" rel="noopener" itemprop="headline">${esc(title)}</a>`
                     : `<span itemprop="headline">${esc(title)}</span>`}
          </h3>
          <div class="update-meta">
            ${it.date ? `<span><b>DATE:</b> ${esc(it.date)}</span>` : ''}${it.date && it.platform ? ' • ' : ''}
            ${it.platform ? `<span><b>PLATFORM:</b> ${esc(it.platform)}</span>` : ''}
          </div>
          ${excerpt ? `<p class="update-excerpt" itemprop="description">${esc(excerpt)}</p>` : ''}
          <div class="update-links">
            ${it.url ? `<a class="inline-link" href="${esc(it.url)}" target="_blank" rel="noopener">阅读原文 ↗</a>` : ''}
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
