(() => {
  // 读取配置（来自 <script> 标签 data- 属性）
  const curScript = document.currentScript;
  const KHB_BASE    = (curScript && curScript.dataset.base)    || location.origin + '/';
  const KHB_LATEST  = (curScript && curScript.dataset.latest)  || (KHB_BASE + 'data/latest.json');
  const KHB_UPDATES = (curScript && curScript.dataset.updates) || (KHB_BASE + '#updates');

  // 注入样式
  const css = `
  .khb{position:sticky;top:0;z-index:1000;font-family:var(--mono-stack,ui-monospace,monospace)}
  .khb__bar{display:flex;align-items:center;gap:.75rem;border-bottom:1px solid #000;background:#f9fbff;color:#111;padding:.45rem .75rem;box-shadow:0 1px 0 rgba(0,0,0,.12)}
  .khb__home{font-weight:900;text-decoration:none;color:#12325f}
  .khb__sep{opacity:.35}
  .khb__meta{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;font-size:.95rem}
  .khb__date{white-space:nowrap}
  .khb__title{max-width:48ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .khb__link{color:#005fa3;text-decoration:underline;text-underline-offset:2px;text-decoration-thickness:2px}
  .khb__new{display:inline-flex;align-items:center;font-weight:800;font-size:.7rem;padding:0 .4rem;border:1px solid #000;background:#fff87a;color:#000;margin-left:.25rem}
  @media (max-width:640px){.khb__title{max-width:26ch}}
  @media (prefers-reduced-motion:no-preference){.khb__new{animation:khbBlink 1.2s steps(2,jump-none) infinite}@keyframes khbBlink{50%{opacity:0}}}
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // 构建 DOM
  const wrap = document.createElement('div');
  wrap.className = 'khb';
  wrap.setAttribute('role','region');
  wrap.setAttribute('aria-label','Kalyna OSINT Hub');
  wrap.innerHTML = `
    <div class="khb__bar">
      <a class="khb__home" id="khbHome" href="${KHB_BASE}">Kalyna OSINT</a>
      <span class="khb__sep">·</span>
      <div class="khb__meta">
        <span class="khb__date">最新更新：<b id="khbDate">—</b></span>
        <span class="khb__title" id="khbTitle">（加载中…）</span>
        <a class="khb__link" id="khbView" href="${KHB_UPDATES}">查看分析 ↗</a>
        <span class="khb__new" id="khbNew" hidden>NEW</span>
      </div>
    </div>
    <noscript><div style="padding:.5rem .75rem;border-bottom:1px solid #000;">已禁用脚本：请访问主页查看最新分析。</div></noscript>
  `;
  // 插入到 <body> 最前
  (document.body ? document.body : document.documentElement).insertBefore(wrap, document.body?.firstChild || null);

  // 拉 latest.json（带时间戳防缓存）
  const elDate  = wrap.querySelector('#khbDate');
  const elTitle = wrap.querySelector('#khbTitle');
  const elView  = wrap.querySelector('#khbView');
  const elHome  = wrap.querySelector('#khbHome');
  const elNew   = wrap.querySelector('#khbNew');

  fetch(KHB_LATEST + '?ts=' + Date.now())
    .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP '+r.status)))
    .then(data => {
      const d = (data && data.date) ? String(data.date) : '';
      const t = (data && data.title) ? String(data.title) : '';
      const u = (data && data.url)   ? String(data.url)   : KHB_UPDATES;

      if (d && elDate)  elDate.textContent = d;
      if (t && elTitle) elTitle.textContent = t;
      if (elView) elView.href = u;

      try {
        const last = localStorage.getItem('khb:lastSeen') || '';
        if (d && (!last || d > last)) elNew.hidden = false;
        const markRead = () => { if (d) localStorage.setItem('khb:lastSeen', d); };
        elView && elView.addEventListener('click', markRead);
        elHome && elHome.addEventListener('click', markRead);
      } catch (e) {}
    })
    .catch(err => {
      if (elTitle) elTitle.textContent = '（无法获取最新信息）';
      console.error('[KHB] latest fetch failed:', err && err.message || err);
    });
})();
