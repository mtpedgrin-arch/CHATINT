import { useState, useEffect, useRef, useCallback } from 'react';
import { getChats, getChatMessages, sendChatMessage, resolveChat, markChatRead, archiveChat, getChatLabels, getProcessingMode, updateProcessingMode, enableChatOptions, updateChatNota, getChatPayments, approvePayment, rejectPayment, casinoCreateUser, casinoDeposit, casinoWithdraw, casinoGetBalance } from '../api';
import { getSocket, joinAsAgent } from '../socket';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

function getChatId(c) { return c.id || c._id; }
function getMsgId(m) { return m.id || m._id; }

function Chats() {
  const { user } = useAuth();
  const { toast } = useToast();

  // State
  const [chats, setChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [chatMode, setChatMode] = useState('manual');
  const [labels, setLabels] = useState([]);
  const [typing, setTyping] = useState(null);
  const [infoTab, setInfoTab] = useState('info');
  const [nota, setNota] = useState('');
  const [chatPayments, setChatPayments] = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  // Casino state
  const [casinoBalance, setCasinoBalance] = useState(null);
  const [casinoLoading, setCasinoLoading] = useState(false);
  const [casinoAmount, setCasinoAmount] = useState('');
  const [casinoAction, setCasinoAction] = useState(null); // 'deposit' | 'withdraw' | 'create'
  const [casinoResult, setCasinoResult] = useState(null);
  const msgEndRef = useRef(null);
  const typingTimeout = useRef(null);
  const selectedChatIdRef = useRef(selectedChatId);

  // Keep ref in sync with state
  useEffect(() => { selectedChatIdRef.current = selectedChatId; }, [selectedChatId]);

  // Get selected chat object
  const selectedChat = chats.find(c => getChatId(c) === selectedChatId);

  // Load initial data
  useEffect(() => {
    loadChats();
    loadLabels();
    loadProcessingMode();
    const socket = getSocket();
    if (user) joinAsAgent(user.id || user.usuario);

    socket.on('message:new', handleNewMessage);
    socket.on('chat:updated', handleChatUpdated);
    socket.on('chat:resolved', handleChatResolved);
    socket.on('typing:start', handleTypingStart);
    socket.on('typing:stop', handleTypingStop);
    socket.on('payment:new', loadPaymentsForChat);
    socket.on('payment:approved', loadPaymentsForChat);
    socket.on('payment:rejected', loadPaymentsForChat);

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('chat:updated', handleChatUpdated);
      socket.off('chat:resolved', handleChatResolved);
      socket.off('typing:start', handleTypingStart);
      socket.off('typing:stop', handleTypingStop);
      socket.off('payment:new', loadPaymentsForChat);
      socket.off('payment:approved', loadPaymentsForChat);
      socket.off('payment:rejected', loadPaymentsForChat);
    };
  }, []);

  // Scroll on new messages - always stay at bottom
  useEffect(() => {
    requestAnimationFrame(() => {
      msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
  }, [messages]);

  // Also scroll when selecting a different chat
  useEffect(() => {
    if (selectedChatId) {
      setTimeout(() => {
        msgEndRef.current?.scrollIntoView({ behavior: 'instant' });
      }, 50);
    }
  }, [selectedChatId]);

  // Load payments when switching to payments tab or selecting new chat
  useEffect(() => {
    if (selectedChatId && infoTab === 'payments') {
      loadPaymentsForCurrentChat();
    }
  }, [selectedChatId, infoTab]);

  // Functions
  async function loadChats() { try { setChats(await getChats()); } catch(e) {} }
  async function loadLabels() { try { setLabels(await getChatLabels()); } catch(e) {} }
  async function loadProcessingMode() {
    try {
      const r = await getProcessingMode();
      setChatMode(r.mode === 'ai' ? 'auto' : 'manual');
    } catch(e) {}
  }

  async function loadPaymentsForCurrentChat(chatId) {
    const cid = chatId || selectedChatIdRef.current;
    if (!cid) return;
    setLoadingPayments(true);
    try { setChatPayments(await getChatPayments(cid)); } catch(e) {}
    setLoadingPayments(false);
  }

  function loadPaymentsForChat() {
    const cid = selectedChatIdRef.current;
    if (cid) loadPaymentsForCurrentChat(cid);
    loadChats();
  }

  async function selectChat(chat) {
    const id = getChatId(chat);
    setSelectedChatId(id);
    setInfoTab('info');
    setNota(chat.nota || '');
    setChatPayments([]);
    try {
      const msgs = await getChatMessages(id);
      setMessages(msgs);
      await markChatRead(id);
      setChats(prev => prev.map(c => getChatId(c) === id ? { ...c, unread: 0 } : c));
    } catch(e) {}
  }

  async function handleSend() {
    if (!newMsg.trim() || !selectedChatId) return;
    const text = newMsg.trim();
    setNewMsg('');

    // Optimistic add
    const tempMsg = {
      id: 'temp-' + Date.now(),
      chatId: selectedChatId,
      sender: 'agent',
      senderName: user?.nombre || user?.usuario || 'Agente',
      text,
      type: 'text',
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempMsg]);

    const socket = getSocket();
    socket.emit('agent:message', {
      chatId: selectedChatId,
      text,
      agentName: user?.nombre || user?.usuario || 'Agente',
    });
    socket.emit('agent:stop-typing', { chatId: selectedChatId });
  }

  function handleNewMessage(msg) {
    const currentChatId = selectedChatIdRef.current;
    if (msg.chatId === currentChatId) {
      setMessages(prev => {
        if (prev.some(m => getMsgId(m) === getMsgId(msg))) return prev;
        const withoutTemp = prev.filter(m => !(m.id?.startsWith('temp-') && m.text === msg.text && m.sender === msg.sender));
        return [...withoutTemp, msg];
      });
    }
    setChats(prev => prev.map(c => {
      if (getChatId(c) === msg.chatId) {
        return {
          ...c,
          lastMessage: msg.text?.substring(0, 100),
          lastMessageAt: msg.timestamp,
          unread: msg.chatId !== currentChatId && msg.sender === 'visitor' ? (c.unread || 0) + 1 : c.unread,
        };
      }
      return c;
    }));
  }

  function handleChatUpdated(data) { loadChats(); }
  function handleChatResolved(data) {
    if (data.chatId === selectedChatIdRef.current) {
      setChats(prev => prev.map(c => getChatId(c) === data.chatId ? { ...c, status: 'resolved' } : c));
    }
    loadChats();
  }
  function handleTypingStart(data) { if (data.chatId === selectedChatIdRef.current) setTyping(data); }
  function handleTypingStop(data) { if (data?.chatId === selectedChatIdRef.current) setTyping(null); }

  function handleInputChange(e) {
    setNewMsg(e.target.value);
    const socket = getSocket();
    socket.emit('agent:typing', { chatId: selectedChatId, agentName: user?.nombre || 'Agente' });
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socket.emit('agent:stop-typing', { chatId: selectedChatId });
    }, 2000);
  }

  async function handleToggleMode() {
    const newMode = chatMode === 'manual' ? 'auto' : 'manual';
    setChatMode(newMode);
    try { await updateProcessingMode(newMode === 'auto' ? 'ai' : 'manual'); } catch(e) {}
  }

  async function handleEnableOptions() {
    if (!selectedChatId) return;
    try {
      await enableChatOptions(selectedChatId);
      toast('Opciones habilitadas', 'success');
      loadChats();
    } catch(e) { toast('Error habilitando opciones', 'error'); }
  }

  async function handleFinalize(chatId) {
    const id = chatId || selectedChatId;
    if (!id) return;
    try {
      await enableChatOptions(id);
      loadChats();
    } catch(e) { toast('Error finalizando chat', 'error'); }
  }

  async function handleSaveNota() {
    if (!selectedChatId) return;
    try {
      await updateChatNota(selectedChatId, nota);
      toast('Nota guardada', 'success');
    } catch(e) { toast('Error guardando nota', 'error'); }
  }

  async function handleApprovePayment(paymentId) {
    try {
      await approvePayment(paymentId, { adminName: user?.nombre || user?.usuario });
      toast('Pago aprobado', 'success');
      loadPaymentsForCurrentChat();
      loadChats();
    } catch(e) { toast('Error aprobando pago', 'error'); }
  }

  async function handleRejectPayment(paymentId) {
    try {
      await rejectPayment(paymentId, { adminName: user?.nombre || user?.usuario, reason: 'Rechazado por admin' });
      toast('Pago rechazado', 'success');
      loadPaymentsForCurrentChat();
      loadChats();
    } catch(e) { toast('Error rechazando pago', 'error'); }
  }

  // Casino functions
  async function loadCasinoBalance() {
    if (!selectedChat?.casinoUsername) { setCasinoBalance(null); return; }
    setCasinoLoading(true);
    try {
      const r = await casinoGetBalance(selectedChat.casinoUsername);
      if (r.success) setCasinoBalance(r.balance);
      else setCasinoBalance(null);
    } catch { setCasinoBalance(null); }
    setCasinoLoading(false);
  }

  async function handleCasinoCreate() {
    if (!selectedChat) return;
    setCasinoLoading(true);
    setCasinoResult(null);
    try {
      const nombre = selectedChat.visitorName || 'user';
      const telefono = selectedChat.visitorPhone || String(Date.now()).slice(-7);
      const r = await casinoCreateUser(nombre, telefono);
      if (r.success && r.user) {
        setCasinoResult({ type: 'success', msg: `Usuario creado: ${r.user.username}` });
        // Auto-send credentials via chat
        const credMsg = `Tu usuario es: ${r.user.username}\nTu clave es: ${r.user.password}`;
        const socket = getSocket();
        socket.emit('agent:message', { chatId: selectedChatId, text: credMsg, agentName: 'Sistema' });
        // Update chat with casino username
        setChats(prev => prev.map(c => getChatId(c) === selectedChatId ? { ...c, casinoUsername: r.user.username } : c));
        setTimeout(loadCasinoBalance, 1000);
      } else {
        setCasinoResult({ type: 'error', msg: r.error || 'Error creando usuario' });
      }
    } catch (e) { setCasinoResult({ type: 'error', msg: 'Error de conexion' }); }
    setCasinoLoading(false);
  }

  async function handleCasinoDeposit() {
    if (!selectedChat?.casinoUsername || !casinoAmount) return;
    const amount = parseFloat(casinoAmount);
    if (isNaN(amount) || amount <= 0) { setCasinoResult({ type: 'error', msg: 'Monto invalido' }); return; }
    setCasinoLoading(true);
    setCasinoResult(null);
    try {
      const r = await casinoDeposit(selectedChat.casinoUsername, amount);
      if (r.success) {
        setCasinoResult({ type: 'success', msg: `+${amount} ARS depositadas` });
        setCasinoAmount('');
        loadCasinoBalance();
      } else {
        setCasinoResult({ type: 'error', msg: r.error || 'Error al depositar' });
      }
    } catch { setCasinoResult({ type: 'error', msg: 'Error de conexion' }); }
    setCasinoLoading(false);
  }

  async function handleCasinoWithdraw() {
    if (!selectedChat?.casinoUsername || !casinoAmount) return;
    const amount = parseFloat(casinoAmount);
    if (isNaN(amount) || amount <= 0) { setCasinoResult({ type: 'error', msg: 'Monto invalido' }); return; }
    setCasinoLoading(true);
    setCasinoResult(null);
    try {
      const r = await casinoWithdraw(selectedChat.casinoUsername, amount);
      if (r.success) {
        setCasinoResult({ type: 'success', msg: `-${amount} ARS retiradas` });
        setCasinoAmount('');
        loadCasinoBalance();
      } else {
        setCasinoResult({ type: 'error', msg: r.error || 'Error al retirar' });
      }
    } catch { setCasinoResult({ type: 'error', msg: 'Error de conexion' }); }
    setCasinoLoading(false);
  }

  // Load casino balance when switching to casino tab or selecting chat
  useEffect(() => {
    if (selectedChatId && infoTab === 'casino') {
      loadCasinoBalance();
      setCasinoResult(null);
      setCasinoAmount('');
    }
  }, [selectedChatId, infoTab]);

  // Helpers
  function timeAgo(ts) {
    if (!ts) return '';
    const diff = (Date.now() - new Date(ts).getTime()) / 1000;
    if (diff < 60) return 'Ahora';
    if (diff < 3600) return Math.floor(diff / 60) + 'm';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h';
    return Math.floor(diff / 86400) + 'd';
  }

  function formatTime(ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }

  function getStatusLabel(s) {
    const map = { bot: 'Bot', waiting: 'Espera', active: 'Activo', resolved: 'Resuelto' };
    return map[s] || s;
  }

  function getStateLabel(s) {
    const map = {
      welcome: 'Bienvenida', options: 'Opciones', carga_cuenta: 'Carga - Cuenta',
      carga_comprobante: 'Carga - Comprobante', carga_verificando: 'Verificando',
      carga_nombre: 'Pidiendo nombre', carga_cuit: 'Pidiendo CUIT',
      retiro_datos: 'Retiro - Datos', retiro_procesando: 'Retiro - Procesando',
      soporte: 'Soporte', cuponera: 'Cuponera', idle: 'Idle'
    };
    return map[s] || s;
  }

  // Auto-tag based on chat state
  function getStateTag(state) {
    if (!state) return null;
    if (state.startsWith('carga')) return { label: 'Carga', color: '#22c55e' };
    if (state.startsWith('retiro')) return { label: 'Retiro', color: '#f59e0b' };
    if (state === 'soporte') return { label: 'Soporte', color: '#3b82f6' };
    if (state === 'cuponera') return { label: 'Cuponera', color: '#a855f7' };
    return null;
  }

  // Check if chat is in an active flow that can be finalized
  function canFinalize(state) {
    return state && !['options', 'welcome', 'idle'].includes(state);
  }

  // Filter chats
  const filteredChats = chats.filter(c => {
    if (activeFilter === 'unread' && !c.unread) return false;
    if (activeFilter === 'archived' && !c.archived) return false;
    if (activeFilter !== 'archived' && c.archived) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (c.visitorName || '').toLowerCase().includes(q) || (c.casinoUsername || '').toLowerCase().includes(q);
    }
    return true;
  });

  // Render
  return (
    <div className="chat-layout">
      {/* LEFT: Chat list */}
      <div className="chat-sidebar">
        {/* Mode toggle */}
        <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <div className="toggle-switch" onClick={handleToggleMode}>
              <input type="checkbox" checked={chatMode === 'auto'} readOnly />
              <span className="toggle-slider"></span>
            </div>
            <span style={{ color: chatMode === 'auto' ? 'var(--green)' : 'var(--gold)' }}>
              {chatMode === 'auto' ? 'Automatico' : 'Manual'}
            </span>
          </label>
          <button className="btn btn-sm btn-outline" onClick={loadChats} title="Recargar">&#x27F3;</button>
        </div>

        {/* Search */}
        <div style={{ padding: '8px 12px' }}>
          <input className="msg-input" placeholder="Buscar un chat..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: '100%', fontSize: 13 }} />
        </div>

        {/* Filter tabs */}
        <div className="tab-group" style={{ padding: '0 12px 8px', gap: 4 }}>
          {['all', 'unread', 'archived'].map(f => (
            <button key={f} className={`tab-btn${activeFilter === f ? ' active' : ''}`} onClick={() => setActiveFilter(f)} style={{ fontSize: 11, padding: '4px 10px' }}>
              {f === 'all' ? 'Todos' : f === 'unread' ? 'No leidos' : 'Archivados'}
            </button>
          ))}
        </div>

        {/* Chat list */}
        <div className="chat-list">
          {filteredChats.map(chat => {
            const id = getChatId(chat);
            const isActive = id === selectedChatId;
            return (
              <div key={id} className={`chat-item${isActive ? ' active' : ''}`} onClick={() => selectChat(chat)}>
                <div className="chat-item-avatar">
                  {(chat.visitorName || chat.casinoUsername || '?').charAt(0).toUpperCase()}
                  {chat.status === 'active' && <span className="online-dot" />}
                </div>
                <div className="chat-item-info">
                  <div className="chat-item-name">
                    {chat.casinoUsername || chat.visitorName || 'Visitante'}
                    {getStateTag(chat.state) && (
                      <span style={{ marginLeft: 6, fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: getStateTag(chat.state).color, color: '#fff' }}>
                        {getStateTag(chat.state).label}
                      </span>
                    )}
                    {canFinalize(chat.state) && (
                      <span
                        onClick={(e) => { e.stopPropagation(); handleFinalize(getChatId(chat)); }}
                        style={{ marginLeft: 4, fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: '#3b82f6', color: '#fff', cursor: 'pointer' }}
                      >
                        Finalizar
                      </span>
                    )}
                  </div>
                  <div className="chat-item-preview">{chat.lastMessage || 'Sin mensajes'}</div>
                </div>
                <div className="chat-item-meta">
                  <span className="chat-item-time">{timeAgo(chat.lastMessageAt)}</span>
                  {chat.unread > 0 && <span className="chat-badge">{chat.unread}</span>}
                  {chat.pendingPayments > 0 && <span className="chat-badge" style={{ background: 'var(--orange)' }}>{chat.pendingPayments}</span>}
                </div>
              </div>
            );
          })}
          {filteredChats.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No hay chats</div>
          )}
        </div>
      </div>

      {/* CENTER: Messages */}
      <div className="chat-main">
        {selectedChat ? (
          <>
            {/* Chat header */}
            <div className="info-header" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="chat-item-avatar" style={{ width: 36, height: 36, fontSize: 14 }}>
                  {(selectedChat.casinoUsername || selectedChat.visitorName || '?').charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{selectedChat.casinoUsername || selectedChat.visitorName}</div>
                  <div style={{ fontSize: 11, color: selectedChat.status === 'active' ? 'var(--green)' : 'var(--text-muted)' }}>
                    {selectedChat.status === 'active' ? 'En linea' : getStatusLabel(selectedChat.status)}
                  </div>
                </div>
                {getStateTag(selectedChat.state) && (
                  <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 10, fontWeight: 600, background: getStateTag(selectedChat.state).color, color: '#fff' }}>
                    {getStateTag(selectedChat.state).label}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {chatMode === 'manual' && <span className="tag tag-yellow" style={{ fontWeight: 600 }}>PAGOS MANUALES</span>}
                <button className="btn btn-sm btn-outline" onClick={() => resolveChat(selectedChatId).then(loadChats)} title="Resolver">&#x2713;</button>
                <button className="btn btn-sm btn-outline" onClick={() => archiveChat(selectedChatId).then(loadChats)} title="Archivar">&#x1F4E6;</button>
              </div>
            </div>

            {/* Messages area */}
            <div className="msg-area">
              <div className="msg-list">
                {messages.map(msg => (
                  <div key={getMsgId(msg)} className={`msg ${msg.sender}`}>
                    {msg.sender === 'bot' && <div className="msg-sender">Casino 463</div>}
                    {msg.sender === 'agent' && <div className="msg-sender">{msg.senderName}</div>}
                    {msg.type === 'image' ? (
                      <div className="msg-bubble msg-image" style={{ padding: 4, background: 'transparent' }}>
                        <img
                          src={msg.text}
                          alt="Comprobante"
                          style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8, cursor: 'pointer', display: 'block' }}
                          onClick={() => window.open(msg.text, '_blank')}
                        />
                      </div>
                    ) : (
                      <div className="msg-bubble">{msg.text}</div>
                    )}
                    <div className="msg-time">{formatTime(msg.timestamp)}</div>
                  </div>
                ))}
                {typing && <div className="msg visitor"><div className="msg-bubble" style={{ opacity: 0.5 }}>Escribiendo...</div></div>}
                <div ref={msgEndRef} />
              </div>
            </div>

            {/* Message input */}
            <div className="msg-input-bar">
              <input className="msg-input" placeholder="Escribe un mensaje..." value={newMsg} onChange={handleInputChange} onKeyDown={e => e.key === 'Enter' && handleSend()} />
              <button className="msg-send-btn" onClick={handleSend} disabled={!newMsg.trim()}>&#x27A4;</button>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: 16 }}>
            <div style={{ fontSize: 48, opacity: 0.3 }}>&#x1F4AC;</div>
            <div style={{ fontSize: 15 }}>Selecciona un chat para comenzar</div>
          </div>
        )}
      </div>

      {/* RIGHT: Info panel */}
      <div className="chat-info-panel">
        {selectedChat ? (
          <>
            {/* Info panel tabs */}
            <div className="tab-group" style={{ padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <button className={`tab-btn${infoTab === 'info' ? ' active' : ''}`} onClick={() => setInfoTab('info')} style={{ fontSize: 11 }}>INFORMACION</button>
              <button className={`tab-btn${infoTab === 'payments' ? ' active' : ''}`} onClick={() => setInfoTab('payments')} style={{ fontSize: 11 }}>
                PAGOS {selectedChat.pendingPayments > 0 && <span className="chat-badge" style={{ marginLeft: 4 }}>{selectedChat.pendingPayments}</span>}
              </button>
              <button className={`tab-btn${infoTab === 'casino' ? ' active' : ''}`} onClick={() => setInfoTab('casino')} style={{ fontSize: 11, color: infoTab === 'casino' ? '#D4A843' : undefined }}>CASINO</button>
              <button className={`tab-btn${infoTab === 'multimedia' ? ' active' : ''}`} onClick={() => setInfoTab('multimedia')} style={{ fontSize: 11 }}>MEDIA</button>
            </div>

            {infoTab === 'info' && (
              <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', flex: 1 }}>
                <div className="info-field">
                  <div className="info-label">Usuario</div>
                  <div className="info-value">{selectedChat.casinoUsername || '\u2014'}</div>
                </div>
                <div className="info-field">
                  <div className="info-label">Nombre</div>
                  <div className="info-value">{selectedChat.visitorName || '\u2014'}</div>
                </div>
                <div className="info-field">
                  <div className="info-label">Telefono</div>
                  <div className="info-value">{selectedChat.visitorPhone || '\u2014'}</div>
                </div>
                <div className="info-field">
                  <div className="info-label">Canal</div>
                  <div className="info-value" style={{ textTransform: 'capitalize' }}>{selectedChat.channel || '\u2014'}</div>
                </div>
                <div className="info-field">
                  <div className="info-label">Estado del flujo</div>
                  <div className="info-value">
                    <span className="tag tag-blue" style={{ fontSize: 10 }}>{getStateLabel(selectedChat.state)}</span>
                  </div>
                </div>
                <div className="info-field">
                  <div className="info-label">Etiquetas</div>
                  <div className="info-value">
                    {(selectedChat.tags || []).length > 0
                      ? selectedChat.tags.map(t => <span key={t} className="tag tag-yellow" style={{ marginRight: 4 }}>{t}</span>)
                      : <span style={{ color: 'var(--text-muted)' }}>Sin asignar</span>
                    }
                  </div>
                </div>
                <div className="info-field">
                  <div className="info-label">Fecha registro</div>
                  <div className="info-value">{selectedChat.createdAt ? new Date(selectedChat.createdAt).toLocaleString('es-AR') : '\u2014'}</div>
                </div>

                {/* Nota */}
                <div className="info-field">
                  <div className="info-label">Nota</div>
                  <textarea value={nota} onChange={e => setNota(e.target.value)} placeholder="Agrega una nota interna sobre el cliente..." style={{ width: '100%', minHeight: 60, background: 'var(--bg-input)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 8, color: 'var(--text)', fontSize: 12, resize: 'vertical' }} />
                  <button className="btn btn-gold btn-sm" onClick={handleSaveNota} style={{ marginTop: 6, width: '100%' }}>GUARDAR NOTA</button>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  {canFinalize(selectedChat.state) ? (
                    <button className="btn" onClick={() => handleFinalize()} style={{ width: '100%', background: '#3b82f6', color: '#fff', fontWeight: 700 }}>FINALIZAR CHAT</button>
                  ) : (
                    <button className="btn btn-outline" onClick={handleEnableOptions} style={{ width: '100%' }}>HABILITAR OPCIONES</button>
                  )}
                  <button className="btn btn-gold" onClick={() => setInfoTab('payments')} style={{ width: '100%' }}>
                    VERIFICAR PAGOS {selectedChat.pendingPayments > 0 && `(${selectedChat.pendingPayments})`}
                  </button>
                </div>
              </div>
            )}

            {infoTab === 'payments' && (
              <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)' }}>Pagos del chat</div>
                {loadingPayments && <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Cargando...</div>}
                {!loadingPayments && chatPayments.length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: 20 }}>No hay pagos registrados</div>
                )}
                {chatPayments.map(p => (
                  <div key={p.id} style={{ background: 'var(--bg-input)', borderRadius: 10, padding: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>${p.amount?.toLocaleString()} ARS</span>
                      <span className={`tag ${p.status === 'approved' ? 'tag-green' : p.status === 'rejected' ? 'tag-red' : p.status === 'pending' ? 'tag-yellow' : 'tag-blue'}`} style={{ fontSize: 9 }}>
                        {p.status === 'approved' ? 'Aprobado' : p.status === 'rejected' ? 'Rechazado' : p.status === 'pending' ? 'Pendiente' : p.status}
                      </span>
                    </div>
                    {p.aiConfidence > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--text-sec)', marginBottom: 4 }}>
                        Confianza AI: <span style={{ color: p.aiConfidence >= 90 ? 'var(--green)' : p.aiConfidence >= 70 ? 'var(--yellow)' : 'var(--red)', fontWeight: 600 }}>{p.aiConfidence}%</span>
                      </div>
                    )}
                    {p.comprobante?.extractedData && (
                      <div style={{ fontSize: 11, color: 'var(--text-sec)', marginBottom: 6 }}>
                        {p.comprobante.extractedData.transactionId && <div>TX: {p.comprobante.extractedData.transactionId}</div>}
                        {p.comprobante.extractedData.senderName && <div>Remitente: {p.comprobante.extractedData.senderName}</div>}
                        {p.comprobante.extractedData.bankName && <div>Banco: {p.comprobante.extractedData.bankName}</div>}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{new Date(p.createdAt).toLocaleString('es-AR')}</div>
                    {/* Action buttons for pending payments */}
                    {(p.status === 'pending' || p.status === 'processing') && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <button className="btn btn-sm" style={{ flex: 1, background: 'var(--green)', color: '#000', fontWeight: 600 }} onClick={() => handleApprovePayment(p.id)}>Aprobar</button>
                        <button className="btn btn-sm btn-danger" style={{ flex: 1 }} onClick={() => handleRejectPayment(p.id)}>Rechazar</button>
                      </div>
                    )}
                    {p.status === 'rejected' && p.rejectionReason && (
                      <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 4 }}>Razon: {p.rejectionReason}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {infoTab === 'casino' && (
              <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#D4A843' }}>Casino 463</div>

                {/* Si no tiene usuario casino */}
                {!selectedChat.casinoUsername ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', padding: '20px 0' }}>
                    <div style={{ fontSize: 36, opacity: 0.3 }}>&#x1F3B0;</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>Este cliente no tiene usuario de casino</div>
                    <button className="btn btn-gold" style={{ width: '100%', marginTop: 8 }} onClick={handleCasinoCreate} disabled={casinoLoading}>
                      {casinoLoading ? 'Creando...' : 'CREAR USUARIO'}
                    </button>
                    {casinoResult && (
                      <div style={{ fontSize: 11, padding: '6px 10px', borderRadius: 6, width: '100%', textAlign: 'center',
                        background: casinoResult.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                        color: casinoResult.type === 'success' ? '#22c55e' : '#ef4444' }}>
                        {casinoResult.msg}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Balance card */}
                    <div style={{ background: 'linear-gradient(135deg, rgba(212,168,67,0.15), rgba(212,168,67,0.05))', borderRadius: 12, padding: 16, border: '1px solid rgba(212,168,67,0.2)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Usuario</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#D4A843' }}>{selectedChat.casinoUsername}</div>
                      </div>
                      {casinoLoading && !casinoBalance ? (
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: 10 }}>Cargando balance...</div>
                      ) : casinoBalance ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Balance</span>
                            <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>${casinoBalance.balance?.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Wager</span>
                            <span style={{ fontSize: 13, color: 'var(--text-sec)' }}>${casinoBalance.wager?.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Cobrable</span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#22c55e' }}>${casinoBalance.withdrawable?.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>No se pudo cargar el balance</div>
                      )}
                      <button onClick={loadCasinoBalance} disabled={casinoLoading} style={{ marginTop: 10, width: '100%', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'var(--text-muted)', fontSize: 11, padding: '4px 0', cursor: 'pointer' }}>
                        {casinoLoading ? '...' : '&#x27F3; Actualizar'}
                      </button>
                    </div>

                    {/* Deposit / Withdraw */}
                    <div style={{ background: 'var(--bg-input)', borderRadius: 10, padding: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Monto (ARS)</div>
                      <input type="number" value={casinoAmount} onChange={e => setCasinoAmount(e.target.value)} placeholder="0" min="0"
                        style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 16, fontWeight: 600, textAlign: 'center', outline: 'none' }}
                        onKeyDown={e => { if (e.key === 'Enter' && casinoAmount) handleCasinoDeposit(); }}
                      />
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <button className="btn" onClick={handleCasinoDeposit} disabled={casinoLoading || !casinoAmount}
                          style={{ flex: 1, background: '#22c55e', color: '#000', fontWeight: 700, fontSize: 12, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer', opacity: (!casinoAmount || casinoLoading) ? 0.5 : 1 }}>
                          + CARGAR
                        </button>
                        <button className="btn" onClick={handleCasinoWithdraw} disabled={casinoLoading || !casinoAmount}
                          style={{ flex: 1, background: '#ef4444', color: '#fff', fontWeight: 700, fontSize: 12, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer', opacity: (!casinoAmount || casinoLoading) ? 0.5 : 1 }}>
                          - RETIRAR
                        </button>
                      </div>
                      {/* Quick amounts */}
                      <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                        {[500, 1000, 2000, 3000, 5000, 10000].map(amt => (
                          <button key={amt} onClick={() => setCasinoAmount(String(amt))}
                            style={{ flex: '1 0 30%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: 'var(--text-sec)', fontSize: 11, padding: '5px 0', cursor: 'pointer' }}>
                            ${amt.toLocaleString()}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Result message */}
                    {casinoResult && (
                      <div style={{ fontSize: 11, padding: '8px 12px', borderRadius: 8, textAlign: 'center',
                        background: casinoResult.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                        color: casinoResult.type === 'success' ? '#22c55e' : '#ef4444',
                        border: `1px solid ${casinoResult.type === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                        {casinoResult.msg}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {infoTab === 'multimedia' && (
              <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)' }}>Multimedia</div>
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: 20 }}>
                  Las imagenes y archivos compartidos apareceran aqui
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13 }}>
            Selecciona un chat para comenzar.
          </div>
        )}
      </div>
    </div>
  );
}

export default Chats;
