(() => {
  const on = !!(window.__MAINTENANCE__ || document.currentScript?.dataset?.on === "true");
  if (!on) return;

  document.documentElement.classList.add('is-maintenance');

  const css = `
  .maint-overlay{
    position: fixed; inset: 0; z-index: 2147483000;
    display: grid; place-items: center;
    background: rgba(0,0,0,.25);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
  }
  .maint-card{
    max-width: min(90vw, 720px);
    padding: 20px 24px;
    background: rgba(255,255,255,.92);
    color:#111; border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0,0,0,.25);
    text-align: center; font: 700 18px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  }
  .maint-card p{ margin: 6px 0 0; font-weight: 600; opacity: .8; }
  .is-maintenance body{ opacity:.65; }
  html.is-maintenance body > *:not(.maint-overlay){ pointer-events:none; }
  `;
  const style = document.createElement('style'); style.textContent = css;
  document.head.appendChild(style);

  const wrap = document.createElement('div');
  wrap.className = 'maint-overlay';
  wrap.setAttribute('role','dialog');
  wrap.setAttribute('aria-modal','true');
  wrap.setAttribute('aria-label','Site maintenance');
  wrap.innerHTML = `
    <div class="maint-card">
      <div style="font-size:20px;">无法访问</div>
      <p>由于维护，网站更新已暂停</p>
    </div>
  `;
  document.body.appendChild(wrap);
})();
