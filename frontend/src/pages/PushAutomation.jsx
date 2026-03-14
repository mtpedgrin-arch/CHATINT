import { useState, useEffect, Component } from 'react';
import { useToast } from '../context/ToastContext';
import {
  getPushAutomationConfig,
  savePushAutomationConfig,
  getPushSubscribersStats,
  getPushAutomationStats,
  startPushAutomation,
  stopPushAutomation,
  getPushAutomationStatus,
} from '../api';

// ==================== ERROR BOUNDARY ====================
class PushErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[PushAuto] RENDER CRASH:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, color: '#f87171', textAlign: 'center' }}>
          <h2 style={{ color: '#D4A843' }}>Error en Push Automation</h2>
          <p style={{ color: '#ccc', marginTop: 10 }}>{String(this.state.error)}</p>
          <button onClick={() => this.setState({ hasError: false, error: null })}
            style={{ marginTop: 16, padding: '8px 20px', background: '#D4A843', color: '#000', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700 }}>
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ==================== DEFAULTS ====================
function getDefaultConfig() {
  return {
    global: { enabled: false, timezone: 'America/Argentina/Buenos_Aires', checkIntervalMinutes: 15, maxPushesPerUserPerDay: 5, quietHoursStart: 1, quietHoursEnd: 8 },
    inactivity: { enabled: false, rules: [
      { daysInactive: 1, title: '🎰 Te extraniamos!', body: 'Tu suerte te espera. Volve a jugar!', icon: '🎰', url: '/widget', onlyOnce: false, enabled: true },
      { daysInactive: 3, title: '💰 Tenes un BONO esperandote', body: 'Volve hoy y aproveche tu bono!', icon: '💰', url: '/widget', onlyOnce: false, enabled: true },
      { daysInactive: 7, title: '🎁 BONO EXCLUSIVO 50%', body: 'Solo por volver. Vence hoy!', icon: '🎁', url: '/widget', onlyOnce: true, enabled: true },
      { daysInactive: 14, title: '😢 Tu lugar VIP te espera', body: 'Te lo guardamos. Ultimas 48hs!', icon: '😢', url: '/widget', onlyOnce: true, enabled: true },
      { daysInactive: 30, title: '🔥 ULTIMA OPORTUNIDAD', body: 'Bono 100% de recarga. No te lo pierdas!', icon: '🔥', url: '/widget', onlyOnce: true, enabled: true },
    ]},
    scheduled: { enabled: false, campaigns: [] },
    events: { enabled: false, triggers: {} },
    reconsumo: { enabled: false, rules: [
      { id: 'balance_zero', enabled: true, triggerType: 'balance_zero', title: '💸 Se te acabaron las fichas!', body: 'Carga y segui jugando 🎰', icon: '💸', url: '/widget', onlyOnce: false },
      { id: 'balance_low', enabled: true, triggerType: 'balance_low', title: 'Te quedan pocas fichas', body: 'Carga ahora y recibi 20% extra', icon: '⚡', url: '/widget', threshold: 500, onlyOnce: false },
      { id: 'big_win', enabled: true, triggerType: 'big_win', title: '🏆 Ganaste!', body: 'La racha sigue, no pares ahora 🔥', icon: '🏆', url: '/widget', onlyOnce: false },
      { id: 'big_loss', enabled: true, triggerType: 'big_loss', title: '🍀 La suerte cambia', body: 'Carga $1000 y te damos $200 extra', icon: '🍀', url: '/widget', onlyOnce: false },
      { id: 'no_deposit_3d', enabled: true, triggerType: 'no_deposit_days', title: '💳 Hace dias que no cargas', body: 'Bono 30% en tu proxima carga!', icon: '💳', url: '/widget', daysThreshold: 3, onlyOnce: false },
    ]},
    urgencia: { enabled: false, rules: [
      { id: 'sorteo_ending', enabled: true, triggerType: 'fomo_sorteo_ending', title: 'Quedan 30 min para el sorteo!', body: 'Ya cargaste? No te lo pierdas!', icon: '⏰', url: '/widget', minutesBefore: 30 },
      { id: 'bono_expiring', enabled: true, triggerType: 'fomo_bono_expiring', title: 'Tu bono vence en 2 horas', body: 'Usalo o se pierde!', icon: '⚠', url: '/widget', hoursBefore: 2 },
      { id: 'players_online', enabled: true, triggerType: 'fomo_players_online', title: '🔥 Muchos jugadores online!', body: 'Unite a la accion ahora!', icon: '🔥', url: '/widget', threshold: 50 },
      { id: 'someone_won', enabled: true, triggerType: 'fomo_someone_won', title: '🏆 Un jugador acaba de ganar!', body: 'El proximo sos vos? 🎰', icon: '🏆', url: '/widget' },
    ]},
    onboarding: { enabled: false, steps: [
      { id: 'day0', day: 0, condition: 'always', enabled: true, title: '🎰 Bienvenido!', body: 'Carga y recibi 100% extra en tu primera carga', icon: '🎰', url: '/widget' },
      { id: 'day1_loaded', day: 1, condition: 'deposited', enabled: true, title: 'Genial tu primera carga!', body: 'Conoce los eventos y gana mas premios 🎁', icon: '✅', url: '/widget' },
      { id: 'day1_noload', day: 1, condition: 'not_deposited', enabled: true, title: '💰 Todavia no cargaste', body: 'Tu bono de bienvenida te espera!', icon: '💰', url: '/widget' },
      { id: 'day3', day: 3, condition: 'always', enabled: true, title: '🎲 Probaste los juegos?', body: 'Los jugadores los aman. Entra y juga!', icon: '🎲', url: '/widget' },
      { id: 'day5', day: 5, condition: 'always', enabled: true, title: '🏆 Este finde hay SORTEO', body: 'Carga y participa por premios!', icon: '🏆', url: '/widget' },
      { id: 'day7', day: 7, condition: 'always', enabled: true, title: '🎉 1 semana con nosotros!', body: 'Bono especial de fidelidad. Aprovecha hoy!', icon: '🎉', url: '/widget' },
    ]},
    templates: [],
  };
}

// ==================== INLINE COMPONENTS ====================
function Toggle({ checked, onChange, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 44, height: 24, borderRadius: 12, cursor: 'pointer',
          background: checked ? '#22c55e' : 'rgba(255,255,255,0.15)',
          position: 'relative', transition: 'background 0.2s',
        }}
      >
        <div style={{
          width: 20, height: 20, borderRadius: '50%', background: '#fff',
          position: 'absolute', top: 2,
          left: checked ? 22 : 2, transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </div>
      {label && <span style={{ fontSize: '0.85rem', color: '#ccc' }}>{label}</span>}
    </div>
  );
}

function StatCard({ label, value, icon, color }) {
  return (
    <div className="card" style={{ padding: 14, textAlign: 'center' }}>
      <div style={{ fontSize: '1.5rem' }}>{icon}</div>
      <div style={{ fontSize: '1.3rem', fontWeight: 700, color: color || '#fff' }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: '#999' }}>{label}</div>
    </div>
  );
}

function SectionCard({ title, enabled, onToggle, children }) {
  return (
    <div className="card" style={{ marginBottom: 16, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#D4A843' }}>{title}</span>
        <Toggle checked={enabled} onChange={onToggle} label={enabled ? 'Activo' : 'Inactivo'} />
      </div>
      <div style={{ padding: 18, opacity: enabled ? 1 : 0.4, pointerEvents: enabled ? 'auto' : 'none' }}>
        {children}
      </div>
    </div>
  );
}

function RuleRow({ label, enabled, onToggle, title, onTitleChange, body, onBodyChange, extra }) {
  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <Toggle checked={enabled} onChange={onToggle} />
        <span style={{ fontWeight: 600, fontSize: '0.85rem', color: enabled ? '#D4A843' : '#666' }}>{label}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8, paddingLeft: 56 }}>
        <input className="form-input" value={title || ''} onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Titulo" style={{ fontSize: '0.8rem' }} />
        <input className="form-input" value={body || ''} onChange={(e) => onBodyChange(e.target.value)}
          placeholder="Mensaje" style={{ fontSize: '0.8rem' }} />
      </div>
      {extra && <div style={{ paddingLeft: 56, marginTop: 6 }}>{extra}</div>}
    </div>
  );
}

// ==================== MAIN COMPONENT ====================
function PushAutomationInner() {
  const [config, setConfig] = useState(null);
  const [activeTab, setActiveTab] = useState('retencion');
  const [stats, setStats] = useState(null);
  const [subStats, setSubStats] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [renderError, setRenderError] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      setLoading(true);
      console.log('[PushAuto] Loading...');

      let rawCfg = null;
      try {
        rawCfg = await getPushAutomationConfig();
        console.log('[PushAuto] Config loaded:', typeof rawCfg, rawCfg);
      } catch (e) {
        console.error('[PushAuto] Config fetch error:', e);
      }

      let sub = { totalClients: 0, clientsWithPush: 0, adoptionRate: 0 };
      try { sub = await getPushSubscribersStats(); } catch (e) { console.warn('[PushAuto] SubStats error (ok):', e.message); }

      let sts = null;
      try { sts = await getPushAutomationStats(); } catch (e) { console.warn('[PushAuto] Stats error (ok):', e.message); }

      // Merge remote config with defaults (use defaults if section missing or empty)
      const defaults = getDefaultConfig();
      const cfg = {};
      const r = rawCfg || {};
      cfg.global = r.global ? { ...defaults.global, ...r.global } : defaults.global;
      cfg.inactivity = (r.inactivity && r.inactivity.rules && r.inactivity.rules.length > 0) ? r.inactivity : defaults.inactivity;
      cfg.scheduled = r.scheduled ? { ...defaults.scheduled, ...r.scheduled, campaigns: Array.isArray(r.scheduled.campaigns) ? r.scheduled.campaigns : [] } : defaults.scheduled;
      cfg.events = r.events ? r.events : defaults.events;
      cfg.reconsumo = (r.reconsumo && r.reconsumo.rules && r.reconsumo.rules.length > 0) ? r.reconsumo : defaults.reconsumo;
      cfg.urgencia = (r.urgencia && r.urgencia.rules && r.urgencia.rules.length > 0) ? r.urgencia : defaults.urgencia;
      cfg.onboarding = (r.onboarding && r.onboarding.steps && r.onboarding.steps.length > 0) ? r.onboarding : defaults.onboarding;
      cfg.templates = (Array.isArray(r.templates) && r.templates.length > 0) ? r.templates : defaults.templates;
      cfg.segments = r.segments || {};

      console.log('[PushAuto] Final config:', cfg);
      setConfig(cfg);
      setSubStats(sub);
      setStats(sts);
    } catch (err) {
      console.error('[PushAuto] FATAL loadAll:', err);
      setConfig(getDefaultConfig());
      try { toast('Error al cargar config', 'error'); } catch(e) {}
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await savePushAutomationConfig(config);
      toast('Configuracion guardada', 'success');
    } catch (err) {
      toast('Error al guardar: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateSection = (section, data) => {
    setConfig(prev => ({ ...prev, [section]: { ...(prev[section] || {}), ...data } }));
  };

  const updateRule = (section, ruleIndex, field, value) => {
    setConfig(prev => {
      const sec = prev[section] || {};
      const items = section === 'onboarding' ? [...(sec.steps || [])] : [...(sec.rules || [])];
      items[ruleIndex] = { ...items[ruleIndex], [field]: value };
      const key = section === 'onboarding' ? 'steps' : 'rules';
      return { ...prev, [section]: { ...sec, [key]: items } };
    });
  };

  const updateInactivityRule = (index, field, value) => {
    setConfig(prev => {
      const rules = [...(prev.inactivity?.rules || [])];
      rules[index] = { ...rules[index], [field]: value };
      return { ...prev, inactivity: { ...(prev.inactivity || {}), rules } };
    });
  };

  // --- Tab labels ---
  const tabs = [
    { key: 'retencion', label: 'Retencion' },
    { key: 'reconsumo', label: 'Reconsumo' },
    { key: 'engagement', label: 'Engagement' },
    { key: 'urgencia', label: 'Urgencia' },
    { key: 'segmentos', label: 'VIP' },
    { key: 'onboarding', label: 'Onboarding' },
    { key: 'ajustes', label: 'Ajustes' },
  ];

  // --- LOADING ---
  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#D4A843', fontSize: '1.2rem' }}>
        Cargando Push Automation...
      </div>
    );
  }

  // --- ERROR ---
  if (!config) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#f87171' }}>
        <p>Error al cargar configuracion</p>
        <button onClick={loadAll} style={{ marginTop: 10, padding: '8px 20px', background: '#D4A843', color: '#000', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          Reintentar
        </button>
      </div>
    );
  }

  // Safe accessors
  const g = config.global || {};
  const inact = config.inactivity || { enabled: false, rules: [] };
  const sched = config.scheduled || { enabled: false, campaigns: [] };
  const recon = config.reconsumo || { enabled: false, rules: [] };
  const urg = config.urgencia || { enabled: false, rules: [] };
  const onb = config.onboarding || { enabled: false, steps: [] };
  const segs = config.segments || {};

  return (
    <div style={{ padding: '20px', paddingBottom: 80 }}>
      {/* STATS BAR */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard label="Total Clientes" value={subStats?.totalClients || 0} icon="👥" />
        <StatCard label="Con Push" value={subStats?.clientsWithPush || 0} icon="🔔" color="#22c55e" />
        <StatCard label="Adopcion" value={(subStats?.adoptionRate || 0) + '%'} icon="📊" color="#D4A843" />
        <StatCard label="Pushes Hoy" value={stats?.totalToday || 0} icon="📤" color="#60a5fa" />
        <StatCard label="Esta Semana" value={stats?.totalThisWeek || 0} icon="📅" color="#a78bfa" />
      </div>

      {/* MASTER ON/OFF */}
      <div className="card" style={{ marginBottom: 20, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Toggle checked={!!g.enabled} onChange={(v) => updateSection('global', { enabled: v })} />
          <span style={{ fontWeight: 700, fontSize: '1rem', color: g.enabled ? '#22c55e' : '#f87171' }}>
            {g.enabled ? 'SISTEMA ACTIVO' : 'SISTEMA DESACTIVADO'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" style={{ background: '#22c55e', color: '#000', fontSize: '0.8rem', padding: '6px 14px', borderRadius: 6 }}
            onClick={async () => { try { await startPushAutomation(); toast('Iniciado', 'success'); loadAll(); } catch(e) { toast('Error', 'error'); } }}>
            Iniciar
          </button>
          <button className="btn" style={{ background: '#f87171', color: '#fff', fontSize: '0.8rem', padding: '6px 14px', borderRadius: 6 }}
            onClick={async () => { try { await stopPushAutomation(); toast('Detenido', 'info'); loadAll(); } catch(e) { toast('Error', 'error'); } }}>
            Detener
          </button>
        </div>
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: '0.8rem', fontWeight: 600,
              background: activeTab === t.key ? '#D4A843' : 'rgba(255,255,255,0.08)',
              color: activeTab === t.key ? '#000' : '#ccc',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB CONTENT */}
      {activeTab === 'retencion' && (
        <SectionCard title="Retencion por Inactividad" enabled={!!inact.enabled}
          onToggle={(v) => updateSection('inactivity', { enabled: v })}>
          {(inact.rules || []).map((rule, i) => (
            <RuleRow key={i}
              label={'Inactivo ' + (rule.daysInactive || '?') + ' dias'}
              enabled={rule.enabled !== false}
              onToggle={(v) => updateInactivityRule(i, 'enabled', v)}
              title={rule.title}
              onTitleChange={(v) => updateInactivityRule(i, 'title', v)}
              body={rule.body}
              onBodyChange={(v) => updateInactivityRule(i, 'body', v)}
            />
          ))}
        </SectionCard>
      )}

      {activeTab === 'reconsumo' && (
        <SectionCard title="Reconsumo" enabled={!!recon.enabled}
          onToggle={(v) => updateSection('reconsumo', { enabled: v })}>
          {(recon.rules || []).map((rule, i) => (
            <RuleRow key={rule.id || i}
              label={rule.triggerType || 'Regla'}
              enabled={!!rule.enabled}
              onToggle={(v) => updateRule('reconsumo', i, 'enabled', v)}
              title={rule.title}
              onTitleChange={(v) => updateRule('reconsumo', i, 'title', v)}
              body={rule.body}
              onBodyChange={(v) => updateRule('reconsumo', i, 'body', v)}
              extra={rule.triggerType === 'balance_low' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.75rem', color: '#999' }}>Umbral: $</span>
                  <input className="form-input" type="number" value={rule.threshold || 500}
                    onChange={(e) => updateRule('reconsumo', i, 'threshold', Number(e.target.value))}
                    style={{ width: 100, fontSize: '0.8rem' }} />
                </div>
              ) : rule.triggerType === 'no_deposit_days' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.75rem', color: '#999' }}>Dias sin deposito:</span>
                  <input className="form-input" type="number" value={rule.daysThreshold || 3}
                    onChange={(e) => updateRule('reconsumo', i, 'daysThreshold', Number(e.target.value))}
                    style={{ width: 80, fontSize: '0.8rem' }} />
                </div>
              ) : null}
            />
          ))}
        </SectionCard>
      )}

      {activeTab === 'engagement' && (
        <SectionCard title="Engagement Programado" enabled={!!sched.enabled}
          onToggle={(v) => updateSection('scheduled', { enabled: v })}>
          {(!sched.campaigns || sched.campaigns.length === 0) ? (
            <p style={{ color: '#999', fontSize: '0.85rem' }}>No hay campanias configuradas.</p>
          ) : sched.campaigns.map((camp, i) => (
            <div key={camp.id || i} style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <Toggle checked={!!camp.enabled} onChange={(v) => {
                  const campaigns = [...sched.campaigns];
                  campaigns[i] = { ...campaigns[i], enabled: v };
                  updateSection('scheduled', { campaigns });
                }} />
                <span style={{ fontWeight: 600, fontSize: '0.85rem', color: camp.enabled ? '#D4A843' : '#666' }}>{camp.name || 'Campania'}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8, paddingLeft: 56 }}>
                <input className="form-input" value={camp.title || ''}
                  onChange={(e) => { const c = [...sched.campaigns]; c[i] = {...c[i], title: e.target.value}; updateSection('scheduled', {campaigns: c}); }}
                  placeholder="Titulo" style={{ fontSize: '0.8rem' }} />
                <input className="form-input" value={camp.body || ''}
                  onChange={(e) => { const c = [...sched.campaigns]; c[i] = {...c[i], body: e.target.value}; updateSection('scheduled', {campaigns: c}); }}
                  placeholder="Mensaje" style={{ fontSize: '0.8rem' }} />
              </div>
            </div>
          ))}
        </SectionCard>
      )}

      {activeTab === 'urgencia' && (
        <SectionCard title="Urgencia / FOMO" enabled={!!urg.enabled}
          onToggle={(v) => updateSection('urgencia', { enabled: v })}>
          {(urg.rules || []).map((rule, i) => (
            <RuleRow key={rule.id || i}
              label={rule.triggerType || 'Regla'}
              enabled={!!rule.enabled}
              onToggle={(v) => updateRule('urgencia', i, 'enabled', v)}
              title={rule.title}
              onTitleChange={(v) => updateRule('urgencia', i, 'title', v)}
              body={rule.body}
              onBodyChange={(v) => updateRule('urgencia', i, 'body', v)}
              extra={rule.triggerType === 'fomo_sorteo_ending' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.75rem', color: '#999' }}>Minutos antes:</span>
                  <input className="form-input" type="number" value={rule.minutesBefore || 30}
                    onChange={(e) => updateRule('urgencia', i, 'minutesBefore', Number(e.target.value))}
                    style={{ width: 80, fontSize: '0.8rem' }} />
                </div>
              ) : rule.triggerType === 'fomo_players_online' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.75rem', color: '#999' }}>Umbral jugadores:</span>
                  <input className="form-input" type="number" value={rule.threshold || 50}
                    onChange={(e) => updateRule('urgencia', i, 'threshold', Number(e.target.value))}
                    style={{ width: 80, fontSize: '0.8rem' }} />
                </div>
              ) : null}
            />
          ))}
        </SectionCard>
      )}

      {activeTab === 'segmentos' && (
        <SectionCard title="VIP / Segmentacion" enabled={true} onToggle={() => {}}>
          {[
            { key: 'ballena', label: '🐳 Ballena', desc: 'Depositan mucho', field: 'minDeposits', defaultVal: 50000, unit: '$' },
            { key: 'regular', label: '💎 Regular', desc: 'Depositan $5K-$50K' },
            { key: 'casual', label: '🎲 Casual', desc: 'Depositan $1K-$5K' },
            { key: 'nuevo', label: '🆕 Nuevo', desc: 'Menos de N dias', field: 'maxDays', defaultVal: 7, unit: 'dias' },
            { key: 'dormido', label: '😴 Dormido', desc: 'Inactivo mas de N dias', field: 'minDays', defaultVal: 14, unit: 'dias' },
          ].map(seg => (
            <div key={seg.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#D4A843', minWidth: 120 }}>{seg.label}</span>
              <span style={{ fontSize: '0.8rem', color: '#999', flex: 1 }}>{seg.desc}</span>
              {seg.field && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {seg.unit === '$' && <span style={{ fontSize: '0.75rem', color: '#999' }}>$</span>}
                  <input className="form-input" type="number"
                    value={(segs[seg.key] && segs[seg.key][seg.field]) || seg.defaultVal}
                    onChange={(e) => {
                      const newSegs = { ...segs, [seg.key]: { ...(segs[seg.key] || {}), [seg.field]: Number(e.target.value) } };
                      setConfig(prev => ({ ...prev, segments: newSegs }));
                    }}
                    style={{ width: 100, fontSize: '0.8rem' }} />
                  {seg.unit !== '$' && <span style={{ fontSize: '0.75rem', color: '#999' }}>{seg.unit}</span>}
                </div>
              )}
            </div>
          ))}
        </SectionCard>
      )}

      {activeTab === 'onboarding' && (
        <SectionCard title="Onboarding (Primeros 7 dias)" enabled={!!onb.enabled}
          onToggle={(v) => updateSection('onboarding', { enabled: v })}>
          {(onb.steps || []).map((step, i) => (
            <div key={step.id || i} style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <Toggle checked={!!step.enabled} onChange={(v) => updateRule('onboarding', i, 'enabled', v)} />
                <span style={{
                  background: 'rgba(212,168,67,0.2)', color: '#D4A843', padding: '2px 8px',
                  borderRadius: 4, fontSize: '0.75rem', fontWeight: 700,
                }}>
                  Dia {step.day}
                </span>
                <span style={{
                  background: step.condition === 'deposited' ? 'rgba(34,197,94,0.2)' : step.condition === 'not_deposited' ? 'rgba(248,113,113,0.2)' : 'rgba(255,255,255,0.08)',
                  color: step.condition === 'deposited' ? '#22c55e' : step.condition === 'not_deposited' ? '#f87171' : '#999',
                  padding: '2px 8px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600,
                }}>
                  {step.condition === 'deposited' ? 'Si cargo' : step.condition === 'not_deposited' ? 'Si NO cargo' : 'Siempre'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8, paddingLeft: 56 }}>
                <input className="form-input" value={step.title || ''}
                  onChange={(e) => updateRule('onboarding', i, 'title', e.target.value)}
                  placeholder="Titulo" style={{ fontSize: '0.8rem' }} />
                <input className="form-input" value={step.body || ''}
                  onChange={(e) => updateRule('onboarding', i, 'body', e.target.value)}
                  placeholder="Mensaje" style={{ fontSize: '0.8rem' }} />
              </div>
            </div>
          ))}
        </SectionCard>
      )}

      {activeTab === 'ajustes' && (
        <SectionCard title="Ajustes Globales" enabled={true} onToggle={() => {}}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={{ fontSize: '0.8rem', color: '#999', display: 'block', marginBottom: 4 }}>Horario Silencioso (inicio)</label>
              <input className="form-input" type="number" min={0} max={23}
                value={g.quietHoursStart || 1}
                onChange={(e) => updateSection('global', { quietHoursStart: Number(e.target.value) })} />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', color: '#999', display: 'block', marginBottom: 4 }}>Horario Silencioso (fin)</label>
              <input className="form-input" type="number" min={0} max={23}
                value={g.quietHoursEnd || 8}
                onChange={(e) => updateSection('global', { quietHoursEnd: Number(e.target.value) })} />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', color: '#999', display: 'block', marginBottom: 4 }}>Max pushes por usuario/dia</label>
              <input className="form-input" type="number" min={1} max={20}
                value={g.maxPushesPerUserPerDay || 5}
                onChange={(e) => updateSection('global', { maxPushesPerUserPerDay: Number(e.target.value) })} />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', color: '#999', display: 'block', marginBottom: 4 }}>Intervalo de chequeo (min)</label>
              <input className="form-input" type="number" min={1} max={120}
                value={g.checkIntervalMinutes || 15}
                onChange={(e) => updateSection('global', { checkIntervalMinutes: Number(e.target.value) })} />
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <label style={{ fontSize: '0.8rem', color: '#999', display: 'block', marginBottom: 4 }}>Zona Horaria</label>
            <select className="form-input" value={g.timezone || 'America/Argentina/Buenos_Aires'}
              onChange={(e) => updateSection('global', { timezone: e.target.value })}>
              <option value="America/Argentina/Buenos_Aires">Argentina (Buenos Aires)</option>
              <option value="America/Sao_Paulo">Brasil (Sao Paulo)</option>
              <option value="America/Santiago">Chile (Santiago)</option>
              <option value="America/Bogota">Colombia (Bogota)</option>
              <option value="America/Mexico_City">Mexico (CDMX)</option>
              <option value="UTC">UTC</option>
            </select>
          </div>
        </SectionCard>
      )}

      {/* SAVE BUTTON */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, padding: '12px 20px',
        background: 'linear-gradient(transparent, rgba(15,12,8,0.95) 20%)',
        display: 'flex', justifyContent: 'center', zIndex: 100,
      }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '12px 40px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(90deg, #D4A843, #FFD700, #D4A843)',
            color: '#000', fontWeight: 800, fontSize: '1rem',
            opacity: saving ? 0.6 : 1,
          }}>
          {saving ? 'Guardando...' : 'Guardar Configuracion'}
        </button>
      </div>
    </div>
  );
}

// ==================== EXPORT WITH ERROR BOUNDARY ====================
export default function PushAutomation() {
  return (
    <PushErrorBoundary>
      <PushAutomationInner />
    </PushErrorBoundary>
  );
}
