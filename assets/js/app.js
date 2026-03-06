/* TechFreela — app.js (MySQL/API version) */
const App = (() => {
  const API = window.location.origin;

  const api = async (method, path, body = null) => {
    const opts = { method, credentials: "include", headers: { "Content-Type": "application/json" } };
    if (body) opts.body = JSON.stringify(body);
    try {
      const res  = await fetch(API + path, opts);
      const text = await res.text();
      let data = {};
      try { data = JSON.parse(text); } catch { /* server returned HTML/text */ }
      if (!res.ok) {
        const msg = data.error || (res.status >= 500 ? "Erro interno do servidor." : "Erro na requisição.");
        throw { status: res.status, message: msg };
      }
      return data;
    } catch (err) {
      if (err.message && !err.status) throw { message: "Falha de conexão com o servidor." };
      throw err;
    }
  };
  const GET  = (p)    => api("GET",  p);
  const POST = (p, b) => api("POST", p, b);
  const PUT  = (p, b) => api("PUT",  p, b);

  const goHome = () => UI.showPage("home");

  const navigate = (page) => {
    const user    = State.getUser();
    const isAdmin = !!user?.is_admin;

    if (["profile","post-job","my-applications","company"].includes(page) && !State.isLoggedIn()) {
      UI.toastWarn("Faça login para continuar."); UI.openModal("login-modal"); return;
    }
    if (page === "admin"    && !isAdmin) { UI.toastWarn("Acesso negado."); return; }
    if (page === "company"  && !isAdmin && user?.type !== "company") {
    UI.toastWarn("Acesso exclusivo para empresas."); return;
  }
    if (page === "company"  && !isAdmin && user?.type !== "company") { UI.toastWarn("Acesso exclusivo para empresas."); return; }

    UI.showPage(page);
    closeMobileMenu();
    if (page === "jobs")             renderJobBoard();
    if (page === "profile")          renderProfilePage();
    if (page === "post-job")         renderPostJobCreditsInfo();
    if (page === "admin")            loadAdminPage();
    if (page === "company")          loadCompanyPanel();
    if (page === "my-applications")  loadMyApplications();
    if (page === "companies")        loadCompanies();
    if (page === "company-public")   {}  // carregado por viewCompanyPublic()
    if (page === "quotes")           loadQuotes();
  };

  const renderJobBoard = async () => {
    const c = document.getElementById("jobs-list");
    if (!c) return;
    c.innerHTML = `<div class="empty-state"><div class="loading-spinner" style="margin:0 auto"></div></div>`;
    try {
      const params = new URLSearchParams({ search: UI.val("job-search"), type: UI.val("job-type-filter"), area: UI.val("job-area-filter"), per_page: 30 });
      const data = await GET("/api/jobs?" + params);
      c.innerHTML = data.jobs.length ? data.jobs.map(j => UI.renderJobCard(j)).join("") : UI.emptyState("🔍","Nenhuma vaga","Tente outros filtros.");
    } catch {
      const jobs = DB.filterJobs({ search: UI.val("job-search"), type: UI.val("job-type-filter"), area: UI.val("job-area-filter") });
      c.innerHTML = jobs.length ? jobs.map(j => UI.renderJobCard(j)).join("") : UI.emptyState("🔍","Nenhuma vaga","Tente outros filtros.");
    }
  };

  const filterJobs = () => renderJobBoard();

  const viewJob = async (jobId) => {
    if (!State.isLoggedIn()) { UI.toastWarn("Faça login para ver detalhes."); UI.openModal("login-modal"); return; }
    if (!State.canAfford(DB.COSTS.VIEW_JOB)) { UI.toastError("Créditos insuficientes!"); navigate("pricing"); return; }
    UI.setHtml("job-detail-content", `<div class="empty-state"><div class="loading-spinner" style="margin:0 auto"></div></div>`);
    UI.openModal("job-detail-modal");
    try {
      const data = await GET(`/api/jobs/${jobId}`);
      State.spendCredits(DB.COSTS.VIEW_JOB, "view");
      UI.setHtml("job-detail-content", UI.renderJobDetail(data.job, State.hasApplied(jobId), data.balance));
      UI.toastInfo(`⚡ ${data.credits_spent} créditos utilizados`);
    } catch (err) {
      if (err.status === 402) { UI.toastError(err.message); UI.closeModal("job-detail-modal"); navigate("pricing"); return; }
      const job = DB.getJobById(jobId);
      if (job) { State.spendCredits(DB.COSTS.VIEW_JOB,"view"); UI.setHtml("job-detail-content", UI.renderJobDetail(job, State.hasApplied(jobId), State.getCredits())); }
    }
  };

  const applyJob = async (jobId) => {
    if (State.hasApplied(jobId)) { UI.toastInfo("Já se candidatou!"); return; }
    if (!State.canAfford(DB.COSTS.APPLY_JOB)) { UI.toastError("Créditos insuficientes!"); navigate("pricing"); UI.closeModal("job-detail-modal"); return; }
    const btn = document.getElementById("apply-btn-" + jobId);
    if (btn) { btn.textContent = "Enviando..."; btn.disabled = true; }
    const finish = () => { if (btn) { btn.textContent = "✅ Candidatura Enviada"; btn.style.cssText = "background:#065f46;color:var(--accent)"; } };
    try {
      await POST(`/api/jobs/${jobId}/apply`, {});
      State.spendCredits(DB.COSTS.APPLY_JOB,"apply"); State.applyJob(jobId); finish();
      UI.toastSuccess("Candidatura enviada! 🎯"); renderAppliedJobsList();
    } catch (err) {
      if (err.status === 409) { State.applyJob(jobId); finish(); UI.toastInfo("Já se candidatou!"); }
      else if (err.status === 402) { UI.toastError(err.message); navigate("pricing"); UI.closeModal("job-detail-modal"); }
      else { State.spendCredits(DB.COSTS.APPLY_JOB,"apply"); State.applyJob(jobId); finish(); UI.toastSuccess("Candidatura enviada!"); renderAppliedJobsList(); }
    }
  };

  const renderPostJobCreditsInfo = () => { const e = document.getElementById("pj-credits-balance"); if (e) e.textContent = State.getCredits() + " créditos"; };

  const postJob = async () => {
    const title=UI.val("pj-title"), company=UI.val("pj-company"), type=UI.val("pj-type"), mode=UI.val("pj-mode"), desc=UI.val("pj-desc");
    if (!title||!company||!type||!mode||!desc) { UI.toastWarn("Preencha os campos obrigatórios."); return; }
    if (!State.canAfford(DB.COSTS.POST_JOB)) { UI.toastError("Créditos insuficientes!"); navigate("pricing"); return; }
    const btn = document.querySelector("#page-post-job .btn-primary");
    if (btn) { btn.textContent = "Publicando..."; btn.disabled = true; }
    try {
      const data = await POST("/api/jobs", { title, company, type, mode, salary: UI.val("pj-salary"), location: UI.val("pj-location"),
        stack: UI.val("pj-stack").split(",").map(s=>s.trim()).filter(Boolean), desc, reqs: UI.val("pj-reqs").split("\n").map(r=>r.trim()).filter(Boolean) });
      State.spendCredits(DB.COSTS.POST_JOB,"post"); State.postJob(data.job.id);
      UI.toastSuccess("Vaga publicada! 🎉");
      UI.clearFields(["pj-title","pj-company","pj-salary","pj-location","pj-stack","pj-desc","pj-reqs"]);
      UI.setVal("pj-type",""); UI.setVal("pj-mode","");
      setTimeout(() => navigate("jobs"), 1200);
    } catch (err) { UI.toastError(err.message || "Erro ao publicar."); }
    finally { if (btn) { btn.textContent = "⚡ Publicar Vaga por 20 Créditos"; btn.disabled = false; } }
  };

  const doLogin = async () => {
    const email=UI.val("login-email"), pass=UI.val("login-pass");
    if (!email||!pass) { UI.toastWarn("Preencha e-mail e senha."); return; }
    const btn = document.querySelector("#login-modal .btn-primary");
    if (btn) { btn.textContent="Entrando..."; btn.disabled=true; }
    try {
      const data = await POST("/api/auth/login", { email, password: pass });
      State.login({ ...data.user, credits: data.user.credits });
      UI.closeModal("login-modal"); UI.clearFields(["login-email","login-pass"]); UI.toastSuccess(data.message);
    } catch (err) {
      if (!err.status) { const n=email.split("@")[0].replace(/[._]/g," ").replace(/\b\w/g,c=>c.toUpperCase()); State.login({name:n,email,type:"dev",credits:10}); UI.closeModal("login-modal"); UI.clearFields(["login-email","login-pass"]); UI.toastSuccess(`Bem-vindo, ${n}! (offline)`); }
      else UI.toastError(err.message);
    } finally { if (btn) { btn.textContent="Entrar"; btn.disabled=false; } }
  };

  const doRegister = async () => {
    const name=UI.val("reg-name"),email=UI.val("reg-email"),pass=UI.val("reg-pass"),role=UI.val("reg-role");
    const type = document.getElementById("tab-company")?.classList.contains("active") ? "company" : "dev";
    if (!name||!email||!pass) { UI.toastWarn("Preencha todos os campos."); return; }
    if (pass.length<6) { UI.toastWarn("Senha mínima de 6 caracteres."); return; }
    const btn = document.querySelector("#register-modal .btn-primary");
    if (btn) { btn.textContent="Criando..."; btn.disabled=true; }
    try {
      const data = await POST("/api/auth/register", { name, email, password: pass, role, type });
      State.login({ ...data.user, credits: data.user.credits });
      UI.closeModal("register-modal"); UI.clearFields(["reg-name","reg-email","reg-pass"]); UI.toastSuccess(data.message);
    } catch (err) {
      if (!err.status) { State.login({name,email,role,type,credits:10}); UI.closeModal("register-modal"); UI.clearFields(["reg-name","reg-email","reg-pass"]); UI.toastSuccess("Conta criada! (offline) 🎁"); }
      else UI.toastError(err.message);
    } finally { if (btn) { btn.textContent="Criar conta grátis"; btn.disabled=false; } }
  };

  const switchRegisterTab = (type) => {
    const isC = type==="company";
    UI.toggleClass("tab-dev","active",!isC); UI.toggleClass("tab-company","active",isC);
    const rg = document.getElementById("reg-role-group"); if (rg) rg.style.display = isC ? "none" : "block";
  };

  // ---- PAYMENT FLOW ----
  let _payState = {
    packageId:     null,
    paymentId:     null,
    pixCode:       "",
    pollTimer:     null,
    timerInterval: null,
  };

  const buyCredits = (amount) => {
    if (!State.isLoggedIn()) { UI.openModal("login-modal"); UI.toastInfo("Faça login."); return; }
    const pkgMap = { 50: "starter", 150: "pro", 400: "business" };
    const pkg = DB.creditPackages.find(x => x.credits === amount);
    _payState.packageId = pkgMap[amount];

    _payShowStep("summary");
    UI.setHtml("pay-pkg-name",  `${amount} créditos`);
    UI.setHtml("pay-pkg-label", pkg ? pkg.label : "Pacote");
    UI.setHtml("pay-pkg-price", `R$ ${pkg ? pkg.price.toFixed(2).replace(".",",") : "—"}`);
    document.getElementById("btn-confirm-pay").disabled = false;
    document.getElementById("btn-confirm-pay").textContent = "⚡ Gerar QR Code PIX";

    UI.openModal("payment-modal");
  };

  const _payShowStep = (step) => {
    ["summary","qr","success","error"].forEach(s => {
      const el = document.getElementById(`pay-step-${s}`);
      if (el) el.style.display = s === step ? "" : "none";
    });
  };

  const confirmPayment = async () => {
    const btn = document.getElementById("btn-confirm-pay");
    btn.textContent = "Gerando QR Code…"; btn.disabled = true;

    try {
      const data = await POST("/api/payments/create", { package_id: _payState.packageId });
      _payState.paymentId = data.payment_id;
      _payState.pixCode   = data.qr_code || "";

      const img = document.getElementById("pay-qr-img");
      if (img && data.qr_base64) {
        img.src = `data:image/png;base64,${data.qr_base64}`;
      }
      const codeEl = document.getElementById("pay-pix-code");
      if (codeEl) codeEl.textContent = data.qr_code || "";

      _payShowStep("qr");
      UI.setHtml("pay-status-msg", "Aguardando pagamento…");

      _startPixTimer(data.expires_in || 1800);
      _pollPayment();

    } catch (err) {
      btn.textContent = "⚡ Gerar QR Code PIX"; btn.disabled = false;
      if (err.status === 503) UI.toastWarn(err.message || "Gateway não configurado.");
      else                    UI.toastError(err.message || "Erro ao criar pagamento.");
    }
  };

  const copyPixCode = () => {
    if (!_payState.pixCode) return;
    navigator.clipboard.writeText(_payState.pixCode).then(() => {
      const btn = document.getElementById("btn-copy-pix");
      if (btn) { btn.textContent = "✅ Copiado!"; setTimeout(() => { btn.textContent = "📋 Copiar"; }, 2000); }
    }).catch(() => {
      const ta = document.createElement("textarea");
      ta.value = _payState.pixCode;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      UI.toastSuccess("Código PIX copiado!");
    });
  };

  const _startPixTimer = (seconds) => {
    if (_payState.timerInterval) clearInterval(_payState.timerInterval);
    let remaining = seconds;
    const el = document.getElementById("pay-timer");
    const update = () => {
      const m = String(Math.floor(remaining / 60)).padStart(2, "0");
      const s = String(remaining % 60).padStart(2, "0");
      if (el) {
        el.textContent = `${m}:${s}`;
        el.style.color = remaining <= 60 ? "#f59e0b" : "var(--accent)";
      }
      if (remaining <= 0) {
        clearInterval(_payState.timerInterval);
        clearInterval(_payState.pollTimer);
        _payShowStep("error");
        const titleEl = document.getElementById("pay-error-title");
        if (titleEl) titleEl.textContent = "QR Code expirado";
      }
      remaining--;
    };
    update();
    _payState.timerInterval = setInterval(update, 1000);
  };

  const retryPayment = () => {
    _payShowStep("summary");
    document.getElementById("btn-confirm-pay").disabled = false;
    document.getElementById("btn-confirm-pay").textContent = "⚡ Gerar QR Code PIX";
  };

  const cancelPayment = () => {
    if (_payState.pollTimer)     clearInterval(_payState.pollTimer);
    if (_payState.timerInterval) clearInterval(_payState.timerInterval);
  };

  const _pollPayment = () => {
    if (_payState.pollTimer) clearInterval(_payState.pollTimer);
    let attempts = 0;
    _payState.pollTimer = setInterval(async () => {
      attempts++;
      if (attempts > 360) { clearInterval(_payState.pollTimer); return; }
      try {
        const data = await GET(`/api/payments/${_payState.paymentId}/status`);
        const s = data.status;

        const msgs = {
          pending:    "⏳ Aguardando pagamento…",
          confirming: "🔄 Confirmando…",
          finished:   "🎉 Pago! Liberando créditos…",
          failed:     "❌ Pagamento recusado.",
          expired:    "⏰ PIX expirado.",
          refunded:   "↩️ Reembolsado.",
        };
        const el = document.getElementById("pay-status-msg");
        if (el) el.textContent = msgs[s] || `Status: ${s}`;

        if (s === "finished") {
          clearInterval(_payState.pollTimer);
          clearInterval(_payState.timerInterval);
          State.setCredits(data.balance);
          setTimeout(() => {
            _payShowStep("success");
            const pkgMap = { starter: 50, pro: 150, business: 400 };
            const credits = pkgMap[_payState.packageId] || "";
            const msgEl = document.getElementById("pay-success-msg");
            if (msgEl) msgEl.textContent = `${credits} créditos adicionados à sua conta!`;
            UI.toastSuccess("💎 Créditos adicionados com sucesso!");
          }, 800);
        }

        if (s === "failed") {
          clearInterval(_payState.pollTimer);
          clearInterval(_payState.timerInterval);
          _payShowStep("error");
          const titleEl = document.getElementById("pay-error-title");
          if (titleEl) titleEl.textContent = "Pagamento recusado";
        }

        if (s === "expired") {
          clearInterval(_payState.pollTimer);
          clearInterval(_payState.timerInterval);
          _payShowStep("error");
        }

      } catch { /* continua polling */ }
    }, 5000);
  };

  // ---- ADMIN ----
  let _adminTab = "config";

  const adminUpdateEnv = () => {
    const sandbox = document.querySelector('input[name="adm-sandbox-radio"]:checked')?.value || "true";
    UI.setVal("adm-sandbox", sandbox);
    const sl = document.getElementById("env-sandbox-label");
    const pl = document.getElementById("env-prod-label");
    if (sl) { sl.style.border = sandbox==="true" ? "2px solid var(--accent)" : "1.5px solid var(--border2)"; sl.style.background = sandbox==="true" ? "rgba(99,102,241,0.08)" : ""; }
    if (pl) { pl.style.border = sandbox==="false" ? "2px solid var(--accent)" : "1.5px solid var(--border2)"; pl.style.background = sandbox==="false" ? "rgba(99,102,241,0.08)" : ""; }
  };

  const adminTab = (tab) => {
    _adminTab = tab;
    ["config","payments"].forEach(t => {
      const btn = document.getElementById("adm-tab-" + t);
      const pnl = document.getElementById("adm-panel-" + t);
      if (btn) btn.classList.toggle("active", t === tab);
      if (pnl) pnl.style.display = t === tab ? "" : "none";
    });
    if (tab === "payments") loadAdminPayments();
  };

  const loadAdminPage = async () => {
    try {
      const s = await GET("/api/admin/stats");
      UI.setText("adm-stat-users",    s.users);
      UI.setText("adm-stat-jobs",     s.active_jobs);
      UI.setText("adm-stat-payments", s.finished_payments);
    } catch {}
    try {
      const c = await GET("/api/admin/config/raw");
      const cfg = c.config || {};
      UI.setVal("adm-mp-access-token", "");
      UI.setVal("adm-mp-public-key",   cfg.mp_public_key || "");
      const sandbox = cfg.mp_sandbox || "true";
      UI.setVal("adm-sandbox", sandbox);
      const sbRadio = document.getElementById(sandbox === "true" ? "radio-sandbox" : "radio-prod");
      if (sbRadio) sbRadio.checked = true;
      adminUpdateEnv();
      const prevEl = document.getElementById("adm-mp-at-preview");
      if (prevEl && cfg.mp_access_token_preview) {
        prevEl.textContent = `Token salvo: ${cfg.mp_access_token_preview} (${cfg.mp_access_token_len} chars)`;
      }
    } catch {}
  };

  const adminSaveConfig = async () => {
    const accessToken = UI.val("adm-mp-access-token");
    const publicKey   = UI.val("adm-mp-public-key");
    const sandbox     = UI.val("adm-sandbox");

    const payload = { mp_sandbox: sandbox };
    if (accessToken) payload.mp_access_token = accessToken;
    if (publicKey)   payload.mp_public_key   = publicKey;

    try {
      const r = await POST("/api/admin/config", payload);
      UI.toastSuccess(r.message || "Configurações salvas!");
      UI.setVal("adm-mp-access-token", "");
    } catch (err) {
      UI.toastError(err.message || "Erro ao salvar.");
    }
  };

  const adminTestConnection = async () => {
    try {
      const r = await POST("/api/admin/test-mercadopago", {});
      if (r.ok) UI.toastSuccess(r.message);
      else       UI.toastError(`❌ ${r.error || r.message}`);
    } catch (err) {
      UI.toastError(err.message || "Erro ao testar.");
    }
  };

  const loadAdminPayments = async () => {
    const el = document.getElementById("adm-payments-list");
    if (!el) return;
    el.innerHTML = `<div class="empty-state"><div class="loading-spinner" style="margin:0 auto"></div></div>`;
    try {
      const data = await GET("/api/admin/payments");
      const pays = data.payments || [];
      if (!pays.length) { el.innerHTML = `<div class="empty-state"><div class="empty-state-text">Nenhum pagamento ainda.</div></div>`; return; }
      const STATUS_CLS = { finished:"status-finished", pending:"status-pending", failed:"status-failed",
                           expired:"status-expired", waiting:"status-waiting", confirming:"status-confirming",
                           confirmed:"status-finished", refunded:"status-failed" };
      el.innerHTML = `<div style="overflow-x:auto"><table class="adm-table">
        <thead><tr>
          <th>ID</th><th>USUÁRIO</th><th>PACOTE</th><th>VALOR</th><th>MÉTODO</th><th>STATUS</th><th>DATA</th>
        </tr></thead>
        <tbody>${pays.map(p => `<tr>
          <td>#${p.id}</td>
          <td><div style="font-weight:600;color:var(--text1)">${UI.esc(p.user_name||"")}</div><div style="font-size:0.72rem;color:var(--text3)">${UI.esc(p.user_email||"")}</div></td>
          <td>${UI.esc(p.package_id)} <span style="color:var(--accent);font-weight:700">${p.credits}cr</span></td>
          <td>R$ ${p.amount_brl}</td>
          <td>${UI.esc(p.payment_method)}</td>
          <td><span class="status-pill ${STATUS_CLS[p.status]||''}">${p.status}</span></td>
          <td style="font-size:0.75rem">${p.created_at ? new Date(p.created_at).toLocaleString("pt-BR") : "—"}</td>
        </tr>`).join("")}</tbody>
      </table></div>`;
    } catch (err) {
      el.innerHTML = `<div class="empty-state"><div class="empty-state-text">Erro ao carregar: ${UI.esc(err.message||"")}</div></div>`;
    }
  };

  // ---- PROFILE ----

  // [CORREÇÃO] uploadAvatar como função independente no módulo (não dentro de renderProfilePage)
  const uploadAvatar = async (input) => {
    const file = input.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { UI.toastWarn("Selecione apenas imagens."); return; }
    if (file.size > 5 * 1024 * 1024) { UI.toastWarn("Imagem muito grande (máx 5MB)."); return; }
    const form = new FormData();
    form.append("avatar", file);
    try {
      const res  = await fetch("/api/profile/avatar", { method: "POST", credentials: "include", body: form });
      const data = await res.json();
      if (!res.ok) throw { message: data.error };
      State.updateUser({ ...State.getUser(), avatar_url: data.avatar_url });
      renderProfilePage();
      UI.toastSuccess("Foto de perfil atualizada! 📷");
    } catch (err) {
      UI.toastError(err.message || "Erro ao enviar foto.");
    }
    input.value = "";
  };

  const renderProfilePage = async () => {
    const user = State.getUser(); if (!user) return;
    UI.setText("profile-name-el", user.name);

    // [CORREÇÃO] Avatar com foto ou iniciais + overlay de câmera
    const profInitials = user.name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase();
    const profAvEl = document.getElementById("profile-avatar-el");
    if (profAvEl) {
      if (user.avatar_url) {
        profAvEl.innerHTML = `<img src="${user.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block"><div class="profile-avatar-overlay">📷</div>`;
      } else {
        profAvEl.innerHTML = profInitials + '<div class="profile-avatar-overlay">📷</div>';
      }
    }

    UI.setText("profile-role-el",  "// "+(user.role||"DESENVOLVEDOR").toUpperCase());
    UI.setText("profile-bio-el",   user.bio||"");
    const sc=["tag-blue","tag-green","tag-purple","tag-orange","tag-pink"];
    const se=document.getElementById("profile-tags");
    if (se&&user.skills?.length) se.innerHTML=user.skills.map((s,i)=>`<span class="tag ${sc[i%sc.length]}">${UI.esc(s)}</span>`).join("");
    const myJobsBtn = document.getElementById("btn-my-jobs");
    if (myJobsBtn) myJobsBtn.style.display = user.type === "company" ? "" : "none";
    try {
      const data = await GET("/api/profile");
      renderExpFromData(data.experiences||[]); renderPortFromData(data.portfolio||[]); renderAppsFromData(data.applications||[]);
    } catch { renderExperienceList(); renderPortfolioGrid(); renderAppliedJobsList(); }
    loadUnreadCount();
  };

  const renderExpFromData = (exps) => {
    const el=document.getElementById("exp-list"); if (!el) return;
    el.innerHTML = exps.length ? exps.map(e=>UI.renderExpItem(e)).join("") : UI.emptyState("💼","Sem experiências","Adicione sua trajetória.");
  };
  const renderPortFromData = (items) => {
    const el=document.getElementById("portfolio-grid"); if (!el) return;
    el.innerHTML = items.length ? items.map(p=>UI.renderPortfolioItem(p)).join("") : UI.emptyState("🗂️","Sem projetos","Adicione seus projetos.");
  };
  const renderAppsFromData = (apps) => {
    const el=document.getElementById("applied-jobs-list"); if (!el) return;
    if (!apps.length) { el.innerHTML=`<div style="text-align:center;padding:1.5rem;color:var(--text3);font-size:0.85rem">Sem candidaturas. <a href="#" onclick="App.navigate('jobs');return false;" style="color:var(--accent)">Explorar →</a></div>`; return; }
    el.innerHTML=apps.map(a=>`<div class="exp-item"><div class="exp-title">${UI.esc(a.job_title||"Vaga")}</div><div class="exp-company">${UI.esc(a.job_company||"")}</div><div style="margin-top:0.4rem"><span class="tag tag-green" style="font-size:0.7rem">✅ Enviada</span><span class="tag tag-gray" style="font-size:0.7rem;margin-left:0.25rem">${UI.esc(a.status||"")}</span></div></div>`).join("");
  };
  const renderExperienceList  = () => { const el=document.getElementById("exp-list"),exps=State.getExperiences(); if(!el)return; el.innerHTML=exps.length?exps.map(e=>UI.renderExpItem(e)).join(""):UI.emptyState("💼","Sem experiências","Adicione sua trajetória."); };
  const renderPortfolioGrid   = () => { const el=document.getElementById("portfolio-grid"),items=State.getPortfolio(); if(!el)return; el.innerHTML=items.length?items.map(p=>UI.renderPortfolioItem(p)).join(""):UI.emptyState("🗂️","Sem projetos","Adicione seus projetos."); };
  const renderAppliedJobsList = () => { const el=document.getElementById("applied-jobs-list"),applied=State.getApplied(); if(!el)return; if(!applied.length){el.innerHTML=`<div style="text-align:center;padding:1.5rem;color:var(--text3);font-size:0.85rem">Sem candidaturas.<a href="#" onclick="App.navigate('jobs');return false;" style="color:var(--accent)"> Explorar →</a></div>`;return;} el.innerHTML=applied.map(id=>{const j=DB.getJobById(id);return j?UI.renderAppliedJob(j):""}).filter(Boolean).join(""); };

  const openEditProfile = () => {
    const u=State.getUser(); if(!u)return;
    UI.setVal("edit-name",u.name||""); UI.setVal("edit-title",u.role||""); UI.setVal("edit-bio",u.bio||"");
    UI.setVal("edit-skills",(u.skills||[]).join(", ")); UI.setVal("edit-linkedin",u.linkedin||""); UI.setVal("edit-github",u.github||"");
    UI.openModal("edit-profile-modal");
  };

  const saveProfile = async () => {
    const upd = { name:UI.val("edit-name"), role:UI.val("edit-title"), bio:UI.val("edit-bio"), skills:UI.val("edit-skills").split(",").map(s=>s.trim()).filter(Boolean), linkedin:UI.val("edit-linkedin"), github:UI.val("edit-github") };
    try { const data=await PUT("/api/profile",upd); State.updateUser(data.user); } catch { State.updateUser(upd); }
    UI.closeModal("edit-profile-modal"); renderProfilePage(); UI.toastSuccess("Perfil atualizado! 💾");
  };

  const addPortfolio = async () => {
    const name=UI.val("port-name"); if (!name) { UI.toastWarn("Informe o nome."); return; }
    const proj={emoji:UI.val("port-emoji")||"💡",name,stack:UI.val("port-stack"),desc:UI.val("port-desc"),link:UI.val("port-link")};
    try { const data=await POST("/api/profile/portfolio",proj); State.addPortfolio(data.project||proj); } catch { State.addPortfolio(proj); }
    UI.clearFields(["port-emoji","port-name","port-stack","port-desc","port-link"]); UI.closeModal("add-portfolio-modal"); renderPortfolioGrid(); UI.toastSuccess("Projeto adicionado! 🗂️");
  };

  const addExperience = async () => {
    const title=UI.val("exp-title-input"),company=UI.val("exp-company-input"); if (!title||!company) { UI.toastWarn("Cargo e empresa obrigatórios."); return; }
    const exp={title,company,location:UI.val("exp-loc-input"),start:UI.val("exp-start"),end:UI.val("exp-end")||"Atual",desc:UI.val("exp-desc-input")};
    try { const data=await POST("/api/profile/experience",exp); State.addExperience(data.experience||exp); } catch { State.addExperience(exp); }
    UI.clearFields(["exp-title-input","exp-company-input","exp-loc-input","exp-start","exp-end","exp-desc-input"]); UI.closeModal("add-exp-modal"); renderExperienceList(); UI.toastSuccess("Experiência adicionada! 💼");
  };

  // ---- MY JOBS (empresa) — redireciona para o painel ----
  const openMyJobs = () => navigate("company");

  // ---- APPLICANTS — mantida para compatibilidade retroativa ----
  const openApplicants = (jobId, jobTitle) => {
    navigate("company");
    setTimeout(() => { App.viewJobApplicants(jobId, jobTitle); }, 200);
  };

  const updateApplicationStatus = async (jobId, applicationId, status) => {
    try {
      await PUT(`/api/jobs/${jobId}/applicants/${applicationId}/status`, { status });
      UI.toastSuccess("Status atualizado!");
    } catch (err) {
      UI.toastError(err.message || "Erro ao atualizar status.");
    }
  };

  // ---- MESSAGING ----
  let _chatState = { applicationId: null, pollTimer: null, myId: null };

  const openChat = async (applicationId, otherName) => {
    _chatState.applicationId = applicationId;
    _chatState.myId = State.getUser()?.id;
    if (_chatState.pollTimer) clearInterval(_chatState.pollTimer);

    document.getElementById("chat-modal-title").textContent = `💬 ${otherName}`;
    document.getElementById("chat-modal-sub").textContent   = "";
    document.getElementById("chat-input").value = "";
    document.getElementById("chat-messages").innerHTML = `<div class="empty-state"><div class="loading-spinner" style="margin:0 auto"></div></div>`;

    UI.openModal("chat-modal");
    await _loadChatMessages();

    _chatState.pollTimer = setInterval(_loadChatMessages, 5000);

    document.getElementById("chat-modal").addEventListener("click", function handler(e) {
      if (e.target === this) { clearInterval(_chatState.pollTimer); this.removeEventListener("click", handler); }
    });
  };

  const _loadChatMessages = async () => {
    const aid = _chatState.applicationId; if (!aid) return;
    try {
      const data = await GET(`/api/messages/${aid}`);
      const msgs = data.messages || [];
      const myId = _chatState.myId;

      document.getElementById("chat-modal-sub").textContent = data.job_title ? `Vaga: ${data.job_title}` : "";
      const container = document.getElementById("chat-messages");
      const wasAtBottom = container.scrollHeight - container.clientHeight <= container.scrollTop + 20;

      container.innerHTML = msgs.length ? msgs.map(m => {
        const isMe = m.sender_id === myId;
        const time = m.created_at ? new Date(m.created_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}) : "";
        return `<div style="display:flex;flex-direction:column;align-items:${isMe?'flex-end':'flex-start'}">
          <div style="max-width:78%;padding:0.6rem 0.9rem;border-radius:${isMe?'14px 14px 4px 14px':'14px 14px 14px 4px'};background:${isMe?'var(--accent)':'rgba(255,255,255,0.07)'};color:${isMe?'#fff':'var(--text1)'};font-size:0.87rem;line-height:1.45;word-break:break-word">
            ${UI.esc(m.content)}
          </div>
          <div style="font-size:0.65rem;color:var(--text3);margin-top:0.2rem;padding:0 0.3rem">${time}</div>
        </div>`;
      }).join("") : `<div style="text-align:center;color:var(--text3);font-size:0.85rem;margin:auto">Nenhuma mensagem ainda. Diga olá! 👋</div>`;

      if (wasAtBottom) container.scrollTop = container.scrollHeight;
      loadUnreadCount();
    } catch { /* keep going */ }
  };

  const sendChatMessage = async () => {
    const content = (document.getElementById("chat-input")?.value || "").trim();
    if (!content) return;
    document.getElementById("chat-input").value = "";
    try {
      await POST("/api/messages", { application_id: _chatState.applicationId, content });
      await _loadChatMessages();
    } catch (err) {
      UI.toastError(err.message || "Erro ao enviar.");
    }
  };

  const openConversations = () => { navigate("company"); setTimeout(() => companyTab("messages"), 100); };

  const loadUnreadCount = async () => {
    try {
      const data = await GET("/api/messages/unread-count");
      const n = data.unread || 0;
      ["nav-unread-badge","company-unread-badge"].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (n > 0) { el.textContent = n; el.style.display = ""; }
        else el.style.display = "none";
      });
    } catch {}
  };

  // ============================================================
  // COMPANY PANEL
  // ============================================================

  let _cpanel = { tab:"jobs", jobs:[], allApplicants:[], currentJobId:null, currentJobTitle:"" };

  const companyTab = (tab) => {
    _cpanel.tab = tab;
    ["jobs","applicants","messages","services","cquotes"].forEach(t => {
    const btn = document.getElementById("ctab-" + t);
    const pnl = document.getElementById("cpanel-" + t);
    if (btn) btn.classList.toggle("active", t === tab);
    if (pnl) pnl.style.display = t === tab ? "" : "none";
  });
  if (tab === "jobs")       renderCompanyJobs();
  if (tab === "applicants") _populateJobFilter();
  if (tab === "messages")   renderCompanyConversations();
  if (tab === "services")   loadMyServices();
  if (tab === "cquotes")    _loadQuotesReceivedInPanel();
  };

  const loadCompanyPanel = async () => {
    const user = State.getUser();
    if (user) {
      const nameEl = document.getElementById("company-panel-title");
      if (nameEl) nameEl.textContent = `Vagas de ${user.name}`;
    }
    try {
      const data = await GET("/api/jobs/mine");
      _cpanel.jobs = data.jobs || [];
    } catch { _cpanel.jobs = []; }
    companyTab("jobs");
    loadUnreadCount();
  };

  // ── TAB: MINHAS VAGAS ──────────────────────────────────────

  const renderCompanyJobs = () => {
    const el    = document.getElementById("company-jobs-list");
    const count = document.getElementById("company-jobs-count");
    const jobs  = _cpanel.jobs;
    if (!el) return;

    if (count) count.textContent = `${jobs.length} vaga(s) publicada(s)`;

    if (!jobs.length) {
      el.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <div class="empty-state-text">Você ainda não publicou nenhuma vaga.</div>
        <button class="btn btn-primary" style="margin-top:1rem" onclick="App.navigate('post-job')">＋ Publicar Primeira Vaga</button>
      </div>`;
      return;
    }

    el.innerHTML = jobs.map(j => `
      <div class="card" style="margin-bottom:1rem;padding:1.25rem 1.5rem" id="cjob-${j.id}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;flex-wrap:wrap">
          <div style="flex:1;min-width:220px">
            <div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.3rem">
              <span style="font-size:1.5rem">${j.logo||'🏢'}</span>
              <div>
                <div style="font-weight:800;font-size:1rem;color:var(--text1)">${UI.esc(j.title)}</div>
                <div style="font-size:0.8rem;color:var(--text3)">${UI.esc(j.company)}</div>
              </div>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.6rem">
              <span class="tag tag-blue">${UI.esc(j.type)}</span>
              <span class="tag tag-gray">${UI.esc(j.mode)}</span>
              ${j.area ? `<span class="tag tag-purple">${UI.esc(j.area)}</span>` : ''}
              <span class="tag ${j.active?'tag-green':'tag-gray'}">${j.active ? '✓ Ativa' : '⏸ Pausada'}</span>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.6rem">
            <div style="text-align:right">
              <div style="font-size:1.5rem;font-weight:800;color:var(--accent)">${j.applicants_count||0}</div>
              <div style="font-size:0.72rem;color:var(--text3)">CANDIDATO(S)</div>
            </div>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap;justify-content:flex-end">
              <button class="btn btn-sm btn-primary" onclick="App.viewJobApplicants(${j.id},'${UI.esc(j.title)}')">👥 Candidatos</button>
              <button class="btn btn-sm btn-secondary" onclick="App.openEditJob(${j.id})">✏️ Editar</button>
              <button class="btn btn-sm btn-secondary" onclick="App.toggleJob(${j.id})" id="toggle-btn-${j.id}">
                ${j.active ? '⏸ Pausar' : '▶ Ativar'}
              </button>
            </div>
          </div>
        </div>
        ${j.salary ? `<div style="margin-top:0.75rem;font-size:0.82rem;color:var(--text2)">💰 ${UI.esc(j.salary)}</div>` : ''}
      </div>`).join("");
  };

  const openEditJob = (jobId) => {
    const j = _cpanel.jobs.find(x => x.id === jobId);
    if (!j) { UI.toastError("Vaga não encontrada."); return; }
    document.getElementById("edit-job-id").value     = j.id;
    document.getElementById("edit-job-modal-sub").textContent = j.title;
    UI.setVal("ej-title",    j.title || "");
    UI.setVal("ej-company",  j.company || "");
    UI.setVal("ej-salary",   j.salary || "");
    UI.setVal("ej-location", j.location || "");
    UI.setVal("ej-area",     j.area || "");
    UI.setVal("ej-stack",    (j.stack||[]).join(", "));
    UI.setVal("ej-desc",     j.desc || j.description || "");
    UI.setVal("ej-reqs",     (j.reqs||j.requirements||[]).join("\n"));
    const typeEl = document.getElementById("ej-type"); if (typeEl) typeEl.value = j.type || "PJ";
    const modeEl = document.getElementById("ej-mode"); if (modeEl) modeEl.value = j.mode || "Remoto";
    const lvlEl  = document.getElementById("ej-level"); if (lvlEl) lvlEl.value  = j.level || "A combinar";
    UI.openModal("edit-job-modal");
  };

  const saveJobEdit = async () => {
    const jobId = parseInt(document.getElementById("edit-job-id").value);
    if (!jobId) return;
    const payload = {
      title:    UI.val("ej-title"),
      company:  UI.val("ej-company"),
      type:     UI.val("ej-type"),
      mode:     UI.val("ej-mode"),
      salary:   UI.val("ej-salary"),
      location: UI.val("ej-location"),
      area:     UI.val("ej-area"),
      level:    UI.val("ej-level"),
      stack:    UI.val("ej-stack"),
      desc:     UI.val("ej-desc"),
      requirements: UI.val("ej-reqs"),
    };
    try {
      const data = await PUT(`/api/jobs/${jobId}`, payload);
      UI.toastSuccess("Vaga atualizada! ✅");
      UI.closeModal("edit-job-modal");
      const r = await GET("/api/jobs/mine");
      _cpanel.jobs = r.jobs || [];
      renderCompanyJobs();
      _populateJobFilter();
    } catch (err) {
      UI.toastError(err.message || "Erro ao salvar.");
    }
  };

  const toggleJob = async (jobId) => {
    try {
      const data = await POST(`/api/jobs/${jobId}/toggle`, {});
      UI.toastSuccess(data.message);
      const job = _cpanel.jobs.find(x => x.id === jobId);
      if (job) job.active = data.active;
      renderCompanyJobs();
    } catch (err) {
      UI.toastError(err.message || "Erro ao atualizar vaga.");
    }
  };

  // ── TAB: CANDIDATOS ────────────────────────────────────────

  const _populateJobFilter = () => {
    const sel = document.getElementById("applicant-job-filter");
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = `<option value="">— Selecione uma vaga —</option>` +
      _cpanel.jobs.map(j => `<option value="${j.id}" ${j.id==prev?'selected':''}>${UI.esc(j.title)} (${j.applicants_count||0} cand.)</option>`).join("");
    if (prev && _cpanel.currentJobId == prev) loadApplicantsForJob(prev);
  };

  const viewJobApplicants = (jobId, jobTitle) => {
    companyTab("applicants");
    setTimeout(() => loadApplicantsForJob(jobId), 50);
    const sel = document.getElementById("applicant-job-filter");
    if (sel) sel.value = jobId;
  };

  const loadApplicantsForJob = async (jobId) => {
    if (!jobId) {
      document.getElementById("company-applicants-list").innerHTML = `<div class="empty-state"><div class="empty-state-icon">👥</div><div class="empty-state-text">Selecione uma vaga para ver os candidatos.</div></div>`;
      document.getElementById("applicants-stats-bar").style.display = "none";
      document.getElementById("applicants-filter-bar").style.display = "none";
      return;
    }
    _cpanel.currentJobId = jobId;
    const el = document.getElementById("company-applicants-list");
    el.innerHTML = `<div class="empty-state"><div class="loading-spinner" style="margin:0 auto"></div></div>`;
    document.getElementById("applicants-stats-bar").style.display = "none";
    document.getElementById("applicants-filter-bar").style.display = "";

    try {
      const data = await GET(`/api/jobs/${jobId}/applicants`);
      _cpanel.allApplicants = data.applicants || [];
      _cpanel.currentJobTitle = data.job?.title || "";
      _renderApplicantList(_cpanel.allApplicants);
      _updateApplicantStats(_cpanel.allApplicants);
      document.getElementById("applicants-stats-bar").style.display = "grid";
    } catch (err) {
      el.innerHTML = `<div class="empty-state"><div class="empty-state-text">Erro: ${UI.esc(err.message||"")}</div></div>`;
    }
  };

  const _updateApplicantStats = (list) => {
    const counts = { total: list.length, pending:0, accepted:0, rejected:0 };
    list.forEach(a => { if (a.status in counts) counts[a.status]++; });
    UI.setText("astat-total",    counts.total);
    UI.setText("astat-pending",  list.filter(a=>a.status==="pending"||a.status==="viewed").length);
    UI.setText("astat-accepted", list.filter(a=>a.status==="accepted").length);
    UI.setText("astat-rejected", list.filter(a=>a.status==="rejected").length);
  };

  const filterApplicants = () => {
    const search = (document.getElementById("applicant-search")?.value || "").toLowerCase();
    const status = document.getElementById("applicant-status-filter")?.value || "";
    const filtered = _cpanel.allApplicants.filter(a => {
      const c = a.candidate;
      const matchSearch = !search || c.name.toLowerCase().includes(search) || (c.role||"").toLowerCase().includes(search) || (c.skills||[]).join(" ").toLowerCase().includes(search);
      const matchStatus = !status || a.status === status;
      return matchSearch && matchStatus;
    });
    _renderApplicantList(filtered);
  };

  const _renderApplicantList = (applicants) => {
    const el = document.getElementById("company-applicants-list");
    if (!el) return;
    if (!applicants.length) {
      el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-text">Nenhum candidato encontrado.</div></div>`;
      return;
    }
    const STATUS_COLORS = { pending:"tag-gray", viewed:"tag-blue", accepted:"tag-green", rejected:"tag-orange" };
    const STATUS_LABELS = { pending:"⏳ Pendente", viewed:"👁️ Visualizado", accepted:"✅ Aprovado", rejected:"❌ Rejeitado" };

    el.innerHTML = applicants.map(a => {
      const c = a.candidate;
      const initials = c.name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase();
      const candAvatar = c.avatar_url ? `<img src="${c.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block">` : initials;

      const skills   = (c.skills||[]).slice(0,6).map(s=>`<span class="tag tag-gray" style="font-size:0.7rem">${UI.esc(s)}</span>`).join("");
      return `
      <div class="card card-hover" style="margin-bottom:0.85rem;padding:1.25rem 1.5rem;cursor:pointer" onclick="App.openCandidateProfile(${a.application_id})">
        <div style="display:flex;align-items:flex-start;gap:1rem;flex-wrap:wrap">
          <div style="width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,var(--accent),#8b5cf6);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1rem;color:#000;flex-shrink:0;overflow:hidden">${candAvatar}</div>
          <div style="flex:1;min-width:180px">
            <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;margin-bottom:0.2rem">
              <span style="font-weight:700;font-size:0.97rem;color:var(--text1)">${UI.esc(c.name)}</span>
              <span class="tag ${STATUS_COLORS[a.status]||'tag-gray'}" style="font-size:0.7rem">${STATUS_LABELS[a.status]||a.status}</span>
              ${a.unread_messages>0?`<span class="tag tag-orange" style="font-size:0.7rem">💬 ${a.unread_messages} nova(s)</span>`:''}
            </div>
            <div style="font-size:0.82rem;color:var(--accent);margin-bottom:0.5rem">${UI.esc(c.role||'Desenvolvedor')}</div>
            ${c.bio?`<div style="font-size:0.8rem;color:var(--text3);line-height:1.4;margin-bottom:0.5rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${UI.esc(c.bio)}</div>`:''}
            ${skills?`<div style="display:flex;flex-wrap:wrap;gap:0.3rem">${skills}</div>`:''}
          </div>
          <div style="display:flex;flex-direction:column;gap:0.5rem;align-items:flex-end" onclick="event.stopPropagation()">
            <button class="btn btn-sm btn-primary" onclick="App.openCandidateProfile(${a.application_id})">👁️ Ver Perfil</button>
            <button class="btn btn-sm btn-secondary" onclick="FM.open();FM.openChat(${a.application_id},'${UI.esc(c.name)}','${UI.esc(_cpanel.currentJobTitle)}')">
              💬 Mensagem${a.unread_messages>0?` (${a.unread_messages})`:''}
            </button>
            <select class="form-select" style="font-size:0.75rem;padding:0.3rem 0.5rem" onchange="App.updateApplicationStatus(${_cpanel.currentJobId},${a.application_id},this.value)" onclick="event.stopPropagation()">
              <option value="pending"  ${a.status==='pending'?'selected':''}>⏳ Pendente</option>
              <option value="viewed"   ${a.status==='viewed'?'selected':''}>👁️ Visualizado</option>
              <option value="accepted" ${a.status==='accepted'?'selected':''}>✅ Aprovado</option>
              <option value="rejected" ${a.status==='rejected'?'selected':''}>❌ Rejeitado</option>
            </select>
          </div>
        </div>
        <div style="margin-top:0.6rem;padding-top:0.6rem;border-top:1px solid var(--border);display:flex;gap:0.75rem;align-items:center">
          <span style="font-size:0.72rem;color:var(--text3)">📅 ${a.applied_at ? new Date(a.applied_at).toLocaleDateString("pt-BR") : '—'}</span>
          ${c.linkedin?`<a href="${UI.esc(c.linkedin)}" target="_blank" onclick="event.stopPropagation()" style="font-size:0.72rem;color:var(--accent)">🔗 LinkedIn</a>`:''}
          ${c.github?`<a href="${UI.esc(c.github)}" target="_blank" onclick="event.stopPropagation()" style="font-size:0.72rem;color:var(--accent)">🐙 GitHub</a>`:''}
        </div>
      </div>`;
    }).join("");
  };

  // ── CANDIDATE PROFILE MODAL ────────────────────────────────

  let _profileCtx = { applicationId: null, jobId: null };

  const openCandidateProfile = (applicationId) => {
    const a = _cpanel.allApplicants.find(x => x.application_id === applicationId);
    if (!a) { UI.toastError("Candidato não encontrado."); return; }
    _profileCtx = { applicationId, jobId: _cpanel.currentJobId };
    const c = a.candidate;

    const initials = c.name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase();
    UI.setHtml("cpm-avatar", c.avatar_url ? `<img src="${c.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block">` : initials);
    UI.setText("cpm-name",   c.name);
    UI.setText("cpm-role",   c.role || "Desenvolvedor");

    const linksEl = document.getElementById("cpm-links");
    if (linksEl) {
      linksEl.innerHTML = [
        c.email    ? `<a href="mailto:${UI.esc(c.email)}" style="font-size:0.78rem;color:var(--text3);text-decoration:none">✉️ ${UI.esc(c.email)}</a>` : '',
        c.linkedin ? `<a href="${UI.esc(c.linkedin)}" target="_blank" style="font-size:0.78rem;color:var(--accent)">🔗 LinkedIn</a>` : '',
        c.github   ? `<a href="${UI.esc(c.github)}"   target="_blank" style="font-size:0.78rem;color:var(--accent)">🐙 GitHub</a>`  : '',
      ].filter(Boolean).join(" <span style='color:var(--border2)'>·</span> ");
    }

    const bioEl = document.getElementById("cpm-bio");
    if (bioEl) bioEl.textContent = c.bio || "Sem bio informada.";

    const sc = ["tag-blue","tag-green","tag-purple","tag-orange","tag-pink"];
    const skillsEl = document.getElementById("cpm-skills");
    if (skillsEl) skillsEl.innerHTML = (c.skills||[]).map((s,i)=>`<span class="tag ${sc[i%sc.length]}">${UI.esc(s)}</span>`).join("") || '<span style="color:var(--text3);font-size:0.82rem">Sem habilidades informadas.</span>';

    const coverBlock = document.getElementById("cpm-cover-block");
    const coverEl    = document.getElementById("cpm-cover");
    if (coverBlock && coverEl) {
      if (a.cover_note) { coverEl.textContent = a.cover_note; coverBlock.style.display = ""; }
      else coverBlock.style.display = "none";
    }

    const expEl = document.getElementById("cpm-experiences");
    if (expEl) {
      expEl.innerHTML = (c.experiences||[]).length
        ? (c.experiences||[]).map(e=>`
          <div style="border-left:3px solid var(--accent);padding-left:1rem;margin-bottom:0.85rem">
            <div style="font-weight:700;color:var(--text1);font-size:0.88rem">${UI.esc(e.title)}</div>
            <div style="font-size:0.8rem;color:var(--accent);margin-bottom:0.25rem">${UI.esc(e.company)}${e.location?' · '+UI.esc(e.location):''}</div>
            <div style="font-size:0.75rem;color:var(--text3);margin-bottom:0.25rem">${UI.esc(e.start||'')} → ${UI.esc(e.end||'Atual')}</div>
            ${e.desc?`<div style="font-size:0.82rem;color:var(--text2);line-height:1.5">${UI.esc(e.desc)}</div>`:''}
          </div>`).join("")
        : '<p style="color:var(--text3);font-size:0.82rem">Sem experiências informadas.</p>';
    }

    const portEl = document.getElementById("cpm-portfolio");
    if (portEl) {
      portEl.innerHTML = (c.portfolio||[]).length
        ? (c.portfolio||[]).map(p=>`
          <div class="portfolio-item">
            <div class="portfolio-emoji">${p.emoji||'💡'}</div>
            <div class="portfolio-name">${UI.esc(p.name)}</div>
            ${p.stack?`<div class="portfolio-stack">${UI.esc(p.stack)}</div>`:''}
            ${p.desc?`<div style="font-size:0.75rem;color:var(--text3);margin-top:0.25rem">${UI.esc(p.desc)}</div>`:''}
            ${p.link?`<a href="${UI.esc(p.link)}" target="_blank" style="font-size:0.75rem;color:var(--accent);margin-top:0.3rem;display:block">🔗 Ver projeto</a>`:''}
          </div>`).join("")
        : '<p style="color:var(--text3);font-size:0.82rem">Sem projetos no portfólio.</p>';
    }

    const statusSel = document.getElementById("cpm-status-sel");
    if (statusSel) statusSel.value = a.status || "pending";

    const msgBtn = document.getElementById("cpm-msg-btn");
    if (msgBtn) msgBtn.onclick = () => { UI.closeModal("candidate-profile-modal"); FM.open(); FM.openChat(applicationId, c.name, _cpanel.currentJobTitle); };

    UI.openModal("candidate-profile-modal");
    if (a.status === "pending") {
      updateApplicationStatus(_cpanel.currentJobId, applicationId, "viewed").catch(()=>{});
      a.status = "viewed";
    }
  };

  const updateStatusFromProfile = async (status) => {
    const { applicationId, jobId } = _profileCtx;
    if (!applicationId) return;
    await updateApplicationStatus(jobId, applicationId, status);
    const a = _cpanel.allApplicants.find(x => x.application_id === applicationId);
    if (a) a.status = status;
  };

  // ── TAB: MENSAGENS ─────────────────────────────────────────

  const renderCompanyConversations = async () => {
    const el = document.getElementById("company-conversations-list");
    if (!el) return;
    el.innerHTML = `<div class="empty-state"><div class="loading-spinner" style="margin:0 auto"></div></div>`;
    try {
      const data  = await GET("/api/messages/conversations");
      const convs = data.conversations || [];
      if (!convs.length) {
        el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💬</div><div class="empty-state-text">Nenhuma conversa ainda.<br><small style="color:var(--text3)">Inicie uma conversa acessando um candidato.</small></div></div>`;
        return;
      }
      el.innerHTML = convs.map(c => {
        const other = c.other_user || {};
        const last  = c.last_message;
        const time  = last?.created_at ? _formatMsgTime(last.created_at) : "";
        const initials = (other.name||"?").split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase();
const convAvatar = other.avatar_url ? `<img src="${other.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block">` : initials;
        return `
        <div class="card card-hover" style="margin-bottom:0.6rem;padding:1rem 1.25rem;cursor:pointer" onclick="App.openChat(${c.application_id},'${UI.esc(other.name||'?')}')">
          <div style="display:flex;align-items:center;gap:0.85rem">
            <div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,var(--accent),#8b5cf6);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85rem;color:#000;flex-shrink:0;overflow:hidden">${convAvatar}</div>
            <div style="flex:1;min-width:0">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.15rem">
                <div style="font-weight:700;color:var(--text1);font-size:0.9rem">${UI.esc(other.name||'?')}</div>
                <div style="font-size:0.7rem;color:var(--text3)">${time}</div>
              </div>
              <div style="font-size:0.75rem;color:var(--text3);margin-bottom:0.15rem">📋 ${UI.esc(c.job_title||'')}</div>
              ${last?`<div style="font-size:0.82rem;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${UI.esc(last.content||'')}</div>`:''}
            </div>
            ${c.unread>0?`<span style="background:var(--accent);color:#000;border-radius:99px;padding:2px 8px;font-size:0.7rem;font-weight:800;flex-shrink:0">${c.unread}</span>`:''}
          </div>
        </div>`;
      }).join("");
    } catch (err) {
      el.innerHTML = `<div class="empty-state"><div class="empty-state-text">Erro ao carregar: ${UI.esc(err.message||"")}</div></div>`;
    }
  };

  const _formatMsgTime = (isoStr) => {
    const d = new Date(isoStr);
    const now = new Date();
    const diffMs = now - d;
    const diffH  = diffMs / 3600000;
    if (diffH < 1)  return "Agora";
    if (diffH < 24) return `${Math.floor(diffH)}h`;
    if (diffH < 48) return "Ontem";
    return d.toLocaleDateString("pt-BR");
  };

  // ============================================================
  // MY APPLICATIONS
  // ============================================================
  let _myApps = [];

  const loadMyApplications = async () => {
    const el = document.getElementById("my-applications-list");
    if (el) el.innerHTML = `<div class="empty-state"><div class="loading-spinner" style="margin:0 auto"></div></div>`;
    try {
      const data = await GET("/api/profile");
      _myApps = data.applications || [];
      _renderMyApplications(_myApps);
      UI.setText("myapp-stat-total",    _myApps.length);
      UI.setText("myapp-stat-pending",  _myApps.filter(a=>a.status==="pending"||a.status==="viewed").length);
      UI.setText("myapp-stat-accepted", _myApps.filter(a=>a.status==="accepted").length);
      UI.setText("myapp-stat-rejected", _myApps.filter(a=>a.status==="rejected").length);
    } catch (err) {
      if (el) el.innerHTML = `<div class="empty-state"><div class="empty-state-text">Erro: ${UI.esc(err.message||"")}</div></div>`;
    }
  };

  const filterMyApplications = (status) => {
    document.querySelectorAll(".myapp-filter").forEach(b => b.classList.toggle("active", b.dataset.status === status));
    const filtered = status ? _myApps.filter(a => a.status === status) : _myApps;
    _renderMyApplications(filtered);
  };

  const _renderMyApplications = (apps) => {
    const el = document.getElementById("my-applications-list");
    if (!el) return;
    if (!apps.length) {
      el.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon">📨</div>
        <div class="empty-state-text">Nenhuma candidatura encontrada.</div>
        <button class="btn btn-primary" style="margin-top:1rem" onclick="App.navigate('jobs')">🔍 Buscar Vagas</button>
      </div>`;
      return;
    }
    const STATUS_COLORS = { pending:"tag-gray", viewed:"tag-blue", accepted:"tag-green", rejected:"tag-orange" };
    const STATUS_LABELS = { pending:"⏳ Pendente", viewed:"👁️ Visualizada", accepted:"✅ Aprovada", rejected:"❌ Rejeitada" };
    el.innerHTML = apps.map(a => `
      <div class="card card-hover" style="margin-bottom:0.85rem;padding:1.25rem 1.5rem">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap">
          <div style="flex:1;min-width:180px">
            <div style="font-weight:800;font-size:0.97rem;color:var(--text1);margin-bottom:0.2rem">${UI.esc(a.job_title||"Vaga")}</div>
            <div style="font-size:0.82rem;color:var(--text3);margin-bottom:0.6rem">${UI.esc(a.job_company||"")}${a.job_type?" · "+UI.esc(a.job_type):""}</div>
            <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">
              <span class="tag ${STATUS_COLORS[a.status]||'tag-gray'}" style="font-size:0.75rem">${STATUS_LABELS[a.status]||a.status}</span>
              <span style="font-size:0.72rem;color:var(--text3)">📅 ${a.applied_at ? new Date(a.applied_at).toLocaleDateString("pt-BR") : "—"}</span>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:0.4rem;align-items:flex-end">
            <button class="btn btn-sm btn-secondary" onclick="App.viewJob(${a.job_id})">👁️ Ver Vaga</button>
          </div>
        </div>
        ${a.cover_note?`<div style="margin-top:0.75rem;padding:0.6rem 0.9rem;background:rgba(255,255,255,0.03);border:1px solid var(--border2);border-radius:8px;font-size:0.8rem;color:var(--text3);font-style:italic">"${UI.esc(a.cover_note)}"</div>`:""}
      </div>`).join("");
  };

  // ── Mobile hamburger menu ──────────────────────────────────
  const toggleMobileMenu = () => {
    const links   = document.getElementById("nav-links");
    const burger  = document.getElementById("nav-hamburger");
    const overlay = document.getElementById("mobile-overlay");
    const isOpen  = links?.classList.contains("open");
    if (isOpen) {
      links?.classList.remove("open");
      burger?.classList.remove("open");
      overlay?.classList.remove("open");
      document.body.style.overflow = "";
    } else {
      links?.classList.add("open");
      burger?.classList.add("open");
      overlay?.classList.add("open");
      document.body.style.overflow = "hidden";
    }
  };

  const closeMobileMenu = () => {
    document.getElementById("nav-links")?.classList.remove("open");
    document.getElementById("nav-hamburger")?.classList.remove("open");
    document.getElementById("mobile-overlay")?.classList.remove("open");
    document.body.style.overflow = "";
  };

  // ── User dropdown menu ─────────────────────────────────────
  const toggleUserMenu = () => {
    const dd = document.getElementById("user-dropdown");
    if (!dd) return;
    dd.style.display = dd.style.display === "none" ? "" : "none";
    const credEl = document.getElementById("ud-credits");
    if (credEl) credEl.textContent = `💎 ${State.getCredits()} créditos`;
  };

  const closeUserMenu = () => {
    const dd = document.getElementById("user-dropdown");
    if (dd) dd.style.display = "none";
  };

  const doLogout = async () => {
    try { await POST("/api/auth/logout", {}); } catch {}
    State.logout();
    UI.showPage("home");
    UI.toastSuccess("Até logo! 👋");
  };

  // ── initEvents ─────────────────────────────────────────────
  const initEvents = () => {
    Events.on("credits:change", (c) => {
      UI.setText("credits-val",c);
      UI.setText("profile-credits-num",c);
      const e = document.getElementById("pj-credits-balance");
      if (e) e.textContent = c+" créditos";
    });
    Events.on("auth:change", (user) => {
      const el = (id) => document.getElementById(id);
      if (user) {
        UI.hide("nav-login-btn"); UI.hide("nav-register-btn");
        el("nav-avatar-wrap").style.display  = "flex";

        // [CORREÇÃO] Exibe foto ou iniciais no nav-avatar
        const initials = user.name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase();
        const navAv = el("nav-avatar");
        if (navAv) {
          if (user.avatar_url) {
            navAv.innerHTML = `<img src="${user.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:10px;display:block">`;
          } else {
            navAv.textContent = initials;
          }
        }

        UI.setText("credits-val", State.getCredits());

        if (el("ud-name"))    el("ud-name").textContent    = user.name;
        if (el("ud-email"))   el("ud-email").textContent   = user.email || "";
        if (el("ud-credits")) el("ud-credits").textContent = `💎 ${State.getCredits()} créditos`;

        const isCompany = user.type === "company";
        const isAdmin   = !!user.is_admin;
        if (el("nav-admin-btn"))        el("nav-admin-btn").style.display        = isAdmin ? "" : "none";
        if (el("nav-company-btn"))      el("nav-company-btn").style.display      = (isCompany || isAdmin) ? "" : "none";
        if (el("nav-post-job-btn"))     el("nav-post-job-btn").style.display     = (isCompany || isAdmin) ? "" : "none";
        if (el("nav-applications-btn")) el("nav-applications-btn").style.display = (!isCompany || isAdmin) ? "" : "none";
        if (el("ud-btn-company"))       el("ud-btn-company").style.display       = (isCompany || isAdmin) ? "" : "none";
        if (el("ud-btn-applications"))  el("ud-btn-applications").style.display  = (!isCompany || isAdmin) ? "" : "none";
        if (el("ud-btn-admin"))         el("ud-btn-admin").style.display         = isAdmin ? "" : "none";
        if (el("ud-btn-quotes"))        el("ud-btn-quotes").style.display        = "";
        if (el("nav-quotes-btn"))       el("nav-quotes-btn").style.display       = "";
      } else {
        UI.show("nav-login-btn"); UI.show("nav-register-btn");
        if (el("nav-avatar-wrap")) el("nav-avatar-wrap").style.display = "none";
        closeUserMenu();
        ["nav-admin-btn","nav-company-btn","nav-post-job-btn","nav-applications-btn","nav-quotes-btn"].forEach(id => {
          if (el(id)) el(id).style.display = "none";
          if (el("ud-btn-quotes")) el("ud-btn-quotes").style.display = "none";
        });
      }
    });

    document.addEventListener("click", (e) => {
      const wrap = document.getElementById("nav-avatar-wrap");
      if (wrap && !wrap.contains(e.target)) closeUserMenu();
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 768) closeMobileMenu();
    });
  };

  const checkSession = async () => {
    try {
      const d = await GET("/api/auth/me");
      State.login({...d, credits: d.credits});
      loadUnreadCount();
      setInterval(loadUnreadCount, 30000);
    } catch {}
  };

  const init = async () => { UI.initModalOutsideClick(); initEvents(); await checkSession(); renderJobBoard(); };



  
// ============================================================
// COMPANIES — Vitrine de empresas
// ============================================================

let _companiesData = [];

const loadCompanies = async () => {
  const grid = document.getElementById("companies-grid");
  if (grid) grid.innerHTML = `<div class="empty-state"><div class="loading-spinner" style="margin:0 auto"></div></div>`;
  try {
    const data = await GET("/api/companies");
    _companiesData = data.companies || [];
    _renderCompaniesGrid(_companiesData);
  } catch {
    if (grid) grid.innerHTML = `<div class="empty-state"><div class="empty-state-text">Erro ao carregar empresas.</div></div>`;
  }
};

const filterCompanies = (q) => {
  q = q.toLowerCase();
  const filtered = q ? _companiesData.filter(c =>
    c.name.toLowerCase().includes(q) || (c.role||"").toLowerCase().includes(q)
  ) : _companiesData;
  _renderCompaniesGrid(filtered);
};

const _renderCompaniesGrid = (list) => {
  const grid = document.getElementById("companies-grid");
  if (!grid) return;
  if (!list.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🏢</div><div class="empty-state-text">Nenhuma empresa encontrada.</div></div>`;
    return;
  }
  grid.innerHTML = list.map(c => {
    const initials = c.name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase();
    const avatarHtml = c.avatar_url
      ? `<img src="${c.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:var(--r-lg);display:block">`
      : initials;
    const svcsPreview = (c.services||[]).slice(0,2).map(s =>
      `<span class="tag tag-blue" style="font-size:0.72rem">${UI.esc(s.title)}</span>`
    ).join("");
    return `
      <div class="card card-hover" style="cursor:pointer;padding:1.5rem" onclick="App.viewCompanyPublic(${c.id})">
        <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1rem">
          <div style="width:52px;height:52px;border-radius:var(--r-lg);background:linear-gradient(135deg,var(--accent2),var(--accent));display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1rem;color:#fff;flex-shrink:0;overflow:hidden">${avatarHtml}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:800;font-size:1rem;color:var(--text1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${UI.esc(c.name)}</div>
            <div style="font-size:0.78rem;color:var(--text3)">${UI.esc(c.role||"Empresa")}</div>
          </div>
        </div>
        ${c.bio ? `<p style="font-size:0.82rem;color:var(--text2);line-height:1.5;margin-bottom:0.75rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${UI.esc(c.bio)}</p>` : ""}
        <div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-bottom:0.75rem">${svcsPreview}</div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:0.75rem;color:var(--text3)">${c.services_count} serviço(s)</span>
          <span style="font-size:0.78rem;color:var(--accent);font-weight:600">Ver perfil →</span>
        </div>
      </div>`;
  }).join("");
};

const viewCompanyPublic = async (companyId) => {
  navigate("company-public");
  const nameEl = document.getElementById("cpub-name");
  const svcsEl = document.getElementById("cpub-services-grid");
  if (nameEl) nameEl.textContent = "Carregando...";
  if (svcsEl) svcsEl.innerHTML = `<div class="empty-state"><div class="loading-spinner" style="margin:0 auto"></div></div>`;

  try {
    const data = await GET(`/api/companies/${companyId}`);
    const c = data.company;
    const initials = c.name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase();

    const avatarEl = document.getElementById("cpub-avatar");
    if (avatarEl) {
      avatarEl.innerHTML = c.avatar_url
        ? `<img src="${c.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:var(--r-lg);display:block">`
        : initials;
    }
    if (document.getElementById("cpub-name"))  document.getElementById("cpub-name").textContent  = c.name;
    if (document.getElementById("cpub-role"))  document.getElementById("cpub-role").textContent  = `// ${(c.role||"EMPRESA").toUpperCase()}`;
    if (document.getElementById("cpub-bio"))   document.getElementById("cpub-bio").textContent   = c.bio || "";
    const tagsEl = document.getElementById("cpub-tags");
    if (tagsEl) tagsEl.innerHTML = (c.skills||[]).map(s=>`<span class="tag tag-blue">${UI.esc(s)}</span>`).join("");

    if (!svcsEl) return;
    if (!c.services.length) {
      svcsEl.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🛠️</div><div class="empty-state-text">Nenhum serviço cadastrado.</div></div>`;
      return;
    }
    svcsEl.innerHTML = c.services.map(s => `
      <div class="card" style="padding:1.25rem">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.5rem">
          <div style="font-weight:800;font-size:0.95rem;color:var(--text1);flex:1">${UI.esc(s.title)}</div>
          <div style="font-size:1.1rem;font-weight:800;color:var(--accent);white-space:nowrap;margin-left:0.5rem">R$ ${UI.esc(s.price)}</div>
        </div>
        ${s.category ? `<span class="tag tag-purple" style="font-size:0.7rem;margin-bottom:0.6rem">${UI.esc(s.category)}</span>` : ""}
        ${s.description ? `<p style="font-size:0.82rem;color:var(--text2);line-height:1.5;margin-bottom:0.75rem">${UI.esc(s.description)}</p>` : ""}
        ${s.delivery_days ? `<div style="font-size:0.78rem;color:var(--text3);margin-bottom:0.75rem">⏱️ Prazo: ${s.delivery_days} dias</div>` : ""}
        <button class="btn btn-sm btn-primary btn-full" onclick="App.requestQuote(${s.id}, '${UI.esc(s.title).replace(/'/g,"\\'")}', '${UI.esc(c.name).replace(/'/g,"\\'")}', '${UI.esc(s.price)}')">
          📋 Solicitar Orçamento
        </button>
      </div>`).join("");
  } catch (err) {
    if (svcsEl) svcsEl.innerHTML = `<div class="empty-state"><div class="empty-state-text">Erro ao carregar.</div></div>`;
  }
};

// ============================================================
// QUOTES — Orçamentos
// ============================================================

const requestQuote = (serviceId, serviceName, companyName, price) => {
  const user = State.getUser();
  if (!user) { UI.openModal("login-modal"); UI.toastWarn("Faça login para solicitar orçamentos."); return; }
  document.getElementById("rq-service-id").value = serviceId;
  const label = document.getElementById("rq-service-label");
  if (label) label.textContent = `${serviceName} — ${companyName}`;
  const priceEl = document.getElementById("rq-price-display");
  if (priceEl) priceEl.textContent = `R$ ${price}`;
  const msgEl = document.getElementById("rq-message");
  if (msgEl) msgEl.value = "";
  UI.openModal("request-quote-modal");
};

const submitQuoteRequest = async () => {
  const serviceId = document.getElementById("rq-service-id").value;
  const message   = (document.getElementById("rq-message")?.value || "").trim();
  if (!serviceId) return;
  try {
    await POST("/api/quotes", { service_id: parseInt(serviceId), message });
    UI.closeModal("request-quote-modal");
    UI.toastSuccess("Orçamento solicitado! 📋");
  } catch (err) {
    UI.toastError(err.message || "Erro ao solicitar.");
  }
};

let _quotesTab = "sent";

const quotesTab = (tab) => {
  _quotesTab = tab;
  ["sent","received"].forEach(t => {
    const btn = document.getElementById(`qtab-${t}`);
    const pnl = document.getElementById(`qpanel-${t}`);
    if (btn) btn.classList.toggle("active", t === tab);
    if (pnl) pnl.style.display = t === tab ? "" : "none";
  });
  if (tab === "sent")     _loadQuotesSent();
  if (tab === "received") _loadQuotesReceived();
};

const loadQuotes = () => {
  const user = State.getUser();
  if (!user) return;
  // Mostra tab "Recebidos" só para empresas
  const recvTab = document.getElementById("qtab-received");
  if (recvTab) recvTab.style.display = user.type === "company" ? "" : "none";
  quotesTab("sent");
};

const _loadQuotesSent = async () => {
  const el = document.getElementById("quotes-sent-list");
  if (!el) return;
  el.innerHTML = `<div class="empty-state"><div class="loading-spinner" style="margin:0 auto"></div></div>`;
  try {
    const data = await GET("/api/quotes/sent");
    const quotes = data.quotes || [];
    if (!quotes.length) {
      el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📤</div><div class="empty-state-text">Você ainda não solicitou nenhum orçamento.<br><a href="#" onclick="App.navigate('companies');return false" style="color:var(--accent)">Explorar empresas →</a></div></div>`;
      return;
    }
    el.innerHTML = quotes.map(q => _renderQuoteCard(q, "sent")).join("");
  } catch { el.innerHTML = `<div class="empty-state"><div class="empty-state-text">Erro ao carregar.</div></div>`; }
};

const _loadQuotesReceived = async () => {
  const el = document.getElementById("quotes-received-list");
  if (!el) return;
  el.innerHTML = `<div class="empty-state"><div class="loading-spinner" style="margin:0 auto"></div></div>`;
  try {
    const data = await GET("/api/quotes/received");
    const quotes = data.quotes || [];
    if (!quotes.length) {
      el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📥</div><div class="empty-state-text">Nenhuma solicitação de orçamento recebida ainda.</div></div>`;
      return;
    }
    el.innerHTML = quotes.map(q => _renderQuoteCard(q, "received")).join("");
  } catch { el.innerHTML = `<div class="empty-state"><div class="empty-state-text">Erro ao carregar.</div></div>`; }
};

const _quoteStatusLabel = (s) => ({
  pending:    `<span class="tag tag-gray">⏳ Aguardando</span>`,
  responded:  `<span class="tag tag-blue">💼 Proposta Enviada</span>`,
  accepted:   `<span class="tag tag-green">✅ Aceito</span>`,
  rejected:   `<span class="tag" style="background:rgba(239,68,68,0.15);color:#f87171">❌ Rejeitado</span>`,
  cancelled:  `<span class="tag tag-gray">🚫 Cancelado</span>`,
})[s] || s;

const _renderQuoteCard = (q, view) => {
  const svc  = q.service || {};
  const req  = q.requester || {};
  const prop = q.proposal;
  const isSent = view === "sent";

  const proposalBlock = prop ? `
    <div style="background:rgba(0,245,196,0.06);border:1px solid rgba(0,245,196,0.18);border-radius:10px;padding:1rem;margin-top:0.75rem">
      <div style="font-size:0.75rem;color:var(--accent);font-weight:700;margin-bottom:0.5rem">💼 PROPOSTA RECEBIDA</div>
      <div style="font-size:1.4rem;font-weight:800;color:var(--accent)">R$ ${UI.esc(prop.price)}</div>
      ${prop.delivery_days ? `<div style="font-size:0.8rem;color:var(--text3);margin-top:0.25rem">⏱️ Prazo: ${prop.delivery_days} dias</div>` : ""}
      ${prop.notes ? `<p style="font-size:0.82rem;color:var(--text2);margin-top:0.5rem;line-height:1.5">${UI.esc(prop.notes)}</p>` : ""}
      ${isSent && q.status === "responded" ? `
        <div style="display:flex;gap:0.5rem;margin-top:0.75rem">
          <button class="btn btn-sm btn-primary" style="flex:1" onclick="App.updateQuoteStatus(${q.id},'accepted')">✅ Aceitar</button>
          <button class="btn btn-sm btn-secondary" style="flex:1" onclick="App.updateQuoteStatus(${q.id},'rejected')">❌ Rejeitar</button>
        </div>` : ""}
    </div>` : "";

  const actionBlock = !isSent && q.status === "pending" ? `
    <button class="btn btn-sm btn-primary" style="margin-top:0.75rem" onclick="App.respondToQuote(${q.id}, '${UI.esc(req.name||"").replace(/'/g,"\\'")}', '${UI.esc(q.message||"").replace(/'/g,"\\'")}')">
      💼 Enviar Proposta
    </button>` : "";

  const cancelBlock = isSent && (q.status === "pending" || q.status === "responded") ? `
    <button class="btn btn-sm btn-ghost" style="margin-top:0.5rem;font-size:0.75rem;color:var(--text3)" onclick="App.updateQuoteStatus(${q.id},'cancelled')">🚫 Cancelar</button>` : "";

  return `
    <div class="card" style="margin-bottom:1rem;padding:1.25rem 1.5rem" id="qcard-${q.id}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.75rem">
        <div>
          <div style="font-weight:800;font-size:0.95rem;color:var(--text1)">${UI.esc(svc.title||"Serviço")}</div>
          <div style="font-size:0.78rem;color:var(--text3);margin-top:0.2rem">
            ${isSent ? `Empresa: ${UI.esc(svc.company?.name||"")}` : `Solicitante: ${UI.esc(req.name||"")}`}
            · R$ ${UI.esc(svc.price||"")}
          </div>
        </div>
        ${_quoteStatusLabel(q.status)}
      </div>
      ${q.message ? `<p style="font-size:0.82rem;color:var(--text2);line-height:1.5;background:rgba(255,255,255,0.03);padding:0.6rem 0.8rem;border-radius:8px;border:1px solid var(--border)">"${UI.esc(q.message)}"</p>` : ""}
      ${proposalBlock}
      ${actionBlock}
      ${cancelBlock}
    </div>`;
};

const respondToQuote = (quoteId, requesterName, message) => {
  document.getElementById("resp-quote-id").value = quoteId;
  const lbl = document.getElementById("resp-requester-label");
  if (lbl) lbl.textContent = `Para: ${requesterName}`;
  const msgEl = document.getElementById("resp-message-display");
  if (msgEl) msgEl.textContent = message || "(sem mensagem)";
  const priceEl = document.getElementById("resp-price");
  const daysEl  = document.getElementById("resp-days");
  const notesEl = document.getElementById("resp-notes");
  if (priceEl) priceEl.value = "";
  if (daysEl)  daysEl.value  = "";
  if (notesEl) notesEl.value = "";
  UI.openModal("respond-quote-modal");
};

const submitQuoteResponse = async () => {
  const quoteId = document.getElementById("resp-quote-id").value;
  const price   = (document.getElementById("resp-price")?.value || "").trim();
  const days    = document.getElementById("resp-days")?.value || null;
  const notes   = (document.getElementById("resp-notes")?.value || "").trim();
  if (!price) { UI.toastWarn("Informe o valor da proposta."); return; }
  try {
    await POST(`/api/quotes/${quoteId}/respond`, { price, delivery_days: days ? parseInt(days) : null, notes });
    UI.closeModal("respond-quote-modal");
    UI.toastSuccess("Proposta enviada! 💼");
    _loadQuotesReceived();
  } catch (err) {
    UI.toastError(err.message || "Erro ao enviar proposta.");
  }
};

const updateQuoteStatus = async (quoteId, status) => {
  const labels = { accepted:"aceito", rejected:"rejeitado", cancelled:"cancelado" };
  try {
    await PUT(`/api/quotes/${quoteId}/status`, { status });
    UI.toastSuccess(`Orçamento ${labels[status]||status}!`);
    if (_quotesTab === "sent")     _loadQuotesSent();
    if (_quotesTab === "received") _loadQuotesReceived();
  } catch (err) {
    UI.toastError(err.message || "Erro.");
  }
};

const _loadQuotesReceivedInPanel = async () => {
  const el = document.getElementById("company-quotes-received-list");
  if (!el) return;
  el.innerHTML = `<div class="empty-state"><div class="loading-spinner" style="margin:0 auto"></div></div>`;
  try {
    const data = await GET("/api/quotes/received");
    const quotes = data.quotes || [];
    if (!quotes.length) {
      el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📥</div><div class="empty-state-text">Nenhuma solicitação de orçamento recebida ainda.</div></div>`;
      return;
    }
    el.innerHTML = quotes.map(q => _renderQuoteCard(q, "received")).join("");
  } catch {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-text">Erro ao carregar.</div></div>`;
  }
};
// ============================================================
// SERVICES — Gerenciamento de serviços da empresa
// ============================================================

const loadMyServices = async () => {
  const el    = document.getElementById("company-services-list");
  const count = document.getElementById("company-services-count");
  if (!el) return;
  el.innerHTML = `<div class="empty-state"><div class="loading-spinner" style="margin:0 auto"></div></div>`;
  try {
    const data = await GET("/api/services/mine");
    const svcs = data.services || [];
    if (count) count.textContent = `${svcs.length} serviço(s) cadastrado(s)`;
    if (!svcs.length) {
      el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🛠️</div><div class="empty-state-text">Nenhum serviço cadastrado.</div><button class="btn btn-primary" style="margin-top:1rem" onclick="App.openAddService()">＋ Criar Primeiro Serviço</button></div>`;
      return;
    }
    el.innerHTML = svcs.map(s => `
      <div class="card" style="margin-bottom:1rem;padding:1.25rem 1.5rem" id="svc-card-${s.id}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:0.75rem">
          <div style="flex:1;min-width:200px">
            <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;margin-bottom:0.3rem">
              <div style="font-weight:800;font-size:0.95rem;color:var(--text1)">${UI.esc(s.title)}</div>
              <span class="tag ${s.active?'tag-green':'tag-gray'}">${s.active?'Ativo':'Pausado'}</span>
            </div>
            ${s.category ? `<span class="tag tag-purple" style="font-size:0.72rem;margin-bottom:0.4rem">${UI.esc(s.category)}</span>` : ""}
            ${s.description ? `<p style="font-size:0.82rem;color:var(--text2);margin-top:0.4rem;line-height:1.5">${UI.esc(s.description)}</p>` : ""}
            <div style="margin-top:0.5rem;font-size:0.8rem;color:var(--text3)">
              💰 R$ ${UI.esc(s.price)}
              ${s.delivery_days ? ` · ⏱️ ${s.delivery_days} dias` : ""}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:0.4rem;align-items:flex-end">
            <button class="btn btn-sm btn-secondary" onclick="App.openEditService(${s.id})">✏️ Editar</button>
            <button class="btn btn-sm btn-ghost" style="font-size:0.75rem;color:var(--text3)" onclick="App.deleteService(${s.id}, '${UI.esc(s.title).replace(/'/g,"\\'")}')">🗑️ Remover</button>
          </div>
        </div>
      </div>`).join("");
    window._myServices = svcs;
  } catch { el.innerHTML = `<div class="empty-state"><div class="empty-state-text">Erro ao carregar serviços.</div></div>`; }
};

const openAddService = () => {
  document.getElementById("svc-edit-id").value = "";
  document.getElementById("add-svc-title").textContent = "Novo Serviço 🛠️";
  ["svc-title","svc-price","svc-days","svc-description"].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = "";
  });
  const cat = document.getElementById("svc-category");
  if (cat) cat.value = "";
  UI.openModal("add-service-modal");
};

const openEditService = (svcId) => {
  const svc = (window._myServices||[]).find(s => s.id === svcId);
  if (!svc) return;
  document.getElementById("svc-edit-id").value = svcId;
  document.getElementById("add-svc-title").textContent = "Editar Serviço ✏️";
  if (document.getElementById("svc-title"))       document.getElementById("svc-title").value       = svc.title;
  if (document.getElementById("svc-price"))       document.getElementById("svc-price").value       = svc.price;
  if (document.getElementById("svc-days"))        document.getElementById("svc-days").value        = svc.delivery_days || "";
  if (document.getElementById("svc-description")) document.getElementById("svc-description").value = svc.description;
  if (document.getElementById("svc-category"))    document.getElementById("svc-category").value    = svc.category;
  UI.openModal("add-service-modal");
};

const saveService = async () => {
  const editId = document.getElementById("svc-edit-id").value;
  const title  = (document.getElementById("svc-title")?.value || "").trim();
  const price  = (document.getElementById("svc-price")?.value || "").trim();
  if (!title || !price) { UI.toastWarn("Título e preço são obrigatórios."); return; }
  const payload = {
    title, price,
    category:     (document.getElementById("svc-category")?.value || "").trim(),
    description:  (document.getElementById("svc-description")?.value || "").trim(),
    delivery_days: parseInt(document.getElementById("svc-days")?.value) || null,
  };
  try {
    if (editId) {
      await PUT(`/api/services/${editId}`, payload);
      UI.toastSuccess("Serviço atualizado! ✅");
    } else {
      await POST("/api/services", payload);
      UI.toastSuccess("Serviço criado! 🛠️");
    }
    UI.closeModal("add-service-modal");
    loadMyServices();
  } catch (err) {
    UI.toastError(err.message || "Erro ao salvar serviço.");
  }
};

const deleteService = async (svcId, title) => {
  if (!confirm(`Remover o serviço "${title}"? Esta ação não pode ser desfeita.`)) return;
  try {
    await fetch(`/api/services/${svcId}`, { method:"DELETE", credentials:"include" });
    UI.toastSuccess("Serviço removido.");
    loadMyServices();
  } catch { UI.toastError("Erro ao remover serviço."); }
};



  return {
    init, navigate, goHome, filterJobs, viewJob, applyJob, postJob, renderPostJobCreditsInfo,
    doLogin, doRegister, doLogout, switchRegisterTab,
    buyCredits, confirmPayment, copyPixCode, cancelPayment, retryPayment,
    openEditProfile, saveProfile, addPortfolio, addExperience, renderProfilePage,
    adminTab, adminSaveConfig, adminTestConnection, adminUpdateEnv,
    openMyJobs, openApplicants, updateApplicationStatus,
    openChat, sendChatMessage, openConversations,
    loadMyApplications, filterMyApplications,
    toggleUserMenu, closeUserMenu, toggleMobileMenu, closeMobileMenu,
    uploadAvatar,  // [CORREÇÃO] exportada corretamente no return
    // Company Panel
    companyTab, loadCompanyPanel,
    viewJobApplicants, loadApplicantsForJob, filterApplicants,
    openEditJob, saveJobEdit, toggleJob,
    openCandidateProfile, updateStatusFromProfile,
    renderCompanyConversations,
   loadCompanies, filterCompanies, viewCompanyPublic,
   requestQuote, submitQuoteRequest,
   quotesTab, loadQuotes, respondToQuote, submitQuoteResponse, updateQuoteStatus,
   loadMyServices, openAddService, openEditService, saveService, deleteService,
  };
})();

document.addEventListener("DOMContentLoaded", App.init);