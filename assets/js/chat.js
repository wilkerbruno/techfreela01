const FM = (() => {
  let _convs    = [];       // todas as conversas carregadas
  let _filtered = [];       // conversas filtradas pela busca
  let _openChats = {};      // { applicationId: { pollTimer, collapsed } }
  let _myId     = null;
  let _convOpen = true;     // painel de conversas aberto?
  let _pollTimer = null;

  const _avatarHtml = (url, initials) => {
  if (url) return `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block">`;
  return initials;
};

  // ── Inicializa quando o usuário faz login ──
  const init = () => {
    // Espera o evento de auth para exibir o widget
    Events.on("auth:change", (user) => {
      const widget = document.getElementById("fm-widget");
      if (!widget) return;
      if (user) {
        _myId = user.id;
        widget.style.display = "flex";
        loadConvs();
        if (_pollTimer) clearInterval(_pollTimer);
        _pollTimer = setInterval(loadConvs, 10000); // atualiza a cada 10s
      } else {
        widget.style.display = "none";
        _myId = null;
        if (_pollTimer) clearInterval(_pollTimer);
        // Fecha todos os chats abertos
        document.getElementById("fm-chats").innerHTML = "";
        _openChats = {};
      }
    });
  };

  // ── Carrega conversas da API ──
  const loadConvs = async () => {
    try {
      const data = await fetch(window.location.origin + "/api/messages/conversations", { credentials: "include" });
      if (!data.ok) return;
      const json = await data.json();
      _convs = json.conversations || [];
      _filtered = _convs;
      renderConvList(_filtered);
      updateUnreadBadge();
      // Atualiza chats abertos silenciosamente
      Object.keys(_openChats).forEach(aid => _loadChatMsgs(parseInt(aid)));
    } catch {}
  };

  const updateUnreadBadge = () => {
    const total = _convs.reduce((s, c) => s + (c.unread || 0), 0);
    const badge = document.getElementById("fm-unread-badge");
    if (!badge) return;
    if (total > 0) { badge.textContent = total > 99 ? "99+" : total; badge.style.display = "inline"; }
    else badge.style.display = "none";
  };

  // ── Renderiza lista de conversas ──
  const renderConvList = (list) => {
    const el = document.getElementById("fm-conv-list");
    if (!el) return;
    if (!list.length) {
      el.innerHTML = `<div class="fm-empty">Nenhuma conversa ainda.</div>`;
      return;
    }
    el.innerHTML = list.map(c => {
      const other   = c.other_user || {};
      const last    = c.last_message;
      const initials = (other.name || "?").split(" ").map(n => n[0]).join("").slice(0,2).toUpperCase();
      const time    = last?.created_at ? _fmtTime(last.created_at) : "";
      const preview = last?.content || "Nenhuma mensagem";
      const hasUnread = (c.unread || 0) > 0;
      const isOpen  = !!_openChats[c.application_id];

      return `<div class="fm-conv-item ... onclick="FM.openChat(${c.application_id}, '${_esc(other.name || '?')}', '${_esc(c.job_title || '')}', '${_esc(other.avatar_url || '')}')">
        <div class="fm-avatar">${_avatarHtml(other.avatar_url, initials)}</div>
        <div class="fm-conv-info">
          <div class="fm-conv-name">${_esc(other.name || '?')}</div>
          <div class="fm-conv-preview ${hasUnread ? 'unread' : ''}">${_esc(preview)}</div>
        </div>
        <div class="fm-conv-meta">
          <span class="fm-conv-time">${time}</span>
          ${hasUnread ? `<span class="fm-badge">${c.unread}</span>` : ''}
        </div>
      </div>`;
    }).join("");
  };

  // ── Filtro de busca ──
  const filterConvs = (q) => {
    q = q.toLowerCase();
    _filtered = q ? _convs.filter(c => (c.other_user?.name || "").toLowerCase().includes(q) || (c.job_title || "").toLowerCase().includes(q)) : _convs;
    renderConvList(_filtered);
  };

  // ── Abre janela de chat ──
  const openChat = (applicationId, name, jobTitle, avatarUrl = "") => {
    // No mobile, delega para o modal existente
    if (window.innerWidth <= 768) {
      App.openChat(applicationId, name);
      return;
    }

    if (_openChats[applicationId]) {
      // Já aberto: expande se estiver minimizado
      const win = document.getElementById(`fm-chat-${applicationId}`);
      if (win) {
        const msgs = win.querySelector(".fm-chat-messages");
        const inp  = win.querySelector(".fm-chat-input-row");
        if (msgs) msgs.classList.remove("collapsed");
        if (inp)  inp.style.display = "";
        _openChats[applicationId].collapsed = false;
      }
      return;
    }

    // Máximo 3 janelas abertas
    const openIds = Object.keys(_openChats);
    if (openIds.length >= 3) closeChat(parseInt(openIds[0]));

    _openChats[applicationId] = { collapsed: false, pollTimer: null };
    _createChatWin(applicationId, name, jobTitle, avatarUrl);
    _loadChatMsgs(applicationId);
    _openChats[applicationId].pollTimer = setInterval(() => _loadChatMsgs(applicationId), 5000);

    // Marca como ativo na lista
    renderConvList(_filtered);
  };

  // ── Cria elemento da janela de chat ──
  const _createChatWin = (applicationId, name, jobTitle, avatarUrl = "") => {
    const wrap = document.getElementById("fm-chats");
    const div  = document.createElement("div");
    div.className = "fm-chat-win";
    div.id = `fm-chat-${applicationId}`;
    div.innerHTML = `
      <div class="fm-chat-header" onclick="FM.toggleChat(${applicationId})">
        <div class="fm-avatar" style="width:32px;height:32px;min-width:32px;font-size:0.7rem">${_avatarHtml(avatarUrl, name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase())}</div>
        <div class="fm-chat-title">
          <div class="fm-chat-title-name">${_esc(name)}</div>
          <div class="fm-chat-title-sub">${_esc(jobTitle)}</div>
        </div>
        <button class="fm-icon-btn" onclick="event.stopPropagation();FM.closeChat(${applicationId})">✕</button>
        <button class="fm-icon-btn" id="fm-chev-${applicationId}">▼</button>
      </div>
      <div class="fm-chat-messages" id="fm-msgs-${applicationId}">
        <div class="fm-empty">Carregando…</div>
      </div>
      <div class="fm-chat-input-row" id="fm-input-row-${applicationId}">
        <input type="file" id="fm-file-${applicationId}" style="display:none" onchange="FM.handleFileSelect(${applicationId},this)">
        <button class="fm-attach-btn" title="Anexar arquivo" onclick="document.getElementById('fm-file-${applicationId}').click()">📎</button>
        <textarea class="fm-chat-input" id="fm-input-${applicationId}" placeholder="Escreva uma mensagem…" rows="1"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();FM.sendMsg(${applicationId})}"
          oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,80)+'px'"></textarea>
        <button class="fm-send-btn" onclick="FM.sendMsg(${applicationId})">➤</button>
      </div>
      <div class="fm-file-preview" id="fm-file-preview-${applicationId}" style="display:none"></div>`;
    wrap.appendChild(div);
  };

  // ── Carrega mensagens do chat ──
  const _loadChatMsgs = async (applicationId) => {
    const el = document.getElementById(`fm-msgs-${applicationId}`);
    if (!el) return;
    try {
      const res  = await fetch(`${window.location.origin}/api/messages/${applicationId}`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      const msgs = data.messages || [];
      const wasAtBottom = el.scrollHeight - el.clientHeight <= el.scrollTop + 30;

      el.innerHTML = msgs.length ? msgs.map(m => {
        const isMe = m.sender_id === _myId;
        const time = m.created_at ? new Date(m.created_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}) : "";
        let fileHtml = "";
        if (m.file_url) {
          const mt = m.file_type || "";
          if (mt.startsWith("image/")) {
            fileHtml = `<a href="${m.file_url}" target="_blank"><img src="${m.file_url}" class="fm-img-preview" alt="${_esc(m.file_name||'imagem')}"></a>`;
          } else if (mt.startsWith("video/")) {
            fileHtml = `<video src="${m.file_url}" class="fm-video-preview" controls></video>`;
          } else {
            fileHtml = `<a href="${m.file_url}" target="_blank" class="fm-file-link" download="${_esc(m.file_name||'arquivo')}">${_fileIcon(mt)} ${_esc(m.file_name||'arquivo')}</a>`;
          }
        }
        return `<div class="fm-msg-row ${isMe ? 'me' : 'them'}">
          <div class="fm-bubble">
            ${fileHtml}
            ${m.content ? `<span>${_esc(m.content)}</span>` : ""}
          </div>
          <div class="fm-msg-time">${time}</div>
        </div>`;
      }).join("") : `<div class="fm-empty">Nenhuma mensagem ainda. Diga olá! 👋</div>`;

      if (wasAtBottom) el.scrollTop = el.scrollHeight;
    } catch {}
  };

  // ── Arquivo pendente por chat ──
  const _pendingFiles = {};

  const handleFileSelect = (applicationId, input) => {
    const file = input.files[0];
    if (!file) return;
    _pendingFiles[applicationId] = file;
    const preview = document.getElementById(`fm-file-preview-${applicationId}`);
    if (preview) {
      preview.style.display = "flex";
      preview.innerHTML = `
        <span class="fm-file-chip">
          ${_fileIcon(file.type)} ${_esc(file.name)}
          <button onclick="FM.clearFile(${applicationId})" style="background:none;border:none;color:inherit;cursor:pointer;margin-left:4px;font-size:0.85rem">✕</button>
        </span>`;
    }
    input.value = "";
  };

  const clearFile = (applicationId) => {
    delete _pendingFiles[applicationId];
    const preview = document.getElementById(`fm-file-preview-${applicationId}`);
    if (preview) { preview.style.display = "none"; preview.innerHTML = ""; }
  };

  const _fileIcon = (mimeType) => {
    if (!mimeType) return "📄";
    if (mimeType.startsWith("image/")) return "🖼️";
    if (mimeType.startsWith("video/")) return "🎬";
    if (mimeType.startsWith("audio/")) return "🎵";
    if (mimeType.includes("pdf"))      return "📑";
    if (mimeType.includes("zip") || mimeType.includes("rar")) return "🗜️";
    return "📄";
  };

  // ── Envia mensagem ──
  const sendMsg = async (applicationId) => {
    const inp     = document.getElementById(`fm-input-${applicationId}`);
    const content = (inp?.value || "").trim();
    const file    = _pendingFiles[applicationId];

    if (!content && !file) return;

    // Desabilita botão temporariamente
    const sendBtn = document.querySelector(`#fm-chat-${applicationId} .fm-send-btn`);
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = "…"; }

    if (inp) { inp.value = ""; inp.style.height = "auto"; }

    let fileUrl = null, fileName = null, fileType = null;

    // Upload do arquivo se houver
    if (file) {
      clearFile(applicationId);
      try {
        const form = new FormData();
        form.append("file", file);
        const res  = await fetch(`${window.location.origin}/api/messages/upload`, {
          method: "POST", credentials: "include", body: form,
        });
        if (res.ok) {
          const data = await res.json();
          fileUrl  = data.file_url;
          fileName = data.file_name;
          fileType = data.file_type;
        }
      } catch { /* continua sem arquivo se upload falhar */ }
    }

    try {
      await fetch(`${window.location.origin}/api/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ application_id: applicationId, content, file_url: fileUrl, file_name: fileName, file_type: fileType }),
      });
      await _loadChatMsgs(applicationId);
      loadConvs();
    } catch {}

    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = "➤"; }
  };

  // ── Minimiza/expande janela de chat ──
  const toggleChat = (applicationId) => {
    const msgs = document.getElementById(`fm-msgs-${applicationId}`);
    const row  = document.getElementById(`fm-input-row-${applicationId}`);
    const chev = document.getElementById(`fm-chev-${applicationId}`);
    if (!msgs) return;
    const collapsed = msgs.classList.toggle("collapsed");
    if (row)  row.style.display  = collapsed ? "none" : "";
    if (chev) chev.textContent   = collapsed ? "▲" : "▼";
    if (_openChats[applicationId]) _openChats[applicationId].collapsed = collapsed;
  };

  // ── Fecha janela de chat ──
  const closeChat = (applicationId) => {
    if (_openChats[applicationId]?.pollTimer) clearInterval(_openChats[applicationId].pollTimer);
    delete _openChats[applicationId];
    const win = document.getElementById(`fm-chat-${applicationId}`);
    if (win) win.remove();
    renderConvList(_filtered);
  };

  // ── Minimiza/expande painel de conversas ──
  const toggleConversations = () => {
    _convOpen = !_convOpen;
    const body = document.getElementById("fm-conv-body");
    const chev = document.getElementById("fm-conv-chevron");
    if (body) body.classList.toggle("collapsed", !_convOpen);
    if (chev) chev.textContent = _convOpen ? "▲" : "▼";
  };

  // ── Helpers ──
  const _esc = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const _fmtTime = (iso) => {
    const d = new Date(iso), now = new Date(), diff = (now - d) / 3600000;
    if (diff < 1)  return "Agora";
    if (diff < 24) return `${Math.floor(diff)}h`;
    if (diff < 48) return "Ontem";
    return d.toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit" });
  };

  // Esconde o widget inicialmente (aparece só após login)
  document.getElementById("fm-widget").style.display = "none";

  const open = () => {
    if (!_convOpen) toggleConversations();
  };

  return { init, loadConvs, openChat, closeChat, toggleChat, toggleConversations, filterConvs, sendMsg, handleFileSelect, clearFile, open };
})();

// Inicializa o FM junto com o App
document.addEventListener("DOMContentLoaded", () => { FM.init(); });