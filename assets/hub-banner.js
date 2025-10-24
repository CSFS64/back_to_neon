/* Kalyna Hub Banner — centered bar that auto-hides to a thin edge
 * Reads latest from {base}/data/updates.json
 * data attributes:
 *   data-base          : site root, must end with '/'
 *   data-updates-json  : override updates.json URL (default {base}data/updates.json)
 *   data-updates-link  : "view" link URL        (default {base}#updates)
 *   data-autohide      : ms before auto hide to edge (default 2200; 0 = never)
 *   data-edge          : edge height in px when hidden (default 6)
 */
(() => {
  const cur = document.currentScript || (function(){const s=document.getElementsByTagName('script');return s[s.length-1];})();
  const guessBase = (src) => {
    try {
      const u = new URL(src, location.href);
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) return `${u.origin}/${parts[0]}/${parts[1]}/`;
      return `${u.origin}/`;
    } catch { return location.origin + '/'; }
  };

  const BASE   = (cur.dataset.base || '').trim() || guessBase(cur.src || '');
  const JSONU  = (cur.dataset.updatesJson || (BASE + 'data/updates.json')).trim();
  const VIEW   = (cur.dataset.updatesLink || (BASE + '#updates')).trim();
  const AUTO   = Math.max(0, parseInt(cur.dataset.autohide ?? '2200', 10));
  const EDGE   = Math.max(0, parseInt(cur.dataset.edge ?? '6', 10)); // px

  // ---------- inject CSS ----------
  const css = `
  :root{ --khb-edge: ${EDGE}px; }
  .khb{
    position: fixed; inset: 0 0 auto 0; z-index: 10000;
    display: flex; justify-content: center; pointer-events: none;
    transform: translateY(0); transition: transform .28s ease;
    font-family: system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;
  }
  .khb__bar{
    pointer-events: auto;
    max-width: clamp(720px, 66vw, 1440px);
    display: flex; align-items: center; gap: 10px;
    height: 40px; padding: 0 14px;
    background: rgba(255,255,255,.93);
    border: 1px solid rgba(0,0,0,.10);
    border-top: none; border-radius: 0 0 12px 12px;
    box-shadow: 0 10px 24px rgba(0,0,0,.18);
    -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
  }
  .khb__home{ color:#111; font-weight:800; text-decoration:none; letter-spacing:0; }
  .khb__meta{ display:flex; gap:8px; align-items:center; font-size:13px; min-width:0; }
  .khb__date{ opacity:.78; white-space:nowrap; }
  .khb__title{ min-width:0; max-width:46ch; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .khb__link{ color:#0b63c5; font-weight:700; text-decoration:none; border-bottom:1px dotted currentColor; }
  .khb__link:hover{ text-decoration:underline; }
  .khb__sep{ display:none; }
  .khb__new{ display:inline-flex; align-items:center; font-size:.7rem;
             padding:0 .4rem; border:1px solid #000; background:#ffec99; border-color:#f1c40f; color:#000; font-weight:800; }

  /* dark preference */
  @media (prefers-color-scheme: dark){
    .khb__bar{ background: rgba(18,18,18,.86); border-color: rgba(255,255,255,.12); color:#eaeaea; }
    .khb__home{ color:#fff; } .khb__link{ color:#6fb0ff; }
  }

  /* hidden-to-edge state: slide up leaving a thin edge */
  .khb.khb--edge{ transform: translateY(calc(-100% + var(--khb-edge))); }
  /* When hidden, hover the edge to reveal */
  .khb.khb--edge:hover{ transform: translateY(0); }

  /* mobile tweaks */
  @media (max-width: 640px){
    .khb__title{ max-width: 28ch; }
  }

  @media (prefers-reduced-motion: reduce){
    .khb{ transition: none; }
  }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ---------- DOM ----------
  const wrap = document.createElement('div');
  wrap.className = 'khb';
  wrap.setAttribute('role', 'region');
  wrap.setAttribute('aria-label', 'Kalyna OSINT Hub');
  
  wrap.innerHTML = `
    <div class="khb__bar">
      <a class="khb__home" id="khbHome" href="${BASE}">Kalyna OSINT</a>
      <span class="khb__sep">·</span>
      <div class="khb__meta">
        <span class="khb__date">最新更新：<b id="khbDate">—</b></span>
        <span class="khb__title" id="khbTitle">（加载中…）</span>
        <!-- 改：统一回主站更新区 -->
        <a class="khb__link" id="khbView" href="${VIEW}" target="_self">查看分析🔍</a>
        <span class="khb__new" id="khbNew" hidden>NEW</span>
      </div>
    </div>
  
    <noscript>
      <div style="padding:.5rem .75rem;border-bottom:1px solid #000;">
        已禁用脚本：请访问主页查看最新分析。
      </div>
    </noscript>
  `;
  
  const mount = () => (document.body || document.documentElement).appendChild(wrap);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  // ---------- helpers ----------
  const q = (sel) => wrap.querySelector(sel);
  const elDate  = q('#khbDate'), elTitle = q('#khbTitle'), elView = q('#khbView'), elHome = q('#khbHome'), elNew = q('#khbNew');

  const clean = (s='') => String(s).replace(/\s+/g,' ').trim();
  const pickTitle = (it) => clean(it?.title || '') || clean(it?.excerpt || '').slice(0,36) || '（无标题）';
  const pickURL   = () => VIEW;
  const pickDate  = (it) => String(it?.date || '');
  const sortByDateDesc = (arr=[]) => arr.slice().sort((a,b)=>pickDate(b).localeCompare(pickDate(a)));

  const loadLatest = async () => {
    const url = JSONU + (JSONU.includes('?') ? '&' : '?') + 'ts=' + Date.now();
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    if (!Array.isArray(data) || data.length===0) throw new Error('updates.json empty');
    return sortByDateDesc(data)[0];
  };

  const enterEdgeLater = () => {
    if (AUTO > 0) setTimeout(() => wrap.classList.add('khb--edge'), AUTO);
  };

  // 点击“查看分析/主页”后把 NEW 清零
  const bindRead = (d) => {
    try {
      const key='khb:lastSeen', last=localStorage.getItem(key)||'';
      if (d && (!last || d>last)) elNew.hidden = false;
      const mark = ()=>{ if(d) localStorage.setItem(key,d); };
      elView?.addEventListener('click', mark); elHome?.addEventListener('click', mark);
    } catch {}
  };

  loadLatest().then(item => {
    const d = pickDate(item), t = pickTitle(item), u = pickURL(item);
    if (d) elDate.textContent = d;
    if (t) elTitle.textContent = t;
    if (u) elView.href = u;

    bindRead(d);
    enterEdgeLater();
  }).catch(err => {
    elTitle.textContent = '（无法获取最新信息）';
    console.error('[KHB] failed:', err?.message||err, 'URL:', JSONU);
    enterEdgeLater();
  });
})();
