import { useState, useEffect } from 'react';
import {
  sendPushNotification,
  getNotificationHistory,
  getNotificationSubscriptions,
  sendPopup,
  getPopupHistory,
  getPopupTemplates,
  createPopupTemplate,
  updatePopupTemplate,
  deletePopupTemplate,
} from '../api';
import { useToast } from '../context/ToastContext';

const notifTypes = [
  { value: 'bono', label: '🎁 Bono' },
  { value: 'deposito', label: '💰 Depósito' },
  { value: 'retiro', label: '💸 Retiro' },
  { value: 'promocion', label: '🔥 Promoción' },
  { value: 'anuncio', label: '📢 Anuncio' },
  { value: 'general', label: '📌 General' },
];

const buttonActions = [
  { value: 'open_chat', label: '💬 Abrir Chat (Menú Principal)' },
  { value: 'link', label: '🔗 Link Externo' },
  { value: 'close', label: '✕ Solo Cerrar' },
];

export default function Notifications() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('push');
  const [subscriptions, setSubscriptions] = useState({ total: 0, subscriptions: [] });
  const [pushHistory, setPushHistory] = useState([]);
  const [popupHistory, setPopupHistory] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [sending, setSending] = useState(false);

  // Template management
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateForm, setTemplateForm] = useState({
    name: '',
    title: '',
    body: '',
    imageUrl: '',
    buttonText: '',
    buttonAction: 'open_chat',
    buttonUrl: '',
  });

  // Push form
  const [pushForm, setPushForm] = useState({
    type: 'general',
    title: '',
    body: '',
    url: '',
    target: 'all',
    targetValue: '',
  });

  // Popup form
  const [popupForm, setPopupForm] = useState({
    title: '',
    body: '',
    imageUrl: '',
    buttonText: '',
    buttonAction: 'open_chat',
    buttonUrl: '',
    target: 'all',
    targetValue: '',
  });

  const loadData = async () => {
    try {
      const [subs, history, popups, tpls] = await Promise.all([
        getNotificationSubscriptions(),
        getNotificationHistory(),
        getPopupHistory(),
        getPopupTemplates(),
      ]);
      setSubscriptions(subs);
      setPushHistory(history);
      setPopupHistory(popups);
      setTemplates(tpls);
    } catch (err) {
      console.error('Error loading notification data:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSendPush = async () => {
    if (!pushForm.title || !pushForm.body) {
      toast('Completá título y mensaje', 'error');
      return;
    }
    setSending(true);
    try {
      const result = await sendPushNotification(pushForm);
      toast(`Notificación enviada: ${result.result?.delivered || 0} entregadas, ${result.result?.failed || 0} fallidas`);
      setPushForm({ type: 'general', title: '', body: '', url: '', target: 'all', targetValue: '' });
      loadData();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSending(false);
    }
  };

  const handleSendPopup = async () => {
    if (!popupForm.title || !popupForm.body) {
      toast('Completá título y mensaje', 'error');
      return;
    }
    setSending(true);
    try {
      await sendPopup(popupForm);
      toast('Popup enviado correctamente');
      setPopupForm({ title: '', body: '', imageUrl: '', buttonText: '', buttonAction: 'open_chat', buttonUrl: '', target: 'all', targetValue: '' });
      loadData();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSending(false);
    }
  };

  // ── Template functions ──
  const resetTemplateForm = () => {
    setTemplateForm({ name: '', title: '', body: '', imageUrl: '', buttonText: '', buttonAction: 'open_chat', buttonUrl: '' });
    setEditingTemplate(null);
    setShowTemplateForm(false);
  };

  const handleSaveTemplate = async () => {
    if (!templateForm.name || !templateForm.title) {
      toast('Nombre y título son requeridos', 'error');
      return;
    }
    setSavingTemplate(true);
    try {
      if (editingTemplate) {
        await updatePopupTemplate(editingTemplate.id, templateForm);
        toast('Plantilla actualizada');
      } else {
        await createPopupTemplate(templateForm);
        toast('Plantilla creada');
      }
      resetTemplateForm();
      loadData();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleEditTemplate = (tpl) => {
    setEditingTemplate(tpl);
    setTemplateForm({
      name: tpl.name,
      title: tpl.title,
      body: tpl.body || '',
      imageUrl: tpl.imageUrl || '',
      buttonText: tpl.buttonText || '',
      buttonAction: tpl.buttonAction || 'open_chat',
      buttonUrl: tpl.buttonUrl || '',
    });
    setShowTemplateForm(true);
  };

  const handleDeleteTemplate = async (tpl) => {
    if (!confirm(`¿Eliminar plantilla "${tpl.name}"?`)) return;
    try {
      await deletePopupTemplate(tpl.id);
      toast('Plantilla eliminada');
      loadData();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const handleUseTemplate = (tpl) => {
    setPopupForm({
      ...popupForm,
      title: tpl.title,
      body: tpl.body || '',
      imageUrl: tpl.imageUrl || '',
      buttonText: tpl.buttonText || '',
      buttonAction: tpl.buttonAction || 'open_chat',
      buttonUrl: tpl.buttonUrl || '',
    });
    toast(`Plantilla "${tpl.name}" cargada`);
  };

  const handleSaveAsTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm({
      name: '',
      title: popupForm.title,
      body: popupForm.body,
      imageUrl: popupForm.imageUrl,
      buttonText: popupForm.buttonText,
      buttonAction: popupForm.buttonAction || 'open_chat',
      buttonUrl: popupForm.buttonUrl,
    });
    setShowTemplateForm(true);
  };

  const formatDate = (d) => {
    if (!d) return '-';
    return new Date(d).toLocaleString('es-AR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <div className="section-padded">
      {/* Stats Bar */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: 1, minWidth: 140 }}>
          <div className="card-body" style={{ textAlign: 'center', padding: '1rem' }}>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#D4A843' }}>{subscriptions.total}</div>
            <div style={{ color: '#aaa', fontSize: '0.8rem' }}>Dispositivos Suscritos</div>
          </div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 140 }}>
          <div className="card-body" style={{ textAlign: 'center', padding: '1rem' }}>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#22c55e' }}>{pushHistory.length}</div>
            <div style={{ color: '#aaa', fontSize: '0.8rem' }}>Push Enviados</div>
          </div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 140 }}>
          <div className="card-body" style={{ textAlign: 'center', padding: '1rem' }}>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#a855f7' }}>{popupHistory.length}</div>
            <div style={{ color: '#aaa', fontSize: '0.8rem' }}>Popups Enviados</div>
          </div>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="toggle-group" style={{ marginBottom: '1.5rem', justifyContent: 'center' }}>
        <button
          type="button"
          className={`toggle-btn ${activeTab === 'push' ? 'active' : ''}`}
          onClick={() => setActiveTab('push')}
        >
          🔔 Push Notifications
        </button>
        <button
          type="button"
          className={`toggle-btn ${activeTab === 'popup' ? 'active' : ''}`}
          onClick={() => setActiveTab('popup')}
        >
          💬 Popups en Vivo
        </button>
      </div>

      {/* ════════════════ Push Tab ════════════════ */}
      {activeTab === 'push' && (
        <div className="settings-grid">
          <div className="card">
            <div className="card-header"><span>Enviar Push Notification</span></div>
            <div className="card-body">
              <div className="form-group">
                <label>Tipo</label>
                <select
                  className="form-input"
                  value={pushForm.type}
                  onChange={(e) => setPushForm({ ...pushForm, type: e.target.value })}
                >
                  {notifTypes.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Título</label>
                <input
                  className="form-input"
                  value={pushForm.title}
                  onChange={(e) => setPushForm({ ...pushForm, title: e.target.value })}
                  placeholder="Casino 463 - Bono Especial!"
                />
              </div>
              <div className="form-group">
                <label>Mensaje</label>
                <textarea
                  className="form-input"
                  value={pushForm.body}
                  onChange={(e) => setPushForm({ ...pushForm, body: e.target.value })}
                  placeholder="Tenés un bono del 200% esperándote..."
                  rows={3}
                  style={{ resize: 'vertical' }}
                />
              </div>
              <div className="form-group">
                <label>URL al hacer click (opcional)</label>
                <input
                  className="form-input"
                  value={pushForm.url}
                  onChange={(e) => setPushForm({ ...pushForm, url: e.target.value })}
                  placeholder="/widget"
                />
              </div>
              <div className="form-group">
                <label>Destinatario</label>
                <div className="toggle-group">
                  <button type="button" className={`toggle-btn ${pushForm.target === 'all' ? 'active' : ''}`} onClick={() => setPushForm({ ...pushForm, target: 'all', targetValue: '' })}>Todos</button>
                  <button type="button" className={`toggle-btn ${pushForm.target === 'client' ? 'active' : ''}`} onClick={() => setPushForm({ ...pushForm, target: 'client' })}>Cliente</button>
                  <button type="button" className={`toggle-btn ${pushForm.target === 'chat' ? 'active' : ''}`} onClick={() => setPushForm({ ...pushForm, target: 'chat' })}>Chat</button>
                </div>
              </div>
              {pushForm.target !== 'all' && (
                <div className="form-group">
                  <label>{pushForm.target === 'client' ? 'ID del Cliente' : 'ID del Chat'}</label>
                  <input
                    className="form-input"
                    value={pushForm.targetValue}
                    onChange={(e) => setPushForm({ ...pushForm, targetValue: e.target.value })}
                    placeholder={pushForm.target === 'client' ? '123' : 'abc-def-ghi'}
                  />
                </div>
              )}
              <button
                className="btn btn-gold"
                onClick={handleSendPush}
                disabled={sending}
                style={{ width: '100%', marginTop: '0.5rem' }}
              >
                {sending ? 'Enviando...' : '🔔 Enviar Notificación'}
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span>Historial de Push</span></div>
            <div className="card-body" style={{ maxHeight: 400, overflowY: 'auto' }}>
              {pushHistory.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>No hay notificaciones enviadas</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {pushHistory.map((n) => (
                    <div key={n.id} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{n.title}</span>
                        <span style={{ fontSize: '0.75rem', color: '#888' }}>{formatDate(n.sentAt)}</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#aaa' }}>{n.body}</div>
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: 4 }}>
                        <span style={{ fontSize: '0.7rem', background: 'rgba(34,197,94,0.15)', color: '#22c55e', padding: '2px 6px', borderRadius: 4 }}>
                          ✓ {n.deliveredCount}
                        </span>
                        {n.failedCount > 0 && (
                          <span style={{ fontSize: '0.7rem', background: 'rgba(239,68,68,0.15)', color: '#ef4444', padding: '2px 6px', borderRadius: 4 }}>
                            ✗ {n.failedCount}
                          </span>
                        )}
                        <span style={{ fontSize: '0.7rem', background: 'rgba(168,85,247,0.15)', color: '#a855f7', padding: '2px 6px', borderRadius: 4 }}>
                          {n.type}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════ Popup Tab ════════════════ */}
      {activeTab === 'popup' && (
        <>
          {/* Plantillas guardadas */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>📋 Plantillas Guardadas</span>
              <button
                className="btn btn-gold"
                style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                onClick={() => { resetTemplateForm(); setShowTemplateForm(true); }}
              >
                + Nueva Plantilla
              </button>
            </div>
            <div className="card-body">
              {templates.length === 0 && !showTemplateForm ? (
                <div style={{ textAlign: 'center', color: '#666', padding: '1rem' }}>
                  No hay plantillas guardadas. Creá una para reutilizar popups rápidamente.
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: showTemplateForm ? '1rem' : 0 }}>
                  {templates.map((tpl) => (
                    <div
                      key={tpl.id}
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(212,168,67,0.2)',
                        borderRadius: 10,
                        padding: '12px 14px',
                        minWidth: 180,
                        maxWidth: 240,
                        flex: '1 1 180px',
                        position: 'relative',
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#D4A843', marginBottom: 4 }}>
                        {tpl.name}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#ccc', marginBottom: 2 }}>{tpl.title}</div>
                      <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tpl.body}
                      </div>
                      {tpl.buttonText && (
                        <div style={{ fontSize: '0.7rem', color: '#aaa', marginBottom: 6 }}>
                          Botón: "{tpl.buttonText}" → {tpl.buttonAction === 'open_chat' ? '💬 Chat' : tpl.buttonAction === 'link' ? '🔗 Link' : '✕ Cerrar'}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button
                          className="btn btn-gold"
                          style={{ padding: '3px 10px', fontSize: '0.75rem', flex: 1 }}
                          onClick={() => handleUseTemplate(tpl)}
                        >
                          Usar
                        </button>
                        <button
                          className="btn"
                          style={{ padding: '3px 10px', fontSize: '0.75rem', background: 'rgba(255,255,255,0.08)', color: '#ccc', border: '1px solid rgba(255,255,255,0.1)' }}
                          onClick={() => handleEditTemplate(tpl)}
                        >
                          ✏️
                        </button>
                        <button
                          className="btn"
                          style={{ padding: '3px 10px', fontSize: '0.75rem', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
                          onClick={() => handleDeleteTemplate(tpl)}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Template create/edit form */}
              {showTemplateForm && (
                <div style={{ background: 'rgba(212,168,67,0.05)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: 10, padding: 16, marginTop: templates.length > 0 ? 0 : undefined }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#D4A843', marginBottom: 12 }}>
                    {editingTemplate ? '✏️ Editar Plantilla' : '➕ Nueva Plantilla'}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: '0.8rem' }}>Nombre de la Plantilla *</label>
                      <input
                        className="form-input"
                        value={templateForm.name}
                        onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                        placeholder="Bono 100% ACTIVADO"
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: '0.8rem' }}>Título del Popup *</label>
                      <input
                        className="form-input"
                        value={templateForm.title}
                        onChange={(e) => setTemplateForm({ ...templateForm, title: e.target.value })}
                        placeholder="🎁 BONO 100% ACTIVADO"
                      />
                    </div>
                  </div>
                  <div className="form-group" style={{ margin: '0.75rem 0 0' }}>
                    <label style={{ fontSize: '0.8rem' }}>Mensaje</label>
                    <textarea
                      className="form-input"
                      value={templateForm.body}
                      onChange={(e) => setTemplateForm({ ...templateForm, body: e.target.value })}
                      placeholder="Aprovechá el 100% de bono en tu próximo depósito..."
                      rows={2}
                      style={{ resize: 'vertical' }}
                    />
                  </div>
                  <div className="form-group" style={{ margin: '0.75rem 0 0' }}>
                    <label style={{ fontSize: '0.8rem' }}>URL Imagen (opcional)</label>
                    <input
                      className="form-input"
                      value={templateForm.imageUrl}
                      onChange={(e) => setTemplateForm({ ...templateForm, imageUrl: e.target.value })}
                      placeholder="https://ejemplo.com/promo.jpg"
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.75rem' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: '0.8rem' }}>Texto del Botón</label>
                      <input
                        className="form-input"
                        value={templateForm.buttonText}
                        onChange={(e) => setTemplateForm({ ...templateForm, buttonText: e.target.value })}
                        placeholder="CARGAR FICHAS"
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: '0.8rem' }}>Acción del Botón</label>
                      <select
                        className="form-input"
                        value={templateForm.buttonAction}
                        onChange={(e) => setTemplateForm({ ...templateForm, buttonAction: e.target.value })}
                      >
                        {buttonActions.map((a) => (
                          <option key={a.value} value={a.value}>{a.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {templateForm.buttonAction === 'link' && (
                    <div className="form-group" style={{ margin: '0.75rem 0 0' }}>
                      <label style={{ fontSize: '0.8rem' }}>URL del Botón</label>
                      <input
                        className="form-input"
                        value={templateForm.buttonUrl}
                        onChange={(e) => setTemplateForm({ ...templateForm, buttonUrl: e.target.value })}
                        placeholder="https://casino463.com/promos"
                      />
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                    <button
                      className="btn btn-gold"
                      onClick={handleSaveTemplate}
                      disabled={savingTemplate}
                      style={{ flex: 1 }}
                    >
                      {savingTemplate ? 'Guardando...' : editingTemplate ? '💾 Actualizar' : '💾 Guardar Plantilla'}
                    </button>
                    <button
                      className="btn"
                      onClick={resetTemplateForm}
                      style={{ padding: '6px 16px', background: 'rgba(255,255,255,0.08)', color: '#ccc', border: '1px solid rgba(255,255,255,0.1)' }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Popup send form + preview/history */}
          <div className="settings-grid">
            <div className="card">
              <div className="card-header"><span>Enviar Popup en Vivo</span></div>
              <div className="card-body">
                <div className="form-group">
                  <label>Título</label>
                  <input
                    className="form-input"
                    value={popupForm.title}
                    onChange={(e) => setPopupForm({ ...popupForm, title: e.target.value })}
                    placeholder="🎁 Promoción Especial!"
                  />
                </div>
                <div className="form-group">
                  <label>Mensaje</label>
                  <textarea
                    className="form-input"
                    value={popupForm.body}
                    onChange={(e) => setPopupForm({ ...popupForm, body: e.target.value })}
                    placeholder="Aprovechá el 200% de bono en tu próximo depósito"
                    rows={3}
                    style={{ resize: 'vertical' }}
                  />
                </div>
                <div className="form-group">
                  <label>URL Imagen (opcional)</label>
                  <input
                    className="form-input"
                    value={popupForm.imageUrl}
                    onChange={(e) => setPopupForm({ ...popupForm, imageUrl: e.target.value })}
                    placeholder="https://ejemplo.com/promo.jpg"
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label>Texto del Botón</label>
                    <input
                      className="form-input"
                      value={popupForm.buttonText}
                      onChange={(e) => setPopupForm({ ...popupForm, buttonText: e.target.value })}
                      placeholder="CARGAR FICHAS"
                    />
                  </div>
                  <div className="form-group">
                    <label>Acción del Botón</label>
                    <select
                      className="form-input"
                      value={popupForm.buttonAction}
                      onChange={(e) => setPopupForm({ ...popupForm, buttonAction: e.target.value })}
                    >
                      {buttonActions.map((a) => (
                        <option key={a.value} value={a.value}>{a.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {popupForm.buttonAction === 'link' && (
                  <div className="form-group">
                    <label>URL del Botón</label>
                    <input
                      className="form-input"
                      value={popupForm.buttonUrl}
                      onChange={(e) => setPopupForm({ ...popupForm, buttonUrl: e.target.value })}
                      placeholder="https://casino463.com/promos"
                    />
                  </div>
                )}
                <div className="form-group">
                  <label>Destinatario</label>
                  <div className="toggle-group">
                    <button type="button" className={`toggle-btn ${popupForm.target === 'all' ? 'active' : ''}`} onClick={() => setPopupForm({ ...popupForm, target: 'all', targetValue: '' })}>Todos</button>
                    <button type="button" className={`toggle-btn ${popupForm.target === 'client' ? 'active' : ''}`} onClick={() => setPopupForm({ ...popupForm, target: 'client' })}>Cliente</button>
                    <button type="button" className={`toggle-btn ${popupForm.target === 'chat' ? 'active' : ''}`} onClick={() => setPopupForm({ ...popupForm, target: 'chat' })}>Chat</button>
                  </div>
                </div>
                {popupForm.target !== 'all' && (
                  <div className="form-group">
                    <label>{popupForm.target === 'client' ? 'ID del Cliente' : 'ID del Chat'}</label>
                    <input
                      className="form-input"
                      value={popupForm.targetValue}
                      onChange={(e) => setPopupForm({ ...popupForm, targetValue: e.target.value })}
                      placeholder={popupForm.target === 'client' ? '123' : 'abc-def-ghi'}
                    />
                  </div>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button
                    className="btn btn-gold"
                    onClick={handleSendPopup}
                    disabled={sending}
                    style={{ flex: 1 }}
                  >
                    {sending ? 'Enviando...' : '💬 Enviar Popup'}
                  </button>
                  {(popupForm.title || popupForm.body) && (
                    <button
                      className="btn"
                      onClick={handleSaveAsTemplate}
                      style={{ padding: '6px 12px', background: 'rgba(168,85,247,0.15)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                      title="Guardar como plantilla"
                    >
                      💾 Guardar
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header"><span>Preview & Historial</span></div>
              <div className="card-body">
                {/* Preview */}
                {(popupForm.title || popupForm.body) && (
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ fontSize: '0.8rem', color: '#888', marginBottom: 6, display: 'block' }}>Vista Previa:</label>
                    <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 12, padding: 16, border: '1px solid rgba(212,168,67,0.2)', textAlign: 'center' }}>
                      {popupForm.imageUrl && (
                        <img src={popupForm.imageUrl} alt="" style={{ maxWidth: '100%', maxHeight: 100, borderRadius: 8, marginBottom: 10, objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; }} />
                      )}
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#D4A843', marginBottom: 6 }}>{popupForm.title || 'Título'}</div>
                      <div style={{ fontSize: 13, color: '#ccc', marginBottom: 10 }}>{popupForm.body || 'Mensaje del popup...'}</div>
                      {popupForm.buttonText && (
                        <div>
                          <span style={{ background: 'linear-gradient(135deg, #D4A843, #b8912e)', color: '#000', padding: '6px 18px', borderRadius: 16, fontSize: 12, fontWeight: 700 }}>
                            {popupForm.buttonText}
                          </span>
                          <div style={{ fontSize: '0.7rem', color: '#888', marginTop: 6 }}>
                            {popupForm.buttonAction === 'open_chat' ? '→ Abre el chat con menú principal' :
                             popupForm.buttonAction === 'link' ? `→ Abre: ${popupForm.buttonUrl || '(sin URL)'}` :
                             '→ Cierra el popup'}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* History */}
                <label style={{ fontSize: '0.8rem', color: '#888', marginBottom: 6, display: 'block' }}>Historial:</label>
                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {popupHistory.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#666', padding: '1.5rem' }}>No hay popups enviados</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {popupHistory.map((p) => (
                        <div key={p.id} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{p.title}</span>
                            <span style={{ fontSize: '0.75rem', color: '#888' }}>{formatDate(p.sentAt)}</span>
                          </div>
                          <div style={{ fontSize: '0.8rem', color: '#aaa' }}>{p.body}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
