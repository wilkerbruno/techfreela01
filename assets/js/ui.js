/* ============================================================
   TECHFREELA — ui.js
   Utilitários de interface: Toast, Modals, Render Helpers
   ============================================================ */

const UI = (() => {

  /* ---- TOAST ---- */
  let toastTimer = null;

  const toast = (icon, message, duration = 3500) => {
    const el  = document.getElementById('toast');
    const ico = document.getElementById('toast-icon');
    const msg = document.getElementById('toast-msg');
    if (!el) return;

    ico.textContent = icon;
    msg.textContent = message;
    el.classList.add('show');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), duration);
  };

  const toastSuccess = (msg) => toast('✅', msg);
  const toastError   = (msg) => toast('❌', msg, 4000);
  const toastWarn    = (msg) => toast('⚠️', msg);
  const toastInfo    = (msg) => toast('ℹ️', msg);

  /* ---- MODALS ---- */
  const openModal = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('open');
    document.body.style.overflow = 'hidden';
  };

  const closeModal = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('open');
    document.body.style.overflow = '';
  };

  const closeAllModals = () => {
    document.querySelectorAll('.modal-overlay.open').forEach(el => {
      el.classList.remove('open');
    });
    document.body.style.overflow = '';
  };

  // Click-outside to close
  const initModalOutsideClick = () => {
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal(overlay.id);
      });
    });
  };

  /* ---- PAGES ---- */
  const showPage = (pageId) => {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById('page-' + pageId);
    if (!target) return;
    target.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* ---- HTML HELPERS ---- */
  const renderTags = (stack, maxVisible = 5) => {
    const colors = ['tag-blue', 'tag-green', 'tag-purple', 'tag-orange', 'tag-pink'];
    const visible = stack.slice(0, maxVisible);
    const extra   = stack.length - maxVisible;
    let html = visible.map((s, i) =>
      `<span class="tag ${colors[i % colors.length]}">${esc(s)}</span>`
    ).join('');
    if (extra > 0) html += `<span class="tag tag-gray">+${extra}</span>`;
    return html;
  };

  const renderJobCard = (job) => `
    <div class="job-card card-accent-left" onclick="App.viewJob(${job.id})">
      <div class="job-logo">${job.logo}</div>
      <div class="job-info">
        <h3>${esc(job.title)}</h3>
        <div class="job-company">${esc(job.company)} · ${esc(job.mode)}</div>
        <div class="job-tags">
          ${renderTags(job.stack, 4)}
          <span class="tag tag-orange">${esc(job.type)}</span>
        </div>
      </div>
      <div class="job-meta">
        <div class="job-salary">${esc(job.salary)}</div>
        <div class="job-type-badge">${esc(job.type)} · ${esc(job.mode)}</div>
        <div class="job-posted">${esc(job.posted)}</div>
        <div class="job-credits-cost">⚡ ${DB.COSTS.VIEW_JOB} créditos para ver</div>
      </div>
    </div>
  `;

  const renderJobDetail = (job, alreadyApplied, userCredits) => `
    <div class="job-detail-head">
      <div class="job-detail-logo">${job.logo}</div>
      <div>
        <div class="job-detail-title">${esc(job.title)}</div>
        <div class="job-detail-company">${esc(job.company)}</div>
      </div>
    </div>

    <div class="job-tags" style="margin-bottom:1.5rem">
      <span class="tag tag-orange">${esc(job.type)}</span>
      <span class="tag tag-blue">${esc(job.mode)}</span>
      <span class="tag tag-purple">${esc(job.level)}</span>
      ${renderTags(job.stack)}
    </div>

    <div class="job-detail-salary-box">
      <span style="color:var(--text2);font-size:0.85rem">💰 Faixa salarial</span>
      <span style="font-family:var(--font-display);font-weight:700;color:var(--accent);font-size:1.15rem">${esc(job.salary)}</span>
    </div>

    <div class="job-detail-section">
      <h4>SOBRE A VAGA</h4>
      <p>${esc(job.desc)}</p>
    </div>

    <div class="job-detail-section">
      <h4>REQUISITOS</h4>
      <ul>${job.reqs.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
    </div>

    ${job.benefits && job.benefits.length ? `
    <div class="job-detail-section">
      <h4>BENEFÍCIOS</h4>
      <ul>${job.benefits.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
    </div>` : ''}

    <div class="apply-cost-box">
      <div>
        <div style="font-size:0.85rem;font-weight:600;margin-bottom:0.2rem">Custo para se candidatar</div>
        <div style="font-size:0.75rem;color:var(--text3)">Seu saldo: <span style="color:var(--accent3);font-family:var(--font-mono)">${userCredits} créditos</span></div>
      </div>
      <div style="font-family:var(--font-mono);font-size:0.95rem;color:var(--accent3);font-weight:700">${DB.COSTS.APPLY_JOB} créditos</div>
    </div>

    <button
      class="btn btn-full btn-primary"
      id="apply-btn-${job.id}"
      onclick="App.applyJob(${job.id})"
      ${alreadyApplied ? 'disabled' : ''}
      style="${alreadyApplied ? 'background:#065f46;color:var(--accent)' : ''}"
    >
      ${alreadyApplied ? '✅ Candidatura Já Enviada' : `📨 Candidatar-se (${DB.COSTS.APPLY_JOB} créditos)`}
    </button>
  `;

  const renderPortfolioItem = (proj) => `
    <div class="portfolio-item">
      <div class="portfolio-item-icon">${esc(proj.emoji || '💡')}</div>
      <div class="portfolio-item-title">${esc(proj.name)}</div>
      <div class="portfolio-item-desc">${esc(proj.stack || '')}</div>
    </div>
  `;

  const renderExpItem = (exp) => `
    <div class="exp-item">
      <div class="exp-title">${esc(exp.title)}</div>
      <div class="exp-company">${esc(exp.company)}${exp.location ? ' · ' + esc(exp.location) : ''}</div>
      <div class="exp-period">${esc(exp.start || '')}${exp.start && exp.end ? ' — ' : ''}${esc(exp.end || '')}</div>
      ${exp.desc ? `<div class="exp-desc">${esc(exp.desc)}</div>` : ''}
    </div>
  `;

  const renderAppliedJob = (job) => `
    <div class="exp-item">
      <div class="exp-title">${esc(job.title)}</div>
      <div class="exp-company">${esc(job.company)}</div>
      <div style="margin-top:0.4rem">
        <span class="tag tag-green" style="font-size:0.7rem">✅ Candidatura enviada</span>
        <span class="tag tag-gray" style="font-size:0.7rem;margin-left:0.25rem">${esc(job.type)}</span>
      </div>
    </div>
  `;

  /* ---- EMPTY STATES ---- */
  const emptyState = (icon, title, text) => `
    <div class="empty-state">
      <div class="empty-state-icon">${icon}</div>
      <div class="empty-state-title">${title}</div>
      <div class="empty-state-text">${text}</div>
    </div>
  `;

  /* ---- FORM HELPERS ---- */
  const val = (id) => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  };

  const setVal = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value;
  };

  const clearFields = (ids) => ids.forEach(id => setVal(id, ''));

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  const setHtml = (id, html) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  };

  const show = (id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = '';
  };

  const hide = (id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  };

  const toggleClass = (id, cls, force) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle(cls, force);
  };

  /* ---- ESCAPE HTML ---- */
  const esc = (str) => {
    if (typeof str !== 'string') return String(str ?? '');
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  return {
    toast, toastSuccess, toastError, toastWarn, toastInfo,
    openModal, closeModal, closeAllModals, initModalOutsideClick,
    showPage,
    renderTags, renderJobCard, renderJobDetail,
    renderPortfolioItem, renderExpItem, renderAppliedJob,
    emptyState,
    val, setVal, clearFields, setText, setHtml, show, hide, toggleClass,
    esc,
  };

})();
