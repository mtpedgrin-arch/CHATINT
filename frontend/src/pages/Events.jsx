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
  getQuizzes,
  getQuizById,
  createQuiz,
  deleteQuiz,
  startQuiz,
  endQuiz as endQuizApi,
  getScratchCards,
  getScratchCardById,
  createScratchCard,
  deleteScratchCard,
  startScratchCard,
  endScratchCard,
} from '../api';
import { useToast } from '../context/ToastContext';

// ============================================
// MAIN TABS CONFIG
// ============================================
const mainTabs = [
  { id: 'sorteos', label: 'Sorteos', icon: '🎰' },
  { id: 'quiz', label: 'Quiz', icon: '🧠' },
  { id: 'raspa', label: 'Raspa y Gana', icon: '🎫' },
  { id: 'ruleta', label: 'Ruleta', icon: '🎡' },
  { id: 'ranking', label: 'Ranking', icon: '🏆' },
];

// ============================================
// SHARED STYLES
// ============================================
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

const statusLabels = {
  draft: { text: 'Borrador', color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
  active: { text: 'Activo', color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
  ended: { text: 'Terminado', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  drawn: { text: 'Sorteado', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
  claimed: { text: 'Reclamado', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
};

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

// ============================================
// MAIN COMPONENT — Tab Wrapper
// ============================================
export default function Events() {
  const [mainTab, setMainTab] = useState('sorteos');

  return (
    <div style={{ padding: 0 }}>
      {/* Main tabs bar */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 0, background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        {mainTabs.map(t => (
          <button
            key={t.id}
            onClick={() => setMainTab(t.id)}
            style={{
              padding: '14px 24px',
              background: mainTab === t.id ? 'rgba(212,168,67,0.15)' : 'transparent',
              border: 'none',
              borderBottom: mainTab === t.id ? '3px solid #D4A843' : '3px solid transparent',
              color: mainTab === t.id ? '#D4A843' : '#888',
              cursor: 'pointer',
              fontSize: 15,
              fontWeight: mainTab === t.id ? 700 : 400,
              transition: 'all 0.2s',
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ padding: '20px 0' }}>
        {mainTab === 'sorteos' && <SorteosTab />}
        {mainTab === 'quiz' && <QuizTab />}
        {mainTab === 'raspa' && <RaspaTab />}
        {mainTab === 'ruleta' && <RuletaTab />}
        {mainTab === 'ranking' && <RankingTab />}
      </div>
    </div>
  );
}

// ============================================
// SORTEOS TAB (existing Events functionality)
// ============================================
function SorteosTab() {
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

  useEffect(() => {
    if (!activeEvent) return;
    const interval = setInterval(() => {
      loadActiveEventDetail(activeEvent.id);
    }, 5000);
    return () => clearInterval(interval);
  }, [activeEvent?.id]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!activeEvent || !activeEvent.endsAt) return;
    const tick = () => {
      const diff = new Date(activeEvent.endsAt).getTime() - Date.now();
      if (diff <= 0) {
        setCountdown('00:00');
        clearInterval(timerRef.current);
        loadData();
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
      toast('Completa todos los campos requeridos', 'error');
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
      toast('Evento lanzado! Popup enviado a todos los clientes');
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
    if (!confirm('Seguro que queres terminar el evento?')) return;
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
    if (!confirm('Sortear ganador? Esta accion es irreversible.')) return;
    try {
      const result = await drawEventWinner(activeEvent.id);
      toast(`Ganador: ${result.winner.clientName}!`);
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
      toast('Fichas acreditadas al ganador');
      loadData();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function handleDelete(id) {
    if (!confirm('Borrar este evento?')) return;
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
    { id: 'create', label: '+ Crear' },
    { id: 'active', label: 'Evento Activo', disabled: !activeEvent && !activeEventDetail },
    { id: 'history', label: 'Historial' },
  ];

  return (
    <div>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 20 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => !t.disabled && setActiveTab(t.id)}
            style={{
              padding: '10px 18px',
              background: activeTab === t.id ? 'rgba(212,168,67,0.08)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === t.id ? '2px solid #D4A843' : '2px solid transparent',
              color: t.disabled ? '#555' : activeTab === t.id ? '#D4A843' : '#999',
              cursor: t.disabled ? 'default' : 'pointer',
              fontSize: 13,
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
          {draftEvents.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ color: '#D4A843', marginBottom: 12, fontSize: 16 }}>Borradores</h3>
              <div style={{ display: 'grid', gap: 10 }}>
                {draftEvents.map(ev => (
                  <div key={ev.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600, color: '#e0e0e0' }}>{ev.name}</div>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                        Deposito min: ${Number(ev.minDeposit).toLocaleString()} | Premio: ${Number(ev.prizeAmount).toLocaleString()} | {ev.durationMinutes} min
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => handleStart(ev.id)} style={{ background: 'linear-gradient(135deg,#D4A843,#b8912e)', color: '#000', border: 'none', padding: '6px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
                        Lanzar
                      </button>
                      <button onClick={() => handleDelete(ev.id)} style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12 }}>
                        Borrar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <h3 style={{ color: '#D4A843', marginBottom: 16, fontSize: 16 }}>Crear Nuevo Evento</h3>
          <div style={{ display: 'grid', gap: 14, maxWidth: 500 }}>
            <div>
              <label style={labelStyle}>Nombre del evento *</label>
              <input style={inputStyle} placeholder="ej: Promo Viernes Dorado" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Descripcion (para el popup)</label>
              <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} placeholder="ej: Carga $5.000 y participa por $100.000 en fichas!" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>URL del flyer/imagen</label>
              <input style={inputStyle} placeholder="https://..." value={form.imageUrl} onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={labelStyle}>Deposito minimo ($) *</label>
                <input style={inputStyle} type="number" value={form.minDeposit} onChange={e => setForm(f => ({ ...f, minDeposit: Number(e.target.value) }))} />
              </div>
              <div>
                <label style={labelStyle}>Premio en fichas *</label>
                <input style={inputStyle} type="number" value={form.prizeAmount} onChange={e => setForm(f => ({ ...f, prizeAmount: Number(e.target.value) }))} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={labelStyle}>Descripcion del premio</label>
                <input style={inputStyle} placeholder={`$${Number(form.prizeAmount).toLocaleString()} en fichas`} value={form.prizeDescription} onChange={e => setForm(f => ({ ...f, prizeDescription: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Duracion (minutos) *</label>
                <input style={inputStyle} type="number" value={form.durationMinutes} onChange={e => setForm(f => ({ ...f, durationMinutes: Number(e.target.value) }))} />
              </div>
            </div>

            {form.name && (
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: 12, padding: 16, marginTop: 8 }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>Vista previa del popup:</div>
                <div style={{ textAlign: 'center' }}>
                  {form.imageUrl && <img src={form.imageUrl} alt="" style={{ maxWidth: '100%', maxHeight: 120, borderRadius: 8, marginBottom: 10 }} onError={e => e.target.style.display = 'none'} />}
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#D4A843', marginBottom: 6 }}>NUEVO EVENTO!</div>
                  <div style={{ fontSize: 13, color: '#ccc', lineHeight: 1.5 }}>
                    {form.description || `Carga $${Number(form.minDeposit).toLocaleString()} y participa por ${form.prizeDescription || '$' + Number(form.prizeAmount).toLocaleString() + ' en fichas'}!`}
                  </div>
                  <div style={{ marginTop: 10, background: 'linear-gradient(135deg,#D4A843,#b8912e)', color: '#000', display: 'inline-block', padding: '6px 20px', borderRadius: 16, fontWeight: 700, fontSize: 13 }}>
                    PARTICIPAR!
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button onClick={() => handleCreate(true)} disabled={saving} style={{ ...btnStyle, background: 'rgba(255,255,255,0.08)', color: '#e0e0e0', border: '1px solid rgba(255,255,255,0.1)' }}>
                {saving ? '...' : 'Guardar Borrador'}
              </button>
              <button onClick={() => handleCreate(false)} disabled={saving} style={{ ...btnStyle, background: 'linear-gradient(135deg,#D4A843,#b8912e)', color: '#000', fontWeight: 700 }}>
                {saving ? '...' : 'Crear y Lanzar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE EVENT TAB */}
      {activeTab === 'active' && activeEventDetail && (
        <div>
          <div style={{ background: 'linear-gradient(135deg, rgba(212,168,67,0.1), rgba(30,25,15,0.5))', border: '1px solid rgba(212,168,67,0.3)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <h2 style={{ color: '#D4A843', margin: 0, fontSize: 20 }}>{activeEventDetail.name}</h2>
                  <StatusBadge status={activeEventDetail.status} />
                </div>
                <div style={{ color: '#999', fontSize: 13 }}>
                  {activeEventDetail.description || `Deposito min: $${Number(activeEventDetail.minDeposit).toLocaleString()}`}
                </div>
              </div>
              {activeEventDetail.status === 'active' && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Tiempo restante</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 28, fontWeight: 700, color: '#FFD700' }}>{countdown}</div>
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
              <StatCard label="Premio" value={`$${Number(activeEventDetail.prizeAmount).toLocaleString()}`} color="#D4A843" />
              <StatCard label="Dep. Minimo" value={`$${Number(activeEventDetail.minDeposit).toLocaleString()}`} color="#10b981" />
              <StatCard label="Inscriptos" value={activeEventDetail.entries?.length || 0} color="#3b82f6" />
              <StatCard label="Calificados" value={activeEventDetail.entries?.filter(e => e.qualified).length || 0} color="#8b5cf6" />
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {activeEventDetail.status === 'active' && (
                <button onClick={handleEnd} style={{ ...btnStyle, background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                  Terminar Evento
                </button>
              )}
              {activeEventDetail.status === 'ended' && (
                <button onClick={handleDraw} style={{ ...btnStyle, background: 'linear-gradient(135deg,#8b5cf6,#6d28d9)', color: '#fff', fontWeight: 700 }}>
                  Sortear Ganador
                </button>
              )}
              {activeEventDetail.status === 'drawn' && !activeEventDetail.winnerClaimed && (
                <button onClick={handleClaim} style={{ ...btnStyle, background: 'linear-gradient(135deg,#D4A843,#b8912e)', color: '#000', fontWeight: 700 }}>
                  Acreditar Fichas al Ganador
                </button>
              )}
            </div>

            {activeEventDetail.status === 'drawn' && activeEventDetail.winnerId && (
              <div style={{ marginTop: 14, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 10, padding: 14, textAlign: 'center' }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>{'🎉'}</div>
                <div style={{ color: '#D4A843', fontWeight: 700, fontSize: 16 }}>
                  Ganador: {activeEventDetail.entries?.find(e => e.id === activeEventDetail.winnerId)?.clientName || 'Cliente #' + activeEventDetail.winnerClientId}
                </div>
                <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
                  {activeEventDetail.winnerClaimed ? 'Premio reclamado' : 'Esperando que reclame...'}
                </div>
              </div>
            )}
            {activeEventDetail.status === 'claimed' && (
              <div style={{ marginTop: 14, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, padding: 14, textAlign: 'center' }}>
                <div style={{ color: '#10b981', fontWeight: 700, fontSize: 16 }}>Premio reclamado exitosamente</div>
                <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
                  {activeEventDetail.entries?.find(e => e.id === activeEventDetail.winnerId)?.clientName} recibio ${Number(activeEventDetail.prizeAmount).toLocaleString()} fichas
                </div>
              </div>
            )}
          </div>

          <h3 style={{ color: '#e0e0e0', marginBottom: 12, fontSize: 16 }}>Participantes ({activeEventDetail.entries?.length || 0})</h3>
          {activeEventDetail.entries && activeEventDetail.entries.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <th style={thStyle}>#</th>
                    <th style={thStyle}>Cliente</th>
                    <th style={thStyle}>Estado</th>
                    <th style={thStyle}>Deposito</th>
                    <th style={thStyle}>Inscripcion</th>
                    <th style={thStyle}>Clasificacion</th>
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
                          {entry.id === activeEventDetail.winnerId && 'GANADOR '}
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
                          {entry.qualified ? 'Calificado' : 'Inscripto'}
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
              Todavia no hay participantes
            </div>
          )}
        </div>
      )}

      {activeTab === 'active' && !activeEventDetail && (
        <div style={{ textAlign: 'center', color: '#555', padding: 60 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>{'🎰'}</div>
          <div>No hay evento activo. Crea uno desde la pestana "Crear".</div>
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
                    <span>Dep. min: ${Number(ev.minDeposit).toLocaleString()}</span>
                    <span>Premio: ${Number(ev.prizeAmount).toLocaleString()}</span>
                    <span>Participantes: {ev.totalEntries || 0}</span>
                    <span>Calificados: {ev.qualifiedEntries || 0}</span>
                  </div>
                  {ev.winnerClientId && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#D4A843' }}>
                      Ganador: Cliente #{ev.winnerClientId} {ev.winnerClaimed ? '(Premio reclamado)' : '(Sin reclamar)'}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button onClick={() => { setActiveEvent(ev); loadActiveEventDetail(ev.id); setActiveTab('active'); }} style={{ background: 'rgba(255,255,255,0.05)', color: '#999', border: '1px solid rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>
                      Ver detalle
                    </button>
                    {(ev.status === 'ended' || ev.status === 'drawn' || ev.status === 'claimed') && (
                      <button onClick={() => handleDelete(ev.id)} style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>
                        Borrar
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

// ============================================
// QUIZ TAB
// ============================================
function QuizTab() {
  const { toast } = useToast();
  const [subTab, setSubTab] = useState('create');
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [activeQuizDetail, setActiveQuizDetail] = useState(null);
  const [saving, setSaving] = useState(false);
  const [countdown, setCountdown] = useState('');
  const timerRef = useRef(null);

  const [form, setForm] = useState({
    question: '',
    options: ['', '', '', ''],
    correctIndex: 0,
    prizeAmount: 2000,
    timeLimit: 10,
  });

  useEffect(() => {
    loadQuizzes();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Auto-refresh active quiz
  useEffect(() => {
    if (!activeQuiz || activeQuiz.status !== 'active') return;
    const interval = setInterval(() => {
      loadQuizDetail(activeQuiz.id);
    }, 2000);
    return () => clearInterval(interval);
  }, [activeQuiz?.id, activeQuiz?.status]);

  // Countdown timer for active quiz
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!activeQuiz || !activeQuiz.startedAt || activeQuiz.status !== 'active') return;
    const endTime = new Date(activeQuiz.startedAt).getTime() + (activeQuiz.timeLimit * 1000);
    const tick = () => {
      const diff = endTime - Date.now();
      if (diff <= 0) {
        setCountdown('00');
        clearInterval(timerRef.current);
        loadQuizzes();
        return;
      }
      setCountdown(String(Math.ceil(diff / 1000)));
    };
    tick();
    timerRef.current = setInterval(tick, 200);
    return () => clearInterval(timerRef.current);
  }, [activeQuiz?.startedAt, activeQuiz?.status]);

  async function loadQuizzes() {
    try {
      const data = await getQuizzes();
      setQuizzes(Array.isArray(data) ? data : []);
      const active = (Array.isArray(data) ? data : []).find(q => q.status === 'active');
      if (active) {
        setActiveQuiz(active);
        setSubTab('active');
        loadQuizDetail(active.id);
      }
    } catch (err) {
      console.error('Error loading quizzes', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadQuizDetail(id) {
    try {
      const detail = await getQuizById(id);
      setActiveQuizDetail(detail);
      if (detail.status !== activeQuiz?.status) {
        setActiveQuiz(prev => prev ? { ...prev, ...detail } : detail);
      }
    } catch (err) {
      console.error('Error loading quiz detail', err);
    }
  }

  async function handleCreateQuiz(asDraft = true) {
    if (!form.question || form.options.some(o => !o.trim())) {
      toast('Completa la pregunta y las 4 opciones', 'error');
      return;
    }
    setSaving(true);
    try {
      const quiz = await createQuiz({
        question: form.question,
        options: form.options,
        correctIndex: form.correctIndex,
        prizeAmount: form.prizeAmount,
        timeLimit: form.timeLimit,
      });
      toast('Quiz creado');
      setQuizzes(prev => [quiz, ...prev]);
      if (!asDraft) {
        await handleStartQuiz(quiz.id);
      }
      setForm({ question: '', options: ['', '', '', ''], correctIndex: 0, prizeAmount: 2000, timeLimit: 10 });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleStartQuiz(quizId) {
    try {
      const updated = await startQuiz(quizId);
      toast('Quiz lanzado! Popup enviado a todos');
      setActiveQuiz(updated);
      setSubTab('active');
      loadQuizDetail(updated.id);
      loadQuizzes();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function handleEndQuiz() {
    if (!activeQuiz) return;
    try {
      await endQuizApi(activeQuiz.id);
      toast('Quiz terminado');
      loadQuizzes();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function handleDeleteQuiz(id) {
    if (!confirm('Borrar este quiz?')) return;
    try {
      await deleteQuiz(id);
      toast('Quiz eliminado');
      loadQuizzes();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const draftQuizzes = quizzes.filter(q => q.status === 'draft');
  const historyQuizzes = quizzes.filter(q => q.status === 'ended');

  const subTabs = [
    { id: 'create', label: '+ Crear Quiz' },
    { id: 'active', label: 'Quiz Activo', disabled: !activeQuiz && !activeQuizDetail },
    { id: 'history', label: 'Historial' },
  ];

  const optionLetters = ['A', 'B', 'C', 'D'];

  return (
    <div>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 20 }}>
        {subTabs.map(t => (
          <button
            key={t.id}
            onClick={() => !t.disabled && setSubTab(t.id)}
            style={{
              padding: '10px 18px',
              background: subTab === t.id ? 'rgba(212,168,67,0.08)' : 'transparent',
              border: 'none',
              borderBottom: subTab === t.id ? '2px solid #D4A843' : '2px solid transparent',
              color: t.disabled ? '#555' : subTab === t.id ? '#D4A843' : '#999',
              cursor: t.disabled ? 'default' : 'pointer',
              fontSize: 13,
              fontWeight: subTab === t.id ? 600 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* CREATE QUIZ */}
      {subTab === 'create' && (
        <div>
          {draftQuizzes.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ color: '#D4A843', marginBottom: 12, fontSize: 16 }}>Borradores</h3>
              <div style={{ display: 'grid', gap: 10 }}>
                {draftQuizzes.map(q => (
                  <div key={q.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600, color: '#e0e0e0' }}>{q.question}</div>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                        Premio: ${Number(q.prizeAmount).toLocaleString()} | Tiempo: {q.timeLimit}s | Correcta: {optionLetters[q.correctIndex]}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => handleStartQuiz(q.id)} style={{ background: 'linear-gradient(135deg,#D4A843,#b8912e)', color: '#000', border: 'none', padding: '6px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
                        Lanzar
                      </button>
                      <button onClick={() => handleDeleteQuiz(q.id)} style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12 }}>
                        Borrar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <h3 style={{ color: '#D4A843', marginBottom: 16, fontSize: 16 }}>Crear Nuevo Quiz</h3>
          <div style={{ display: 'grid', gap: 14, maxWidth: 550 }}>
            <div>
              <label style={labelStyle}>Pregunta *</label>
              <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} placeholder="ej: Cual es la capital de Argentina?" value={form.question} onChange={e => setForm(f => ({ ...f, question: e.target.value }))} />
            </div>

            <div>
              <label style={labelStyle}>Opciones (4 respuestas) *</label>
              <div style={{ display: 'grid', gap: 8 }}>
                {form.options.map((opt, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={() => setForm(f => ({ ...f, correctIndex: i }))}
                      style={{
                        width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer',
                        background: form.correctIndex === i ? '#10b981' : 'rgba(255,255,255,0.08)',
                        color: form.correctIndex === i ? '#fff' : '#888',
                        fontWeight: 700, fontSize: 13, flexShrink: 0,
                      }}
                      title={form.correctIndex === i ? 'Respuesta correcta' : 'Click para marcar como correcta'}
                    >
                      {optionLetters[i]}
                    </button>
                    <input
                      style={{ ...inputStyle, flex: 1 }}
                      placeholder={`Opcion ${optionLetters[i]}`}
                      value={opt}
                      onChange={e => {
                        const newOpts = [...form.options];
                        newOpts[i] = e.target.value;
                        setForm(f => ({ ...f, options: newOpts }));
                      }}
                    />
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>
                Click en la letra para marcar la respuesta correcta (verde = correcta)
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={labelStyle}>Premio en fichas *</label>
                <input style={inputStyle} type="number" value={form.prizeAmount} onChange={e => setForm(f => ({ ...f, prizeAmount: Number(e.target.value) }))} />
              </div>
              <div>
                <label style={labelStyle}>Tiempo limite (segundos) *</label>
                <input style={inputStyle} type="number" min={5} max={60} value={form.timeLimit} onChange={e => setForm(f => ({ ...f, timeLimit: Number(e.target.value) }))} />
              </div>
            </div>

            {/* Preview */}
            {form.question && (
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 12, padding: 16, marginTop: 8 }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>Vista previa del popup:</div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#8b5cf6', marginBottom: 4 }}>QUIZ EN VIVO!</div>
                  <div style={{ fontSize: 13, color: '#e0e0e0', marginBottom: 12, lineHeight: 1.4 }}>{form.question}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, maxWidth: 300, margin: '0 auto' }}>
                    {form.options.map((opt, i) => (
                      <div key={i} style={{
                        padding: '6px 10px', borderRadius: 8, fontSize: 12,
                        background: opt ? 'rgba(139,92,246,0.1)' : 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(139,92,246,0.2)',
                        color: opt ? '#e0e0e0' : '#555',
                      }}>
                        {optionLetters[i]}. {opt || '...'}
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: '#888' }}>
                    Premio: ${Number(form.prizeAmount).toLocaleString()} fichas | {form.timeLimit}s para responder
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button onClick={() => handleCreateQuiz(true)} disabled={saving} style={{ ...btnStyle, background: 'rgba(255,255,255,0.08)', color: '#e0e0e0', border: '1px solid rgba(255,255,255,0.1)' }}>
                {saving ? '...' : 'Guardar Borrador'}
              </button>
              <button onClick={() => handleCreateQuiz(false)} disabled={saving} style={{ ...btnStyle, background: 'linear-gradient(135deg,#8b5cf6,#6d28d9)', color: '#fff', fontWeight: 700 }}>
                {saving ? '...' : 'Crear y Lanzar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE QUIZ */}
      {subTab === 'active' && activeQuizDetail && (
        <div>
          <div style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.1), rgba(30,20,40,0.5))', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <h2 style={{ color: '#8b5cf6', margin: 0, fontSize: 20 }}>Quiz en Vivo</h2>
                  <StatusBadge status={activeQuizDetail.status} />
                </div>
                <div style={{ color: '#e0e0e0', fontSize: 15, fontWeight: 600, marginTop: 4 }}>
                  {activeQuizDetail.question}
                </div>
              </div>
              {activeQuizDetail.status === 'active' && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Tiempo</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 36, fontWeight: 700, color: '#8b5cf6' }}>{countdown}s</div>
                </div>
              )}
            </div>

            {/* Options display */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              {activeQuizDetail.options?.map((opt, i) => (
                <div key={i} style={{
                  padding: '10px 14px', borderRadius: 10, fontSize: 13,
                  background: activeQuizDetail.status === 'ended' && i === activeQuizDetail.correctIndex
                    ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.04)',
                  border: activeQuizDetail.status === 'ended' && i === activeQuizDetail.correctIndex
                    ? '2px solid #10b981' : '1px solid rgba(255,255,255,0.08)',
                  color: '#e0e0e0',
                }}>
                  <span style={{ fontWeight: 700, marginRight: 8 }}>{optionLetters[i]}.</span>
                  {opt}
                  {activeQuizDetail.status === 'ended' && i === activeQuizDetail.correctIndex && (
                    <span style={{ marginLeft: 8, color: '#10b981' }}> CORRECTA</span>
                  )}
                </div>
              ))}
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
              <StatCard label="Respuestas" value={activeQuizDetail.totalAnswers || 0} color="#8b5cf6" />
              <StatCard label="Correctas" value={activeQuizDetail.correctAnswers || 0} color="#10b981" />
              <StatCard label="Incorrectas" value={(activeQuizDetail.totalAnswers || 0) - (activeQuizDetail.correctAnswers || 0)} color="#ef4444" />
              <StatCard label="Premio c/u" value={`$${Number(activeQuizDetail.prizeAmount).toLocaleString()}`} color="#D4A843" />
            </div>

            {activeQuizDetail.status === 'active' && (
              <button onClick={handleEndQuiz} style={{ ...btnStyle, background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                Terminar Quiz
              </button>
            )}

            {activeQuizDetail.status === 'ended' && activeQuizDetail.correctAnswers > 0 && (
              <div style={{ marginTop: 10, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, padding: 12, textAlign: 'center' }}>
                <div style={{ color: '#10b981', fontWeight: 700 }}>
                  {activeQuizDetail.correctAnswers} ganador{activeQuizDetail.correctAnswers > 1 ? 'es' : ''} - ${Number(activeQuizDetail.prizeAmount * activeQuizDetail.correctAnswers).toLocaleString()} fichas repartidas
                </div>
              </div>
            )}
          </div>

          {/* Answers table */}
          {activeQuizDetail.answers && activeQuizDetail.answers.length > 0 && (
            <div>
              <h3 style={{ color: '#e0e0e0', marginBottom: 12, fontSize: 16 }}>Respuestas ({activeQuizDetail.answers.length})</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <th style={thStyle}>#</th>
                      <th style={thStyle}>Cliente</th>
                      <th style={thStyle}>Respuesta</th>
                      <th style={thStyle}>Resultado</th>
                      <th style={thStyle}>Tiempo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeQuizDetail.answers.map((ans, i) => (
                      <tr key={ans.id} style={{
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        background: ans.correct ? 'rgba(16,185,129,0.05)' : 'transparent',
                      }}>
                        <td style={tdStyle}>{i + 1}</td>
                        <td style={tdStyle}>{ans.clientName || `Cliente #${ans.clientId}`}</td>
                        <td style={tdStyle}>{optionLetters[ans.selectedIndex]}. {activeQuizDetail.options?.[ans.selectedIndex] || '?'}</td>
                        <td style={tdStyle}>
                          <span style={{
                            padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                            background: ans.correct ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                            color: ans.correct ? '#10b981' : '#ef4444',
                          }}>
                            {ans.correct ? 'Correcta' : 'Incorrecta'}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, fontSize: 12, color: '#888' }}>
                          {ans.timeMs ? `${(ans.timeMs / 1000).toFixed(1)}s` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {subTab === 'active' && !activeQuizDetail && (
        <div style={{ textAlign: 'center', color: '#555', padding: 60 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>{'🧠'}</div>
          <div>No hay quiz activo. Crea uno desde la pestana "Crear Quiz".</div>
        </div>
      )}

      {/* HISTORY */}
      {subTab === 'history' && (
        <div>
          <h3 style={{ color: '#D4A843', marginBottom: 14, fontSize: 16 }}>Historial de Quizzes</h3>
          {historyQuizzes.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#555', padding: 40 }}>
              No hay quizzes en el historial
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {historyQuizzes.map(q => (
                <div key={q.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontWeight: 600, color: '#e0e0e0' }}>{q.question}</span>
                    </div>
                    <span style={{ fontSize: 12, color: '#888' }}>
                      {q.startedAt ? new Date(q.startedAt).toLocaleDateString('es-AR') : new Date(q.createdAt).toLocaleDateString('es-AR')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 20, fontSize: 12, color: '#888' }}>
                    <span>Respuestas: {q.totalAnswers || 0}</span>
                    <span style={{ color: '#10b981' }}>Correctas: {q.correctAnswers || 0}</span>
                    <span>Premio c/u: ${Number(q.prizeAmount).toLocaleString()}</span>
                    <span>Correcta: {optionLetters[q.correctIndex]}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button onClick={() => { setActiveQuiz(q); loadQuizDetail(q.id); setSubTab('active'); }} style={{ background: 'rgba(255,255,255,0.05)', color: '#999', border: '1px solid rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>
                      Ver detalle
                    </button>
                    <button onClick={() => handleDeleteQuiz(q.id)} style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>
                      Borrar
                    </button>
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

// ============================================
// RASPA Y GANA TAB
// ============================================
function RaspaTab() {
  const { toast } = useToast();
  const [subTab, setSubTab] = useState('create');
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCard, setActiveCard] = useState(null);
  const [activeCardDetail, setActiveCardDetail] = useState(null);
  const [saving, setSaving] = useState(false);

  const defaultPrizes = [
    { label: 'Premio Mayor', amount: 10000, probability: 5, emoji: '💎' },
    { label: 'Premio Medio', amount: 2000, probability: 15, emoji: '🌟' },
    { label: 'Premio Menor', amount: 500, probability: 30, emoji: '🍀' },
    { label: 'Sin premio', amount: 0, probability: 50, emoji: '❌' },
  ];

  const [form, setForm] = useState({
    name: '',
    prizes: [...defaultPrizes],
  });

  useEffect(() => { loadCards(); }, []);

  // Auto-refresh active card
  useEffect(() => {
    if (!activeCard || activeCard.status !== 'active') return;
    const interval = setInterval(() => { loadCardDetail(activeCard.id); }, 5000);
    return () => clearInterval(interval);
  }, [activeCard?.id, activeCard?.status]);

  async function loadCards() {
    try {
      const data = await getScratchCards();
      setCards(Array.isArray(data) ? data : []);
      const active = (Array.isArray(data) ? data : []).find(c => c.status === 'active');
      if (active) {
        setActiveCard(active);
        setSubTab('active');
        loadCardDetail(active.id);
      }
    } catch (err) {
      console.error('Error loading scratch cards', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadCardDetail(id) {
    try {
      const detail = await getScratchCardById(id);
      setActiveCardDetail(detail);
      if (detail.status !== activeCard?.status) {
        setActiveCard(prev => prev ? { ...prev, ...detail } : detail);
      }
    } catch (err) {
      console.error('Error loading scratch card detail', err);
    }
  }

  async function handleCreate(asDraft = true) {
    if (!form.name) { toast('Ingresa un nombre', 'error'); return; }
    const validPrizes = form.prizes.filter(p => p.label && p.emoji);
    if (validPrizes.length < 2) { toast('Necesitas al menos 2 premios', 'error'); return; }
    const totalProb = validPrizes.reduce((s, p) => s + p.probability, 0);
    if (totalProb < 99 || totalProb > 101) { toast(`La probabilidad total debe sumar 100% (ahora: ${totalProb}%)`, 'error'); return; }
    setSaving(true);
    try {
      const card = await createScratchCard({ name: form.name, prizes: validPrizes });
      toast('Raspa y Gana creado');
      setCards(prev => [card, ...prev]);
      if (!asDraft) { await handleStart(card.id); }
      setForm({ name: '', prizes: [...defaultPrizes] });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleStart(cardId) {
    try {
      const updated = await startScratchCard(cardId);
      toast('Raspa y Gana activado!');
      setActiveCard(updated);
      setSubTab('active');
      loadCardDetail(updated.id);
      loadCards();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function handleEnd() {
    if (!activeCard) return;
    if (!confirm('Terminar este Raspa y Gana?')) return;
    try {
      await endScratchCard(activeCard.id);
      toast('Raspa y Gana terminado');
      loadCards();
      setActiveCard(null);
      setActiveCardDetail(null);
      setSubTab('create');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function handleDelete(id) {
    if (!confirm('Borrar este Raspa y Gana?')) return;
    try {
      await deleteScratchCard(id);
      toast('Eliminado');
      loadCards();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function updatePrize(index, field, value) {
    setForm(f => {
      const newPrizes = [...f.prizes];
      newPrizes[index] = { ...newPrizes[index], [field]: field === 'amount' || field === 'probability' ? Number(value) : value };
      return { ...f, prizes: newPrizes };
    });
  }

  function addPrize() {
    setForm(f => ({ ...f, prizes: [...f.prizes, { label: '', amount: 0, probability: 0, emoji: '🎁' }] }));
  }

  function removePrize(index) {
    setForm(f => ({ ...f, prizes: f.prizes.filter((_, i) => i !== index) }));
  }

  const draftCards = cards.filter(c => c.status === 'draft');
  const historyCards = cards.filter(c => c.status === 'ended');
  const totalProb = form.prizes.reduce((s, p) => s + (p.probability || 0), 0);

  const subTabs = [
    { id: 'create', label: '+ Crear' },
    { id: 'active', label: 'Activo', disabled: !activeCard && !activeCardDetail },
    { id: 'history', label: 'Historial' },
  ];

  const emojiOptions = ['💎', '🌟', '🍀', '🎁', '💰', '🏆', '👑', '🔥', '⭐', '❌', '🎲', '🃏'];

  return (
    <div>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 20 }}>
        {subTabs.map(t => (
          <button
            key={t.id}
            onClick={() => !t.disabled && setSubTab(t.id)}
            style={{
              padding: '10px 18px',
              background: subTab === t.id ? 'rgba(212,168,67,0.08)' : 'transparent',
              border: 'none',
              borderBottom: subTab === t.id ? '2px solid #D4A843' : '2px solid transparent',
              color: t.disabled ? '#555' : subTab === t.id ? '#D4A843' : '#999',
              cursor: t.disabled ? 'default' : 'pointer',
              fontSize: 13,
              fontWeight: subTab === t.id ? 600 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* CREATE */}
      {subTab === 'create' && (
        <div>
          {draftCards.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ color: '#D4A843', marginBottom: 12, fontSize: 16 }}>Borradores</h3>
              <div style={{ display: 'grid', gap: 10 }}>
                {draftCards.map(c => (
                  <div key={c.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600, color: '#e0e0e0' }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                        {c.prizes?.length || 0} premios configurados
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => handleStart(c.id)} style={{ background: 'linear-gradient(135deg,#D4A843,#b8912e)', color: '#000', border: 'none', padding: '6px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
                        Activar
                      </button>
                      <button onClick={() => handleDelete(c.id)} style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12 }}>
                        Borrar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <h3 style={{ color: '#D4A843', marginBottom: 16, fontSize: 16 }}>Crear Raspa y Gana</h3>
          <div style={{ display: 'grid', gap: 14, maxWidth: 600 }}>
            <div>
              <label style={labelStyle}>Nombre de la campana *</label>
              <input style={inputStyle} placeholder="ej: Raspa Viernes Loco" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>

            <div>
              <label style={labelStyle}>Premios (probabilidad total debe sumar 100%)</label>
              <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
                {form.prizes.map((prize, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <select
                      value={prize.emoji}
                      onChange={e => updatePrize(i, 'emoji', e.target.value)}
                      style={{ ...inputStyle, width: 50, padding: '6px', textAlign: 'center', fontSize: 18 }}
                    >
                      {emojiOptions.map(em => (
                        <option key={em} value={em}>{em}</option>
                      ))}
                    </select>
                    <input
                      style={{ ...inputStyle, flex: 2 }}
                      placeholder="Nombre premio"
                      value={prize.label}
                      onChange={e => updatePrize(i, 'label', e.target.value)}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 11, color: '#888' }}>$</span>
                      <input
                        style={{ ...inputStyle, width: 80 }}
                        type="number"
                        placeholder="Monto"
                        value={prize.amount}
                        onChange={e => updatePrize(i, 'amount', e.target.value)}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input
                        style={{ ...inputStyle, width: 55 }}
                        type="number"
                        min={0}
                        max={100}
                        value={prize.probability}
                        onChange={e => updatePrize(i, 'probability', e.target.value)}
                      />
                      <span style={{ fontSize: 11, color: '#888' }}>%</span>
                    </div>
                    <button
                      onClick={() => removePrize(i)}
                      style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}
                    >
                      X
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <button onClick={addPrize} style={{ background: 'rgba(255,255,255,0.05)', color: '#999', border: '1px solid rgba(255,255,255,0.1)', padding: '4px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                  + Agregar premio
                </button>
                <span style={{ fontSize: 12, color: totalProb === 100 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                  Total: {totalProb}%
                </span>
              </div>
            </div>

            {/* Preview */}
            {form.name && (
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(212,168,67,0.2)', borderRadius: 12, padding: 16, marginTop: 8 }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>Vista previa de la tarjeta:</div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#D4A843', marginBottom: 8 }}>RASPA Y GANA!</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, maxWidth: 180, margin: '0 auto' }}>
                    {[0,1,2,3,4,5,6,7,8].map(i => (
                      <div key={i} style={{ width: 50, height: 50, background: 'linear-gradient(135deg,#888,#aaa)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#fff', fontWeight: 700 }}>
                        ?
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: '#888' }}>
                    {form.prizes.filter(p => p.amount > 0).map(p => `${p.emoji} ${p.label}: $${Number(p.amount).toLocaleString()} (${p.probability}%)`).join(' | ')}
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button onClick={() => handleCreate(true)} disabled={saving} style={{ ...btnStyle, background: 'rgba(255,255,255,0.08)', color: '#e0e0e0', border: '1px solid rgba(255,255,255,0.1)' }}>
                {saving ? '...' : 'Guardar Borrador'}
              </button>
              <button onClick={() => handleCreate(false)} disabled={saving} style={{ ...btnStyle, background: 'linear-gradient(135deg,#D4A843,#b8912e)', color: '#000', fontWeight: 700 }}>
                {saving ? '...' : 'Crear y Activar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE */}
      {subTab === 'active' && activeCardDetail && (
        <div>
          <div style={{ background: 'linear-gradient(135deg, rgba(212,168,67,0.1), rgba(30,25,15,0.5))', border: '1px solid rgba(212,168,67,0.3)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <h2 style={{ color: '#D4A843', margin: 0, fontSize: 20 }}>{activeCardDetail.name}</h2>
                  <StatusBadge status={activeCardDetail.status} />
                </div>
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
              <StatCard label="Rasparon" value={activeCardDetail.totalPlayed || 0} color="#3b82f6" />
              <StatCard label="Ganadores" value={activeCardDetail.totalWinners || 0} color="#10b981" />
              <StatCard label="Sin premio" value={(activeCardDetail.totalPlayed || 0) - (activeCardDetail.totalWinners || 0)} color="#888" />
              <StatCard label="Total repartido" value={`$${Number(activeCardDetail.totalPrizeGiven || 0).toLocaleString()}`} color="#D4A843" />
            </div>

            {/* Prizes config */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Premios configurados:</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {activeCardDetail.prizes?.map((p, i) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>
                    <span style={{ marginRight: 4 }}>{p.emoji}</span>
                    <span style={{ color: '#e0e0e0' }}>{p.label}</span>
                    {p.amount > 0 && <span style={{ color: '#D4A843', marginLeft: 6 }}>${Number(p.amount).toLocaleString()}</span>}
                    <span style={{ color: '#666', marginLeft: 6 }}>({p.probability}%)</span>
                  </div>
                ))}
              </div>
            </div>

            {activeCardDetail.status === 'active' && (
              <button onClick={handleEnd} style={{ ...btnStyle, background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                Terminar Raspa y Gana
              </button>
            )}
          </div>

          {/* Plays table */}
          {activeCardDetail.plays && activeCardDetail.plays.length > 0 && (
            <div>
              <h3 style={{ color: '#e0e0e0', marginBottom: 12, fontSize: 16 }}>Jugadas ({activeCardDetail.plays.length})</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <th style={thStyle}>#</th>
                      <th style={thStyle}>Cliente</th>
                      <th style={thStyle}>Resultado</th>
                      <th style={thStyle}>Premio</th>
                      <th style={thStyle}>Hora</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeCardDetail.plays.map((play, i) => (
                      <tr key={play.id} style={{
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        background: play.won ? 'rgba(16,185,129,0.05)' : 'transparent',
                      }}>
                        <td style={tdStyle}>{i + 1}</td>
                        <td style={tdStyle}>{play.clientName || `Cliente #${play.clientId}`}</td>
                        <td style={tdStyle}>
                          <span style={{
                            padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                            background: play.won ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.05)',
                            color: play.won ? '#10b981' : '#888',
                          }}>
                            {play.won ? 'Gano!' : 'Sin premio'}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          {play.won ? (
                            <span style={{ color: '#D4A843' }}>{play.prizeLabel} - ${Number(play.prizeAmount).toLocaleString()}</span>
                          ) : (
                            <span style={{ color: '#555' }}>-</span>
                          )}
                        </td>
                        <td style={{ ...tdStyle, fontSize: 12, color: '#888' }}>
                          {new Date(play.playedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {subTab === 'active' && !activeCardDetail && (
        <div style={{ textAlign: 'center', color: '#555', padding: 60 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>{'🎫'}</div>
          <div>No hay Raspa y Gana activo. Crea uno desde "Crear".</div>
        </div>
      )}

      {/* HISTORY */}
      {subTab === 'history' && (
        <div>
          <h3 style={{ color: '#D4A843', marginBottom: 14, fontSize: 16 }}>Historial</h3>
          {historyCards.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#555', padding: 40 }}>
              No hay historial
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {historyCards.map(c => (
                <div key={c.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, color: '#e0e0e0' }}>{c.name}</span>
                    <span style={{ fontSize: 12, color: '#888' }}>
                      {c.startedAt ? new Date(c.startedAt).toLocaleDateString('es-AR') : new Date(c.createdAt).toLocaleDateString('es-AR')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 20, fontSize: 12, color: '#888' }}>
                    <span>Jugadas: {c.totalPlayed || 0}</span>
                    <span style={{ color: '#10b981' }}>Ganadores: {c.totalWinners || 0}</span>
                    <span style={{ color: '#D4A843' }}>Repartido: ${Number(c.totalPrizeGiven || 0).toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button onClick={() => { setActiveCard(c); loadCardDetail(c.id); setSubTab('active'); }} style={{ background: 'rgba(255,255,255,0.05)', color: '#999', border: '1px solid rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>
                      Ver detalle
                    </button>
                    <button onClick={() => handleDelete(c.id)} style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>
                      Borrar
                    </button>
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

// ============================================
// RULETA TAB (placeholder)
// ============================================
function RuletaTab() {
  return (
    <div style={{ textAlign: 'center', padding: 60, color: '#555' }}>
      <div style={{ fontSize: 50, marginBottom: 16 }}>{'🎡'}</div>
      <h3 style={{ color: '#D4A843', margin: '0 0 8px' }}>Ruleta de Premios</h3>
      <p style={{ margin: 0 }}>Proximamente - Ruleta visual con premios configurables</p>
    </div>
  );
}

// ============================================
// RANKING TAB (placeholder)
// ============================================
function RankingTab() {
  return (
    <div style={{ textAlign: 'center', padding: 60, color: '#555' }}>
      <div style={{ fontSize: 50, marginBottom: 16 }}>{'🏆'}</div>
      <h3 style={{ color: '#D4A843', margin: '0 0 8px' }}>Ranking de Jugadores</h3>
      <p style={{ margin: 0 }}>Proximamente - Tabla de clasificacion por depositos/actividad</p>
    </div>
  );
}
