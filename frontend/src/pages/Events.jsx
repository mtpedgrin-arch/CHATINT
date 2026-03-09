import { useState, useEffect, useRef } from 'react';
import {
  getEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  startEvent,
  endEvent,
  drawEventWinner,
  claimEventPrize,
} from '../api';
import { useToast } from '../context/ToastContext';

const statusLabels = {
  draft: { text: 'Borrador', color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
  active: { text: 'Activo', color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
  ended: { text: 'Terminado', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  drawn: { text: 'Sorteado', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
  claimed: { text: 'Reclamado', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
};

export default function Events() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('create');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeEvent, setActiveEvent] = useState(null);
  const [activeEventDetail, setActiveEventDetail] = useState(null);
  const [saving, setSaving] = useState(false);
  const [countdown, setCountdown] = useState('');
  const timerRef = useRef(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    imageUrl: '',
    minDeposit: 5000,
    prizeAmount: 100000,
    prizeDescription: '',
    durationMinutes: 60,
  });

  useEffect(() => {
    loadData();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Auto-refresh active event detail
  useEffect(() => {
    if (!activeEvent) return;
    const interval = setInterval(() => {
      loadActiveEventDetail(activeEvent.id);
    }, 5000);
    return () => clearInterval(interval);
  }, [activeEvent?.id]);

  // Countdown timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!activeEvent || !activeEvent.endsAt) return;
    const tick = () => {
      const diff = new Date(activeEvent.endsAt).getTime() - Date.now();
      if (diff <= 0) {
        setCountdown('00:00');
        clearInterval(timerRef.current);
        loadData(); // Refresh to see status change
        return;
      }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => clearInterval(timerRef.current);
  }, [activeEvent?.endsAt]);

  async function loadData() {
    try {
      const data = await getEvents();
      setEvents(data);
      const active = data.find(e => e.status === 'active');
      if (active) {
        setActiveEvent(active);
        setActiveTab('active');
        loadActiveEventDetail(active.id);
      } else {
        setActiveEvent(null);
        setActiveEventDetail(null);
        // If there's a recently drawn/ended event, show it
        const drawn = data.find(e => e.status === 'drawn' || e.status === 'ended');
        if (drawn) {
          loadActiveEventDetail(drawn.id);
          setActiveEvent(drawn);
          setActiveTab('active');
        }
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function loadActiveEventDetail(id) {
    try {
      const detail = await getEventById(id);
      setActiveEventDetail(detail);
    } catch (err) {
      console.error('Error loading event detail', err);
    }
  }

  async function handleCreate(asDraft = true) {
    if (!form.name || !form.minDeposit || !form.prizeAmount || !form.durationMinutes) {
      toast('Completá todos los campos requeridos', 'error');
      return;
    }
    setSaving(true);
    try {
      const event = await createEvent({
        ...form,
        prizeDescription: form.prizeDescription || `$${Number(form.prizeAmount).toLocaleString()} en fichas`,
      });
      toast('Evento creado como borrador');
      setEvents(prev => [event, ...prev]);
      if (!asDraft) {
        await handleStart(event.id);
      }
      setForm({ name: '', description: '', imageUrl: '', minDeposit: 5000, prizeAmount: 100000, prizeDescription: '', durationMinutes: 60 });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleStart(eventId) {
    try {
      const updated = await startEvent(eventId);
      toast('🎰 ¡Evento lanzado! Popup enviado a todos los clientes');
      setActiveEvent(updated);
      setActiveTab('active');
      loadActiveEventDetail(updated.id);
      loadData();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function handleEnd() {
    if (!activeEvent) return;
    if (!confirm('¿Seguro que querés terminar el evento?')) return;
    try {
      await endEvent(activeEvent.id);
      toast('Evento terminado');
      loadData();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function handleDraw() {
    if (!activeEvent) return;
    if (!confirm('¿Sortear ganador? Esta acción es irreversible.')) return;
    try {
      const result = await drawEventWinner(activeEvent.id);
      toast(`🎉 ¡Ganador: ${result.winner.clientName}!`);
      setActiveEvent(result.event);
      loadActiveEventDetail(result.event.id);
      loadData();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function handleClaim() {
    if (!activeEvent) return;
    try {
      await claimEventPrize(activeEvent.id);
      toast('💰 Fichas acreditadas al ganador');
      loadData();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function handleDelete(id) {
    if (!confirm('¿Borrar este evento?')) return;
    try {
      await deleteEvent(id);
      toast('Evento eliminado');
      loadData();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const historyEvents = events.filter(e => e.status !== 'draft' && e.status !== 'active');
  const draftEvents = events.filter(e => e.status === 'draft');

  const tabs = [
    { id: 'create', label: '➕ Crear' },
    { id: 'active', label: '🎰 Evento Activo', disabled: !activeEvent && !activeEventDetail },
    { id: 'history', label: '📋 Historial' },
  ];

  return (
    <div style={{ padding: '0' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 20 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => !t.disabled && setActiveTab(t.id)}
            style={{
              padding: '12px 20px',
              background: activeTab === t.id ? 'rgba(212,168,67,0.1)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === t.id ? '2px solid #D4A843' : '2px solid transparent',
              color: t.disabled ? '#555' : activeTab === t.id ? '#D4A843' : '#999',
              cursor: t.disabled ? 'default' : 'pointer',
              fontSize: 14,
              fontWeight: activeTab === t.id ? 600 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* CREATE TAB */}
      {activeTab === 'create' && (
        <div>
          {/* Draft Events */}
          {draftEvents.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ color: '#D4A843', marginBottom: 12, fontSize: 16 }}>📝 Borradores</h3>
              <div style={{ display: 'grid', gap: 10 }}>
                {draftEvents.map(ev => (
                  <div key={ev.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600, color: '#e0e0e0' }}>{ev.name}</div>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                        Depósito mín: ${Number(ev.minDeposit).toLocaleString()} | Premio: ${Number(ev.prizeAmount).toLocaleString()} | {ev.durationMinutes} min
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => handleStart(ev.id)} style={{ background: 'linear-gradient(135deg,#D4A843,#b8912e)', color: '#000', border: 'none', padding: '6px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
                        🚀 Lanzar
                      </button>
                      <button onClick={() => handleDelete(ev.id)} style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12 }}>
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Create Form */}
          <h3 style={{ color: '#D4A843', marginBottom: 16, fontSize: 16 }}>Crear Nuevo Evento</h3>
          <div style={{ display: 'grid', gap: 14, maxWidth: 500 }}>
            <div>
              <label style={labelStyle}>Nombre del evento *</label>
              <input style={inputStyle} placeholder="ej: Promo Viernes Dorado" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Descripción (para el popup)</label>
              <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} placeholder="ej: Cargá $5.000 y participá por $100.000 en fichas!" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>URL del flyer/imagen</label>
              <input style={inputStyle} placeholder="https://..." value={form.imageUrl} onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={labelStyle}>Depósito mínimo ($) *</label>
                <input style={inputStyle} type="number" value={form.minDeposit} onChange={e => setForm(f => ({ ...f, minDeposit: Number(e.target.value) }))} />
              </div>
              <div>
                <label style={labelStyle}>Premio en fichas *</label>
                <input style={inputStyle} type="number" value={form.prizeAmount} onChange={e => setForm(f => ({ ...f, prizeAmount: Number(e.target.value) }))} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={labelStyle}>Descripción del premio</label>
                <input style={inputStyle} placeholder={`$${Number(form.prizeAmount).toLocaleString()} en fichas`} value={form.prizeDescription} onChange={e => setForm(f => ({ ...f, prizeDescription: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Duración (minutos) *</label>
                <input style={inputStyle} type="number" value={form.durationMinutes} onChange={e => setForm(f => ({ ...f, durationMinutes: Number(e.target.value) }))} />
              </div>
            </div>

            {/* Preview */}
            {form.name && (
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: 12, padding: 16, marginTop: 8 }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>Vista previa del popup:</div>
                <div style={{ textAlign: 'center' }}>
                  {form.imageUrl && <img src={form.imageUrl} alt="" style={{ maxWidth: '100%', maxHeight: 120, borderRadius: 8, marginBottom: 10 }} onError={e => e.target.style.display = 'none'} />}
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#D4A843', marginBottom: 6 }}>🎰 ¡NUEVO EVENTO!</div>
                  <div style={{ fontSize: 13, color: '#ccc', lineHeight: 1.5 }}>
                    {form.description || `Cargá $${Number(form.minDeposit).toLocaleString()} y participá por ${form.prizeDescription || '$' + Number(form.prizeAmount).toLocaleString() + ' en fichas'}!`}
                  </div>
                  <div style={{ marginTop: 10, background: 'linear-gradient(135deg,#D4A843,#b8912e)', color: '#000', display: 'inline-block', padding: '6px 20px', borderRadius: 16, fontWeight: 700, fontSize: 13 }}>
                    ¡PARTICIPAR!
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button onClick={() => handleCreate(true)} disabled={saving} style={{ ...btnStyle, background: 'rgba(255,255,255,0.08)', color: '#e0e0e0', border: '1px solid rgba(255,255,255,0.1)' }}>
                {saving ? '...' : '💾 Guardar Borrador'}
              </button>
              <button onClick={() => handleCreate(false)} disabled={saving} style={{ ...btnStyle, background: 'linear-gradient(135deg,#D4A843,#b8912e)', color: '#000', fontWeight: 700 }}>
                {saving ? '...' : '🚀 Crear y Lanzar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE EVENT TAB */}
      {activeTab === 'active' && activeEventDetail && (
        <div>
          {/* Event Header Card */}
          <div style={{ background: 'linear-gradient(135deg, rgba(212,168,67,0.1), rgba(30,25,15,0.5))', border: '1px solid rgba(212,168,67,0.3)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <h2 style={{ color: '#D4A843', margin: 0, fontSize: 20 }}>{activeEventDetail.name}</h2>
                  <StatusBadge status={activeEventDetail.status} />
                </div>
                <div style={{ color: '#999', fontSize: 13 }}>
                  {activeEventDetail.description || `Depósito mín: $${Number(activeEventDetail.minDeposit).toLocaleString()}`}
                </div>
              </div>
              {activeEventDetail.status === 'active' && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Tiempo restante</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 28, fontWeight: 700, color: '#FFD700' }}>{countdown}</div>
                </div>
              )}
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
              <StatCard label="Premio" value={`$${Number(activeEventDetail.prizeAmount).toLocaleString()}`} color="#D4A843" />
              <StatCard label="Dep. Mínimo" value={`$${Number(activeEventDetail.minDeposit).toLocaleString()}`} color="#10b981" />
              <StatCard label="Inscriptos" value={activeEventDetail.entries?.length || 0} color="#3b82f6" />
              <StatCard label="Calificados" value={activeEventDetail.entries?.filter(e => e.qualified).length || 0} color="#8b5cf6" />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {activeEventDetail.status === 'active' && (
                <button onClick={handleEnd} style={{ ...btnStyle, background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                  ⏹ Terminar Evento
                </button>
              )}
              {activeEventDetail.status === 'ended' && (
                <button onClick={handleDraw} style={{ ...btnStyle, background: 'linear-gradient(135deg,#8b5cf6,#6d28d9)', color: '#fff', fontWeight: 700 }}>
                  🎲 Sortear Ganador
                </button>
              )}
              {activeEventDetail.status === 'drawn' && !activeEventDetail.winnerClaimed && (
                <button onClick={handleClaim} style={{ ...btnStyle, background: 'linear-gradient(135deg,#D4A843,#b8912e)', color: '#000', fontWeight: 700 }}>
                  💰 Acreditar Fichas al Ganador
                </button>
              )}
            </div>

            {/* Winner display */}
            {activeEventDetail.status === 'drawn' && activeEventDetail.winnerId && (
              <div style={{ marginTop: 14, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 10, padding: 14, textAlign: 'center' }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>🎉</div>
                <div style={{ color: '#D4A843', fontWeight: 700, fontSize: 16 }}>
                  Ganador: {activeEventDetail.entries?.find(e => e.id === activeEventDetail.winnerId)?.clientName || 'Cliente #' + activeEventDetail.winnerClientId}
                </div>
                <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
                  {activeEventDetail.winnerClaimed ? '✅ Premio reclamado' : '⏳ Esperando que reclame...'}
                </div>
              </div>
            )}
            {activeEventDetail.status === 'claimed' && (
              <div style={{ marginTop: 14, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, padding: 14, textAlign: 'center' }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>✅</div>
                <div style={{ color: '#10b981', fontWeight: 700, fontSize: 16 }}>Premio reclamado exitosamente</div>
                <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
                  {activeEventDetail.entries?.find(e => e.id === activeEventDetail.winnerId)?.clientName} recibió ${Number(activeEventDetail.prizeAmount).toLocaleString()} fichas
                </div>
              </div>
            )}
          </div>

          {/* Participants Table */}
          <h3 style={{ color: '#e0e0e0', marginBottom: 12, fontSize: 16 }}>Participantes ({activeEventDetail.entries?.length || 0})</h3>
          {activeEventDetail.entries && activeEventDetail.entries.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <th style={thStyle}>#</th>
                    <th style={thStyle}>Cliente</th>
                    <th style={thStyle}>Estado</th>
                    <th style={thStyle}>Depósito</th>
                    <th style={thStyle}>Inscripción</th>
                    <th style={thStyle}>Clasificación</th>
                  </tr>
                </thead>
                <tbody>
                  {activeEventDetail.entries.map((entry, i) => (
                    <tr key={entry.id} style={{
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      background: entry.id === activeEventDetail.winnerId ? 'rgba(212,168,67,0.1)' :
                                   entry.qualified ? 'rgba(16,185,129,0.05)' : 'transparent',
                    }}>
                      <td style={tdStyle}>{i + 1}</td>
                      <td style={tdStyle}>
                        <span style={{ fontWeight: entry.id === activeEventDetail.winnerId ? 700 : 400 }}>
                          {entry.id === activeEventDetail.winnerId && '🏆 '}
                          {entry.clientName || `Cliente #${entry.clientId}`}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 600,
                          background: entry.qualified ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                          color: entry.qualified ? '#10b981' : '#f59e0b',
                        }}>
                          {entry.qualified ? '✓ Calificado' : '⏳ Inscripto'}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        {entry.depositAmount > 0 ? `$${Number(entry.depositAmount).toLocaleString()}` : '-'}
                      </td>
                      <td style={{ ...tdStyle, fontSize: 12, color: '#888' }}>
                        {new Date(entry.joinedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ ...tdStyle, fontSize: 12, color: '#888' }}>
                        {entry.qualifiedAt ? new Date(entry.qualifiedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: '#555', padding: 30 }}>
              Todavía no hay participantes
            </div>
          )}
        </div>
      )}

      {activeTab === 'active' && !activeEventDetail && (
        <div style={{ textAlign: 'center', color: '#555', padding: 60 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🎰</div>
          <div>No hay evento activo. Creá uno desde la pestaña "Crear".</div>
        </div>
      )}

      {/* HISTORY TAB */}
      {activeTab === 'history' && (
        <div>
          <h3 style={{ color: '#D4A843', marginBottom: 14, fontSize: 16 }}>Historial de Eventos</h3>
          {historyEvents.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#555', padding: 40 }}>
              No hay eventos en el historial
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {historyEvents.map(ev => (
                <div key={ev.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontWeight: 600, color: '#e0e0e0' }}>{ev.name}</span>
                      <StatusBadge status={ev.status} />
                    </div>
                    <span style={{ fontSize: 12, color: '#888' }}>
                      {ev.startedAt ? new Date(ev.startedAt).toLocaleDateString('es-AR') : new Date(ev.createdAt).toLocaleDateString('es-AR')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 20, fontSize: 12, color: '#888' }}>
                    <span>💰 Dep. mín: ${Number(ev.minDeposit).toLocaleString()}</span>
                    <span>🏆 Premio: ${Number(ev.prizeAmount).toLocaleString()}</span>
                    <span>👥 Participantes: {ev.totalEntries || 0}</span>
                    <span>✓ Calificados: {ev.qualifiedEntries || 0}</span>
                  </div>
                  {ev.winnerClientId && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#D4A843' }}>
                      🏆 Ganador: Cliente #{ev.winnerClientId} {ev.winnerClaimed ? '(Premio reclamado)' : '(Sin reclamar)'}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button onClick={() => { setActiveEvent(ev); loadActiveEventDetail(ev.id); setActiveTab('active'); }} style={{ background: 'rgba(255,255,255,0.05)', color: '#999', border: '1px solid rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>
                      Ver detalle
                    </button>
                    {(ev.status === 'ended' || ev.status === 'drawn' || ev.status === 'claimed') && (
                      <button onClick={() => handleDelete(ev.id)} style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>
                        🗑️ Borrar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const cfg = statusLabels[status] || statusLabels.draft;
  return (
    <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: cfg.bg, color: cfg.color }}>
      {cfg.text}
    </span>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '10px 8px', textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{label}</div>
    </div>
  );
}

const labelStyle = { display: 'block', fontSize: 12, color: '#999', marginBottom: 4 };
const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  color: '#e0e0e0',
  fontSize: 14,
  outline: 'none',
};
const btnStyle = {
  padding: '8px 18px',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 13,
};
const thStyle = { textAlign: 'left', padding: '8px 10px', fontSize: 11, color: '#888', fontWeight: 600 };
const tdStyle = { padding: '8px 10px', fontSize: 13, color: '#e0e0e0' };
