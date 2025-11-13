(() => {
  const MAINTENANCE_ON = true;

  if (!MAINTENANCE_ON) return;

  const html = document.documentElement;
  const body = document.body;
  html.style.overflow = 'hidden';
  body.style.overflow = 'hidden';

  const style = document.createElement('style');
  style.textContent = `
  .kmnt-overlay {
    position: fixed;
    inset: 0;
    z-index: 999999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(0, 0, 0, 0.82);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    pointer-events: auto;
  }

  .kmnt-panel {
    max-width: 520px;
    width: 100%;
    background: #050608;
    border: 1px solid #1aff7a;
    box-shadow:
      0 0 0 1px rgba(0,0,0,0.8),
      0 0 32px rgba(0, 0, 0, 0.9);
    padding: 22px 24px 18px;
    color: #e6fff0;
    font-family: "Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  }

  .kmnt-title {
    font-size: 13px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #1aff7a;
    border-bottom: 1px solid rgba(26, 255, 122, 0.5);
    padding-bottom: 6px;
    margin-bottom: 12px;
  }

  .kmnt-line-main {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 10px;
    color: #ffffff;
  }

  .kmnt-line {
    font-size: 14px;
    line-height: 1.6;
    color: #c7f5dc;
  }

  .kmnt-line-sub {
    font-size: 12px;
    margin-top: 10px;
    color: #80cfa5;
    opacity: 0.9;
  }

  .kmnt-badge {
    display: inline-block;
    padding: 0 6px;
    margin-right: 6px;
    border-radius: 3px;
    background: #1aff7a;
    color: #04120a;
    font-size: 11px;
    font-weight: 700;
  }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.className = 'kmnt-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Kalyna OSINT 维护通知');

  overlay.innerHTML = `
    <div class="kmnt-panel">
      <div class="kmnt-title">
        <span class="kmnt-badge">KALYNA</span> MAINTENANCE NOTICE
      </div>
      <div class="kmnt-line kmnt-line-main">
        当前无法访问
      </div>
      <div class="kmnt-line">
        由于内部原因，网站更新已暂停。
      </div>
      <div class="kmnt-line kmnt-line-sub">
        请在官方账号等待更多信息。
      </div>
    </div>
  `;

  const mount = () => (document.body || document.documentElement).appendChild(overlay);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
