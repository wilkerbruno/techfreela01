/* TechFreela — app.js (MySQL/API version) */
const App = (() => {
  const API = window.location.origin;

  const api = async (method, path, body = null) => {
    const opts = { method, credentials: "include", headers: { "Content-Type": "application/json" } };
    if (body) opts.body = JSON.stringify(body);
    try {
      const res  = await fetch(API + path, opts);
      const data = await res.json();
      if (!res.ok) throw { status: res.status, message: data.error || "Erro." };
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
    if (["profile","post-job"].includes(page) && !State.isLoggedIn()) {
      UI.toastWarn("Faça login para continuar."); UI.openModal("login-modal"); return;
    }
    if (page === "admin" && !State.isAdmin()) {
      UI.toastWarn("Acesso negado."); return;
    }
    UI.showPage(page);
    if (page === "jobs")     renderJobBoard();
    if (page === "profile")  renderProfilePage();
    if (page === "post-job") renderPostJobCreditsInfo();
    if (page === "admin")    loadAdminPage();
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
  let _payState = { packageId: null, method: "pix", paymentId: null, pollTimer: null };

  const buyCredits = (amount) => {
    if (!State.isLoggedIn()) { UI.openModal("login-modal"); UI.toastInfo("Faça login."); return; }
    const pkgMap = { 50: "starter", 150: "pro", 400: "business" };
    const pkg = DB.creditPackages.find(x => x.credits === amount);
    _payState.packageId = pkgMap[amount];
    _payState.method    = "pix";

    // Populate modal
    UI.setHtml("pay-pkg-name", `${amount} créditos`);
    UI.setHtml("pay-pkg-label", pkg ? pkg.label : "Pacote");
    UI.setHtml("pay-pkg-price", `R$ ${pkg ? pkg.price.toFixed(2).replace(".",",") : "—"}`);
    document.getElementById("pay-status-area").style.display = "none";
    document.getElementById("btn-confirm-pay").style.display = "";
    document.getElementById("btn-confirm-pay").disabled = false;
    document.getElementById("btn-confirm-pay").textContent = "⚡ Ir para Pagamento";

    // Reset method selection
    selectPayMethod("pix");
    UI.openModal("payment-modal");
  };

  const selectPayMethod = (method) => {
    _payState.method = method;
    ["pix","credit_card","debit_card","crypto"].forEach(m => {
      const btn = document.getElementById("pmb-" + m);
      if (btn) btn.classList.toggle("active", m === method);
    });
  };

  const confirmPayment = async () => {
    const btn = document.getElementById("btn-confirm-pay");
    btn.textContent = "Criando pagamento…"; btn.disabled = true;
    try {
      const data = await POST("/api/payments/create", {
        package_id: _payState.packageId,
        method: _payState.method,
      });
      _payState.paymentId = data.payment_id;

      // Open checkout in new tab
      if (data.invoice_url) {
        window.open(data.invoice_url, "_blank");
      }

      btn.style.display = "none";
      document.getElementById("pay-status-area").style.display = "block";
      UI.setHtml("pay-status-msg", "Aguardando confirmação do pagamento…");

      // Poll status
      _pollPayment();

    } catch (err) {
      btn.textContent = "⚡ Ir para Pagamento"; btn.disabled = false;
      if (err.status === 503) {
        UI.toastWarn(err.message || "Gateway não configurado.");
      } else {
        UI.toastError(err.message || "Erro ao criar pagamento.");
      }
    }
  };

  const _pollPayment = () => {
    if (_payState.pollTimer) clearInterval(_payState.pollTimer);
    let attempts = 0;
    _payState.pollTimer = setInterval(async () => {
      attempts++;
      if (attempts > 120) { clearInterval(_payState.pollTimer); return; } // 10 min max
      try {
        const data = await GET(`/api/payments/${_payState.paymentId}/status`);
        const s = data.status;
        const msgs = {
          pending:    "⏳ Aguardando abertura do pagamento…",
          waiting:    "⌛ Aguardando recebimento…",
          confirming: "🔄 Confirmando na rede…",
          confirmed:  "✅ Confirmado! Liberando créditos…",
          finished:   "🎉 Pagamento concluído!",
          failed:     "❌ Falha no pagamento.",
          expired:    "⏰ Pagamento expirado.",
          refunded:   "↩️ Reembolsado.",
        };
        UI.setHtml("pay-status-msg", msgs[s] || `Status: ${s}`);

        if (s === "finished" || s === "confirmed") {
          clearInterval(_payState.pollTimer);
          State.setCredits(data.balance);
          setTimeout(() => {
            UI.closeModal("payment-modal");
            UI.toastSuccess(`💎 Créditos adicionados com sucesso!`);
          }, 1800);
        }
        if (s === "failed" || s === "expired") {
          clearInterval(_payState.pollTimer);
          document.getElementById("btn-confirm-pay").style.display = "";
          document.getElementById("btn-confirm-pay").disabled = false;
          document.getElementById("btn-confirm-pay").textContent = "🔄 Tentar novamente";
          document.getElementById("pay-status-area").style.display = "none";
        }
      } catch { /* keep polling */ }
    }, 5000);
  };

  // ---- ADMIN ----
  let _adminTab = "config";

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
    // Load stats
    try {
      const s = await GET("/api/admin/stats");
      UI.setText("adm-stat-users",    s.users);
      UI.setText("adm-stat-jobs",     s.active_jobs);
      UI.setText("adm-stat-payments", s.finished_payments);
    } catch {}
    // Load config
    try {
      const c = await GET("/api/admin/config/raw");
      const cfg = c.config || {};
      UI.setVal("adm-api-key",    ""); // Never pre-fill secrets — force re-entry
      UI.setVal("adm-ipn-secret", "");
      UI.setVal("adm-wallet",     cfg.receiving_wallet    || "");
      UI.setVal("adm-currency",   cfg.receiving_currency  || "usdttrc20");
      UI.setVal("adm-sandbox",    cfg.nowpayments_sandbox || "true");
    } catch {}
  };

  const adminSaveConfig = async () => {
    const apiKey    = UI.val("adm-api-key");
    const ipnSecret = UI.val("adm-ipn-secret");
    const wallet    = UI.val("adm-wallet");
    const currency  = UI.val("adm-currency");
    const sandbox   = UI.val("adm-sandbox");

    const payload = { receiving_wallet: wallet, receiving_currency: currency, nowpayments_sandbox: sandbox };
    if (apiKey)    payload.nowpayments_api_key    = apiKey;
    if (ipnSecret) payload.nowpayments_ipn_secret = ipnSecret;

    try {
      const r = await POST("/api/admin/config", payload);
      UI.toastSuccess(r.message || "Configurações salvas!");
      // Clear secret fields after save
      UI.setVal("adm-api-key", ""); UI.setVal("adm-ipn-secret", "");
    } catch (err) {
      UI.toastError(err.message || "Erro ao salvar.");
    }
  };

  const adminTestConnection = async () => {
    try {
      const r = await POST("/api/admin/test-nowpayments", {});
      if (r.ok) UI.toastSuccess(`✅ Conexão OK: ${r.message}`);
      else       UI.toastError(`❌ Falha: ${r.error || r.message}`);
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

  const renderProfilePage = async () => {
    const user = State.getUser(); if (!user) return;
    UI.setText("profile-name-el",  user.name);
    UI.setText("profile-avatar-el", user.name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase());
    UI.setText("profile-role-el",  "// "+(user.role||"DESENVOLVEDOR").toUpperCase());
    UI.setText("profile-bio-el",   user.bio||"");
    const sc=["tag-blue","tag-green","tag-purple","tag-orange","tag-pink"];
    const se=document.getElementById("profile-tags");
    if (se&&user.skills?.length) se.innerHTML=user.skills.map((s,i)=>`<span class="tag ${sc[i%sc.length]}">${UI.esc(s)}</span>`).join("");
    try {
      const data = await GET("/api/profile");
      renderExpFromData(data.experiences||[]); renderPortFromData(data.portfolio||[]); renderAppsFromData(data.applications||[]);
    } catch { renderExperienceList(); renderPortfolioGrid(); renderAppliedJobsList(); }
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
  const renderExperienceList = () => { const el=document.getElementById("exp-list"),exps=State.getExperiences(); if(!el)return; el.innerHTML=exps.length?exps.map(e=>UI.renderExpItem(e)).join(""):UI.emptyState("💼","Sem experiências","Adicione sua trajetória."); };
  const renderPortfolioGrid  = () => { const el=document.getElementById("portfolio-grid"),items=State.getPortfolio(); if(!el)return; el.innerHTML=items.length?items.map(p=>UI.renderPortfolioItem(p)).join(""):UI.emptyState("🗂️","Sem projetos","Adicione seus projetos."); };
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

  const initEvents = () => {
    Events.on("credits:change", (c) => { UI.setText("credits-val",c); UI.setText("profile-credits-num",c); const e=document.getElementById("pj-credits-balance"); if(e)e.textContent=c+" créditos"; });
    Events.on("auth:change", (user) => {
      if (user) {
        UI.hide("nav-login-btn"); UI.hide("nav-register-btn");
        document.getElementById("credits-display").style.display="flex";
        document.getElementById("nav-avatar").style.display="flex";
        UI.setText("nav-avatar",user.name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase());
        UI.setText("credits-val",State.getCredits());
        const adminBtn = document.getElementById("nav-admin-btn");
        if (adminBtn) adminBtn.style.display = user.is_admin ? "" : "none";
      } else {
        document.getElementById("nav-login-btn").style.display="";
        document.getElementById("nav-register-btn").style.display="";
        document.getElementById("credits-display").style.display="none";
        document.getElementById("nav-avatar").style.display="none";
        const adminBtn = document.getElementById("nav-admin-btn");
        if (adminBtn) adminBtn.style.display = "none";
      }
    });
  };

  const checkSession = async () => { try { const d=await GET("/api/auth/me"); State.login({...d,credits:d.credits}); } catch {} };

  const init = async () => { UI.initModalOutsideClick(); initEvents(); await checkSession(); renderJobBoard(); };

  return { init, navigate, goHome, filterJobs, viewJob, applyJob, postJob, renderPostJobCreditsInfo,
           doLogin, doRegister, switchRegisterTab, buyCredits, selectPayMethod, confirmPayment,
           openEditProfile, saveProfile, addPortfolio, addExperience, renderProfilePage,
           adminTab, adminSaveConfig, adminTestConnection };
})();

document.addEventListener("DOMContentLoaded", App.init);