/* Kalyna Hub Banner — read latest from data/updates.json
 * by CSFS64 — v1.0
 * 用法（工具页中）：
 * <script src="https://csfs64.github.io/back_to_neon/assets/hub-banner.js"
 *         data-base="https://csfs64.github.io/back_to_neon/"
 *         data-updates-link="https://csfs64.github.io/back_to_neon/#updates"
 *         defer></script>
 */
(() => {
  // ===== 读取 <script> data- 配置 =====
  const curScript = document.currentScript || (function () {
    const scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  // 主站根（必须以 / 结尾）；默认尝试从 script src 推断
  const guessBaseFromSrc = (src) => {
    try {
      const u = new URL(src, location.href);
      // 取到 /<repo>/ 前缀，例如 https://user.github.io/repo/assets/hub-banner.js → https://user.github.io/repo/
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        return `${u.origin}/${parts[0]}/${parts[1]}/`;
      }
      return `${u.origin}/`;
    } catch { return location.origin + '/'; }
  };

  const KHB_BASE = (curScript?.dataset?.base) || guessBaseFromSrc(curScript?.src || '');
  // updates.json 的地址（允许覆写）；默认用 {BASE}/data/updates.json
  const KHB_UPDATES_JSON = (curScript?.dataset?.updatesJson) || (KHB_BASE + 'data/updates.json');
  // “查看分析”跳转链接（允许覆写），默认 {BASE}#updates
  const KHB_UPDATES_LINK = (curScript?.dataset?.updatesLink) || (KHB_BASE + '#updates');

  // ===== 注入样式（作用域独立）=====
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

  // ===== 构建 DOM 并挂载到 <body> 顶部 =====
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
        <a class="khb__link" id="khbView" href="${KHB_UPDATES_LINK}">查看分析 ↗</a>
        <span class="khb__new" id="khbNew" hidden>NEW</span>
      </div>
    </div>
    <noscript><div style="padding:.5rem .75rem;border-bottom:1px solid #000;">已禁用脚本：请访问主页查看最新分析。</div></noscript>
  `;
  const inject = () => {
    const target = document.body || document.documentElement;
    target.insertBefore(wrap, target.firstChild || null);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else inject();

  // ===== 辅助函数 =====
  const byId = (sel) => wrap.querySelector(sel);
  const elDate  = byId('#khbDate');
  const elTitle = byId('#khbTitle');
  const elView  = byId('#khbView');
  const elHome  = byId('#khbHome');
  const elNew   = byId('#khbNew');

  const cleanText = (s='') => String(s).replace(/\s+/g,' ').trim();
  const pickTitle = (it) => cleanText(it?.title || '') || cleanText(it?.excerpt || '').slice(0, 36) || '（无标题）';
  const pickURL   = (it) => (it?.url && String(it.url)) || KHB_UPDATES_LINK;
  const pickDate  = (it) => String(it?.date || '');

  // 将数组按日期降序（YYYY-MM-DD 优先；否则字符串比较）
  const sortByDateDesc = (arr=[]) => {
    const copy = arr.slice();
    copy.sort((a,b) => (pickDate(b)).localeCompare(pickDate(a)));
    return copy;
  };

  // ===== 拉取 updates.json（带时间戳避缓存）=====
  const loadLatestFromUpdates = async () => {
    const url = KHB_UPDATES_JSON + (KHB_UPDATES_JSON.includes('?') ? '&' : '?') + 'ts=' + Date.now();
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error('updates.json empty');
    const sorted = sortByDateDesc(data);
    return sorted[0];
  };

  loadLatestFromUpdates()
    .then(latestItem => {
      const d = pickDate(latestItem);
      const t = pickTitle(latestItem);
      const u = pickURL(latestItem);

      if (d && elDate)  elDate.textContent = d;
      if (t && elTitle) elTitle.textContent = t;
      if (u && elView)  elView.href = u;

      // NEW 徽标：若 d 比 lastSeen 新 → 显示
      try {
        const key = 'khb:lastSeen';
        const last = localStorage.getItem(key) || '';
        if (d && (!last || d > last)) elNew.hidden = false;
        const markRead = () => { if (d) localStorage.setItem(key, d); };
        elView && elView.addEventListener('click', markRead);
        elHome && elHome.addEventListener('click', markRead);
      } catch (e) {}
    })
    .catch(err => {
      if (elTitle) elTitle.textContent = '（无法获取最新信息）';
      // 控制台提示方便排障
      console.error('[KHB] updates fetch failed:', err?.message || err);
      console.error('[KHB] tried URL:', KHB_UPDATES_JSON);
    });
})();
